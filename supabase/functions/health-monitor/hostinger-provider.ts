// KORbuild · health-monitor — Hostinger Mail API implementation of
// EmailProvider. Byte-for-byte the same provider used by
// send-appointment-reminders/hostinger-provider.ts (see that file for the
// full API notes) -- duplicated here so this function stays self-contained.
//
//   POST https://api.mail.hostinger.com/api/v1/mailboxes/{mailboxResourceId}/send
//   Authorization: Bearer <token>
//   Content-Type: application/json
//   Body: { to: string[], displayName?: string, subject: string, html?: string, text?: string, ... }
//
// Success is HTTP 204 with an empty body. Never throws: a missing API key
// or mailbox id, or any request/response failure, resolves to
// { success: false, error }.

import type { EmailProvider, EmailSendResult } from './email-provider.ts';

const HOSTINGER_API_BASE = 'https://api.mail.hostinger.com';

interface HostingerErrorBody {
  error?: string;
  code?: string;
  params?: unknown;
}

export class HostingerEmailProvider implements EmailProvider {
  constructor(
    private apiKey: string | undefined,
    private mailboxResourceId: string | undefined,
    private displayName: string
  ) {}

  async send(to: string, subject: string, body: string): Promise<EmailSendResult> {
    if (!this.apiKey) {
      return { success: false, error: 'HOSTINGER_MAIL_API_KEY is not configured' };
    }
    if (!this.mailboxResourceId) {
      return { success: false, error: 'HOSTINGER_MAILBOX_ID is not configured' };
    }

    const endpoint = `${HOSTINGER_API_BASE}/api/v1/mailboxes/${encodeURIComponent(this.mailboxResourceId)}/send`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: [to],
          displayName: this.displayName,
          subject,
          html: body
        })
      });

      if (response.status === 204) {
        return { success: true };
      }

      const payload: HostingerErrorBody = await response.json().catch(() => ({}));
      const message = payload.error || (payload.code ? `Hostinger Mail API error: ${payload.code}` : `Hostinger Mail API error: HTTP ${response.status}`);
      return { success: false, error: message };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error calling Hostinger Mail API' };
    }
  }
}
