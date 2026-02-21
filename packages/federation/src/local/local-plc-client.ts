/**
 * LocalPlcClient — a self-contained did:plc implementation for Stage 0-1.
 *
 * Generates real did:plc: identifiers using the same algorithm as plc.directory:
 *   DID = "did:plc:" + base32_lower(sha256(JSON.stringify(sorted_genesis_op)))[:24]
 *
 * Stores genesis operations and DID documents in the local PostgreSQL DB.
 * No external HTTP service required.
 *
 * In Stage 2, swap this for the real PlcClient (http-based) pointing at
 * plc.directory. The DIDs generated locally won't be globally resolvable,
 * but the format is identical so no migration of records is needed if you
 * re-register keys with the real PLC directory.
 */

import * as crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import type { FederationDatabase } from './db-tables.js';
import type { PlcCreateParams } from './plc-client.js';

// ─── base32 encoding (RFC 4648, lowercase) ───────────────────────────────────

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Encode(buf: Buffer): string {
  let out = '';
  let bits = 0;
  let val = 0;
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(val >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(val << (5 - bits)) & 0x1f];
  }
  return out;
}

// ─── DID computation ─────────────────────────────────────────────────────────

function sortObject(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortObject(v)]),
    );
  }
  return obj;
}

function computeDid(genesisOp: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortObject(genesisOp));
  const hash = crypto.createHash('sha256').update(canonical).digest();
  return 'did:plc:' + base32Encode(hash).slice(0, 24);
}

// ─── DID document builder ─────────────────────────────────────────────────────

function buildDidDocument(
  did: string,
  params: PlcCreateParams,
): Record<string, unknown> {
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ecdsa-2019/v1',
    ],
    id: did,
    alsoKnownAs: [`at://${params.handle}`],
    verificationMethod: [
      {
        id: `${did}#atproto`,
        type: 'EcdsaSecp256r1VerificationKey2019',
        controller: did,
        publicKeyMultibase: params.signingKey,
      },
    ],
    authentication: [`${did}#atproto`],
    assertionMethod: [`${did}#atproto`],
    service: [
      {
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: params.pdsUrl,
      },
    ],
  };
}

// ─── LocalPlcClient ───────────────────────────────────────────────────────────

export class LocalPlcClient {
  constructor(private db: Kysely<FederationDatabase>) {}

  async create(params: PlcCreateParams): Promise<string> {
    const genesisOp = {
      type: 'plc_operation',
      rotationKeys: params.rotationKeys ?? [params.signingKey],
      verificationMethods: { atproto: params.signingKey },
      alsoKnownAs: [`at://${params.handle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: params.pdsUrl,
        },
      },
      prev: null,
    };

    const did = computeDid(genesisOp);
    const didDocument = buildDidDocument(did, params);

    // Idempotent — if DID already exists return it (same key = same DID)
    const existing = await this.db
      .selectFrom('plc_operation')
      .where('did', '=', did)
      .select('did')
      .executeTakeFirst();

    if (!existing) {
      await this.db
        .insertInto('plc_operation')
        .values({
          did,
          genesis_op: genesisOp,
          did_document: didDocument,
          created_at: new Date(),
        })
        .execute();
    }

    return did;
  }

  async resolve(did: string): Promise<object> {
    const row = await this.db
      .selectFrom('plc_operation')
      .where('did', '=', did)
      .select('did_document')
      .executeTakeFirst();

    if (!row) {
      throw new Error(`DID not found: ${did}`);
    }
    return row.did_document as object;
  }

  async update(
    did: string,
    params: Partial<PlcCreateParams>,
    _signingPrivateKeyJwk: object,
  ): Promise<void> {
    const row = await this.db
      .selectFrom('plc_operation')
      .where('did', '=', did)
      .select('did_document')
      .executeTakeFirst();

    if (!row) throw new Error(`DID not found: ${did}`);

    const current = row.did_document as Record<string, unknown>;

    // Merge updates into the existing DID document
    const updated: Record<string, unknown> = { ...current };

    if (params.handle) {
      updated.alsoKnownAs = [`at://${params.handle}`];
    }
    if (params.signingKey) {
      updated.verificationMethod = [
        {
          id: `${did}#atproto`,
          type: 'EcdsaSecp256r1VerificationKey2019',
          controller: did,
          publicKeyMultibase: params.signingKey,
        },
      ];
    }
    if (params.pdsUrl) {
      updated.service = [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: params.pdsUrl,
        },
      ];
    }

    await this.db
      .updateTable('plc_operation')
      .set({ did_document: updated })
      .where('did', '=', did)
      .execute();
  }
}
