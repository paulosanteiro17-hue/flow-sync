import { Inject, Injectable } from '@nestjs/common';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  type AttachmentView,
} from '@flowsync/shared';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { AccessService } from '../common/access.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TaskMapper } from '../common/task-mapper.service';
import { ActivityService } from '../activity/activity.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StorageService } from '../storage/storage.service';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Magic-byte signatures for the formats where a mismatch between the declared
 * type and the real bytes is worth rejecting. A `.png` that is really a script
 * is the classic upload attack, so the declared type has to survive a sniff.
 */
const MAGIC_BYTES: Array<{ mime: string; test: (buffer: Buffer) => boolean }> = [
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  { mime: 'application/zip', test: (b) => b[0] === 0x50 && b[1] === 0x4b },
];

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly mapper: TaskMapper,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  async list(userId: string, workspaceId: string, taskId: string): Promise<AttachmentView[]> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');

    const attachments = await this.prisma.attachment.findMany({
      where: { taskId },
      select: {
        id: true,
        taskId: true,
        filename: true,
        contentType: true,
        size: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return attachments.map((attachment) => this.toView(attachment, workspaceId));
  }

  async upload(
    userId: string,
    workspaceId: string,
    taskId: string,
    file: UploadedFile | undefined,
    socketId?: string | null,
  ): Promise<AttachmentView> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');
    this.access.assert(context.role, 'attachment:create');

    if (!file) throw AppException.validation('No file was uploaded');
    this.validate(file);

    const extension = this.safeExtension(file.originalname);
    const key = `${workspaceId}/${taskId}/${randomUUID()}${extension}`;
    await this.storage.put(key, file.buffer, file.mimetype);

    const attachment = await this.prisma.attachment.create({
      data: {
        workspaceId,
        taskId,
        uploadedById: userId,
        filename: this.safeFilename(file.originalname),
        storageKey: key,
        contentType: file.mimetype,
        size: file.size,
      },
      select: {
        id: true,
        taskId: true,
        filename: true,
        contentType: true,
        size: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    const view = this.toView(attachment, workspaceId);

    await this.activity.record({
      workspaceId,
      actorId: userId,
      projectId: context.projectId,
      taskId,
      taskKey: context.taskKey,
      type: 'ATTACHMENT_ADDED',
      metadata: { filename: view.filename },
    });

    await this.realtime.emitToBoard(
      context.boardId,
      'attachment.created',
      { attachment: view },
      { actorId: userId, exceptSocketId: socketId },
    );
    await this.realtime.emitToBoard(context.boardId, 'task.updated', {
      task: await this.mapper.summaryById(taskId),
    });

    return view;
  }

  /** Resolves an attachment for download, re-checking access on every request. */
  async openForDownload(
    userId: string,
    workspaceId: string,
    attachmentId: string,
  ): Promise<{ stream: Readable; filename: string; contentType: string; size: number }> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, workspaceId },
      select: {
        storageKey: true,
        filename: true,
        contentType: true,
        size: true,
        taskId: true,
      },
    });
    if (!attachment) throw AppException.notFound('Attachment not found');

    const context = await this.access.requireTask(userId, attachment.taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Attachment not found');

    return {
      stream: await this.storage.getStream(attachment.storageKey),
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
    };
  }

  async remove(
    userId: string,
    workspaceId: string,
    attachmentId: string,
    socketId?: string | null,
  ): Promise<void> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, workspaceId },
      select: { id: true, storageKey: true, filename: true, taskId: true, uploadedById: true },
    });
    if (!attachment) throw AppException.notFound('Attachment not found');

    const context = await this.access.requireTask(userId, attachment.taskId);
    if (attachment.uploadedById !== userId) {
      this.access.assert(context.role, 'attachment:delete_any', 'You can only delete your own uploads');
    }

    await this.prisma.attachment.delete({ where: { id: attachment.id } });
    await this.storage.delete(attachment.storageKey).catch(() => undefined);

    await this.activity.record({
      workspaceId,
      actorId: userId,
      projectId: context.projectId,
      taskId: attachment.taskId,
      taskKey: context.taskKey,
      type: 'ATTACHMENT_REMOVED',
      metadata: { filename: attachment.filename },
    });

    await this.realtime.emitToBoard(
      context.boardId,
      'attachment.deleted',
      { attachmentId, taskId: attachment.taskId },
      { actorId: userId, exceptSocketId: socketId },
    );
    await this.realtime.emitToBoard(context.boardId, 'task.updated', {
      task: await this.mapper.summaryById(attachment.taskId),
    });
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  private validate(file: UploadedFile): void {
    if (file.size > this.config.UPLOAD_MAX_BYTES) {
      throw AppException.unsupportedFile(
        `Files must be ${Math.floor(this.config.UPLOAD_MAX_BYTES / (1024 * 1024))} MB or smaller`,
      );
    }

    if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw AppException.unsupportedFile(`Files of type ${file.mimetype} are not allowed`);
    }

    const extension = extname(file.originalname).toLowerCase();
    if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)) {
      throw AppException.unsupportedFile(`Files with the extension ${extension || '(none)'} are not allowed`);
    }

    const signature = MAGIC_BYTES.find((entry) => entry.mime === file.mimetype);
    if (signature && !signature.test(file.buffer)) {
      throw AppException.unsupportedFile('The file contents do not match its declared type');
    }
  }

  private safeExtension(filename: string): string {
    const extension = extname(filename).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '';
  }

  /** Display-only name: stripped of path separators and control characters. */
  private safeFilename(filename: string): string {
    return (
      filename
        .replace(/[/\\]/g, '_')
        .replace(new RegExp('[\\u0000-\\u001f\\u007f]', 'g'), '')
        .trim()
        .slice(0, 180) || 'file'
    );
  }

  private toView(
    attachment: {
      id: string;
      taskId: string;
      filename: string;
      contentType: string;
      size: number;
      createdAt: Date;
      uploadedBy: { id: string; name: string; avatarUrl: string | null };
    },
    workspaceId: string,
  ): AttachmentView {
    return {
      id: attachment.id,
      taskId: attachment.taskId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      createdAt: attachment.createdAt.toISOString(),
      uploadedBy: attachment.uploadedBy,
      downloadUrl: `${this.config.API_URL}/workspaces/${workspaceId}/attachments/${attachment.id}/download`,
    };
  }
}
