import 'express-session';

declare module 'express-session' {
  interface SessionData {
    did?: string;
    cliSessionId?: string;
  }
}
