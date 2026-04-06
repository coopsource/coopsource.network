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
import { sql } from 'kysely';
import type { FederationDatabase } from './db-tables.js';
import type { PlcCreateParams } from './plc-client.js';
import { publicJwkToMultibase } from './did-manager.js';
import type { JwkKey } from './did-manager.js';

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
  const service: Array<{ id: string; type: string; serviceEndpoint: string }> = [
    {
      id: '#atproto_pds',
      type: 'AtprotoPersonalDataServer',
      serviceEndpoint: params.pdsUrl,
    },
  ];

  if (params.labelerUrl) {
    service.push({
      id: '#atproto_labeler',
      type: 'AtprotoLabeler',
      serviceEndpoint: params.labelerUrl,
    });
  }

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
    service,
  };
}

// ─── LocalPlcClient ───────────────────────────────────────────────────────────

/**
 * @deprecated V3 scaffolding — generates did:plc identifiers locally without
 * connecting to plc.directory. Retained for local dev when PLC_URL='local'.
 * In production, use PlcClient with PLC_URL=https://plc.directory.
 */
export class LocalPlcClient {
  constructor(
    private db: Kysely<FederationDatabase>,
    private pdsUrl?: string,
  ) {}

  async create(params: PlcCreateParams): Promise<string> {
    const services: Record<string, { type: string; endpoint: string }> = {
      atproto_pds: {
        type: 'AtprotoPersonalDataServer',
        endpoint: params.pdsUrl,
      },
    };

    if (params.labelerUrl) {
      services.atproto_labeler = {
        type: 'AtprotoLabeler',
        endpoint: params.labelerUrl,
      };
    }

    const genesisOp = {
      type: 'plc_operation',
      rotationKeys: params.rotationKeys ?? [params.signingKey],
      verificationMethods: { atproto: params.signingKey },
      alsoKnownAs: [`at://${params.handle}`],
      services,
      prev: null,
    };

    const did = computeDid(genesisOp);
    const didDocument = buildDidDocument(did, params);

    // Idempotent — if DID already exists return it (same key = same DID).
    // plc_operation table dropped in migration 056 — skip gracefully.
    try {
      const existingRows = await sql<{ did: string }>`
        SELECT did FROM plc_operation WHERE did = ${did} LIMIT 1
      `.execute(this.db);
      const existing = existingRows.rows[0];

      if (!existing) {
        await sql`
          INSERT INTO plc_operation (did, genesis_op, did_document, created_at)
          VALUES (${did}, ${JSON.stringify(genesisOp)}, ${JSON.stringify(didDocument)}, NOW())
          ON CONFLICT (did) DO NOTHING
        `.execute(this.db);
      }
    } catch (err: unknown) {
      // plc_operation table may not exist after V3 cleanup migration (056)
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('relation') || !msg.includes('does not exist')) {
        throw err; // Re-throw unexpected errors
      }
    }

    return did;
  }

  async resolve(did: string): Promise<object> {
    // Try plc_operation table first (dropped in migration 056 — falls through to fallback).
    try {
      const result = await sql<{ did_document: unknown }>`
        SELECT did_document FROM plc_operation WHERE did = ${did} LIMIT 1
      `.execute(this.db);
      const row = result.rows[0];
      if (row) return row.did_document as object;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('relation') || !msg.includes('does not exist')) {
        throw err;
      }
      // plc_operation table dropped — fall through to entity_key fallback
    }

    // Fallback: reconstruct minimal DID document from entity_key + entity tables.
    const keyRows = await this.db
      .selectFrom('entity_key')
      .where('entity_did', '=', did)
      .where('invalidated_at', 'is', null)
      .select(['public_key_jwk', 'key_purpose'])
      .orderBy('created_at', 'desc')
      .execute();

    const signingKeyRow = keyRows.find((r) => r.key_purpose === 'signing') ?? keyRows[0];
    if (!signingKeyRow) {
      throw new Error(`DID not found: ${did}`);
    }

    let signingKey: string;
    try {
      const jwk = JSON.parse(signingKeyRow.public_key_jwk) as JwkKey;
      signingKey = publicJwkToMultibase(jwk);
    } catch {
      signingKey = `did-key-${did}`;
    }

    const entityRow = await this.db
      .selectFrom('entity')
      .where('did', '=', did)
      .select(['handle'])
      .executeTakeFirst();

    const handle = entityRow?.handle ?? did;

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ecdsa-2019/v1',
      ],
      id: did,
      alsoKnownAs: [`at://${handle}`],
      verificationMethod: [
        {
          id: `${did}#atproto`,
          type: 'EcdsaSecp256r1VerificationKey2019',
          controller: did,
          publicKeyMultibase: signingKey,
        },
      ],
      authentication: [`${did}#atproto`],
      assertionMethod: [`${did}#atproto`],
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: this.pdsUrl ?? `https://pds.local`,
        },
      ],
    };
  }

  async update(
    did: string,
    params: Partial<PlcCreateParams>,
    _signingPrivateKeyJwk: object,
  ): Promise<void> {
    // plc_operation table may not exist after V3 cleanup migration (056) — skip gracefully.
    try {
      const updateResult = await sql<{ did_document: Record<string, unknown> }>`
        SELECT did_document FROM plc_operation WHERE did = ${did} LIMIT 1
      `.execute(this.db);
      const row = updateResult.rows[0];

      if (!row) throw new Error(`DID not found: ${did}`);

      const current = row.did_document;

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

      await sql`
        UPDATE plc_operation SET did_document = ${JSON.stringify(updated)} WHERE did = ${did}
      `.execute(this.db);
    } catch (err: unknown) {
      // Re-throw "DID not found" and other real errors; ignore only missing table
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('relation') || !msg.includes('does not exist')) {
        throw err; // Re-throw unexpected errors
      }
      // plc_operation table does not exist — update is a no-op
    }
  }
}
