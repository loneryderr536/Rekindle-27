import { Resend } from "resend";
import { env } from "@/lib/env";

export interface EmailSender {
  send(m: {
    to: string;
    subject: string;
    html: string;
    attachments?: { filename: string; content: Buffer; contentId: string }[];
    /** Same key → the provider sends once, so a retry after an unrecorded success is not a duplicate. */
    idempotencyKey?: string;
  }): Promise<void>;
}

export class ResendSender implements EmailSender {
  private client = new Resend(env.RESEND_API_KEY);

  async send(m: Parameters<EmailSender["send"]>[0]): Promise<void> {
    const { error } = await this.client.emails.send({
      from: env.EMAIL_FROM,
      to: m.to,
      subject: m.subject,
      html: m.html,
      attachments: m.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: "image/png",
        contentId: a.contentId,
      })),
    }, m.idempotencyKey ? { idempotencyKey: m.idempotencyKey } : undefined);
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
  }
}

let override: EmailSender | null = null;
let singleton: EmailSender | null = null;

export function setEmailSenderForTests(s: EmailSender | null): void {
  override = s;
}

/** Test override if set, otherwise a lazily created Resend sender. */
export function getEmailSender(): EmailSender {
  if (override) return override;
  return (singleton ??= new ResendSender());
}
