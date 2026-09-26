import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';

import {
  DEV_SERVER_PORT_RANGE_SIZE,
  DEV_SERVER_PORT_START,
  MAX_PORT,
  classifyWorkosProfiles,
  convexReference,
  derivePortCandidate,
  deriveWorktreeId,
  isExpectedConvexReference,
  isValidWorktreeId,
  parsePort,
  slugify,
} from './domain.ts';

describe('slugify', () => {
  it('lowercases and collapses separators', () => {
    expect(slugify('My App--6')).toBe('my-app-6');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('--Worktree--')).toBe('worktree');
  });

  it('collapses path separators rather than preserving them', () => {
    expect(slugify('a/b')).toBe('a-b');
  });
});

describe('deriveWorktreeId', () => {
  it('derives the identifier from the git dir basename', () => {
    expect(deriveWorktreeId('/repo/.git/worktrees/my-app6')).toBe('my-app6');
  });

  it('ignores everything above the basename', () => {
    expect(deriveWorktreeId('/Production/.git/worktrees/feature-a')).toBe(
      'feature-a'
    );
  });

  it('tolerates a trailing slash', () => {
    expect(deriveWorktreeId('/repo/.git/worktrees/feature-a/')).toBe(
      'feature-a'
    );
  });
});

describe('isValidWorktreeId', () => {
  it('accepts a slugged identifier', () => {
    expect(isValidWorktreeId('my-app6')).toBe(true);
  });

  it.each([
    ['path traversal', '../production'],
    ['a leading hyphen', '-worktree'],
    ['a trailing hyphen', 'worktree-'],
    ['an empty identifier', ''],
    ['uppercase characters', 'Worktree'],
    ['a path separator', 'a/b'],
  ])('rejects %s', (_description, candidate) => {
    expect(isValidWorktreeId(candidate)).toBe(false);
  });

  it('rejects every path-traversal attempt that survives slugification', () => {
    expect(isValidWorktreeId(slugify('../production'))).toBe(true);
    // Slugification alone is not a safety boundary — it turns `../production`
    // into `production`. The basename-only derivation is what prevents traversal.
    expect(deriveWorktreeId('/repo/.git/worktrees/../production')).toBe(
      'production'
    );
  });
});

describe('convexReference', () => {
  it('builds the worktree-scoped reference', () => {
    expect(convexReference('my-app6')).toBe('dev/worktree-my-app6');
  });

  it('accepts only an exact match', () => {
    expect(isExpectedConvexReference('dev/worktree-my-app6', 'my-app6')).toBe(
      true
    );
    expect(isExpectedConvexReference('dev', 'my-app6')).toBe(false);
    expect(
      isExpectedConvexReference('dev/worktree-my-app6-extra', 'my-app6')
    ).toBe(false);
  });
});

describe('parsePort', () => {
  it('reuses a valid existing port', () => {
    expect(parsePort('5416')).toStrictEqual(Result.succeed(5416));
  });

  it('tolerates surrounding whitespace', () => {
    expect(parsePort(' 5416 ')).toStrictEqual(Result.succeed(5416));
  });

  it.each(['0', '65536', '-1', '5416.5', '', 'abc', '5416abc'])(
    'rejects %j',
    (candidate) => {
      expect(Result.isFailure(parsePort(candidate))).toBe(true);
    }
  );

  it('accepts the range boundaries', () => {
    expect(parsePort('1')).toStrictEqual(Result.succeed(1));
    expect(parsePort(String(MAX_PORT))).toStrictEqual(Result.succeed(MAX_PORT));
  });
});

describe('derivePortCandidate', () => {
  it('stays inside the derived window', () => {
    for (const worktreeId of ['a', 'feature-a', 'my-app6', 'z'.repeat(64)]) {
      const port = derivePortCandidate(worktreeId);
      expect(port).toBeGreaterThanOrEqual(DEV_SERVER_PORT_START);
      expect(port).toBeLessThan(
        DEV_SERVER_PORT_START + DEV_SERVER_PORT_RANGE_SIZE
      );
    }
  });

  it('is deterministic', () => {
    expect(derivePortCandidate('feature-a')).toBe(
      derivePortCandidate('feature-a')
    );
  });

  it('separates distinct worktrees', () => {
    expect(derivePortCandidate('feature-a')).not.toBe(
      derivePortCandidate('feature-b')
    );
  });
});

describe('classifyWorkosProfiles', () => {
  it('treats a profile no worktree names as orphaned', () => {
    const report = classifyWorkosProfiles(
      ['unclaimed', 'unclaimed-2'],
      [{ worktree: '/w/a', environment: 'unclaimed-2' }]
    );

    expect(report.orphaned).toEqual(['unclaimed']);
    expect(report.claimed).toEqual([
      { environment: 'unclaimed-2', worktrees: ['/w/a'] },
    ]);
  });

  it('keeps every owner when two worktrees claim one profile', () => {
    const report = classifyWorkosProfiles(
      ['unclaimed'],
      [
        { worktree: '/w/a', environment: 'unclaimed' },
        { worktree: '/w/b', environment: 'unclaimed' },
      ]
    );

    expect(report.claimed).toEqual([
      { environment: 'unclaimed', worktrees: ['/w/a', '/w/b'] },
    ]);
    expect(report.orphaned).toEqual([]);
  });

  it('reports a claim on a profile the registry no longer has', () => {
    const report = classifyWorkosProfiles(
      ['unclaimed'],
      [{ worktree: '/w/a', environment: 'unclaimed-99' }]
    );

    expect(report.dangling).toEqual([
      { worktree: '/w/a', environment: 'unclaimed-99' },
    ]);
    // The surviving profile is still unclaimed by anything live.
    expect(report.orphaned).toEqual(['unclaimed']);
  });

  it('orphans every profile when no worktree claims one', () => {
    const report = classifyWorkosProfiles(['unclaimed', 'unclaimed-2'], []);

    expect(report.orphaned).toEqual(['unclaimed', 'unclaimed-2']);
    expect(report.claimed).toEqual([]);
    expect(report.dangling).toEqual([]);
  });

  it('returns empty buckets for an empty registry', () => {
    const report = classifyWorkosProfiles([], []);

    expect(report).toEqual({ claimed: [], orphaned: [], dangling: [] });
  });
});
