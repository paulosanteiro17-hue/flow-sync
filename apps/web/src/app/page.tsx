import Link from 'next/link';
import {
  ArrowRight,
  AtSign,
  Bell,
  Check,
  Command,
  Filter,
  KanbanSquare,
  KeyRound,
  Layers,
  Lock,
  MessageSquare,
  MousePointer2,
  Radio,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { BoardPreview } from '@/components/marketing/board-preview';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <ProductPreview />
        <RealtimeSection />
        <FeatureGrid />
        <TeamSection />
        <SecuritySection />
        <PricingPreview />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="FlowSync home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#realtime" className="transition-colors hover:text-foreground">
            Real-time
          </a>
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#security" className="transition-colors hover:text-foreground">
            Security
          </a>
          <a href="#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            Live collaboration, not a refresh button
          </span>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Move work forward, together.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Plan projects, collaborate in real time, and keep your team perfectly in sync.
            When someone moves a card, everyone sees it move.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Start free
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/demo">Explore the demo workspace</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            No credit card. The demo is a fully populated workspace you can click through.
          </p>
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <section className="mx-auto -mt-6 max-w-6xl px-4 pb-20 sm:px-6">
      <BoardPreview />
    </section>
  );
}

function RealtimeSection() {
  const points = [
    {
      icon: MousePointer2,
      title: 'Drag once, everyone sees it',
      body: 'Moves are applied optimistically for the person dragging and pushed over a WebSocket to everyone else on the board. No polling, no refresh.',
    },
    {
      icon: Radio,
      title: 'Presence that means something',
      body: 'See who else has the board open right now, backed by heartbeats with expiry rather than a socket that forgot to disconnect.',
    },
    {
      icon: MessageSquare,
      title: 'Comments and mentions land instantly',
      body: 'Discussion appears as it is written, and an @mention turns into a notification wherever the mentioned person happens to be.',
    },
  ];

  return (
    <section id="realtime" className="border-y border-border bg-surface/50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built around real-time, not bolted on
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every change is broadcast to the room it belongs to, carrying a sequence number so a
            client can tell the difference between &ldquo;nothing happened&rdquo; and
            &ldquo;I missed something&rdquo; — and resynchronise when it matters.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {points.map((point) => (
            <div key={point.title} className="rounded-xl border border-border bg-card p-6">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <point.icon className="size-[18px]" />
              </div>
              <h3 className="mt-4 font-medium">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-3 rounded-xl border border-border bg-card p-6 sm:grid-cols-3">
          {[
            ['Ordering', 'Per-room sequence numbers detect gaps'],
            ['Duplicates', 'Every event carries an id, applied once'],
            ['Reconnects', 'Rooms re-subscribe and state resynchronises'],
          ].map(([title, body]) => (
            <div key={title} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    {
      icon: KanbanSquare,
      title: 'Kanban that persists order',
      body: 'Drag between columns or reorder within one. Positions use fractional ranks, so a move is a single row write no matter how big the board is.',
    },
    {
      icon: Layers,
      title: 'Projects, boards, tasks',
      body: 'Readable ids like WEB-101, subtask progress, priorities, labels, due dates, estimates and attachments.',
    },
    {
      icon: Bell,
      title: 'Notifications that arrive',
      body: 'Assignments, mentions, comments and status changes, delivered live and respecting each person’s preferences.',
    },
    {
      icon: Command,
      title: 'Command palette',
      body: 'Ctrl/Cmd + K to search tasks, jump to a project, create work or open your notifications without touching the mouse.',
    },
    {
      icon: Filter,
      title: 'Filters that combine',
      body: 'Narrow a board by assignee, priority, label, due date and free text at the same time.',
    },
    {
      icon: AtSign,
      title: 'Activity you can trust',
      body: 'Every meaningful change is recorded with who did it, what changed and when — cursor-paginated so it stays fast as it grows.',
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything a working team actually needs
          </h2>
          <p className="mt-4 text-muted-foreground">
            Focused on the daily loop — plan, assign, discuss, move, ship — rather than dashboards
            nobody opens twice.
          </p>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="bg-card p-6">
              <feature.icon className="size-5 text-primary" />
              <h3 className="mt-4 font-medium">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="border-y border-border bg-surface/50 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            One workspace, four levels of trust
          </h2>
          <p className="mt-4 text-muted-foreground">
            Invite the whole team, bring in a contractor as a guest, and let admins run projects
            without handing over the keys to the workspace itself.
          </p>

          <dl className="mt-8 space-y-4">
            {[
              ['Owner', 'Full control, including ownership transfer and deletion.'],
              ['Admin', 'Runs projects, boards and people. Cannot delete the workspace.'],
              ['Member', 'Creates, moves and discusses work across every project.'],
              ['Guest', 'Sees only the projects they were added to, and can comment.'],
            ].map(([role, description]) => (
              <div key={role} className="flex gap-4">
                <dt className="w-16 shrink-0 text-sm font-semibold">{role}</dt>
                <dd className="text-sm text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-primary" />
            Northstar Labs
          </div>
          <ul className="mt-4 divide-y divide-border">
            {[
              ['Emma Carter', 'Owner', 'EC'],
              ['Daniel Kim', 'Admin', 'DK'],
              ['Sophia Martinez', 'Member', 'SM'],
              ['Olivia Chen', 'Member', 'OC'],
              ['Noah Bennett', 'Guest', 'NB'],
            ].map(([name, role, badge]) => (
              <li key={name} className="flex items-center gap-3 py-2.5">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {badge}
                </span>
                <span className="text-sm font-medium">{name}</span>
                <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {role}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  const items = [
    { icon: Lock, title: 'httpOnly session cookies', body: 'No token is readable by JavaScript. Refresh tokens rotate and detect reuse.' },
    { icon: ShieldCheck, title: 'Enforced on the server', body: 'Roles and tenancy are checked in the query that loads the resource, never in the UI alone.' },
    { icon: KeyRound, title: 'Isolated workspaces', body: 'A member of one workspace cannot read, write or subscribe to another. Tested explicitly.' },
    { icon: Zap, title: 'Rate limited', body: 'Sign-in, invitations, comments, search, uploads and socket connections all have budgets.' },
  ];

  return (
    <section id="security" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Security that is part of the design
          </h2>
          <p className="mt-4 text-muted-foreground">
            Multi-tenant software is only as good as its boundaries. FlowSync treats them as the
            first thing to get right, not the last.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
              <item.icon className="size-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingPreview() {
  const tiers = [
    {
      name: 'Free',
      price: '$0',
      cadence: 'forever',
      description: 'For small teams getting organised.',
      features: ['Up to 5 members', 'Unlimited projects', 'Real-time boards', 'Community support'],
      highlighted: false,
    },
    {
      name: 'Team',
      price: '$8',
      cadence: 'per user / month',
      description: 'For teams that live in their board.',
      features: ['Everything in Free', 'Guest collaborators', 'Advanced filters', 'Priority support'],
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      cadence: 'annual',
      description: 'For organisations with compliance needs.',
      features: ['SSO and SCIM', 'Audit export', 'Data residency', 'Dedicated support'],
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="border-y border-border bg-surface/50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple pricing</h2>
          <p className="mt-4 text-muted-foreground">
            An illustration of how FlowSync would be packaged. Billing is not part of this
            portfolio build, so these plans are presentational.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={
                tier.highlighted
                  ? 'relative rounded-xl border-2 border-primary bg-card p-6 shadow-lg'
                  : 'rounded-xl border border-border bg-card p-6'
              }
            >
              {tier.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  Most popular
                </span>
              ) : null}

              <h3 className="font-medium">{tier.name}</h3>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight">{tier.price}</span>
                <span className="text-sm text-muted-foreground">{tier.cadence}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>

              <ul className="mt-6 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          See it sync in two windows
        </h2>
        <p className="mt-4 text-muted-foreground">
          Open the demo workspace in two browsers, move a card in one, and watch it land in the
          other. That is the whole pitch.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/demo">
              Explore the demo workspace
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-up">Create your workspace</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
        <Wordmark className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          A portfolio project demonstrating real-time collaborative software.
        </p>
        <nav className="flex gap-5 text-sm text-muted-foreground sm:ml-auto">
          <Link href="/sign-in" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-up" className="transition-colors hover:text-foreground">
            Sign up
          </Link>
          <Link href="/demo" className="transition-colors hover:text-foreground">
            Demo
          </Link>
        </nav>
      </div>
    </footer>
  );
}
