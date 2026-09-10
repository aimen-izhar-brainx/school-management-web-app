import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

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
}
