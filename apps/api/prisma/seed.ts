/**
 * Seeds the "Northstar Labs" demo workspace.
 *
 * The data is deliberately realistic — real names, real-sounding engineering work,
 * varied priorities, overdue and upcoming due dates, threaded comments and a
 * populated activity feed — so the demo reads like a product in use rather than a
 * fixture file. Running it twice replaces the demo workspace and leaves any other
 * workspace untouched.
 */
import { PrismaClient, type ActivityType, type Prisma, type TaskPriority } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_LABELS, buildActivityMessage, generateRanks, slugify } from '@flowsync/shared';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoFlow2024!';
const WORKSPACE_NAME = 'Northstar Labs';

interface SeedUser {
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  timezone: string;
}

const USERS: SeedUser[] = [
  {
    name: 'Emma Carter',
    email: 'emma.carter@northstarlabs.io',
    role: 'OWNER',
    timezone: 'Europe/London',
  },
  {
    name: 'Daniel Kim',
    email: 'daniel.kim@northstarlabs.io',
    role: 'ADMIN',
    timezone: 'America/Los_Angeles',
  },
  {
    name: 'Sophia Martinez',
    email: 'sophia.martinez@northstarlabs.io',
    role: 'MEMBER',
    timezone: 'Europe/Madrid',
  },
  {
    name: 'Liam Anderson',
    email: 'liam.anderson@northstarlabs.io',
    role: 'MEMBER',
    timezone: 'America/New_York',
  },
  {
    name: 'Olivia Chen',
    email: 'olivia.chen@northstarlabs.io',
    role: 'MEMBER',
    timezone: 'Asia/Singapore',
  },
  {
    name: 'Noah Bennett',
    email: 'noah.bennett@contractor.dev',
    role: 'GUEST',
    timezone: 'Europe/Berlin',
  },
];

interface SeedTask {
  title: string;
  description?: string;
  column: string;
  priority: TaskPriority;
  assignees: string[];
  labels: string[];
  /** Days from today; negative is overdue. */
  dueInDays?: number;
  estimate?: number;
  storyPoints?: number;
  subtasks?: Array<{ title: string; completed: boolean }>;
  comments?: Array<{ author: string; body: string; hoursAgo: number }>;
}

interface SeedProject {
  name: string;
  key: string;
  description: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
  color: string;
  icon: string;
  lead: string;
  members: string[];
  tasks: SeedTask[];
}

const COLUMNS = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'] as const;
const COLUMN_COLORS: Record<string, string> = {
  Backlog: '#94a3b8',
  'To Do': '#64748b',
  'In Progress': '#3b82f6',
  Review: '#a855f7',
  Done: '#22c55e',
};

