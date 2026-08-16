import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ChangePasswordInput,
  CurrentUser,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
} from '@flowsync/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { AppException, ERROR_CODES } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { PasswordService } from './password.service';

export interface SessionMeta {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface IssuedSession {
  userId: string;
  email: string;
  refreshToken: string;
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mailer: MailerService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  async signUp(input: SignUpInput, meta: SessionMeta): Promise<IssuedSession> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict(
        'An account with that email already exists',
        ERROR_CODES.EMAIL_TAKEN,
      );
    }

    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        preference: { create: {} },
      },
      select: { id: true, email: true },
    });

    const refreshToken = await this.issueRefreshToken(user.id, randomUUID(), meta);
    return { userId: user.id, email: user.email, refreshToken };
  }

  async signIn(input: SignInInput, meta: SessionMeta): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, passwordHash: true },
    });

    // Always spend the same amount of time, whether or not the account exists.
    if (!user) {
      await this.passwords.verifyDummy(input.password);
      throw AppException.invalidCredentials();
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) throw AppException.invalidCredentials();

    await this.pruneExpiredTokens(user.id);
    const refreshToken = await this.issueRefreshToken(user.id, randomUUID(), meta);
    return { userId: user.id, email: user.email, refreshToken };
  }

  /**
   * Rotates a refresh token. Replaying a token that was already consumed means the
   * cookie leaked, so the entire family is revoked and the user must sign in again.
   */
  async refresh(token: string | undefined, meta: SessionMeta): Promise<IssuedSession> {
    if (!token) throw AppException.unauthenticated('No session to refresh');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        consumedAt: true,
        revokedAt: true,
        user: { select: { email: true } },
      },
    });

    if (!stored) throw AppException.unauthenticated('Session expired. Please sign in again.');

    if (stored.consumedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        'Refresh token reuse detected — revoking token family',
      );
      throw AppException.unauthenticated('Session expired. Please sign in again.');
    }

    if (stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw AppException.unauthenticated('Session expired. Please sign in again.');
    }

    const now = new Date();
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { consumedAt: now },
      });
      const plain = randomBytes(32).toString('base64url');
      await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          familyId: stored.familyId,
          tokenHash: sha256(plain),
          expiresAt: this.refreshExpiry(),
          userAgent: meta.userAgent?.slice(0, 255) ?? null,
          ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
        },
      });
      return plain;
    });

    return { userId: stored.userId, email: stored.user.email, refreshToken };
  }

  async signOut(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async signOutEverywhere(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        timezone: true,
        createdAt: true,
        preference: true,
      },
    });

    if (!user) throw AppException.unauthenticated();

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      createdAt: user.createdAt.toISOString(),
      preferences: {
        theme: (user.preference?.theme as 'light' | 'dark' | 'system' | undefined) ?? 'system',
        emailNotifications: user.preference?.emailNotifications ?? true,
        notifyOnAssignment: user.preference?.notifyOnAssignment ?? true,
        notifyOnMention: user.preference?.notifyOnMention ?? true,
        notifyOnComment: user.preference?.notifyOnComment ?? true,
        notifyOnDueSoon: user.preference?.notifyOnDueSoon ?? true,
      },
    };
  }

  /**
   * Always resolves successfully, whether or not the address is registered — the
   * response must not reveal which emails have accounts.
   */
  async requestPasswordReset(email: string, webOrigin: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;

    const plain = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(plain),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.mailer.sendPasswordReset({
      to: email,
      resetUrl: `${webOrigin}/reset-password?token=${plain}`,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(input.token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
      throw AppException.validation('This reset link is invalid or has expired');
    }

    const passwordHash = await this.passwords.hash(input.password);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      // Changing the password invalidates every existing session.
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw AppException.unauthenticated();

    const valid = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!valid) throw AppException.validation('Your current password is incorrect');

    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  private async issueRefreshToken(
    userId: string,
    familyId: string,
    meta: SessionMeta,
  ): Promise<string> {
    const plain = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(plain),
        expiresAt: this.refreshExpiry(),
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      },
    });
    return plain;
  }

  private async pruneExpiredTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }
}
