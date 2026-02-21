import session from 'express-session';
import type { RequestHandler } from 'express';
import connectPgSimple from 'connect-pg-simple';
import type { AppConfig } from '../config.js';

export function createSessionMiddleware(config: AppConfig): RequestHandler {
  const PgSession = connectPgSimple(session);

  return session({
    store: new PgSession({
      conString: config.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: false,
    }),
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
}
