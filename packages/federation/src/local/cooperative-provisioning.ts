import { AtpAgent } from '@atproto/api';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import {
  encryptKey,
  generateKeyPair,
  publicJwkToMultibase,
} from './did-manager.js';
import { generateRotationKeypair, signPlcOperationK256 } from './plc-signing.js';
import type { UnsignedPlcOperation } from './plc-signing.js';
import { PlcClient } from './plc-client.js';

/**
 * Options for provisioning a cooperative with a CSN-owned ATProto signing
 * key, pre-signed PLC genesis op, and `#coopsource` service entry.
 *
 * The flow is a single atomic operation:
 *   1. Generate a fresh P-256 signing keypair + secp256k1 rotation keypair.
 *   2. Build and sign a PLC genesis op carrying both keys and the service
 *      entries (`atproto_pds` pointing at the PDS, `coopsource` pointing at
 *      `instanceUrl`).
 *   3. Compute the did:plc from the signed op.
 *   4. Call `com.atproto.server.createAccount({..., did, plcOp})` so the PDS
 *      submits the op to PLC and opens the account in one step.
 *   5. Write an `entity` row and an encrypted `entity_key` row with
 *      `key_purpose='atproto-signing'` for `AtprotoPdsService.authFor()` to
 *      read when minting service-auth JWTs.
 *
 * This replaces the V6-era "let the PDS generate the key, then retrofit via
 * a three-method PLC migration dance" flow. CSN has never been deployed, so
 * there are no existing cooperatives to migrate — fresh provisioning is the
 * only path V9.1 needs to support.
 */
export interface ProvisionCooperativeOptions {
  /** Kysely handle against the main CSN database (must include `entity` and `entity_key`). */
  db: Kysely<Database>;
  /** PDS base URL, e.g. `http://localhost:2583`. */
  pdsUrl: string;
  /** Admin password for the PDS (used to create the invite code). */
  adminPassword: string;
  /** CSN instance URL for the `#coopsource` service entry on the cooperative's DID document. */
  instanceUrl: string;
  /** Encryption key (base64) for encrypting the private JWK at rest in `entity_key`. */
  keyEncKey: string;
  /** Initial handle (e.g. `mycoop.test`). */
  handle: string;
  /** Email address for the account (optional, defaults to `<handle>@coopsource.local`). */
  email?: string;
  /** Display name for the `entity` row and the optional profile record. */
  displayName?: string;
  /** Short description for the `entity` row. */
  description?: string;
}

/**
 * Summary of the provisioning outcome. Contains everything an operator needs
 * to wire the new cooperative into the API: the DID, the account password
 * (for any fallback `agent.login` paths), and the rotation key for future
 * PLC update operations.
 */
export interface ProvisionCooperativeResult {
  did: string;
  handle: string;
  email: string;
  /** Randomly-generated account password. Store securely; lost = account lost. */
  password: string;
  /** `did:key:<multibase>` form of the signing public key, as it appears in PLC `verificationMethods.atproto`. */
  signingKeyDidKey: string;
  /** Raw hex-encoded secp256k1 rotation private key. Store in `COOP_ROTATION_KEY_HEX`. */
  rotationPrivateKeyHex: string;
  /** `did:key:<multibase>` form of the rotation public key (what's in PLC `rotationKeys[0]`). */
  rotationDidKey: string;
}

/**
 * Provision a cooperative identity and write the CSN-owned signing key to
 * `entity_key` so the API's `AtprotoPdsService` can mint service-auth JWTs
 * for all subsequent writes. See `ProvisionCooperativeOptions` for the full
 * flow description.
 *
 * This function is intentionally side-effectful — it performs multiple
 * network calls and database writes in sequence. If the PDS `createAccount`
 * step fails, no database writes have happened yet (safe retry). If the
 * database writes fail *after* the PDS account was created, the cooperative
 * exists in PLC + the PDS but has no `atproto-signing` key in CSN; the
 * operator must either delete the PDS account or manually insert the key
 * row. This is an acceptable pre-deployment risk for a development-stage
 * project.
 */
