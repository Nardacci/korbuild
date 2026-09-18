// KORbuild · Customer Service Scheduling — Hostinger Mail API implementation
// of EmailProvider.
//
// Confirmed against the official OpenAPI spec (github.com/hostinger/mail-api,
// openapi.json) on 2026-09-17 — this is NOT a generic transactional-email
// API like Resend. Endpoint:
//
//   POST https://api.mail.hostinger.com/api/v1/mailboxes/{mailboxResourceId}/send
//   Authorization: Bearer <token>
//   Content-Type: application/json
//   Body: { to: string[], displayName?: string, subject: string, html?: string, text?: string, ... }
//
// There is no "from" field in the payload: the sending address is whichever
// managed mailbox mailboxResourceId points to (the bearer token must be
// authorized for that mailbox). displayName only overrides the display
// name, not the address. Success is HTTP 204 with an empty body — the API
// does not return a message id, so EmailSendResult.messageId is always left
// undefined on success for this provider.
//
// Same defensive contract as resend-provider.ts: never throws. A missing
// API key or mailbox id, or any request/response failure, resolves to
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

      // Documented success response for this endpoint is 204 No Content —
      // no message id is available to store in provedor_message_id.
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
