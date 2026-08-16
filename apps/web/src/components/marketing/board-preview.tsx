'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The product preview on the landing page.
 *
 * It is a real component rather than a screenshot, so it stays sharp at any zoom,
 * adapts to light and dark, and — most importantly — can actually demonstrate the
 * thing the page is selling: a card moving between columns while a second cursor
 * is visible on it. Everything here is presentational and self-contained.
 */

interface PreviewCard {
  id: string;
  key: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  labels: Array<{ name: string; color: string }>;
  assignees: string[];
  column: number;
}

const INITIAL_CARDS: PreviewCard[] = [
  {
    id: '1',
    key: 'WEB-14',
    title: 'Rebuild the pricing page layout',
    priority: 'high',
    labels: [{ name: 'Frontend', color: '#0ea5e9' }],
    assignees: ['SM', 'OC'],
    column: 1,
  },
  {
    id: '2',
    key: 'APP-31',
    title: 'Implement authentication flow',
    priority: 'urgent',
    labels: [{ name: 'Security', color: '#f97316' }],
    assignees: ['DK'],
    column: 1,
  },
  {
    id: '3',
    key: 'PLAT-8',
    title: 'Review database indexes',
    priority: 'medium',
    labels: [{ name: 'Performance', color: '#eab308' }],
    assignees: ['DK'],
    column: 0,
  },
  {
    id: '4',
    key: 'WEB-22',
    title: 'Optimize hero image loading',
    priority: 'high',
    labels: [{ name: 'Performance', color: '#eab308' }],
    assignees: ['LA'],
    column: 2,
  },
  {
    id: '5',
    key: 'APP-12',
    title: 'Create onboarding screens',
    priority: 'medium',
    labels: [{ name: 'Design', color: '#ec4899' }],
    assignees: ['OC'],
    column: 0,
  },
];

const COLUMNS = ['To Do', 'In Progress', 'Review'];

const PRIORITY_STYLES: Record<PreviewCard['priority'], string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-amber-300',
  low: 'bg-sky-400',
};

export function BoardPreview({ animate = true }: { animate?: boolean }) {
  const [cards, setCards] = useState(INITIAL_CARDS);
  const [movingId, setMovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!animate) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // A single card walks To Do -> In Progress -> Review and back, on a slow loop.
    const timer = setInterval(() => {
      setMovingId('3');
      setCards((current) =>
        current.map((card) =>
          card.id === '3' ? { ...card, column: (card.column + 1) % COLUMNS.length } : card,
        ),
      );
      setTimeout(() => setMovingId(null), 900);
    }, 3200);

    return () => clearInterval(timer);
  }, [animate]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/40">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-red-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <p className="ml-2 text-xs font-medium text-muted-foreground">Website Redesign · Main Board</p>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">3 online</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-surface/50 p-3 sm:gap-4 sm:p-4">
        {COLUMNS.map((column, columnIndex) => {
          const columnCards = cards.filter((card) => card.column === columnIndex);
          return (
            <div key={column} className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {column}
                </span>
                <span className="text-[11px] text-muted-foreground/60">{columnCards.length}</span>
              </div>

              <div className="flex min-h-[168px] flex-col gap-2">
                {columnCards.map((card) => (
                  <article
                    key={card.id}
                    className={cn(
                      'group relative rounded-lg border border-border bg-card p-2.5 shadow-sm transition-all duration-500',
                      movingId === card.id &&
                        'ring-2 ring-primary/60 shadow-lg shadow-primary/10 -translate-y-0.5',
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span
                        className={cn('size-1.5 rounded-full', PRIORITY_STYLES[card.priority])}
                        aria-hidden
                      />
                      <span className="font-mono text-[10px] font-medium text-muted-foreground">
                        {card.key}
                      </span>
                    </div>

                    <p className="text-[12px] font-medium leading-snug text-card-foreground">
                      {card.title}
                    </p>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                        style={{
                          backgroundColor: `color-mix(in oklch, ${card.labels[0]?.color} 15%, transparent)`,
                          color: card.labels[0]?.color,
                        }}
                      >
                        {card.labels[0]?.name}
                      </span>
                      <div className="flex -space-x-1" aria-hidden>
                        {card.assignees.map((assignee) => (
                          <span
                            key={assignee}
                            className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary ring-2 ring-card"
                          >
                            {assignee}
                          </span>
                        ))}
                      </div>
                    </div>

                    {movingId === card.id ? (
                      <span className="absolute -right-1 -top-1 flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground shadow-md">
                        Daniel
                      </span>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
