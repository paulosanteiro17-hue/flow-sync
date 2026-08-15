import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { activityQuerySchema, type ActivityQuery, type ActivityView } from '@flowsync/shared';
import { CurrentUser } from '../common/decorators';
import { zodQuery } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import type { CursorPage } from '../common/pagination';
import { ActivityService } from './activity.service';

@ApiTags('activity')
@Controller('workspaces/:workspaceId/activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'Cursor-paginated activity feed for a workspace, project or task' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(zodQuery(activityQuerySchema)) query: ActivityQuery,
  ): Promise<CursorPage<ActivityView>> {
    return this.activity.list(user.userId, workspaceId, query);
  }
}
