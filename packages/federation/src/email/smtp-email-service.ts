import nodemailer from 'nodemailer';
import type { IEmailService } from '../interfaces/email-service.js';
import type {
  InvitationEmailParams,
  NotificationEmailParams,
} from '../interfaces/email-service.js';

export interface SmtpEmailConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
}

export class SmtpEmailService implements IEmailService {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(config: SmtpEmailConfig) {
    this.from = config.from ?? 'noreply@coopsource.local';
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      ...(config.user && config.pass
        ? { auth: { user: config.user, pass: config.pass } }
        : {}),
    });
  }

  async sendInvitation(params: InvitationEmailParams): Promise<void> {
    await this.transporter.sendMail({
      from: `"${params.coopName}" <${this.from}>`,
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
      from: `"Co-op Source" <${this.from}>`,
      to: params.to,
      subject: params.subject,
      text: params.textBody,
      html: params.htmlBody,
    });
  }
}
