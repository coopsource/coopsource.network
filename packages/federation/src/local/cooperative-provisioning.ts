import { AtpAgent } from '@atproto/api';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { encryptKey } from './did-manager.js';
import { ATPROTO_APP_PASSWORD_CREDENTIAL_TYPE } from '../http/auth-credential-resolver.js';
import { MailpitClient } from '../email/mailpit-client.js';

/**
 * Options for provisioning a cooperative account on a PDS and storing a
 * scoped app-password credential for ongoing CSN writes.
 *
 * The V9.1 flow is intentionally simple:
 *   1. Ask the PDS to create the account the normal way — let the PDS
 *      generate its own `verificationMethods.atproto` signing key and
 *      register the DID in PLC using its own rotation key. This is the
 *      ecosystem-native "I want an account on this PDS" path, and
 *      produces an activated account in one round-trip.
 *   2. Using the session tokens returned by `createAccount`, immediately
 *      call `com.atproto.server.createAppPassword({name:'coopsource-api',
 *      privileged:true})` to mint a scoped, revocable credential.
 *   3. Encrypt the app password at rest in `auth_credential` with
 *      `credential_type='atproto-app-password'`. This is the credential
 *      `AtprotoPdsService.authFor` uses for ongoing repo writes.
 *   4. Write the matching `entity` row so the `auth_credential` FK holds.
 *
 * Explicitly deferred (not V9.1 scope): CSN-owned PLC signing keys,
 * client-signed PLC genesis operations, a `#coopsource` service entry in
 * the cooperative's DID document. Each would require pre-registering the
 * DID in PLC and importing it into the PDS — a path PDS 0.4 currently
 * gates behind `getRecommendedDidCredentials` (which requires a session),
 * a pre-provisioned rotation-key handshake we'd need to bootstrap via a
 * throwaway account, or the `createAccount(plcOp)` param that 0.4
 * rejects. See ARCHITECTURE-V9.md §2 for the full rationale.
 *
 * The V9.1 ship contract:
 *   - Per-cooperative auth via app-password sessions ✅
 *   - No shared `PDS_ADMIN_PASSWORD` on the cooperative write path ✅
 *   - Revocable, scoped credentials ✅
 *   - Ecosystem-aligned (app passwords are the atproto-native primitive) ✅
 *   - CSN-owned PLC signing keys ⏭️ (deferred)
 *   - `#coopsource` service entry in PLC doc ⏭️ (deferred to V9.2)
 */
export interface ProvisionCooperativeOptions {
  /** Kysely handle against the main CSN database (must include `entity` and `auth_credential`). */
  db: Kysely<Database>;
  /** PDS base URL, e.g. `http://localhost:2583`. */
  pdsUrl: string;
  /** Admin password for the PDS (used to create the invite code). */
  adminPassword: string;
  /** Encryption key (base64) for encrypting the app password at rest in `auth_credential`. */
  keyEncKey: string;
  /** Initial handle (e.g. `mycoop.test`). */
  handle: string;
  /** Email address for the account (optional, defaults to `<handle>@coopsource.local`). */
  email?: string;
  /** Display name for the `entity` row. */
  displayName?: string;
  /** Short description for the `entity` row. */
  description?: string;
  /** CSN service endpoint URL for the #coopsource PLC entry (e.g. 'https://coopsource.network').
   *  If omitted, no PLC service entry is added (V9.1 behavior). */
  serviceEndpoint?: string;
  /** Mailpit base URL for email token extraction (required when serviceEndpoint is set). */
  mailpitUrl?: string;
}

/**
 * Summary of the provisioning outcome. Contains the DID, the handle, and
 * both the random account password and the app password that were just
 * created. The app password is the credential CSN retains ongoing via
 * `auth_credential`; the account password is returned for operator
 * reference but is not stored.
 */
export interface ProvisionCooperativeResult {
  did: string;
  handle: string;
  email: string;
  /** Randomly-generated account password. Operator-facing; not stored in CSN. */
  password: string;
  /**
   * The app password created via `com.atproto.server.createAppPassword`
   * and stored (encrypted) in `auth_credential`. Returned by the library
   * so the CLI wrapper can print it for the operator; the API reads it
   * back from `auth_credential` via `AuthCredentialResolver`.
   */
  appPassword: string;
  /** True if the optional PLC `#coopsource` service entry step failed.
   *  The cooperative is fully functional but not discoverable via DID. */
  plcServiceEntryFailed?: boolean;
}

/**
 * Provision a cooperative account on a PDS via the normal `createAccount`
 * flow, create a privileged app password, and persist it to
 * `auth_credential` for `AtprotoPdsService.authFor` to pick up.
 *
 * Side effects: PDS `createAccount` XRPC call, PDS `createAppPassword`
 * XRPC call, two database inserts (`entity` + `auth_credential`),
 * and optionally a PLC DID document update (when `serviceEndpoint` is
 * provided).
 *
 * Failure modes (all acceptable pre-deployment):
 *   - Steps 1-3 fail → no side effects beyond a partial PDS account.
 *   - Step 4 (DB writes) fails after PDS account created → account
 *     exists in PDS but not in CSN. Operator can re-provision or
 *     manually insert the rows.
 *   - Step 5 (PLC service entry) fails after DB writes → cooperative
 *     is fully functional but its DID document lacks `#coopsource`.
 *     The result is returned with `plcServiceEntryFailed: true` so
 *     the caller/operator knows. The PLC step can be retried manually.
 */
