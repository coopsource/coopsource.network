import type { IEmailService } from '../interfaces/email-service.js';
import type {
  InvitationEmailParams,
  NotificationEmailParams,
} from '../interfaces/email-service.js';

export class NoopEmailService implements IEmailService {
  async sendInvitation(params: InvitationEmailParams): Promise<void> {
    console.warn(`[email] SMTP not configured — skipping invitation email to ${params.to}`);
  }

  async sendNotification(params: NotificationEmailParams): Promise<void> {
    console.warn(`[email] SMTP not configured — skipping notification "${params.subject}" to ${params.to}`);
  }
}
