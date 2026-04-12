/**
 * Mailpit REST API client for dev/test email token extraction.
 *
 * Used by `provisionCooperative()` to extract the PLC operation
 * confirmation token from emails sent by the PDS during the
 * `requestPlcOperationSignature` → `signPlcOperation` flow.
 *
 * Mailpit API docs: https://mailpit.axllent.org/docs/api-v1/
 */

interface MailpitMessage {
  ID: string;
  Created: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

interface MailpitMessageDetail {
  Text: string;
  HTML: string;
  Subject: string;
}

interface MailpitSearchResult {
  messages: MailpitMessage[];
  messages_count: number;
}

export class MailpitClient {
  constructor(private baseUrl: string) {}

  /**
   * Delete all messages in the Mailpit inbox.
   * Call before tests to avoid stale token interference.
   */
  async clearInbox(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/messages`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Mailpit clearInbox failed (${res.status})`);
    }
  }

  /**
   * Poll for an email matching the given recipient. Returns the plain-text
   * body (or HTML body as fallback). Polls every 500ms.
   *
   * @param to — recipient email address
   * @param opts.timeoutMs — max wait (default 15000)
   * @param opts.afterTimestamp — only consider emails received after this time
   */
  async waitForEmail(
    to: string,
    opts?: { timeoutMs?: number; afterTimestamp?: Date },
  ): Promise<string> {
    const timeout = opts?.timeoutMs ?? 15_000;
    const after = opts?.afterTimestamp ?? new Date(0);
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const searchRes = await fetch(
        `${this.baseUrl}/api/v1/messages?limit=10`,
      );
      if (!searchRes.ok) {
        throw new Error(`Mailpit search failed (${searchRes.status})`);
      }
      const result = (await searchRes.json()) as MailpitSearchResult;

      const match = result.messages?.find(
        (m) =>
          m.To?.some((t) => t.Address === to) &&
          new Date(m.Created) > after,
      );

      if (match) {
        const detailRes = await fetch(
          `${this.baseUrl}/api/v1/message/${match.ID}`,
        );
        if (!detailRes.ok) {
          throw new Error(
            `Mailpit message fetch failed (${detailRes.status})`,
          );
        }
        const detail = (await detailRes.json()) as MailpitMessageDetail;
        return detail.Text || detail.HTML;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error(
      `No email to ${to} received within ${timeout}ms — check PDS SMTP config`,
    );
  }

  /**
   * Extract the PLC operation confirmation token from a PDS email body.
   *
   * The PDS sends an email with subject "PLC Update Operation Requested"
   * containing a confirmation code in the format XXXXX-XXXXX (5 uppercase
   * alphanumeric chars, hyphen, 5 uppercase alphanumeric chars).
   */
  extractPlcToken(emailBody: string): string {
    const match = emailBody.match(/\b([A-Z0-9]{5}-[A-Z0-9]{5})\b/);
    if (!match) {
      throw new Error(
        'Could not extract PLC confirmation token from email body',
      );
    }
    return match[1];
  }
}
