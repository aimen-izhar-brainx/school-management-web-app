import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './jwt.strategy.js';
import { generateRawToken, hashToken, meetsPasswordRules } from './security.util.js';

const PASSWORD_RESET_TTL_MINUTES = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, rememberMe = false) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const { token: refreshToken, expiresAt: refreshTokenExpiresAt } = await this.issueRefreshToken(
      this.prisma,
      user.id,
      rememberMe,
    );

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role),
      refreshToken,
      rememberMe,
      refreshTokenExpiresAt,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async refresh(rawRefreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawRefreshToken) },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const user = await this.users.findById(stored.userId);
    if (!user) throw new UnauthorizedException('Session expired. Please sign in again.');

    const { token: refreshToken, expiresAt: refreshTokenExpiresAt } = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      return this.issueRefreshToken(tx, user.id, stored.longLived);
    });

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role),
      refreshToken,
      rememberMe: stored.longLived,
      refreshTokenExpiresAt,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken) },
      data: { revokedAt: new Date() },
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Burn roughly the same time a real request spends on its DB writes, so response
      // timing does not reveal whether the address has an account.
      await bcrypt.hash(email, 10);
      return; // never reveal whether the address has an account
    }

    const rawToken = generateRawToken();
    await this.prisma.$transaction([
      // Invalidate any reset links already in flight so only the newest one can be used.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          tokenHash: hashToken(rawToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
        },
      }),
    ]);

    // Don't hold the response open for the SMTP round-trip.
    void this.mail.sendPasswordResetEmail(user.email, rawToken).catch((error: unknown) => {
      this.logger.error(`Failed to send password reset email to ${user.email}`, error);
    });
  }

  async verifyResetToken(rawToken: string): Promise<{ email: string }> {
    const record = await this.findValidResetToken(rawToken);
    const user = await this.users.findById(record.userId);
    if (!user) throw new BadRequestException('This reset link is invalid.');
    return { email: user.email };
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    if (!meetsPasswordRules(password)) {
      throw new BadRequestException('Your password does not meet all the requirements.');
    }

    const record = await this.findValidResetToken(rawToken);
    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async findValidResetToken(rawToken: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link has expired.');
    }

    return record;
  }

  private signAccessToken(userId: string, email: string, role: string): string {
    const payload: JwtPayload = { sub: userId, email, role };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
    });
  }

  private async issueRefreshToken(
    db: PrismaService | Prisma.TransactionClient,
    userId: string,
    longLived: boolean,
  ): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = generateRawToken();
    const days = Number(
      this.config.get(longLived ? 'JWT_REFRESH_TTL_DAYS_REMEMBER' : 'JWT_REFRESH_TTL_DAYS', '7'),
    );
    const expiresAt = new Date(Date.now() + days * 86_400_000);

    await db.refreshToken.create({
      data: {
        tokenHash: hashToken(rawToken),
        userId,
        longLived,
        expiresAt,
      },
    });

    return { token: rawToken, expiresAt };
  }
}
