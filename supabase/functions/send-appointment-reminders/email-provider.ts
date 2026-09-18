// KORbuild · Customer Service Scheduling — email provider abstraction.
// Swapping providers later means implementing this interface again, not
// touching index.ts.

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<EmailSendResult>;
}
