import { Controller, Get, Module, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DashboardSummary } from '@flowsync/shared';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/auth-context';
import { ProjectsModule } from '../projects/projects.module';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('workspaces/:workspaceId/dashboard')
class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Workflow-focused dashboard payload in a single request' })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(user.userId, workspaceId);
  }
}

@Module({
  imports: [ProjectsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
