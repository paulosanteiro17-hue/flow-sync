import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, SkipCsrf } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

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
