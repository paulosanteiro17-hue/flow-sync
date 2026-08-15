import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import type { AuthenticatedUser } from './auth-context';

interface AccessTokenClaims {
  sub: string;
  email: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  signAccessToken(user: AuthenticatedUser): string {
    const claims: AccessTokenClaims = { sub: user.userId, email: user.email };
    return this.jwt.sign(claims, { expiresIn: this.config.JWT_ACCESS_TTL });
  }

  /** Returns the identity encoded in the token, or null when it is missing, expired or forged. */
  verifyAccessToken(token: string | undefined): AuthenticatedUser | null {
    if (!token) return null;
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(token);
      if (!claims.sub || !claims.email) return null;
      return { userId: claims.sub, email: claims.email };
    } catch {
      return null;
    }
  }
}
