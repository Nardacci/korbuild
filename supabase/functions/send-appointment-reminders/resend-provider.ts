// KORbuild · Customer Service Scheduling — Resend implementation of EmailProvider.
// Never throws: a missing/invalid RESEND_API_KEY or a Resend API error both
// resolve to { success: false, error }, so the caller can log a controlled
// 'falhou' row in lembretes_enviados instead of crashing the whole cron run.

import type { EmailProvider, EmailSendResult } from './email-provider.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

export class ResendEmailProvider implements EmailProvider {
  constructor(private apiKey: string | undefined, private fromAddress: string) {}

  async send(to: string, subject: string, body: string): Promise<EmailSendResult> {
    if (!this.apiKey) {
      return { success: false, error: 'RESEND_API_KEY is not configured' };
    }

    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [to],
          subject,
          html: body
        })
      });

      const payload = await response.json().catch(() => ({} as Record<string, unknown>));

      if (!response.ok) {
        const message = typeof payload?.message === 'string' ? payload.message : `Resend API error: HTTP ${response.status}`;
        return { success: false, error: message };
      }

      return { success: true, messageId: typeof payload?.id === 'string' ? payload.id : undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error calling Resend' };
    }
  }
}
