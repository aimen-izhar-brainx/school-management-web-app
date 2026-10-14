import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

const NOTICE_BATCH_SIZE = 50;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.requireEnv('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT', '587')),
      secure: this.config.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.requireEnv('SMTP_USER'),
        pass: this.requireEnv('SMTP_PASS'),
      },
    });
  }

  /** Unlike ConfigService#getOrThrow, this also rejects "" so a blank .env value fails at boot instead of at send time. */
  private requireEnv(key: string): string {
    const value = this.config.get<string>(key, '');
    if (!value) throw new Error(`Missing required environment variable: ${key}`);
    return value;
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.config.getOrThrow<string>('FRONTEND_URL')}/?token=${token}`;
    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to,
      subject: 'Reset your Brainx School password',
      html: `<p>Click below to set a new password. This link expires in 30 minutes.</p><p><a href="${link}">${link}</a></p>`,
    });
    this.logger.log(`Password reset email sent to ${to}`);
  }

  async sendInviteEmail(to: string, name: string, token: string): Promise<void> {
    const link = `${this.config.getOrThrow<string>('FRONTEND_URL')}/?token=${token}`;
    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to,
      subject: 'Welcome to Brainx School — set your password',
      html: `<p>Hi ${escapeHtml(name)}, an account has been created for you. Click below to set your password. This link expires in 7 days.</p><p><a href="${link}">${link}</a></p>`,
    });
    this.logger.log(`Invite email sent to ${to}`);
  }

  /** Tells recipients about a new notice. Sent in BCC batches so addresses stay private; a failed batch doesn't stop the rest. */
  async sendNoticeEmail(
    recipients: string[],
    notice: { title: string; description: string; audience: string | null; postedBy: string },
  ): Promise<void> {
    if (recipients.length === 0) return;
    const from = this.config.getOrThrow<string>('SMTP_FROM');
    const link = this.config.getOrThrow<string>('FRONTEND_URL');
    const audience = notice.audience ? `for ${escapeHtml(notice.audience)}` : 'for the whole school';
    const html =
      `<p>${escapeHtml(notice.postedBy)} posted a new notice ${audience}:</p>` +
      `<h3>${escapeHtml(notice.title)}</h3>` +
      `<p style="white-space:pre-wrap">${escapeHtml(notice.description)}</p>` +
      `<p><a href="${link}">Open the notice board</a></p>`;

    let failed = 0;
    for (let i = 0; i < recipients.length; i += NOTICE_BATCH_SIZE) {
      const batch = recipients.slice(i, i + NOTICE_BATCH_SIZE);
      try {
        await this.transporter.sendMail({ from, to: from, bcc: batch, subject: `New notice: ${notice.title}`, html });
      } catch (error) {
        failed += batch.length;
        this.logger.error(`Notice email batch failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    this.logger.log(`Notice email sent to ${recipients.length - failed} of ${recipients.length} recipients`);
  }
}
