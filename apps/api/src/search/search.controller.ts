import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { searchQuerySchema, type SearchQuery, type SearchResults } from '@flowsync/shared';
import { CurrentUser, RateLimit } from '../common/decorators';
import { zodQuery } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('workspaces/:workspaceId/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RateLimit({ limit: 60, windowMs: 60 * 1000, scope: 'user', name: 'search' })
  @ApiOperation({ summary: 'Search projects, tasks, members and comments' })
  query(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(zodQuery(searchQuerySchema)) query: SearchQuery,
  ): Promise<SearchResults> {
    return this.search.search(user.userId, workspaceId, query);
  }
}
