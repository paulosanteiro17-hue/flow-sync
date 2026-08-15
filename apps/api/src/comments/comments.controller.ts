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
  createCommentSchema,
  cursorPaginationSchema,
  updateCommentSchema,
  type CommentView,
  type CreateCommentInput,
  type CursorPaginationInput,
  type UpdateCommentInput,
} from '@flowsync/shared';
import { CurrentUser, OriginSocketId, RateLimit } from '../common/decorators';
import { zodBody, zodQuery } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import type { CursorPage } from '../common/pagination';
import { CommentsService } from './comments.service';

@ApiTags('comments')
@Controller('workspaces/:workspaceId')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('tasks/:taskId/comments')
  @ApiOperation({ summary: 'Comments on a task, newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Query(zodQuery(cursorPaginationSchema)) query: CursorPaginationInput,
  ): Promise<CursorPage<CommentView>> {
    return this.comments.list(user.userId, workspaceId, taskId, query);
  }

  @Post('tasks/:taskId/comments')
  @RateLimit({ limit: 60, windowMs: 60 * 1000, scope: 'user', name: 'comment:create' })
  @ApiOperation({ summary: 'Post a comment, resolving @mentions server-side' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body(zodBody(createCommentSchema)) body: CreateCommentInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<CommentView> {
    return this.comments.create(user.userId, workspaceId, taskId, body, socketId);
  }

  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'Edit your own comment' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('commentId') commentId: string,
    @Body(zodBody(updateCommentSchema)) body: UpdateCommentInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<CommentView> {
    return this.comments.update(user.userId, workspaceId, commentId, body, socketId);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (author, or an admin for any comment)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('commentId') commentId: string,
    @OriginSocketId() socketId: string | null,
  ): Promise<void> {
    return this.comments.remove(user.userId, workspaceId, commentId, socketId);
  }
}
