import { z } from 'zod';

const envBoolean = z.stringbool().default(false);
const httpUrl = z.string().url().refine(
  (value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  },
  { message: 'must be an http(s) URL' },
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    SESSION_SECRET: z.string().default('change-me-in-production'),
    // The origin inbound federation signatures are verified against
    // (`middleware/federation-auth.ts`). Deliberately **not** `.default()`:
    // a default is the same string on every instance, so the parsed config
    // cannot tell "the operator set http://localhost:3001" from "the operator
    // set nothing" — and two instances that both said nothing bind an
    // identical origin and stay mutually replayable, which is N-23 surviving
    // as configuration instead of code. Resolved from `PORT` below for a
    // standalone development instance, and required to be explicit for any
    // instance that federates or runs in production.
    PUBLIC_API_URL: httpUrl.optional(),
    // Federation / local development substrate
    PLC_URL: z.string().default('local'),
    INSTANCE_URL: z.string().url().default('http://localhost:3001'),
    KEY_ENC_KEY: z.string().min(44).default('CHANGEME-generate-with-openssl-rand-base64-32=='),
    BLOB_DIR: z.string().default('./data/blobs'),
    // Real ATProto PDS (when set, AtprotoPdsService is used instead of LocalPdsService)
    PDS_URL: z.string().url().optional(),
    PDS_ADMIN_PASSWORD: z.string().default('admin'),
    // V6: Cooperative's own PDS and identity
    COOP_PDS_URL: z.string().url().optional(),       // PDS URL for the cooperative's account
    COOP_PDS_ADMIN_PASSWORD: z.string().optional(),  // Admin password for the cooperative's PDS
    COOP_DID: z.string().optional(),                 // Cooperative's did:plc identifier
    COOP_OPERATORS: z.string().optional(),            // Comma-separated DIDs of authorized operators
    COOP_ROTATION_KEY_HEX: z.string().optional(),    // Cooperative's secp256k1 rotation key (hex) for PLC operations
    // Frontend URL for OAuth redirects (API → frontend after OAuth callback)
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('noreply@coopsource.local'),
    // Legacy / Stage 2-3 (kept for compatibility)
    OAUTH_CLIENT_ID: z.string().optional(),
    OAUTH_PRIVATE_KEY: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    LINEAR_CLIENT_ID: z.string().optional(),
    LINEAR_CLIENT_SECRET: z.string().optional(),
    ZOOM_CLIENT_ID: z.string().optional(),
    ZOOM_CLIENT_SECRET: z.string().optional(),
    CONNECTION_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
    // Stripe env vars removed — credentials are now per-cooperative in payment_provider_config table
    OIDC_JWKS: z.string().optional(),
    // Anthropic API key removed — credentials are now per-cooperative in model_provider_config table
    // Federation
    INSTANCE_ROLE: z.enum(['standalone', 'hub', 'coop']).default('standalone'),
    INSTANCE_DID: z.string().optional(),   // Override auto-derived DID
    HUB_URL: z.string().optional(),        // Hub URL for co-op instances to register with
    // Tap firehose consumer (pre-filtered ATProto events over HTTP; unset = local pg_notify)
    TAP_URL: z.string().url().optional(),     // Tap HTTP URL (e.g. http://localhost:2480)
    // V11 Stage 1: Spaces consumer (pull-based permissioned-data consumer)
    SPACES_CONSUMER_ENABLED: envBoolean,
    UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA: envBoolean,
    PERMISSIONED_REPO_READER_MODE: z
      .enum(['fail-closed', 'draft-xrpc'])
      .default('fail-closed'),
    SPACES_CONSUMER_SPACES: z.string().default('[]'),
    PERMISSIONED_RECORD_WRITER_MODE: z
      .enum(['private-record', 'draft-xrpc'])
      .default('private-record'),
    // V12 Phase 4: comma-separated DIDs eligible to renew space credentials.
    SPACE_MANAGING_SESSION_DIDS: z.string().optional(),
    SPACE_MANAGING_APP_ACCESS_MODE: z
      .enum(['disabled', 'group-directory'])
      .default('disabled'),
    // V9.2.5: Service-auth JWT verification for external ATProto apps
    SERVICE_AUTH_AUDIENCE_DID: z.string().optional(), // DID or service identifier external services use as `aud` (defaults to INSTANCE_DID)
    SERVICE_AUTH_TRUSTED_ISSUERS: z.string().optional(), // Comma-separated DIDs of trusted service-auth issuers
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET must be at least 32 characters in production',
        });
      }
      if (data.KEY_ENC_KEY.startsWith('CHANGEME')) {
        ctx.addIssue({
          code: 'custom',
          path: ['KEY_ENC_KEY'],
          message: 'KEY_ENC_KEY must be set to a real value in production',
        });
      }
      if (data.PLC_URL === 'local') {
        ctx.addIssue({
          code: 'custom',
          path: ['PLC_URL'],
          message: 'PLC_URL must be a real URL in production',
        });
      } else if (!httpUrl.safeParse(data.PLC_URL).success) {
        ctx.addIssue({
          code: 'custom',
          path: ['PLC_URL'],
          message: 'PLC_URL must be a valid HTTP(S) URL in production',
        });
      }
      if (!data.PDS_URL && !data.COOP_PDS_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['PDS_URL'],
          message: 'PDS_URL or COOP_PDS_URL is required in production',
        });
      }
      const pdsAdminPassword =
        data.COOP_PDS_ADMIN_PASSWORD ?? data.PDS_ADMIN_PASSWORD;
      if (
        pdsAdminPassword.trim().length === 0 ||
        pdsAdminPassword === 'admin'
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [
            data.COOP_PDS_ADMIN_PASSWORD !== undefined
              ? 'COOP_PDS_ADMIN_PASSWORD'
              : 'PDS_ADMIN_PASSWORD',
          ],
          message:
            'PDS admin password must be set to a real value in production',
        });
      }
    }
    // A federating instance has peers that sign for its origin, and a
    // production instance is dialled by name, so neither may run on the
    // localhost fallback. `INSTANCE_ROLE !== 'standalone'` is the condition
    // that would have caught the real case: every API service in
    // docker-compose.federation.yml declares a role and none of them set
    // PUBLIC_API_URL, so all three silently bound http://localhost:3001.
    if (data.PUBLIC_API_URL === undefined) {
      if (data.NODE_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_API_URL'],
          message:
            'PUBLIC_API_URL must be set explicitly in production — it is the ' +
            'origin inbound federation signatures are verified against',
        });
      } else if (data.INSTANCE_ROLE !== 'standalone') {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_API_URL'],
          message:
            `PUBLIC_API_URL must be set explicitly when INSTANCE_ROLE is '${data.INSTANCE_ROLE}' ` +
            '— a federating instance cannot share the localhost fallback with its peers',
        });
      }
    }
    if (data.SPACE_MANAGING_APP_ACCESS_MODE === 'group-directory') {
      if (!data.SERVICE_AUTH_AUDIENCE_DID) {
        ctx.addIssue({
          code: 'custom',
          path: ['SERVICE_AUTH_AUDIENCE_DID'],
          message:
            'SERVICE_AUTH_AUDIENCE_DID is required when managing-app access is enabled',
        });
      }
      if (
        !(data.SERVICE_AUTH_TRUSTED_ISSUERS ?? '')
          .split(',')
          .some((issuer) => issuer.trim().length > 0)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['SERVICE_AUTH_TRUSTED_ISSUERS'],
          message:
            'SERVICE_AUTH_TRUSTED_ISSUERS is required when managing-app access is enabled',
        });
      }
    }
  })
  // Resolved last so the checks above can still see "the operator said
  // nothing". Derived from PORT rather than hardcoded, so two instances on one
  // host no longer collide on a single origin the way the federation stack did.
  .transform((data) => ({
    ...data,
    PUBLIC_API_URL: data.PUBLIC_API_URL ?? `http://localhost:${data.PORT}`,
  }));

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
