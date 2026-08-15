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
  createSubtaskSchema,
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  myTasksQuerySchema,
  updateSubtaskSchema,
  updateTaskSchema,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type ListTasksQuery,
  type MoveTaskInput,
  type MyTasksQuery,
  type SubtaskView,
  type TaskDetail,
  type TaskSummary,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
} from '@flowsync/shared';
import { CurrentUser, OriginSocketId } from '../common/decorators';
import { zodBody, zodQuery } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('workspaces/:workspaceId')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks')
  @ApiOperation({ summary: 'Filtered task list across the workspace' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(zodQuery(listTasksQuerySchema)) query: ListTasksQuery,
  ): Promise<TaskSummary[]> {
    return this.tasks.list(user.userId, workspaceId, query);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'Tasks assigned to the current user, bucketed by urgency' })
  myTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(zodQuery(myTasksQuerySchema)) query: MyTasksQuery,
  ): Promise<TaskSummary[]> {
    return this.tasks.myTasks(user.userId, workspaceId, query);
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a task in a column' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(zodBody(createTaskSchema)) body: CreateTaskInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<TaskSummary> {
    return this.tasks.create(user.userId, workspaceId, body, socketId);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Task detail with subtasks and creator' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskDetail> {
    return this.tasks.get(user.userId, workspaceId, taskId);
  }

  @Patch('tasks/:taskId')
  @ApiOperation({ summary: 'Patch task fields (only the fields sent are touched)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body(zodBody(updateTaskSchema)) body: UpdateTaskInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<TaskSummary> {
    return this.tasks.update(user.userId, workspaceId, taskId, body, socketId);
  }

  @Patch('tasks/:taskId/move')
  @ApiOperation({ summary: 'Move a task between or within columns' })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body(zodBody(moveTaskSchema)) body: MoveTaskInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<TaskSummary> {
    return this.tasks.move(user.userId, workspaceId, taskId, body, socketId);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @OriginSocketId() socketId: string | null,
  ): Promise<void> {
    return this.tasks.remove(user.userId, workspaceId, taskId, socketId);
  }

  // --- Subtasks ------------------------------------------------------------

  @Post('tasks/:taskId/subtasks')
  @ApiOperation({ summary: 'Add a subtask' })
  createSubtask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body(zodBody(createSubtaskSchema)) body: CreateSubtaskInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<SubtaskView> {
    return this.tasks.createSubtask(user.userId, workspaceId, taskId, body, socketId);
  }

  @Patch('subtasks/:subtaskId')
  @ApiOperation({ summary: 'Rename or complete a subtask' })
  updateSubtask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('subtaskId') subtaskId: string,
    @Body(zodBody(updateSubtaskSchema)) body: UpdateSubtaskInput,
    @OriginSocketId() socketId: string | null,
  ): Promise<SubtaskView> {
    return this.tasks.updateSubtask(user.userId, workspaceId, subtaskId, body, socketId);
  }

  @Delete('subtasks/:subtaskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a subtask' })
  deleteSubtask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('subtaskId') subtaskId: string,
    @OriginSocketId() socketId: string | null,
  ): Promise<void> {
    return this.tasks.deleteSubtask(user.userId, workspaceId, subtaskId, socketId);
  }
}
