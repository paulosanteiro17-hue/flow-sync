import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { CONFIG_TOKEN, type AppConfig } from './config/env';

/**
 * The monorepo keeps a single `.env` at the root so docker compose, the API and
 * the Prisma CLI all read the same file. Values already present in the process
 * environment (Docker, CI, hosting provider) always win.
 */
function loadRootEnv(): void {
  for (const candidate of ['../../.env', '../.env', '.env']) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) {
      loadDotenv({ path, override: false });
      return;
    }
  }
}

async function bootstrap(): Promise<void> {
  loadRootEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get<AppConfig>(CONFIG_TOKEN);

  // Behind exactly one reverse proxy in the reference deployments, so `req.ip`
  // reflects the client rather than the proxy.
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin and server-to-server calls arrive without an Origin header.
      if (!origin || config.webOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Socket-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    maxAge: 600,
  });

  app.enableShutdownHooks();

  if (!config.isProduction) {
    const openApi = new DocumentBuilder()
      .setTitle('FlowSync API')
      .setDescription(
        'REST API for FlowSync. Authentication uses httpOnly cookies; every state-changing ' +
          'request must echo the `fs_csrf` cookie in the `X-CSRF-Token` header.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('fs_at')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApi), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(config.PORT, '0.0.0.0');
}

void bootstrap();
