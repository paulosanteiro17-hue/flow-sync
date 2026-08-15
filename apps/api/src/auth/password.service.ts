import { Injectable, type OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id with the OWASP 2024 baseline parameters (19 MiB, t=2, p=1).
 *
 * Also owns the dummy-verify used on unknown emails: without it, sign-in would
 * return noticeably faster for addresses that do not exist, handing an attacker a
 * free user-enumeration oracle.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private static readonly OPTIONS: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };

  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash('flowsync-dummy-password-for-constant-time');
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, PasswordService.OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Burns roughly the same time as a real verification, then reports failure. */
  async verifyDummy(plain: string): Promise<false> {
    if (this.dummyHash) {
      await this.verify(this.dummyHash, plain);
    }
    return false;
  }
}
