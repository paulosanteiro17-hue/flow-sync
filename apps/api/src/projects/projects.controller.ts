import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectMembersSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectDetail,
  type ProjectSummary,
  type UpdateProjectInput,
} from '@flowsync/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { zodBody, zodQuery } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Projects visible to the current user' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(zodQuery(listProjectsQuerySchema)) query: ListProjectsQuery,
  ): Promise<ProjectSummary[]> {
    return this.projects.list(user.userId, workspaceId, query);
  }

  @Post()
  @RequirePermissions('project:create')
  @ApiOperation({ summary: 'Create a project with a default board and columns' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(zodBody(createProjectSchema)) body: CreateProjectInput,
  ): Promise<ProjectSummary> {
    return this.projects.create(user.userId, workspaceId, body);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Project detail with members and boards' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ): Promise<ProjectDetail> {
    return this.projects.get(user.userId, workspaceId, projectId);
  }

  @Patch(':projectId')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: 'Update project settings, status or key' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body(zodBody(updateProjectSchema)) body: UpdateProjectInput,
  ): Promise<ProjectSummary> {
    return this.projects.update(user.userId, workspaceId, projectId, body);
  }

  @Delete(':projectId')
  @RequirePermissions('project:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project and its boards, tasks and comments' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ): Promise<void> {
    return this.projects.remove(user.userId, workspaceId, projectId);
  }

  @Post(':projectId/members')
  @RequirePermissions('project:manage_members')
  @ApiOperation({ summary: 'Add workspace members to a project' })
  addMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body(zodBody(projectMembersSchema)) body: { userIds: string[] },
  ): Promise<ProjectDetail> {
    return this.projects.addMembers(user.userId, workspaceId, projectId, body.userIds);
  }

  @Delete(':projectId/members/:userId')
  @RequirePermissions('project:manage_members')
  @ApiOperation({ summary: 'Remove someone from a project' })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
  ): Promise<ProjectDetail> {
    return this.projects.removeMember(user.userId, workspaceId, projectId, targetUserId);
  }
}
