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
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    OIDC_JWKS: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: 32,
          type: 'string',
          inclusive: true,
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET must be at least 32 characters in production',
        });
      }
      if (data.KEY_ENC_KEY.startsWith('CHANGEME')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
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