export async function provisionCooperative(
  options: ProvisionCooperativeOptions,
): Promise<ProvisionCooperativeResult> {
  const {
    db,
    pdsUrl,
    adminPassword,
    instanceUrl,
    keyEncKey,
    handle,
    displayName,
    description,
  } = options;
  const email =
    options.email ?? `${handle.replace(/\./g, '-')}@coopsource.local`;

  // ─── Step 1: Generate keypairs ──────────────────────────────────────────
  const { publicJwk, privateJwk } = await generateKeyPair();
  const signingKeyMultibase = publicJwkToMultibase(publicJwk);
  const signingKeyDidKey = `did:key:${signingKeyMultibase}`;

  const { privateKeyHex: rotationPrivateKeyHex, publicKeyMultibase: rotationPublicMultibase } =
    await generateRotationKeypair();
  const rotationDidKey = `did:key:${rotationPublicMultibase}`;

  // ─── Step 2: Build and sign the PLC genesis op ──────────────────────────
  const unsignedOp: UnsignedPlcOperation = {
    type: 'plc_operation',
    rotationKeys: [rotationDidKey],
    verificationMethods: {
      atproto: signingKeyDidKey,
    },
    alsoKnownAs: [`at://${handle}`],
    services: {
      atproto_pds: {
        type: 'AtprotoPersonalDataServer',
        endpoint: pdsUrl,
      },
      coopsource: {
        type: 'CoopSourcePds',
        endpoint: instanceUrl,
      },
    },
    prev: null,
  };
  const signedOp = await signPlcOperationK256(unsignedOp, rotationPrivateKeyHex);
  const did = PlcClient.computeDid(signedOp);

  // ─── Step 3: Create the PDS account via createAccount(plcOp) ────────────
  const adminAgent = new AtpAgent({ service: pdsUrl });
  await adminAgent.login({ identifier: 'admin', password: adminPassword });
  const invite = await adminAgent.api.com.atproto.server.createInviteCode({
    useCount: 1,
  });

  const password = `coop-${crypto.randomUUID()}`;

  // Pin outbound requests to the configured pdsUrl (in case the PDS DID doc
  // advertises an internal hostname that isn't reachable from the host).
  const agent = new AtpAgent({
    service: pdsUrl,
    fetch: async (input, init) => {
      let url: string;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = String(input);
      }
      const xrpcIdx = url.indexOf('/xrpc/');
      if (xrpcIdx !== -1) {
        url = pdsUrl + url.slice(xrpcIdx);
      }
      if (input instanceof Request && !init) {
        return globalThis.fetch(new Request(url, input));
      }
      return globalThis.fetch(url, init);
    },
  });

  const createResult = await agent.com.atproto.server.createAccount({
    handle,
    email,
    password,
    inviteCode: invite.data.code,
    did,
    plcOp: signedOp as unknown as Record<string, unknown>,
  });
  const accountDid = createResult.data.did;
  if (accountDid !== did) {
    throw new Error(
      `Derived DID ${did} does not match PDS-returned DID ${accountDid} — ` +
        `PlcClient.computeDid is out of sync with the PDS, which should never happen.`,
    );
  }

  // ─── Step 4: Persist entity + entity_key rows ───────────────────────────
  const encryptedPrivateJwk = await encryptKey(
    JSON.stringify(privateJwk),
    keyEncKey,
  );

  await db
    .insertInto('entity')
    .values({
      did: accountDid,
      type: 'cooperative',
      handle,
      display_name: displayName ?? handle,
      description: description ?? null,
      status: 'active',
    })
    .onConflict((oc) => oc.column('did').doNothing())
    .execute();

  await db
    .insertInto('entity_key')
    .values({
      entity_did: accountDid,
      key_type: 'ES256',
      public_key_jwk: JSON.stringify(publicJwk),
      private_key_enc: encryptedPrivateJwk,
      key_purpose: 'atproto-signing',
    })
    .execute();

  return {
    did: accountDid,
    handle,
    email,
    password,
    signingKeyDidKey,
    rotationPrivateKeyHex,
    rotationDidKey,
  };
}
