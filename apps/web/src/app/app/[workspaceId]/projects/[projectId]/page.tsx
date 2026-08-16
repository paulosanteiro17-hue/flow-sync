'use client';

import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, can, type ProjectStatus } from '@flowsync/shared';
import { KanbanSquare, MoreHorizontal, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Topbar } from '@/components/layout/topbar';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  useCreateBoard,
  useDeleteProject,
  useProject,
  useProjectMembers,
  useUpdateProject,
} from '@/features/projects/use-projects';
import { useRoomSubscription } from '@/features/realtime/realtime-provider';
import { useMembers, useWorkspace } from '@/features/workspaces/use-workspaces';

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>();
  const router = useRouter();

  const { data: workspace } = useWorkspace(workspaceId);
  const { data: workspaceMembers = [] } = useMembers(workspaceId);
  const { data: project, isLoading, isError, refetch } = useProject(workspaceId, projectId);

  const updateProject = useUpdateProject(workspaceId, projectId);
  const deleteProject = useDeleteProject(workspaceId);
  const createBoard = useCreateBoard(workspaceId, projectId);
  const projectMembers = useProjectMembers(workspaceId, projectId);

  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  useRoomSubscription('project', projectId);

  const canEdit = can(workspace?.role, 'project:update');
  const canDelete = can(workspace?.role, 'project:delete');
  const canManageMembers = can(workspace?.role, 'project:manage_members');
  const canManageBoards = can(workspace?.role, 'board:manage');

  const existingMemberIds = new Set(project?.members.map((member) => member.user.id) ?? []);
  const addableMembers = workspaceMembers.filter(
    (member) => !existingMemberIds.has(member.user.id),
  );

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">{project?.name ?? 'Project'}</h1>
      </Topbar>

      <main className="flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {isError ? (
            <ErrorState
              title="This project could not be loaded"
              message="It may have been deleted, or you may not have access to it."
              onRetry={() => void refetch()}
            />
          ) : isLoading || !project ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start gap-3">
                <span
                  className="mt-1 size-4 shrink-0 rounded-[5px]"
                  style={{ backgroundColor: project.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-semibold tracking-tight">{project.name}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {project.key} · created {formatDate(project.createdAt)} ·{' '}
                    {project.completedTaskCount}/{project.taskCount} tasks done
                  </p>
                  {project.description ? (
                    <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}
                </div>

                <Select
                  value={project.status}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    updateProject.mutate(
                      { status: value as ProjectStatus },
                      { onSuccess: () => toast.success('Project status updated') },
                    )
                  }
                >
                  <SelectTrigger className="w-40" aria-label="Project status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {PROJECT_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {canDelete ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Project actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                        <Trash2 />
                        Delete project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </header>

              <section className="rounded-xl border border-border bg-card">
                <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <KanbanSquare className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Boards</h3>
                  <span className="text-xs text-muted-foreground">{project.boards.length}</span>
                  {canManageBoards ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setBoardName('');
                        setBoardDialogOpen(true);
                      }}
                    >
                      <Plus />
                      New board
                    </Button>
                  ) : null}
                </header>

                {project.boards.length === 0 ? (
                  <EmptyState title="No boards yet" className="m-4 border-0" />
                ) : (
                  <ul className="divide-y divide-border">
                    {project.boards.map((board) => (
                      <li key={board.id}>
                        <Link
                          href={`/app/${workspaceId}/boards/${board.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                        >
                          <KanbanSquare className="size-4 text-muted-foreground" />
                          <span className="flex-1 text-sm font-medium">{board.name}</span>
                          {board.isDefault ? (
                            <span className="text-[11px] text-muted-foreground">Default</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card">
                <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <Users className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Members</h3>
                  <span className="text-xs text-muted-foreground">{project.members.length}</span>
                  {canManageMembers && addableMembers.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setSelectedMemberIds([]);
                        setMembersDialogOpen(true);
                      }}
                    >
                      <UserPlus />
                      Add members
                    </Button>
                  ) : null}
                </header>

                <ul className="divide-y divide-border">
                  {project.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                      <UserAvatar user={member.user} size="sm" decorative />
                      <span className="flex-1 text-sm">{member.user.name}</span>
                      {member.user.id === project.lead?.id ? (
                        <span className="text-xs text-muted-foreground">Lead</span>
                      ) : null}
                      {canManageMembers ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${member.user.name} from this project`}
                          onClick={() =>
                            projectMembers.remove.mutate(member.user.id, {
                              onSuccess: () =>
                                toast.success(`${member.user.name} removed from the project`),
                              onError: (error) =>
                                toast.error(
                                  error instanceof ApiError
                                    ? error.message
                                    : 'The member could not be removed.',
                                ),
                            })
                          }
                        >
                          <X />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </main>

      {/* --- New board --------------------------------------------------- */}
      <Dialog open={boardDialogOpen} onOpenChange={setBoardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New board</DialogTitle>
            <DialogDescription>
              It starts with the default workflow columns: Backlog, To Do, In Progress, Review and
              Done.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!boardName.trim()) return;
              createBoard.mutate(
                { name: boardName.trim(), withDefaultColumns: true },
                {
                  onSuccess: () => {
                    toast.success(`${boardName.trim()} created`);
                    setBoardDialogOpen(false);
                  },
                  onError: () => toast.error('The board could not be created.'),
                },
              );
            }}
            className="space-y-4"
          >
            <Field label="Name" htmlFor="board-name" required>
              <Input
                id="board-name"
                value={boardName}
                onChange={(event) => setBoardName(event.target.value)}
                placeholder="Sprint 12"
                autoFocus
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setBoardDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createBoard.isPending} disabled={!boardName.trim()}>
                Create board
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- Add members ------------------------------------------------- */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>Guests only see the projects they are added to.</DialogDescription>
          </DialogHeader>

          <div className="max-h-64 scrollbar-thin space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
            {addableMembers.map((member) => (
              <label
                key={member.user.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/60"
              >
                <Checkbox
                  checked={selectedMemberIds.includes(member.user.id)}
                  onCheckedChange={() =>
                    setSelectedMemberIds((current) =>
                      current.includes(member.user.id)
                        ? current.filter((id) => id !== member.user.id)
                        : [...current, member.user.id],
                    )
                  }
                />
                <UserAvatar user={member.user} size="xs" decorative />
                <span className="flex-1 truncate">{member.user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{member.user.email}</span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMembersDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={projectMembers.add.isPending}
              disabled={selectedMemberIds.length === 0}
              onClick={() =>
                projectMembers.add.mutate(selectedMemberIds, {
                  onSuccess: () => {
                    toast.success('Members added to the project');
                    setMembersDialogOpen(false);
                  },
                  onError: () => toast.error('The members could not be added.'),
                })
              }
            >
              Add to project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Delete project ---------------------------------------------- */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {project?.name}?</DialogTitle>
            <DialogDescription>
              Every board, task, comment and attachment in this project is permanently removed.
              Archiving it instead keeps the history — change the status to Archived.
            </DialogDescription>
          </DialogHeader>

          <Field label="Type the project name to confirm" htmlFor="confirm-project-delete">
            <Input
              id="confirm-project-delete"
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              placeholder={project?.name}
            />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteText !== project?.name}
              loading={deleteProject.isPending}
              onClick={() =>
                deleteProject.mutate(projectId, {
                  onSuccess: () => {
                    toast.success('Project deleted');
                    router.push(`/app/${workspaceId}/projects`);
                  },
                  onError: () => toast.error('The project could not be deleted.'),
                })
              }
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
