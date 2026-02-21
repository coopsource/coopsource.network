export interface InvitationEmailParams {
  to: string;
  inviterName: string;
  coopName: string;
  token: string;
  inviteUrl: string;
  message?: string;
  expiresAt: Date;
}

export interface NotificationEmailParams {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

export interface IEmailService {
  sendInvitation(params: InvitationEmailParams): Promise<void>;
  sendNotification(params: NotificationEmailParams): Promise<void>;
}