export async function provisionCooperative(
  options: ProvisionCooperativeOptions,
): Promise<ProvisionCooperativeResult> {
  const {
    db,
    pdsUrl,
    adminPassword,
    keyEncKey,
    handle,
    displayName,
    description,
  } = options;
  const email =
    options.email ?? `${handle.replace(/\./g, '-')}@coopsource.local`;

  if (options.serviceEndpoint && !options.mailpitUrl) {
    throw new Error(
      'mailpitUrl is required when serviceEndpoint is set — ' +
      'no production email path exists yet, only Mailpit-based dev/test',
    );
  }

  // ─── Step 1: Create an invite code as PDS admin (HTTP Basic auth) ───────
  const adminAuthHeader =
    'Basic ' + Buffer.from(`admin:${adminPassword}`).toString('base64');
  const inviteRes = await fetch(
    `${pdsUrl}/xrpc/com.atproto.server.createInviteCode`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': adminAuthHeader,
      },
      body: JSON.stringify({ useCount: 1 }),
    },
  );
  if (!inviteRes.ok) {
    const text = await inviteRes.text().catch(() => 'unknown');
    throw new Error(
      `Failed to create invite code (${inviteRes.status}): ${text}`,
    );
  }
  const invite = (await inviteRes.json()) as { code: string };

  // ─── Step 2: Create the account via the normal createAccount flow ───────
  // Let the PDS generate everything: rotation key, signing key, PLC
  // registration, local account. Returns an activated session.
  const password = `coop-${crypto.randomUUID()}`;
  const agent = new AtpAgent({ service: pdsUrl });
  const createResult = await agent.com.atproto.server.createAccount({
    handle,
    email,
    password,
    inviteCode: invite.code,
  });
  const accountDid = createResult.data.did;

  // Resume the session on the agent so it can be used for subsequent
  // authenticated calls (createAppPassword, identity endpoints).
  // AtpAgent does not auto-adopt the createAccount session.
  await agent.resumeSession({
    did: createResult.data.did,
    handle: createResult.data.handle,
    accessJwt: createResult.data.accessJwt,
    refreshJwt: createResult.data.refreshJwt,
    active: true,
  });

  // ─── Step 3: Create an app password via the agent session ─────────────
  const appPasswordResult =
    await agent.com.atproto.server.createAppPassword({
      name: 'coopsource-api',
      privileged: true,
    });
  const appPassword = appPasswordResult.data.password;

  // ─── Step 4: Persist entity + auth_credential rows ──────────────────────
  const encryptedAppPassword = await encryptKey(appPassword, keyEncKey);

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
    .insertInto('auth_credential')
    .values({
      entity_did: accountDid,
      credential_type: ATPROTO_APP_PASSWORD_CREDENTIAL_TYPE,
      // (credential_type, identifier) is uniquely indexed — use the DID
      // as the identifier so there's at most one row per (type, DID).
      identifier: accountDid,
      secret_hash: encryptedAppPassword,
    })
    .execute();

  // ─── Step 5: Add #coopsource service entry to PLC (optional) ─────────
  // Wrapped in try/catch so a PLC failure does not prevent the caller
  // from receiving the provisioning result. The cooperative is fully
  // functional without the service entry — it just won't be discoverable
  // via DID document resolution until the entry is added manually.
  let plcServiceEntryFailed = false;
  if (options.serviceEndpoint) {
    try {
      const mailpit = new MailpitClient(options.mailpitUrl!);

      // 5a. Get current DID credentials for the defensive services map
      const recommended =
        await agent.com.atproto.identity.getRecommendedDidCredentials();
      const currentServices = (recommended.data.services ?? {}) as Record<
        string,
        { type: string; endpoint: string }
      >;

      // 5b. Request PLC operation signature — PDS emails a confirmation token
      const beforeEmail = new Date();
      await agent.com.atproto.identity.requestPlcOperationSignature();

      // 5c. Extract token from Mailpit
      const emailBody = await mailpit.waitForEmail(email, {
        afterTimestamp: beforeEmail,
      });
      const token = mailpit.extractPlcToken(emailBody);

      // 5d. Sign the PLC operation with defensive services map
      const signResult = await agent.com.atproto.identity.signPlcOperation({
        token,
        services: {
          ...currentServices,
          coopsource: {
            type: 'CoopSourceNetwork',
            endpoint: options.serviceEndpoint,
          },
        },
      });

      // 5e. Submit the signed operation to PLC
      await agent.com.atproto.identity.submitPlcOperation({
        operation: signResult.data.operation,
      });
    } catch (err) {
      plcServiceEntryFailed = true;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `PLC #coopsource service entry failed for ${accountDid}: ${message}. ` +
        'Cooperative is functional but not discoverable via DID.',
      );
    }
  }

  return {
    did: accountDid,
    handle,
    email,
    password,
    appPassword,
    ...(plcServiceEntryFailed ? { plcServiceEntryFailed } : {}),
  };
}
