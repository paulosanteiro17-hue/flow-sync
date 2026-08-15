import { Injectable } from '@nestjs/common';
import type { TaskDetail, TaskSummary } from '@flowsync/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const TASK_SUMMARY_SELECT = {
  id: true,
  key: true,
  title: true,
  priority: true,
  rank: true,
  columnId: true,
  boardId: true,
  projectId: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  estimate: true,
  storyPoints: true,
  assignees: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  _count: { select: { comments: true, attachments: true, subtasks: true } },
} satisfies Prisma.TaskSelect;

export type TaskSummaryRow = Prisma.TaskGetPayload<{ select: typeof TASK_SUMMARY_SELECT }>;

export const TASK_DETAIL_SELECT = {
  ...TASK_SUMMARY_SELECT,
  description: true,
  creator: { select: { id: true, name: true, avatarUrl: true } },
  subtasks: {
    select: { id: true, title: true, completed: true, rank: true, createdAt: true },
    orderBy: { rank: 'asc' },
  },
  project: { select: { name: true } },
  column: { select: { name: true } },
} satisfies Prisma.TaskSelect;

export type TaskDetailRow = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;

/**
 * Turns Prisma rows into the wire shapes shared with the web app.
 *
 * Completed-subtask counts deliberately come from one grouped query for the whole
 * page rather than from a per-task include: on a 300-task board that is the
 * difference between two queries and three hundred.
 */
@Injectable()
export class TaskMapper {
  constructor(private readonly prisma: PrismaService) {}

  async toSummaries(rows: TaskSummaryRow[]): Promise<TaskSummary[]> {
    if (rows.length === 0) return [];
    const completed = await this.completedSubtaskCounts(rows.map((row) => row.id));
    return rows.map((row) => this.toSummary(row, completed.get(row.id) ?? 0));
  }

  async toDetail(row: TaskDetailRow): Promise<TaskDetail> {
    const completedSubtaskCount = row.subtasks.filter((subtask) => subtask.completed).length;
    return {
      ...this.toSummary(row, completedSubtaskCount),
      description: row.description,
      creator: row.creator,
      subtasks: row.subtasks.map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        completed: subtask.completed,
        rank: subtask.rank,
        createdAt: subtask.createdAt.toISOString(),
      })),
      projectName: row.project.name,
      columnName: row.column.name,
    };
  }

  /** Loads a single task in summary shape, used after mutations to build the realtime payload. */
  async summaryById(taskId: string): Promise<TaskSummary> {
    const row = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: TASK_SUMMARY_SELECT,
    });
    const [summary] = await this.toSummaries([row]);
    return summary as TaskSummary;
  }

  private toSummary(row: TaskSummaryRow, completedSubtaskCount: number): TaskSummary {
    return {
      id: row.id,
      key: row.key,
      title: row.title,
      priority: row.priority,
      rank: row.rank,
      columnId: row.columnId,
      boardId: row.boardId,
      projectId: row.projectId,
      dueDate: row.dueDate?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      estimate: row.estimate,
      storyPoints: row.storyPoints,
      assignees: row.assignees.map((assignee) => assignee.user),
      labels: row.labels.map((taskLabel) => taskLabel.label),
      commentCount: row._count.comments,
      attachmentCount: row._count.attachments,
      subtaskCount: row._count.subtasks,
      completedSubtaskCount,
      isDone: row.completedAt !== null,
    };
  }

  private async completedSubtaskCounts(taskIds: string[]): Promise<Map<string, number>> {
    const grouped = await this.prisma.subtask.groupBy({
      by: ['taskId'],
      where: { taskId: { in: taskIds }, completed: true },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.taskId, row._count._all] as const));
  }
}
