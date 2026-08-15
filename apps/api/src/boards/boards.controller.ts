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
  createBoardSchema,
  createColumnSchema,
  moveColumnSchema,
  updateBoardSchema,
  updateColumnSchema,
  type BoardColumnView,
  type BoardSnapshot,
  type BoardSummary,
  type CreateBoardInput,
  type CreateColumnInput,
  type MoveColumnInput,
  type UpdateBoardInput,
  type UpdateColumnInput,
} from '@flowsync/shared';
import { CurrentUser, OriginSocketId, RequirePermissions } from '../common/decorators';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import { BoardsService } from './boards.service';

@ApiTags('boards')
@Controller('workspaces/:workspaceId')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get('projects/:projectId/boards')
  @ApiOperation({ summary: 'Boards belonging to a project' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<BoardSummary[]> {
    return this.boards.listForProject(user.userId, projectId);
  }

  @Post('projects/:projectId/boards')
  @RequirePermissions('board:manage')
  @ApiOperation({ summary: 'Create a board, optionally with the default workflow columns' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body(zodBody(createBoardSchema)) body: CreateBoardInput,
  ): Promise<BoardSummary> {
    return this.boards.create(user.userId, projectId, body);
  }

  @Get('boards/:boardId')
  @ApiOperation({ summary: 'Full board snapshot with columns, tasks and the realtime sequence' })
  snapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
  ): Promise<BoardSnapshot> {
    return this.boards.snapshot(user.userId, workspaceId, boardId);
  }

  @Patch('boards/:boardId')
  @RequirePermissions('board:manage')
  @ApiOperation({ summary: 'Rename a board' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
    @Body(zodBody(updateBoardSchema)) body: UpdateBoardInput,
  ): Promise<BoardSummary> {
    return this.boards.update(user.userId, workspaceId, boardId, body);
  }

  @Delete('boards/:boardId')
  @RequirePermissions('board:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a board' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
  ): Promise<void> {
    return this.boards.remove(user.userId, workspaceId, boardId);
  }

  // --- Columns -------------------------------------------------------------

  @Post('boards/:boardId/columns')
  @RequirePermissions('board:manage')
  @ApiOperation({ summary: 'Add a column to a board' })
  createColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
    @Body(zodBody(createColumnSchema)) body: CreateColumnInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<BoardColumnView> {
    return this.boards.createColumn(user.userId, workspaceId, boardId, body, socketId);
  }

  @Patch('columns/:columnId')
  @RequirePermissions('board:manage')
  @ApiOperation({ summary: 'Rename, recolour or set the WIP limit of a column' })
  updateColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('columnId') columnId: string,
    @Body(zodBody(updateColumnSchema)) body: UpdateColumnInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<BoardColumnView> {
    return this.boards.updateColumn(user.userId, workspaceId, columnId, body, socketId);
  }

  @Patch('columns/:columnId/move')
  @RequirePermissions('board:manage')
  @ApiOperation({ summary: 'Reorder a column relative to its neighbours' })
  moveColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('columnId') columnId: string,
    @Body(zodBody(moveColumnSchema)) body: MoveColumnInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<BoardColumnView> {
    return this.boards.moveColumn(user.userId, workspaceId, columnId, body, socketId);
  }

  @Delete('columns/:columnId')
  @RequirePermissions('board:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a column, relocating its tasks when needed' })
  deleteColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('columnId') columnId: string,
    @Query('moveTasksTo') moveTasksTo: string | undefined,
    @OriginSocketId() socketId: string | null,
  ): Promise<void> {
    return this.boards.deleteColumn(user.userId, workspaceId, columnId, moveTasksTo, socketId);
  }
}
