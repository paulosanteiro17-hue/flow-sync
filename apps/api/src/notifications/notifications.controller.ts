import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  markNotificationsReadSchema,
  notificationsQuerySchema,
  type NotificationView,
  type NotificationsQuery,
} from '@flowsync/shared';
import { CurrentUser } from '../common/decorators';
import { zodBody, zodQuery } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import type { CursorPage } from '../common/pagination';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('workspaces/:workspaceId/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notification center feed with unread count' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(zodQuery(notificationsQuerySchema)) query: NotificationsQuery,
  ): Promise<CursorPage<NotificationView> & { unreadCount: number }> {
    return this.notifications.list(user.userId, workspaceId, query);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark specific notifications as read' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(zodBody(markNotificationsReadSchema)) body: { ids: string[] },
  ): Promise<{ unreadCount: number }> {
    return this.notifications.markRead(user.userId, workspaceId, body.ids);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every notification in the workspace as read' })
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ unreadCount: number }> {
    return this.notifications.markAllRead(user.userId, workspaceId);
  }

  @Delete(':notificationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss a notification' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('notificationId') notificationId: string,
  ): Promise<void> {
    return this.notifications.remove(user.userId, workspaceId, notificationId);
  }
}
