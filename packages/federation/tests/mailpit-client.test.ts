import { describe, it, expect } from 'vitest';
import { MailpitClient } from '../src/email/mailpit-client.js';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

describe('MailpitClient', () => {
  const client = new MailpitClient(MAILPIT_URL);

  describe('clearInbox', () => {
    it('succeeds when inbox is empty', async () => {
      await client.clearInbox();
    });
  });

  describe('extractPlcToken', () => {
    it('extracts XXXXX-XXXXX token from PDS PLC operation email', () => {
      const emailBody = [
        'PLC UPDATE REQUESTED',
        '',
        'We received a request to update your PLC identity. Your confirmation code is:',
        '',
        'WGYJT-BXEJU',
        '',
        'Updating your PLC identity is a very sensitive operation.',
      ].join('\n');
      expect(client.extractPlcToken(emailBody)).toBe('WGYJT-BXEJU');
    });

    it('extracts token regardless of surrounding text', () => {
      expect(client.extractPlcToken('code: AB12C-DE34F done')).toBe('AB12C-DE34F');
    });

    it('throws if no token is found in the email body', () => {
      expect(() => client.extractPlcToken('Hello, no token here.')).toThrow(
        /Could not extract PLC confirmation token/,
      );
    });

    it('throws for tokens that are too short', () => {
      expect(() => client.extractPlcToken('ABC-DEF')).toThrow(
        /Could not extract PLC confirmation token/,
      );
    });
  });
});
