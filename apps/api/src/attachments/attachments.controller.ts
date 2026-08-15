import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AttachmentView } from '@flowsync/shared';
import type { Response } from 'express';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { CurrentUser, OriginSocketId, RateLimit } from '../common/decorators';
import type { AuthenticatedUser } from '../common/auth-context';
import { AttachmentsService, type UploadedFile as UploadedFileShape } from './attachments.service';

@ApiTags('attachments')
@Controller('workspaces/:workspaceId')
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  @Get('tasks/:taskId/attachments')
  @ApiOperation({ summary: 'Attachments on a task' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ): Promise<AttachmentView[]> {
    return this.attachments.list(user.userId, workspaceId, taskId);
  }

  @Post('tasks/:taskId/attachments')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'user', name: 'attachment:upload' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file to a task' })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @UploadedFile() file: UploadedFileShape | undefined,
    @OriginSocketId() socketId: string | null,
  ): Promise<AttachmentView> {
    return this.attachments.upload(user.userId, workspaceId, taskId, file, socketId);
  }

  /**
   * Downloads are streamed through the API rather than served statically, so the
   * caller's access is re-checked on every request and the content can never be
   * rendered inline in the browser.
   */
  @Get('attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Download an attachment' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.attachments.openForDownload(user.userId, workspaceId, attachmentId);

    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );

    file.stream.pipe(response);
  }

  @Delete('attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attachment' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('attachmentId') attachmentId: string,
    @OriginSocketId() socketId: string | null,
  ): Promise<void> {
    return this.attachments.remove(user.userId, workspaceId, attachmentId, socketId);
  }
}
