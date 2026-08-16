import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { Public, SkipCsrf } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * A bare `GET /` has no meaning on an API, but a signpost is friendlier than a
 * raw 404 for anyone who pastes the host into a browser — which is exactly what
 * people do with a portfolio deployment.
 */
@ApiTags('health')
@Controller()
export class RootController {
  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  @Public()
  @SkipCsrf()
  @Get()
  @ApiOperation({ summary: 'Service signpost' })
  root(): {
    name: string;
    status: 'ok';
    docs: string | null;
    health: string;
    web: string | null;
  } {
    return {
      name: 'FlowSync API',
      status: 'ok',
      docs: this.config.docsEnabled ? `${this.config.API_URL}/api/docs` : null,
      health: `${this.config.API_URL}/health/ready`,
      web: this.config.webOrigins[0] ?? null,
    };
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @SkipCsrf()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Public()
  @SkipCsrf()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe including database and Redis' })
  async ready(): Promise<{
    status: 'ok' | 'degraded';
    database: boolean;
    redis: boolean | 'disabled';
  }> {
    const database = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redis = this.redis.enabled ? await this.redis.ping() : ('disabled' as const);
    const healthy = database && redis !== false;
    return { status: healthy ? 'ok' : 'degraded', database, redis };
  }
}
