import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    SESSION_SECRET: z.string().default('change-me-in-production'),
    PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
    // Federation / Local PDS
    PLC_URL: z.string().default('local'), // 'local' = DB-backed (Stage 0-1), URL = real PLC directory (Stage 2+)
    INSTANCE_URL: z.string().url().default('http://localhost:3001'),
    KEY_ENC_KEY: z.string().min(44).default('CHANGEME-generate-with-openssl-rand-base64-32=='),
    BLOB_DIR: z.string().default('./data/blobs'),
    // Stage 2: Real ATProto PDS (when set, AtprotoPdsService is used instead of LocalPdsService)
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
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
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
    // V6 Phase F3: Firehose AppView (TAP_URL takes priority over RELAY_URL; neither = local pg_notify)
    TAP_URL: z.string().url().optional(),     // Tap WebSocket URL (e.g. ws://localhost:4000). Pre-filtered firehose events.
    RELAY_URL: z.string().url().optional(),    // ATProto relay WebSocket (e.g. wss://bsky.network). Raw firehose, filtered by collection prefix.
    VERIFY_COMMIT_SIGNATURES: z.enum(['true', 'false']).default('false'), // Verify commit signatures on firehose records
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
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
