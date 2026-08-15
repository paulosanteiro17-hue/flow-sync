import { describe, expect, it } from 'vitest';
import {
  RANK_MAX_LENGTH,
  RankError,
  compareRank,
  firstRank,
  generateRanks,
  needsRebalance,
  rankBetween,
  rankForPosition,
  rebalance,
  sortByRank,
} from './rank';

describe('rankBetween', () => {
  it('produces a rank for the very first item', () => {
    const rank = firstRank();
    expect(rank.length).toBeGreaterThan(0);
    expect(rank > '').toBe(true);
  });

  it('appends after an existing rank', () => {
    const first = firstRank();
    const second = rankBetween(first, '');
    expect(second > first).toBe(true);
  });

  it('prepends before an existing rank', () => {
    const first = firstRank();
    const before = rankBetween('', first);
    expect(before < first).toBe(true);
  });

  it('inserts strictly between two neighbours', () => {
    const a = firstRank();
    const c = rankBetween(a, '');
    const b = rankBetween(a, c);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('rejects an inverted range', () => {
    expect(() => rankBetween('b', 'a')).toThrow(RankError);
    expect(() => rankBetween('a', 'a')).toThrow(RankError);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => rankBetween('a-b', '')).toThrow(RankError);
  });

  it('survives 500 consecutive insertions at the same position', () => {
    // The pathological case: always dropping a card into the same gap.
    let low = firstRank();
    const high = rankBetween(low, '');
    let previousHigh = high;

    for (let i = 0; i < 500; i++) {
      const mid = rankBetween(low, previousHigh);
      expect(low < mid).toBe(true);
      expect(mid < previousHigh).toBe(true);
      previousHigh = mid;
    }

    // And the mirror case, always inserting just after `low`.
    previousHigh = high;
    for (let i = 0; i < 500; i++) {
      const mid = rankBetween(low, previousHigh);
      expect(low < mid).toBe(true);
      expect(mid < previousHigh).toBe(true);
      low = mid;
    }
  });

  it('keeps a list ordered through 300 random insertions', () => {
    let seed = 42;
    const random = () => {
      // Deterministic LCG so a failure is reproducible.
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const list: string[] = [firstRank()];

    for (let i = 0; i < 300; i++) {
      const index = Math.floor(random() * (list.length + 1));
      const before = index > 0 ? list[index - 1] : undefined;
      const after = index < list.length ? list[index] : undefined;
      const rank = rankBetween(before ?? '', after ?? '');
      list.splice(index, 0, rank);
    }

    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]! < list[i]!).toBe(true);
    }
    expect(new Set(list).size).toBe(list.length);
  });
});

describe('generateRanks', () => {
  it('returns ascending unique ranks', () => {
    const ranks = generateRanks(50);
    expect(ranks).toHaveLength(50);
    expect(new Set(ranks).size).toBe(50);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1]! < ranks[i]!).toBe(true);
    }
  });

  it('returns an empty array for zero items', () => {
    expect(generateRanks(0)).toEqual([]);
  });
});

describe('rankForPosition', () => {
  it('handles both neighbours missing', () => {
    expect(rankForPosition(null, null)).toBe(firstRank());
  });

  it('places an item between two tasks', () => {
    const [a, b] = generateRanks(2) as [string, string];
    const mid = rankForPosition({ rank: a }, { rank: b });
    expect(a < mid && mid < b).toBe(true);
  });
});

describe('rebalance', () => {
  it('detects ranks that have grown too long', () => {
    expect(needsRebalance('a')).toBe(false);
    expect(needsRebalance('a'.repeat(RANK_MAX_LENGTH + 1))).toBe(true);
  });

  it('rewrites an ordered list into short evenly spread ranks', () => {
    const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    const result = rebalance(items);
    expect(result.map((r) => r.id)).toEqual(['x', 'y', 'z']);
    expect(result[0]!.rank < result[1]!.rank).toBe(true);
    expect(result[1]!.rank < result[2]!.rank).toBe(true);
    expect(result.every((r) => r.rank.length <= 2)).toBe(true);
  });
});

describe('sorting helpers', () => {
  it('compares ranks lexicographically', () => {
    expect(compareRank('a', 'b')).toBe(-1);
    expect(compareRank('b', 'a')).toBe(1);
    expect(compareRank('a', 'a')).toBe(0);
  });

  it('sorts items by rank without mutating the input', () => {
    const input = [{ rank: 'c' }, { rank: 'a' }, { rank: 'b' }];
    const sorted = sortByRank(input);
    expect(sorted.map((i) => i.rank)).toEqual(['a', 'b', 'c']);
    expect(input.map((i) => i.rank)).toEqual(['c', 'a', 'b']);
  });
});
