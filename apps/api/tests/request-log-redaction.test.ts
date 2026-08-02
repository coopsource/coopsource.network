import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createHttpLogger } from '../src/middleware/logger.js';

/**
 * Audit finding S-03: request logging used pino-http defaults with no
 * redaction, so session cookies and bearer credentials (MCP tokens,
 * service-auth JWTs, federation signatures, provider webhook signatures)
 * were written to logs at info level.
 */
describe('Request log redaction (S-03)', () => {
  function appWithCapturedLogs(): { app: express.Express; lines: () => string } {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });

    const app = express();
    app.use(createHttpLogger(sink));
    app.get('/probe', (_req, res) => {
      res.setHeader('set-cookie', 'coopsource_sid=SUPERSECRET_SESSION; Path=/');
      res.status(200).json({ ok: true });
    });
    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    return { app, lines: () => chunks.join('') };
  }

  const secretHeaders: Array<[string, string]> = [
    ['cookie', 'coopsource_sid=SUPERSECRET_SESSION'],
    ['authorization', 'Bearer SUPERSECRET_BEARER'],
    ['signature', 'sig1=:SUPERSECRET_SIGNATURE:'],
    ['signature-input', 'sig1=("@method");keyid="SUPERSECRET_KEYID"'],
    ['stripe-signature', 't=1,v1=SUPERSECRET_STRIPE'],
    ['x-api-key', 'SUPERSECRET_APIKEY'],
  ];

  for (const [header, value] of secretHeaders) {
    it(`redacts the ${header} request header`, async () => {
      const { app, lines } = appWithCapturedLogs();

      await request(app).get('/probe').set(header, value).expect(200);

      const output = lines();
      expect(output).not.toContain('SUPERSECRET');
      expect(output).toContain('[Redacted]');
    });
  }

  it('redacts set-cookie on the response', async () => {
    const { app, lines } = appWithCapturedLogs();

    await request(app).get('/probe').expect(200);

    expect(lines()).not.toContain('SUPERSECRET_SESSION');
  });

  it('does not log health probes, which poll continuously', async () => {
    const { app, lines } = appWithCapturedLogs();

    await request(app).get('/health').expect(200);

    expect(lines()).toBe('');
  });

  it('still logs useful request metadata', async () => {
    const { app, lines } = appWithCapturedLogs();

    await request(app).get('/probe').set('cookie', 'coopsource_sid=SUPERSECRET_SESSION').expect(200);

    const output = lines();
    expect(output).toContain('/probe');
    expect(output).toContain('200');
  });
});
