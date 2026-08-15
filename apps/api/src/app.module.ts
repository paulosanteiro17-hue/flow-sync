import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfigModule } from './config/config.module';
import { CONFIG_TOKEN, type AppConfig } from './config/env';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtCookieGuard } from './common/guards/jwt-cookie.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { WorkspaceContextGuard } from './common/guards/workspace-context.guard';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MailerModule } from './mailer/mailer.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ActivityModule } from './activity/activity.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ProjectsModule } from './projects/projects.module';
import { BoardsModule } from './boards/boards.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { SearchModule } from './search/search.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [CONFIG_TOKEN],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          // A stable id per request, echoed to the client in error bodies so a
          // user can report a failure without the server leaking internals.
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const existing = req.headers['x-request-id'];
            const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
              '*.password',
              '*.passwordHash',
              '*.token',
              '*.tokenHash',
              '*.refreshToken',
              '*.secret',
            ],
            censor: '[redacted]',
          },
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url === '/health' || req.url === '/health/ready',
          },
          customProps: (req: IncomingMessage) => {
            const request = req as IncomingMessage & {
              auth?: { userId: string };
              workspace?: { workspaceId: string };
            };
            return {
              userId: request.auth?.userId,
              workspaceId: request.workspace?.workspaceId,
            };
          },
          transport:
            config.isProduction || config.isTest
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } },
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    CommonModule,
    MailerModule,
    RealtimeModule,
    ActivityModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    ProjectsModule,
    BoardsModule,
    TasksModule,
    CommentsModule,
    AttachmentsModule,
    SearchModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters and is enforced here: identity → CSRF → tenancy → RBAC → budget.
    { provide: APP_GUARD, useClass: JwtCookieGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: WorkspaceContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
