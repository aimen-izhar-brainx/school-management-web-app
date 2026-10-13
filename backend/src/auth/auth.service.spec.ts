import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasswordResetToken, RefreshToken, Role, User } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { hashToken } from './security.util.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    passwordHash: 'hashed-password',
    role: 'admin' as Role,
    sectionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'refresh-1',
    tokenHash: hashToken('raw-refresh-token'),
    userId: 'user-1',
    longLived: false,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeResetToken(overrides: Partial<PasswordResetToken> = {}): PasswordResetToken {
  return {
    id: 'reset-1',
    tokenHash: hashToken('raw-reset-token'),
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let users: { findByEmail: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn> };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    refreshToken: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    passwordResetToken: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    user: {
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jwt: { sign: ReturnType<typeof vi.fn> };
  let mail: { sendPasswordResetEmail: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn>; getOrThrow: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    users = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
    };

    prisma = {
      $transaction: vi.fn(async (operations: unknown) => {
        if (typeof operations === 'function') {
          return (operations as (tx: typeof prisma) => unknown)(prisma);
        }
        return Promise.all(operations as Promise<unknown>[]);
      }),
      refreshToken: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      passwordResetToken: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    jwt = { sign: vi.fn().mockReturnValue('signed-access-token') };

    mail = { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) };

    config = {
      get: vi.fn((key: string, fallback?: unknown) => fallback),
      getOrThrow: vi.fn((key: string) => `fake-${key}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(AuthService);

    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('AC-07.1 returns an access token and a new refresh token, and creates a RefreshToken row for valid credentials', async () => {
      const user = makeUser();
      users.findByEmail.mockResolvedValue(user);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.login(user.email, 'correct-password');

      expect(result.accessToken).toBe('signed-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
      expect(result.user).toEqual({ id: user.id, name: user.name, email: user.email, role: user.role });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: user.id, longLived: false }),
        }),
      );
    });

    it('AC-07.2 throws UnauthorizedException("Invalid email or password.") for a wrong password', async () => {
      const user = makeUser();
      users.findByEmail.mockResolvedValue(user);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(user.email, 'wrong-password')).rejects.toThrow(
        new UnauthorizedException('Invalid email or password.'),
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('AC-07.2 throws UnauthorizedException("Invalid email or password.") for an unknown email', async () => {
      users.findByEmail.mockResolvedValue(null);
      const compareSpy = vi.spyOn(bcrypt, 'compare');

      await expect(service.login('nobody@example.com', 'whatever')).rejects.toThrow(
        new UnauthorizedException('Invalid email or password.'),
      );
      // Same error message as the wrong-password case, and no need to even call bcrypt.
      expect(compareSpy).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('AC-07.2 uses the exact same message for both invalid-credential cases', async () => {
      users.findByEmail.mockResolvedValueOnce(null);
      let unknownEmailMessage = '';
      try {
        await service.login('nobody@example.com', 'whatever');
      } catch (error) {
        unknownEmailMessage = (error as UnauthorizedException).message;
      }

      const user = makeUser();
      users.findByEmail.mockResolvedValueOnce(user);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      let wrongPasswordMessage = '';
      try {
        await service.login(user.email, 'wrong-password');
      } catch (error) {
        wrongPasswordMessage = (error as UnauthorizedException).message;
      }

      expect(unknownEmailMessage).toBe('Invalid email or password.');
      expect(unknownEmailMessage).toBe(wrongPasswordMessage);
    });
  });

  describe('refresh', () => {
    it('AC-07.3 rotates the refresh token inside one transaction: revokes the old one and issues a new one', async () => {
      const stored = makeRefreshToken();
      const user = makeUser();
      prisma.refreshToken.findUnique.mockResolvedValue(stored);
      users.findById.mockResolvedValue(user);

      const result = await service.refresh('raw-refresh-token');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof prisma.$transaction.mock.calls[0][0]).toBe('function');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: stored.id },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: user.id, longLived: stored.longLived }) }),
      );
      expect(result.accessToken).toBe('signed-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe('raw-refresh-token');
    });

    it('AC-07.4 throws UnauthorizedException("Session expired. Please sign in again.") when the token is not found', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('missing-token')).rejects.toThrow(
        new UnauthorizedException('Session expired. Please sign in again.'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('AC-07.4 throws UnauthorizedException("Session expired. Please sign in again.") when the token is revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeRefreshToken({ revokedAt: new Date() }));

      await expect(service.refresh('revoked-token')).rejects.toThrow(
        new UnauthorizedException('Session expired. Please sign in again.'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('AC-07.4 throws UnauthorizedException("Session expired. Please sign in again.") when the token is expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeRefreshToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refresh('expired-token')).rejects.toThrow(
        new UnauthorizedException('Session expired. Please sign in again.'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('UC-07-E1 rejects reuse of a stale token that was already rotated (revoked) by a prior refresh call', async () => {
      // Simulates calling `refresh` a second time with the same raw token after a prior
      // call already rotated (and thus revoked) it.
      prisma.refreshToken.findUnique.mockResolvedValue(makeRefreshToken({ revokedAt: new Date() }));

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(
        new UnauthorizedException('Session expired. Please sign in again.'),
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('AC-07.5 resolves without throwing for a known email, creating a reset token and invalidating prior unused ones', async () => {
      const user = makeUser();
      users.findByEmail.mockResolvedValue(user);

      await expect(service.requestPasswordReset(user.email)).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [operations] = prisma.$transaction.mock.calls[0];
      expect(Array.isArray(operations)).toBe(true);
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: user.id, expiresAt: expect.any(Date) }),
        }),
      );
    });

    it('AC-07.5 resolves without throwing for an unknown email, only burning time via bcrypt.hash', async () => {
      users.findByEmail.mockResolvedValue(null);
      const hashSpy = vi.spyOn(bcrypt, 'hash').mockResolvedValue('decoy-hash' as never);

      await expect(service.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();

      expect(hashSpy).toHaveBeenCalledWith('nobody@example.com', 10);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const validPassword = 'Str0ng!Pass';

    it('AC-07.6 updates passwordHash, marks the token usedAt, and revokes all active refresh tokens', async () => {
      const record = makeResetToken();
      prisma.passwordResetToken.findUnique.mockResolvedValue(record);
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('new-hashed-password' as never);

      await expect(service.resetPassword('raw-reset-token', validPassword)).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [operations] = prisma.$transaction.mock.calls[0];
      expect(Array.isArray(operations)).toBe(true);
      expect(operations).toHaveLength(3);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: record.userId },
        data: { passwordHash: 'new-hashed-password' },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: record.id },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('AC-07.7 throws BadRequestException("This reset link has expired.") when the token is missing', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('missing-token', validPassword)).rejects.toThrow(
        new BadRequestException('This reset link has expired.'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('AC-07.7 throws BadRequestException("This reset link has expired.") when the token was already used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(makeResetToken({ usedAt: new Date() }));

      await expect(service.resetPassword('used-token', validPassword)).rejects.toThrow(
        new BadRequestException('This reset link has expired.'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('AC-07.7 throws BadRequestException("This reset link has expired.") when the token is expired', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        makeResetToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.resetPassword('expired-token', validPassword)).rejects.toThrow(
        new BadRequestException('This reset link has expired.'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('UC-07-E2 rejects a password that fails meetsPasswordRules before the token is even looked up', async () => {
      await expect(service.resetPassword('any-token', 'weak')).rejects.toThrow(
        new BadRequestException('Your password does not meet all the requirements.'),
      );

      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    });
  });

  describe('verifyResetToken', () => {
    it('AC-07.7 throws BadRequestException("This reset link has expired.") when the token is missing', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyResetToken('missing-token')).rejects.toThrow(
        new BadRequestException('This reset link has expired.'),
      );
    });

    it('AC-07.7 throws BadRequestException("This reset link has expired.") when the token was already used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(makeResetToken({ usedAt: new Date() }));

      await expect(service.verifyResetToken('used-token')).rejects.toThrow(
        new BadRequestException('This reset link has expired.'),
      );
    });

    it('AC-07.7 throws BadRequestException("This reset link has expired.") when the token is expired', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        makeResetToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.verifyResetToken('expired-token')).rejects.toThrow(
        new BadRequestException('This reset link has expired.'),
      );
    });

    it('AC-07.7 resolves with the account email for a valid, unused, unexpired token', async () => {
      const user = makeUser();
      prisma.passwordResetToken.findUnique.mockResolvedValue(makeResetToken({ userId: user.id }));
      users.findById.mockResolvedValue(user);

      await expect(service.verifyResetToken('raw-reset-token')).resolves.toEqual({ email: user.email });
    });
  });
});
