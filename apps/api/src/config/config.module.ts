import { Global, Module } from '@nestjs/common';
import { CONFIG_TOKEN, loadEnv, type AppConfig } from './env';

@Global()
@Module({
  providers: [
    {
      provide: CONFIG_TOKEN,
      useFactory: (): AppConfig => loadEnv(),
    },
  ],
  exports: [CONFIG_TOKEN],
})
export class AppConfigModule {}
