'use client';

import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  WORKSPACE_ROLES,
  assignableRoles,
  can,
  outranks,
  type WorkspaceRole,
} from '@flowsync/shared';
import { Mail, MoreHorizontal, Trash2, UserPlus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Topbar } from '@/components/layout/topbar';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError } from '@/lib/api-client';
import { formatDate, pluralize, relativeTime } from '@/lib/utils';
import { useCurrentUser } from '@/features/auth/use-auth';
import {
  useInvitations,
  useInviteMember,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMemberRole,
  useWorkspace,
} from '@/features/workspaces/use-workspaces';

export default function TeamPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: currentUser } = useCurrentUser();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: members, isLoading, isError, refetch } = useMembers(workspaceId);

  const canInvite = can(workspace?.role, 'member:invite');
  const { data: invitations } = useInvitations(workspaceId, canInvite);

  const updateRole = useUpdateMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const revokeInvitation = useRevokeInvitation(workspaceId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);

  const myRole = workspace?.role;

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">Team</h1>
      </Topbar>

      <main className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">People</h2>
              <p className="text-sm text-muted-foreground">
                {members ? pluralize(members.length, 'member') : '—'} in {workspace?.name ?? 'this workspace'}
              </p>
            </div>
            {canInvite ? (
              <Button className="ml-auto" onClick={() => setInviteOpen(true)}>
                <UserPlus />
                Invite people
              </Button>
            ) : null}
          </div>

          {isError ? (
            <ErrorState message="The team could not be loaded." onRetry={() => void refetch()} />
          ) : isLoading || !members ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <ul className="divide-y divide-border">
                {members.map((member) => {
                  const isSelf = member.user.id === currentUser?.id;
                  const canManage =
                    myRole !== undefined && !isSelf && outranks(myRole, member.role);

                  return (
                    <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <UserAvatar user={member.user} size="lg" decorative />

                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {member.user.name}
                          {isSelf ? (
                            <span className="text-xs font-normal text-muted-foreground">(you)</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Joined {formatDate(member.joinedAt)} ·{' '}
                          {pluralize(member.projectCount, 'project')}
                        </p>
                      </div>

                      {canManage && can(myRole, 'member:update_role') ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            updateRole.mutate(
                              { userId: member.user.id, role: role as WorkspaceRole },
                              {
                                onSuccess: () => toast.success(`${member.user.name} is now ${ROLE_LABELS[role as WorkspaceRole]}`),
                                onError: (error) =>
                                  toast.error(
                                    error instanceof ApiError ? error.message : 'Role change failed',
                                  ),
                              },
                            )
                          }
                        >
                          <SelectTrigger
                            className="h-8 w-32 text-xs"
                            aria-label={`Role for ${member.user.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WORKSPACE_ROLES.filter((role) =>
                              assignableRoles(myRole).includes(role),
                            ).map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                      )}

                      {canManage && can(myRole, 'member:remove') ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Options for ${member.user.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{member.user.name}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              onSelect={() =>
                                setRemoving({ userId: member.user.id, name: member.user.name })
                              }
                            >
                              <Trash2 />
                              Remove from workspace
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {canInvite ? (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <Mail className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Pending invitations</h3>
              </header>

              {!invitations || invitations.length === 0 ? (
                <EmptyState
                  title="No pending invitations"
                  description="Invited people appear here until they accept."
                  className="m-4 border-0 py-6"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {invitations.map((invitation) => (
                    <li key={invitation.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{invitation.email}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Invited by {invitation.invitedBy.name} · expires{' '}
                          {relativeTime(invitation.expiresAt)}
                        </p>
                      </div>
                      <Badge variant="outline">{ROLE_LABELS[invitation.role]}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          revokeInvitation.mutate(invitation.id, {
                            onSuccess: () => toast.success('Invitation revoked'),
                          })
                        }
                      >
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">What each role can do</h3>
            <dl className="mt-3 space-y-2">
              {WORKSPACE_ROLES.map((role) => (
                <div key={role} className="flex gap-3">
                  <dt className="w-16 shrink-0 text-xs font-semibold">{ROLE_LABELS[role]}</dt>
                  <dd className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>

      <InviteDialog workspaceId={workspaceId} open={inviteOpen} onOpenChange={setInviteOpen} />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              They lose access to every project in this workspace immediately. Their tasks and
              comments stay where they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removeMember.isPending}
              onClick={() =>
                removing &&
                removeMember.mutate(removing.userId, {
                  onSuccess: () => {
                    toast.success(`${removing.name} removed`);
                    setRemoving(null);
                  },
                  onError: (error) =>
                    toast.error(error instanceof ApiError ? error.message : 'Removal failed'),
                })
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InviteDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteMember(workspaceId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER' | 'GUEST'>('MEMBER');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await invite.mutateAsync({ email: email.trim().toLowerCase(), role });
      toast.success('Invitation sent', {
        description: 'In development the invitation link is printed to the API logs.',
      });
      setEmail('');
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The invitation could not be sent.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to the workspace</DialogTitle>
          <DialogDescription>
            They receive a single-use link that expires in seven days.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" htmlFor="invite-email" error={error ?? undefined} required>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
              autoFocus
            />
          </Field>

          <Field label="Role" htmlFor="invite-role" hint={ROLE_DESCRIPTIONS[role]}>
            <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="GUEST">Guest</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending} disabled={!email.trim()}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
