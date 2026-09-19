// KORbuild · health-monitor — email provider abstraction.
// Identical contract to send-appointment-reminders/email-provider.ts.
// Duplicated rather than cross-imported so each Edge Function stays a
// self-contained deployable unit (matches how resend-provider.ts sits
// alongside hostinger-provider.ts in that function too).

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<EmailSendResult>;
}
