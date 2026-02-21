import nodemailer from 'nodemailer';
import type { IEmailService } from '../interfaces/email-service.js';
import type {
  InvitationEmailParams,
  NotificationEmailParams,
} from '../interfaces/email-service.js';

export interface DevEmailConfig {
  host: string; // 'localhost'
  port: number; // 1025 (Mailpit default SMTP port)
}

export class DevEmailService implements IEmailService {
  private transporter: nodemailer.Transporter;

  constructor(config: DevEmailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false,
      ignoreTLS: true,
    });
  }

  async sendInvitation(params: InvitationEmailParams): Promise<void> {
    await this.transporter.sendMail({
      from: `"${params.coopName}" <noreply@coopsource.local>`,
      to: params.to,
      subject: `You're invited to join ${params.coopName}`,
      text: [
        `${params.inviterName} has invited you to join ${params.coopName}.`,
        params.message ? `\nMessage: ${params.message}` : '',
        `\nAccept your invitation: ${params.inviteUrl}`,
        `\nThis invitation expires: ${params.expiresAt.toLocaleDateString()}`,
      ].join(''),
    });
  }

  async sendNotification(params: NotificationEmailParams): Promise<void> {
    await this.transporter.sendMail({
      from: '"Co-op Source" <noreply@coopsource.local>',
      to: params.to,
      subject: params.subject,
      text: params.textBody,
      html: params.htmlBody,
    });
  }
}
