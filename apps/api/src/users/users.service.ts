import { Injectable } from '@nestjs/common';
import type { CurrentUser, UpdatePreferencesInput, UpdateProfileInput } from '@flowsync/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  get(userId: string): Promise<CurrentUser> {
    return this.auth.me(userId);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<CurrentUser> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
    });
    return this.auth.me(userId);
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<CurrentUser> {
    await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    return this.auth.me(userId);
  }
}
