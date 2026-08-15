/**
 * Fractional lexicographic ranking (LexoRank-style, base 62).
 *
 * Ordering a Kanban board with integer positions turns one drag into O(n) writes
 * and an O(n) realtime payload. Floats run out of precision after ~50 midpoint
 * insertions between the same pair. Rank strings give us O(1) writes, tiny
 * realtime payloads and an unbounded number of insertions — at the cost of the
 * strings slowly growing, which `needsRebalance` detects and `rebalance` fixes.
 *
 * Invariant: for any a < b, `a < rankBetween(a, b) < b` in plain string ordering.
 */

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = CHARS.length; // 62

/** Sentinel used when there is no predecessor: sorts before every real index. */
const LOW = -1;
/** Sentinel used when there is no successor: sorts after every real index. */
const HIGH = BASE;

const MIN_INDEX = 0;
const MAX_INDEX = BASE - 1;

/**
 * Ranks longer than this trigger a column rebalance. 48 characters allows
 * roughly 48 consecutive worst-case insertions at the same position before we
 * pay for a rewrite, which in practice never happens outside stress tests.
 */
export const RANK_MAX_LENGTH = 48;

export const RANK_ALPHABET = CHARS;

function indexAt(value: string, position: number, fallback: number): number {
  if (position >= value.length) return fallback;
  const index = CHARS.indexOf(value.charAt(position));
  if (index === -1) {
    throw new RankError(`Rank "${value}" contains a character outside the base-62 alphabet`);
  }
  return index;
}

export class RankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RankError';
  }
}

/**
 * Returns a rank strictly between `prev` and `next`.
 * Pass an empty string for `prev` to insert at the head, and an empty string for
 * `next` to append at the tail.
 */
export function isValidRank(value: string): boolean {
  if (value.length === 0) return false;
  for (const char of value) {
    if (CHARS.indexOf(char) === -1) return false;
  }
  return true;
}

function assertRankInput(value: string, label: string): void {
  // Validate up front rather than lazily: the walk below stops at the first
  // differing character, so a bad character further right would slip through.
  if (value !== '' && !isValidRank(value)) {
    throw new RankError(`${label} rank "${value}" contains a character outside the base-62 alphabet`);
  }
}

export function rankBetween(prev: string, next: string): string {
  assertRankInput(prev, 'Previous');
  assertRankInput(next, 'Next');

  if (prev !== '' && next !== '' && prev >= next) {
    throw new RankError(`rankBetween expects prev < next, received "${prev}" and "${next}"`);
  }

  let prevIndex = 0;
  let nextIndex = 0;
  let position = 0;

  // Walk to the first position where the two ranks differ.
  for (position = 0; prevIndex === nextIndex; position++) {
    prevIndex = indexAt(prev, position, LOW);
    nextIndex = indexAt(next, position, HIGH);
  }

  let result = prev.slice(0, position - 1);

  if (prevIndex === LOW) {
    // `prev` is a prefix of `next`; skip over leading minimum characters so we
    // do not produce a rank equal to `next`.
    while (nextIndex === MIN_INDEX) {
      nextIndex = position < next.length ? indexAt(next, position++, HIGH) : HIGH;
      result += CHARS.charAt(MIN_INDEX);
    }
    if (nextIndex === MIN_INDEX + 1) {
      result += CHARS.charAt(MIN_INDEX);
      nextIndex = HIGH;
    }
  } else if (prevIndex + 1 === nextIndex) {
    // Consecutive characters: borrow from `prev` and extend to the right.
    result += CHARS.charAt(prevIndex);
    nextIndex = HIGH;
    for (;;) {
      prevIndex = position < prev.length ? indexAt(prev, position++, LOW) : LOW;
      if (prevIndex !== MAX_INDEX) break;
      result += CHARS.charAt(MAX_INDEX);
    }
  }

  return result + CHARS.charAt(Math.ceil((prevIndex + nextIndex) / 2));
}

/** Rank for the first item of an empty list. */
export function firstRank(): string {
  return rankBetween('', '');
}

/** Generates `count` ascending ranks, e.g. for seeding a board's columns. */
export function generateRanks(count: number): string[] {
  const ranks: string[] = [];
  let previous = '';
  for (let index = 0; index < count; index++) {
    previous = rankBetween(previous, '');
    ranks.push(previous);
  }
  return ranks;
}

/**
 * Computes the rank for an item dropped between two neighbours.
 * `before` is the item that will sit above it, `after` the one below.
 */
export function rankForPosition(
  before: { rank: string } | null | undefined,
  after: { rank: string } | null | undefined,
): string {
  return rankBetween(before?.rank ?? '', after?.rank ?? '');
}

export function needsRebalance(rank: string): boolean {
  return rank.length > RANK_MAX_LENGTH;
}

/** Produces evenly spread ranks for an already ordered list of ids. */
export function rebalance<T extends { id: string }>(items: T[]): Array<{ id: string; rank: string }> {
  const ranks = generateRanks(items.length);
  return items.map((item, index) => ({ id: item.id, rank: ranks[index] as string }));
}

export function compareRank(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function sortByRank<T extends { rank: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareRank(a.rank, b.rank));
}
