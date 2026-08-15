import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { AccessService } from './access.service';
import { CookieService } from './cookie.service';
import { TaskMapper } from './task-mapper.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIG_TOKEN],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_SECRET,
        signOptions: { expiresIn: config.JWT_ACCESS_TTL, issuer: 'flowsync' },
        verifyOptions: { issuer: 'flowsync' },
      }),
    }),
  ],
  providers: [TokenService, CookieService, AccessService, TaskMapper],
  exports: [TokenService, CookieService, AccessService, TaskMapper, JwtModule],
})
export class CommonModule {}
