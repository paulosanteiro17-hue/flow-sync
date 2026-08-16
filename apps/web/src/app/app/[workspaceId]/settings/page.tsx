'use client';

import { can } from '@flowsync/shared';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
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
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { ApiError } from '@/lib/api-client';
import { useCurrentUser, useUpdatePreferences, useUpdateProfile } from '@/features/auth/use-auth';
import {
  useDeleteWorkspace,
  useUpdateWorkspace,
  useWorkspace,
} from '@/features/workspaces/use-workspaces';

function SettingsInner() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { data: user } = useCurrentUser();
  const { data: workspace } = useWorkspace(workspaceId);
  const updateProfile = useUpdateProfile();
  const updatePreferences = useUpdatePreferences();
  const updateWorkspace = useUpdateWorkspace(workspaceId);
  const deleteWorkspace = useDeleteWorkspace();

  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  // The forms are seeded from data that may still be loading on first render.
  // Adjusting during render (rather than in an effect) fills them in as soon as
  // the query resolves, without an extra committed render showing empty fields.
  const [syncedUserId, setSyncedUserId] = useState(user?.id);
  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setName(user.name);
    setTimezone(user.timezone);
  }

  const [syncedWorkspaceId, setSyncedWorkspaceId] = useState(workspace?.id);
  if (workspace && workspace.id !== syncedWorkspaceId) {
    setSyncedWorkspaceId(workspace.id);
    setWorkspaceName(workspace.name);
  }

  const tab = searchParams.get('tab') === 'workspace' ? 'workspace' : 'profile';

  if (!user) return null;

  const preferences = [
    { key: 'notifyOnAssignment', label: 'When a task is assigned to me' },
    { key: 'notifyOnMention', label: 'When someone mentions me' },
    { key: 'notifyOnComment', label: 'When someone comments on my tasks' },
    { key: 'notifyOnDueSoon', label: 'When a task of mine is due soon' },
  ] as const;

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">Settings</h1>
      </Topbar>

      <main className="flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <Tabs
            value={tab}
            onValueChange={(value) =>
              router.replace(
                `/app/${workspaceId}/settings${value === 'workspace' ? '?tab=workspace' : ''}`,
              )
            }
          >
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="workspace">Workspace</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">Your profile</h2>

                <div className="mt-4 flex items-center gap-4">
                  <UserAvatar user={user} size="xl" decorative />
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                <form
                  className="mt-5 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateProfile.mutate(
                      { name: name.trim(), timezone: timezone.trim() },
                      {
                        onSuccess: () => toast.success('Profile updated'),
                        onError: () => toast.error('The profile could not be updated.'),
                      },
                    );
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" htmlFor="profile-name">
                      <Input
                        id="profile-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </Field>

                    <Field
                      label="Timezone"
                      htmlFor="profile-timezone"
                      hint="Used when showing due dates."
                    >
                      <Input
                        id="profile-timezone"
                        value={timezone}
                        onChange={(event) => setTimezone(event.target.value)}
                        placeholder="Europe/London"
                      />
                    </Field>
                  </div>

                  <Field
                    label="Email"
                    htmlFor="profile-email"
                    hint="Your email cannot be changed here."
                  >
                    <Input id="profile-email" value={user.email} disabled />
                  </Field>

                  <Button type="submit" loading={updateProfile.isPending}>
                    Save changes
                  </Button>
                </form>
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">Notifications</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  These control which notifications are created for you.
                </p>

                <ul className="mt-4 space-y-3">
                  {preferences.map((preference) => (
                    <li key={preference.key} className="flex items-center justify-between gap-4">
                      <label htmlFor={preference.key} className="text-sm">
                        {preference.label}
                      </label>
                      <Switch
                        id={preference.key}
                        checked={user.preferences[preference.key]}
                        onCheckedChange={(checked) =>
                          updatePreferences.mutate({ [preference.key]: checked })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            </TabsContent>

            <TabsContent value="workspace" className="space-y-6">
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">Workspace</h2>

                <form
                  className="mt-4 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateWorkspace.mutate(
                      { name: workspaceName.trim() },
                      {
                        onSuccess: () => toast.success('Workspace updated'),
                        onError: (error) =>
                          toast.error(error instanceof ApiError ? error.message : 'Update failed'),
                      },
                    );
                  }}
                >
                  <Field label="Name" htmlFor="workspace-name">
                    <Input
                      id="workspace-name"
                      value={workspaceName}
                      disabled={!can(workspace?.role, 'workspace:update')}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                    />
                  </Field>

                  {can(workspace?.role, 'workspace:update') ? (
                    <Button type="submit" loading={updateWorkspace.isPending}>
                      Save changes
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Only owners and admins can change workspace settings.
                    </p>
                  )}
                </form>
              </section>

              {can(workspace?.role, 'workspace:delete') ? (
                <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
                  <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
                  <Separator className="my-3 bg-destructive/20" />
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Delete this workspace</p>
                      <p className="text-xs text-muted-foreground">
                        Every project, board, task and comment is permanently removed.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      disabled={workspace?.isDemo}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete workspace
                    </Button>
                  </div>
                  {workspace?.isDemo ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      The shared demo workspace is protected from deletion.
                    </p>
                  ) : null}
                </section>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {workspace?.name}?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Type the workspace name to confirm.
            </DialogDescription>
          </DialogHeader>

          <Field label="Workspace name" htmlFor="confirm-delete">
            <Input
              id="confirm-delete"
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              placeholder={workspace?.name}
            />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteText !== workspace?.name}
              loading={deleteWorkspace.isPending}
              onClick={() =>
                deleteWorkspace.mutate(workspaceId, {
                  onSuccess: () => {
                    toast.success('Workspace deleted');
                    router.push('/app');
                  },
                  onError: () => toast.error('The workspace could not be deleted.'),
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

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}
