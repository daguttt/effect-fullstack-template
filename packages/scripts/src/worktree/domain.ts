/**
 * Pure worktree domain logic: identifier derivation and validation, Convex
 * deployment reference construction, development server port selection, and
 * sorting local WorkOS profiles into the ones a worktree still claims.
 *
 * Nothing in this module performs I/O, so every rule here is directly testable
 * from `domain.test.ts`.
 */
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

export {
  DEV_SERVER_PORT_RANGE_SIZE,
  DEV_SERVER_PORT_START,
  MAX_PORT,
  MIN_PORT,
  WORKOS_ENV_NAME_KEY,
  WorktreeDomainError,
  classifyWorkosProfiles,
  convexReference,
  deriveWorktreeId,
  derivePortCandidate,
  isExpectedConvexReference,
  isValidWorktreeId,
  parsePort,
  slugify,
  type ClaimedProfile,
  type Port,
  type WorkosProfileReport,
  type WorktreeClaim,
};

class WorktreeDomainError extends Schema.TaggedError<WorktreeDomainError>()(
  'WorktreeDomainError',
  {
    message: Schema.String,
  }
) {}

/** Lowest port a dev server may be assigned. */
const MIN_PORT = 1;

/** Highest port a dev server may be assigned. */
const MAX_PORT = 65535;

/** First port considered when deriving a fresh dev server port. */
const DEV_SERVER_PORT_START = 5174;

/** Width of the window the derived dev server port is spread across. */
const DEV_SERVER_PORT_RANGE_SIZE = 800;

type Port = number;

const WORKTREE_ID_PATTERN = /^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/;

/**
 * Lowercases and collapses anything that is not `[a-z0-9-]` into single
 * hyphens, then trims leading and trailing separators.
 */
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

/**
 * Derives the worktree identifier from the absolute path of the linked
 * worktree's git dir. Only the basename contributes, so sibling directories in
 * the path can never leak into the identifier.
 */
const deriveWorktreeId = (gitDir: string) => {
  const segments = gitDir.split('/').filter((segment) => segment !== '');
  return slugify(segments.at(-1) ?? '');
};

const isValidWorktreeId = (worktreeId: string) =>
  WORKTREE_ID_PATTERN.test(worktreeId);

const convexReference = (worktreeId: string) => `dev/worktree-${worktreeId}`;

const isExpectedConvexReference = (reference: string, worktreeId: string) =>
  reference === convexReference(worktreeId);

/**
 * Parses a dev server port that was previously persisted to `.env.local`.
 * Anything that is not a plain integer inside the valid TCP range is rejected
 * rather than silently replaced, so a corrupted value surfaces instead of
 * quietly reassigning a port another process may already be using.
 */
const parsePort = (value: string): Result.Result<Port, WorktreeDomainError> => {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return Result.fail(
      new WorktreeDomainError({
        message: `Port must be an integer between ${MIN_PORT} and ${MAX_PORT}: ${value}`,
      })
    );
  }

  const port = Number(trimmed);

  if (port < MIN_PORT || port > MAX_PORT) {
    return Result.fail(
      new WorktreeDomainError({
        message: `Port must be an integer between ${MIN_PORT} and ${MAX_PORT}: ${value}`,
      })
    );
  }

  return Result.succeed(port);
};

/**
 * Spreads worktrees deterministically across a port window so two worktrees
 * usually get different ports without any shared state. Collisions are resolved
 * by the caller probing upward for a free listener.
 */
const derivePortCandidate = (worktreeId: string) => {
  let hash = 2166136261;

  for (const character of worktreeId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return DEV_SERVER_PORT_START + (hash % DEV_SERVER_PORT_RANGE_SIZE);
};

/**
 * The `.env.local` key under which setup records the worktree's WorkOS profile.
 *
 * This is the only link between a profile and the worktree using it: the WorkOS
 * CLI names profiles itself (`unclaimed`, `unclaimed-2`, …) and stores nothing
 * about who provisioned them.
 */
const WORKOS_ENV_NAME_KEY = 'WORKOS_LOCAL_ENV_NAME';

/** A live worktree and the WorkOS profile its `.env.local` names. */
type WorktreeClaim = {
  readonly worktree: string;
  readonly environment: string;
};

/** A profile together with every worktree claiming it. */
type ClaimedProfile = {
  readonly environment: string;
  readonly worktrees: ReadonlyArray<string>;
};

type WorkosProfileReport = {
  /** Profiles a live worktree still points at. Leave these alone. */
  readonly claimed: ReadonlyArray<ClaimedProfile>;
  /** Profiles no live worktree claims. These are safe to remove. */
  readonly orphaned: ReadonlyArray<string>;
  /** Worktrees naming a profile the registry no longer has. */
  readonly dangling: ReadonlyArray<WorktreeClaim>;
};

/**
 * Partitions the local WorkOS profiles against the claims found on disk.
 *
 * Matching only works in this direction. A live worktree records its profile
 * name, so the claimed set is derivable; a *deleted* worktree took its
 * `.env.local` with it, which is why the leftovers can only be identified as a
 * group rather than traced back to whichever worktree provisioned them.
 *
 * A profile claimed by two worktrees keeps both owners rather than collapsing
 * to one — that means a `.env.local` was copied, and the duplicate is worth
 * seeing rather than hiding.
 */
const classifyWorkosProfiles = (
  profiles: ReadonlyArray<string>,
  claims: ReadonlyArray<WorktreeClaim>
): WorkosProfileReport => {
  const owners = new Map<string, Array<string>>();

  for (const claim of claims) {
    const existing = owners.get(claim.environment);

    if (Predicate.isUndefined(existing)) {
      owners.set(claim.environment, [claim.worktree]);
      continue;
    }

    existing.push(claim.worktree);
  }

  const registry = new Set(profiles);
  const claimed: Array<ClaimedProfile> = [];
  const orphaned: Array<string> = [];

  for (const profile of profiles) {
    const worktrees = owners.get(profile);

    if (Predicate.isUndefined(worktrees)) {
      orphaned.push(profile);
      continue;
    }

    claimed.push({ environment: profile, worktrees });
  }

  return {
    claimed,
    orphaned,
    dangling: claims.filter((claim) => !registry.has(claim.environment)),
  };
};
