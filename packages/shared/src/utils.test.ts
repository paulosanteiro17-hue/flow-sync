import { describe, expect, it } from 'vitest';
import {
  buildActivityMessage,
  extractMentionIds,
  humanFileSize,
  initials,
  slugify,
  stripMentionMarkup,
  suggestProjectKey,
  taskKey,
  tokenizeMentions,
  truncate,
} from './utils';

describe('slugify', () => {
  it('normalises accents and separators', () => {
    expect(slugify('Northstar Labs')).toBe('northstar-labs');
    expect(slugify('  Café  & Co. ')).toBe('cafe-co');
    expect(slugify('Q4 Product Launch!')).toBe('q4-product-launch');
  });
});

describe('initials', () => {
  it('handles one, two and many names', () => {
    expect(initials('Emma Carter')).toBe('EC');
    expect(initials('Liam')).toBe('LI');
    expect(initials('Maria da Silva Santos')).toBe('MS');
    expect(initials('   ')).toBe('?');
  });
});

describe('task keys', () => {
  it('formats readable ids', () => {
    expect(taskKey('WEB', 101)).toBe('WEB-101');
  });

  it('suggests a project key from its name', () => {
    expect(suggestProjectKey('Website Redesign')).toBe('WR');
    expect(suggestProjectKey('Mobile')).toBe('MOBI');
    expect(suggestProjectKey('Q4 Product Launch')).toBe('QPL');
    expect(suggestProjectKey('!!!')).toBe('PROJ');
  });
});

describe('mentions', () => {
  const body = 'Hey @[Emma Carter](clx1234567) can you review @[Daniel Kim](clx7654321)?';

  it('extracts unique user ids', () => {
    expect(extractMentionIds(body)).toEqual(['clx1234567', 'clx7654321']);
    expect(extractMentionIds('no mentions here')).toEqual([]);
  });

  it('ignores duplicates', () => {
    expect(extractMentionIds('@[A](clx1234567) @[A](clx1234567)')).toEqual(['clx1234567']);
  });

  it('tokenises for rendering', () => {
    const tokens = tokenizeMentions(body);
    expect(tokens[0]).toEqual({ type: 'text', value: 'Hey ' });
    expect(tokens[1]).toEqual({ type: 'mention', value: 'Emma Carter', userId: 'clx1234567' });
    expect(tokens.at(-1)).toEqual({ type: 'text', value: '?' });
  });

  it('renders plain text for notifications', () => {
    expect(stripMentionMarkup('ping @[Emma Carter](clx1234567)')).toBe('ping @Emma Carter');
  });
});

describe('formatting helpers', () => {
  it('renders file sizes', () => {
    expect(humanFileSize(512)).toBe('512 B');
    expect(humanFileSize(2048)).toBe('2.0 KB');
    expect(humanFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('truncates with an ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a much longer sentence', 10)).toBe('a much lo…');
  });
});

describe('buildActivityMessage', () => {
  it('renders the movement message used all over the activity feed', () => {
    expect(
      buildActivityMessage('TASK_MOVED', {
        actorName: 'Emma Carter',
        taskKey: 'FLOW-103',
        metadata: { from: 'To Do', to: 'In Progress' },
      }),
    ).toBe('Emma Carter moved FLOW-103 from To Do to In Progress');
  });

  it('renders assignment and priority changes', () => {
    expect(
      buildActivityMessage('TASK_ASSIGNED', {
        actorName: 'Daniel Kim',
        taskKey: 'WEB-108',
        metadata: { assigneeName: 'Olivia Chen' },
      }),
    ).toBe('Daniel Kim assigned Olivia Chen to WEB-108');

    expect(
      buildActivityMessage('TASK_PRIORITY_CHANGED', {
        actorName: 'Sophia Martinez',
        taskKey: 'APP-203',
        metadata: { from: 'Medium', to: 'High' },
      }),
    ).toBe('Sophia Martinez changed priority of APP-203 from Medium to High');
  });

  it('handles a cleared due date', () => {
    expect(
      buildActivityMessage('TASK_DUE_DATE_CHANGED', {
        actorName: 'Liam Anderson',
        taskKey: 'FLOW-1',
        metadata: { to: null },
      }),
    ).toBe('Liam Anderson removed the due date of FLOW-1');
  });
});
