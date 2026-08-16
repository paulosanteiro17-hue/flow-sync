import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isPast,
  isToday,
  isTomorrow,
  parseISO,
} from 'date-fns';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "in 3 days", "yesterday", "2 hours ago" — used everywhere timestamps appear. */
export function relativeTime(iso: string): string {
  return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
}

export function formatDate(iso: string, pattern = 'd MMM yyyy'): string {
  return format(parseISO(iso), pattern);
}

export interface DueDateDisplay {
  label: string;
  tone: 'overdue' | 'today' | 'soon' | 'future';
}

/** Due dates are the highest-signal thing on a card, so they get their own vocabulary. */
export function describeDueDate(iso: string | null): DueDateDisplay | null {
  if (!iso) return null;
  const date = parseISO(iso);

  if (isToday(date)) return { label: 'Today', tone: 'today' };
  if (isPast(date)) {
    const days = Math.abs(differenceInCalendarDays(date, new Date()));
    return { label: days === 1 ? 'Yesterday' : `${days}d overdue`, tone: 'overdue' };
  }
  if (isTomorrow(date)) return { label: 'Tomorrow', tone: 'soon' };

  const days = differenceInCalendarDays(date, new Date());
  if (days <= 7) return { label: `${days}d left`, tone: 'soon' };

  return { label: format(date, 'd MMM'), tone: 'future' };
}

/** Deterministic avatar tint derived from the user id, so a person keeps one colour. */
export function avatarTint(seed: string): string {
  const palette = [
    'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
    'bg-sky-500/15 text-sky-600 dark:text-sky-300',
    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    'bg-amber-500/15 text-amber-600 dark:text-amber-300',
    'bg-rose-500/15 text-rose-600 dark:text-rose-300',
    'bg-violet-500/15 text-violet-600 dark:text-violet-300',
    'bg-teal-500/15 text-teal-600 dark:text-teal-300',
  ];
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100_000;
  }
  return palette[hash % palette.length] as string;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