const PROJECTS: SeedProject[] = [
  {
    name: 'Website Redesign',
    key: 'WEB',
    description:
      'Rebuild the marketing site on the new design system, with a focus on page speed and a clearer pricing story.',
    status: 'ACTIVE',
    color: '#6366f1',
    icon: 'Globe',
    lead: 'Sophia Martinez',
    members: ['Emma Carter', 'Sophia Martinez', 'Liam Anderson', 'Olivia Chen'],
    tasks: [
      {
        title: 'Audit current pages for design system gaps',
        description:
          'Walk every marketing page and list the components that do not exist in the design system yet. Output is a table of component, page, and estimated build effort.',
        column: 'Done',
        priority: 'MEDIUM',
        assignees: ['Sophia Martinez'],
        labels: ['Design', 'Documentation'],
        dueInDays: -12,
        estimate: 8,
        storyPoints: 3,
        subtasks: [
          { title: 'Home and pricing pages', completed: true },
          { title: 'Docs and changelog', completed: true },
          { title: 'Summarise findings in Notion', completed: true },
        ],
      },
      {
        title: 'Rebuild the pricing page layout',
        description:
          'Three tiers plus an enterprise contact card. The comparison table needs to stay readable at 360px without horizontal scrolling.',
        column: 'In Progress',
        priority: 'HIGH',
        assignees: ['Sophia Martinez', 'Olivia Chen'],
        labels: ['Frontend', 'Design'],
        dueInDays: 3,
        estimate: 16,
        storyPoints: 5,
        subtasks: [
          { title: 'Tier cards', completed: true },
          { title: 'Comparison table', completed: true },
          { title: 'Mobile breakpoints', completed: false },
          { title: 'Annual/monthly toggle', completed: false },
        ],
        comments: [
          {
            author: 'Emma Carter',
            body: 'The comparison table is the part that always breaks on mobile. Can we try stacking it into cards below 640px?',
            hoursAgo: 30,
          },
          {
            author: 'Sophia Martinez',
            body: 'Agreed. @[Olivia Chen](OLIVIA_ID) already has a stacked variant in the design file, I will wire it up today.',
            hoursAgo: 26,
          },
        ],
      },
      {
        title: 'Optimize hero image loading',
        description:
          'Largest Contentful Paint is 3.1s on a throttled 4G connection. Serve AVIF with a WebP fallback and preload the hero.',
        column: 'Review',
        priority: 'HIGH',
        assignees: ['Liam Anderson'],
        labels: ['Performance', 'Frontend'],
        dueInDays: 1,
        estimate: 6,
        storyPoints: 3,
        comments: [
          {
            author: 'Liam Anderson',
            body: 'LCP is down to 1.4s locally. Would like a second pair of eyes on the srcset breakpoints before this ships.',
            hoursAgo: 5,
          },
        ],
      },
      {
        title: 'Write copy for the new features section',
        column: 'To Do',
        priority: 'MEDIUM',
        assignees: ['Emma Carter'],
        labels: ['Documentation'],
        dueInDays: 6,
        storyPoints: 2,
      },
      {
        title: 'Fix layout shift on the testimonials carousel',
        description:
          'CLS spikes to 0.24 when the carousel hydrates because the slide height is not reserved.',
        column: 'To Do',
        priority: 'URGENT',
        assignees: ['Olivia Chen'],
        labels: ['Bug', 'Performance'],
        dueInDays: -1,
        estimate: 4,
      },
      {
        title: 'Add structured data for search results',
        column: 'Backlog',
        priority: 'LOW',
        assignees: [],
        labels: ['Frontend'],
        storyPoints: 2,
      },
      {
        title: 'Retire the legacy CSS bundle',
        description:
          'Roughly 180KB of unused styles still ship on every page. Remove once the last legacy page is migrated.',
        column: 'Backlog',
        priority: 'MEDIUM',
        assignees: ['Liam Anderson'],
        labels: ['Performance'],
        storyPoints: 5,
      },
    ],
  },
  {
    name: 'Mobile App',
    key: 'APP',
    description:
      'React Native client for iOS and Android. First release targets task browsing, comments and push notifications.',
    status: 'ACTIVE',
    color: '#0ea5e9',
    icon: 'Smartphone',
    lead: 'Daniel Kim',
    members: ['Daniel Kim', 'Olivia Chen', 'Liam Anderson', 'Emma Carter'],
    tasks: [
      {
        title: 'Implement authentication flow',
        description:
          'Sign in, sign up and biometric unlock. Tokens live in the platform keychain, never in AsyncStorage.',
        column: 'In Progress',
        priority: 'URGENT',
        assignees: ['Daniel Kim'],
        labels: ['Security', 'Backend'],
        dueInDays: 2,
        estimate: 20,
        storyPoints: 8,
        subtasks: [
          { title: 'Sign-in screen', completed: true },
          { title: 'Keychain storage', completed: true },
          { title: 'Refresh token rotation', completed: false },
          { title: 'Biometric unlock', completed: false },
          { title: 'Error states', completed: false },
        ],
        comments: [
          {
            author: 'Emma Carter',
            body: 'Please make sure the refresh rotation matches the web behaviour exactly, including reuse detection.',
            hoursAgo: 48,
          },
          {
            author: 'Daniel Kim',
            body: 'Yes, same endpoint and same family revocation. I am adding an integration test for the reuse case.',
            hoursAgo: 44,
          },
          {
            author: 'Olivia Chen',
            body: 'Shout if you want me to take the error states, I have capacity after the onboarding screens.',
            hoursAgo: 20,
          },
        ],
      },
      {
        title: 'Create onboarding screens',
        description:
          'Four-step carousel introducing boards, real-time updates, mentions and notifications.',
        column: 'In Progress',
        priority: 'HIGH',
        assignees: ['Olivia Chen'],
        labels: ['Frontend', 'Design'],
        dueInDays: 5,
        estimate: 12,
        storyPoints: 5,
        subtasks: [
          { title: 'Illustrations', completed: true },
          { title: 'Carousel component', completed: false },
          { title: 'Skip and resume behaviour', completed: false },
        ],
      },
      {
        title: 'Fix notification race condition',
        description:
          'Two notifications arriving in the same tick sometimes leave the badge count one behind. Suspected state update batching in the reducer.',
        column: 'Review',
        priority: 'URGENT',
        assignees: ['Liam Anderson', 'Daniel Kim'],
        labels: ['Bug', 'Performance'],
        dueInDays: 0,
        estimate: 5,
        comments: [
          {
            author: 'Liam Anderson',
            body: 'Reproduced it: the badge reads from a stale closure. Fix is to derive the count from the store instead of incrementing locally.',
            hoursAgo: 8,
          },
        ],
      },
      {
        title: 'Offline queue for comment drafts',
        column: 'Backlog',
        priority: 'MEDIUM',
        assignees: [],
        labels: ['Frontend'],
        storyPoints: 8,
      },
      {
        title: 'Set up Detox end-to-end tests',
        column: 'To Do',
        priority: 'MEDIUM',
        assignees: ['Daniel Kim'],
        labels: ['Backend', 'Documentation'],
        dueInDays: 9,
        storyPoints: 5,
      },
      {
        title: 'App icon and splash screen assets',
        column: 'Done',
        priority: 'LOW',
        assignees: ['Olivia Chen'],
        labels: ['Design'],
        dueInDays: -6,
        storyPoints: 1,
      },
    ],
  },
  {
    name: 'Q4 Product Launch',
    key: 'LAUNCH',
    description:
      'Coordination for the November launch: pricing, billing, docs, launch post and the support runbook.',
    status: 'PLANNING',
    color: '#f59e0b',
    icon: 'Rocket',
    lead: 'Emma Carter',
    members: ['Emma Carter', 'Daniel Kim', 'Sophia Martinez', 'Noah Bennett'],
    tasks: [
      {
        title: 'Build billing page',
        description:
          'Plan selection, seat count and invoice history. Payment provider integration is a separate task.',
        column: 'To Do',
        priority: 'HIGH',
        assignees: ['Sophia Martinez'],
        labels: ['Frontend', 'Feature'],
        dueInDays: 14,
        estimate: 24,
        storyPoints: 8,
      },
      {
        title: 'Draft the launch announcement',
        column: 'In Progress',
        priority: 'MEDIUM',
        assignees: ['Emma Carter'],
        labels: ['Documentation'],
        dueInDays: 10,
        storyPoints: 3,
        comments: [
          {
            author: 'Noah Bennett',
            body: 'Happy to review the draft for tone before it goes out. I did the same for the last two releases.',
            hoursAgo: 12,
          },
        ],
      },
      {
        title: 'Write the support runbook',
        description:
          'What support should do for the ten most likely launch-day questions, with escalation paths.',
        column: 'Backlog',
        priority: 'MEDIUM',
        assignees: ['Noah Bennett'],
        labels: ['Documentation'],
        dueInDays: 18,
        storyPoints: 3,
      },
      {
        title: 'Security review of the billing flow',
        description: 'Focus on webhook signature verification, idempotency keys and PII in logs.',
        column: 'Backlog',
        priority: 'HIGH',
        assignees: ['Daniel Kim'],
        labels: ['Security'],
        dueInDays: 21,
        storyPoints: 5,
      },
      {
        title: 'Pricing page A/B test plan',
        column: 'Backlog',
        priority: 'LOW',
        assignees: ['Emma Carter'],
        labels: ['Documentation', 'Design'],
        storyPoints: 2,
      },
    ],
  },
  {
    name: 'Internal Platform',
    key: 'PLAT',
    description:
      'Developer platform work: CI, observability, database health and the shared component library.',
    status: 'ACTIVE',
    color: '#10b981',
    icon: 'Server',
    lead: 'Liam Anderson',
    members: ['Liam Anderson', 'Daniel Kim', 'Emma Carter'],
    tasks: [
      {
        title: 'Optimize API response time',
        description:
          'The board endpoint spends most of its time on N+1 subtask counts. Replace with a single grouped query and measure again.',
        column: 'Done',
        priority: 'HIGH',
        assignees: ['Liam Anderson'],
        labels: ['Performance', 'Backend'],
        dueInDays: -3,
        estimate: 10,
        storyPoints: 5,
        subtasks: [
          { title: 'Profile the endpoint', completed: true },
          { title: 'Replace per-task counts', completed: true },
          { title: 'Add a regression test', completed: true },
        ],
        comments: [
          {
            author: 'Liam Anderson',
            body: 'p95 went from 340ms to 62ms on a 300-task board. The fix was one grouped query instead of one per task.',
            hoursAgo: 72,
          },
          {
            author: 'Daniel Kim',
            body: 'Nice. Worth writing this up in the architecture docs so the next person does not reintroduce it.',
            hoursAgo: 70,
          },
        ],
      },
      {
        title: 'Review database indexes',
        description:
          'Check the query plans for the activity feed and notification list. Both are cursor-paginated and should never sequential scan.',
        column: 'Review',
        priority: 'MEDIUM',
        assignees: ['Daniel Kim'],
        labels: ['Performance', 'Backend'],
        dueInDays: 4,
        estimate: 6,
        storyPoints: 3,
      },
      {
        title: 'Configure CI pipeline',
        description:
          'Lint, typecheck, unit tests, build and end-to-end on every pull request. Must fail loudly.',
        column: 'In Progress',
        priority: 'HIGH',
        assignees: ['Liam Anderson', 'Daniel Kim'],
        labels: ['Backend', 'Documentation'],
        dueInDays: 2,
        estimate: 8,
        storyPoints: 5,
        subtasks: [
          { title: 'Install and cache dependencies', completed: true },
          { title: 'Lint and typecheck jobs', completed: true },
          { title: 'Postgres and Redis services', completed: true },
          { title: 'Playwright job', completed: false },
        ],
      },
      {
        title: 'Add structured request logging',
        column: 'Done',
        priority: 'MEDIUM',
        assignees: ['Daniel Kim'],
        labels: ['Backend', 'Security'],
        dueInDays: -8,
        storyPoints: 3,
      },
      {
        title: 'Alerting for WebSocket disconnect spikes',
        column: 'Backlog',
        priority: 'MEDIUM',
        assignees: ['Liam Anderson'],
        labels: ['Backend', 'Performance'],
        storyPoints: 5,
      },
      {
        title: 'Document the realtime event contract',
        column: 'To Do',
        priority: 'LOW',
        assignees: ['Emma Carter'],
        labels: ['Documentation'],
        dueInDays: 12,
        storyPoints: 2,
      },
    ],
  },
];

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(17, 0, 0, 0);
  return date;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  console.log('Seeding the Northstar Labs demo workspace…');

  const slug = slugify(WORKSPACE_NAME);

  // Replace any previous demo workspace; other workspaces are never touched.
  await prisma.workspace.deleteMany({ where: { slug } });

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const users = new Map<string, string>();
  for (const seedUser of USERS) {
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      create: {
        email: seedUser.email,
        name: seedUser.name,
        passwordHash,
        timezone: seedUser.timezone,
        preference: { create: {} },
      },
      update: { name: seedUser.name, passwordHash, timezone: seedUser.timezone },
      select: { id: true },
    });
    users.set(seedUser.name, user.id);
  }

  const userId = (name: string): string => {
    const id = users.get(name);
    if (!id) throw new Error(`Unknown seed user: ${name}`);
    return id;
  };

  const workspace = await prisma.workspace.create({
    data: {
      name: WORKSPACE_NAME,
      slug,
      isDemo: true,
      members: {
        create: USERS.map((seedUser) => ({ userId: userId(seedUser.name), role: seedUser.role })),
      },
      labels: { create: DEFAULT_LABELS.map((label) => ({ ...label })) },
    },
    select: { id: true },
  });

  const labels = await prisma.label.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true },
  });
  const labelId = (name: string): string => {
    const label = labels.find((candidate) => candidate.name === name);
    if (!label) throw new Error(`Unknown seed label: ${name}`);
    return label.id;
  };

  const activityRows: Prisma.ActivityEventCreateManyInput[] = [];
  const notificationRows: Prisma.NotificationCreateManyInput[] = [];

  const pushActivity = (
    type: ActivityType,
    actorName: string,
    options: {
      projectId?: string;
      taskId?: string;
      taskKey?: string;
      metadata?: Record<string, string | null>;
      createdAt: Date;
    },
  ): void => {
    activityRows.push({
      workspaceId: workspace.id,
      projectId: options.projectId ?? null,
      taskId: options.taskId ?? null,
      actorId: userId(actorName),
      type,
      metadata: (options.metadata ?? {}) as Prisma.InputJsonValue,
      message: buildActivityMessage(type, {
        actorName,
        taskKey: options.taskKey ?? null,
        metadata: options.metadata,
      }),
      createdAt: options.createdAt,
    });
  };

  let projectIndex = 0;
  for (const seedProject of PROJECTS) {
    projectIndex += 1;
    const columnRanks = generateRanks(COLUMNS.length);

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: seedProject.name,
        key: seedProject.key,
        description: seedProject.description,
        status: seedProject.status,
        color: seedProject.color,
        icon: seedProject.icon,
        leadId: userId(seedProject.lead),
        createdAt: hoursAgo(24 * (30 + projectIndex * 5)),
        members: { create: seedProject.members.map((name) => ({ userId: userId(name) })) },
        boards: {
          create: {
            name: 'Main Board',
            isDefault: true,
            rank: generateRanks(1)[0] as string,
            columns: {
              create: COLUMNS.map((column, index) => ({
                name: column,
                color: COLUMN_COLORS[column] as string,
                rank: columnRanks[index] as string,
                isDone: column === 'Done',
              })),
            },
          },
        },
      },
      select: {
        id: true,
        key: true,
        name: true,
        boards: {
          select: { id: true, columns: { select: { id: true, name: true, isDone: true } } },
        },
      },
    });

    const board = project.boards[0];
    if (!board) throw new Error('Seed board was not created');

    pushActivity('PROJECT_CREATED', seedProject.lead, {
      projectId: project.id,
      metadata: { projectName: project.name },
      createdAt: hoursAgo(24 * (30 + projectIndex * 5)),
    });

    const columnId = (name: string): { id: string; isDone: boolean } => {
      const column = board.columns.find((candidate) => candidate.name === name);
      if (!column) throw new Error(`Unknown seed column: ${name}`);
      return { id: column.id, isDone: column.isDone };
    };

    // Ranks are generated per column so cards keep a stable, human order.
    const ranksByColumn = new Map<string, string[]>();
    for (const column of COLUMNS) {
      const count = seedProject.tasks.filter((task) => task.column === column).length;
      ranksByColumn.set(column, generateRanks(count));
    }
    const rankCursor = new Map<string, number>();

    let taskNumber = 0;
    for (const seedTask of seedProject.tasks) {
      taskNumber += 1;
      const column = columnId(seedTask.column);
      const cursor = rankCursor.get(seedTask.column) ?? 0;
      rankCursor.set(seedTask.column, cursor + 1);
      const rank = (ranksByColumn.get(seedTask.column) as string[])[cursor] as string;
      const createdAt = hoursAgo(24 * (20 - taskNumber) + projectIndex * 6);

      const task = await prisma.task.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          boardId: board.id,
          columnId: column.id,
          key: `${project.key}-${taskNumber}`,
          number: taskNumber,
          title: seedTask.title,
          description: seedTask.description ?? null,
          priority: seedTask.priority,
          rank,
          dueDate: seedTask.dueInDays === undefined ? null : daysFromNow(seedTask.dueInDays),
          estimate: seedTask.estimate ?? null,
          storyPoints: seedTask.storyPoints ?? null,
          creatorId: userId(seedProject.lead),
          completedAt: column.isDone ? hoursAgo(24 * 2) : null,
          createdAt,
          assignees: { create: seedTask.assignees.map((name) => ({ userId: userId(name) })) },
          labels: { create: seedTask.labels.map((name) => ({ labelId: labelId(name) })) },
          ...(seedTask.subtasks
            ? {
                subtasks: {
                  create: seedTask.subtasks.map((subtask, index) => ({
                    title: subtask.title,
                    completed: subtask.completed,
                    rank: (generateRanks(seedTask.subtasks?.length ?? 0)[index] as string) ?? 'V',
                  })),
                },
              }
            : {}),
        },
        select: { id: true, key: true, title: true },
      });

      await prisma.project.update({
        where: { id: project.id },
        data: { taskCounter: taskNumber },
      });

      pushActivity('TASK_CREATED', seedProject.lead, {
        projectId: project.id,
        taskId: task.id,
        taskKey: task.key,
        createdAt,
      });

      for (const assignee of seedTask.assignees) {
        pushActivity('TASK_ASSIGNED', seedProject.lead, {
          projectId: project.id,
          taskId: task.id,
          taskKey: task.key,
          metadata: { assigneeName: assignee },
          createdAt: new Date(createdAt.getTime() + 60_000),
        });
      }

      if (
        seedTask.column === 'In Progress' ||
        seedTask.column === 'Review' ||
        seedTask.column === 'Done'
      ) {
        pushActivity('TASK_MOVED', seedTask.assignees[0] ?? seedProject.lead, {
          projectId: project.id,
          taskId: task.id,
          taskKey: task.key,
          metadata: { from: 'To Do', to: seedTask.column },
          createdAt: hoursAgo(24 * 2 + taskNumber),
        });
      }

      for (const comment of seedTask.comments ?? []) {
        // Mentions are stored as `@[Name](userId)`, so the placeholder is resolved here.
        const body = comment.body.replace(/OLIVIA_ID/g, userId('Olivia Chen'));
        const mentionIds = [...body.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)].map(
          (match) => match[1] as string,
        );

        const created = await prisma.comment.create({
          data: {
            workspaceId: workspace.id,
            taskId: task.id,
            authorId: userId(comment.author),
            body,
            createdAt: hoursAgo(comment.hoursAgo),
            mentions: { create: mentionIds.map((mentionedId) => ({ userId: mentionedId })) },
          },
          select: { id: true },
        });
        void created;

        pushActivity('COMMENT_CREATED', comment.author, {
          projectId: project.id,
          taskId: task.id,
          taskKey: task.key,
          createdAt: hoursAgo(comment.hoursAgo),
        });

        for (const mentionedId of mentionIds) {
          notificationRows.push({
            workspaceId: workspace.id,
            userId: mentionedId,
            actorId: userId(comment.author),
            taskId: task.id,
            type: 'MENTION',
            title: `You were mentioned in ${task.key}`,
            body: body.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 140),
            link: `/app/${workspace.id}/boards/${board.id}?task=${task.id}`,
            createdAt: hoursAgo(comment.hoursAgo),
          });
        }
      }

      // A couple of unread assignment notifications so the bell is not empty.
      if (seedTask.priority === 'URGENT' && seedTask.assignees.length > 0) {
        notificationRows.push({
          workspaceId: workspace.id,
          userId: userId(seedTask.assignees[0] as string),
          actorId: userId(seedProject.lead),
          taskId: task.id,
          type: 'TASK_ASSIGNED',
          title: `You were assigned ${task.key}`,
          body: task.title,
          link: `/app/${workspace.id}/boards/${board.id}?task=${task.id}`,
          createdAt: hoursAgo(6),
        });
      }
    }
  }

  for (const seedUser of USERS) {
    pushActivity('MEMBER_JOINED', seedUser.name, {
      metadata: { memberName: seedUser.name },
      createdAt: hoursAgo(24 * 45),
    });
  }

  await prisma.activityEvent.createMany({ data: activityRows });
  await prisma.notification.createMany({ data: notificationRows });

  const counts = {
    users: USERS.length,
    projects: PROJECTS.length,
    tasks: PROJECTS.reduce((total, project) => total + project.tasks.length, 0),
    activity: activityRows.length,
    notifications: notificationRows.length,
  };

  console.log('Demo workspace ready:');
  console.table(counts);
  console.log(`\nSign in with any of these accounts (password: ${DEMO_PASSWORD}):`);
  for (const seedUser of USERS) {
    console.log(`  ${seedUser.role.padEnd(6)} ${seedUser.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
