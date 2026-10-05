import { type ReactNode, StrictMode } from 'react';

import { QueryResult, useAction, useMutation, useQuery } from '@confect/react';
import { RegistryContext } from '@effect/atom-react';
import { useAuth } from '@workos-inc/authkit-react';
import { useConvexAuth } from 'convex/react';
import { Duration } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import { type Mock, vi } from 'vitest';

/**
 * Fakes only what leaves the app: the Confect data edge (`useQuery` /
 * `useMutation`) and the two auth SDKs behind `Auth.useAuthState`. Everything a
 * module owns — reducers, atoms, sessionStorage, derivations, React effects —
 * runs for real, so a test drives a feature the way the browser does.
 *
 * This mirrors `TestConfect` on the backend, which runs a real in-memory
 * database and hand-builds only the WorkOS responses.
 *
 * A test file must declare the mocks itself, because `vi.mock` is hoisted per
 * module:
 *
 * ```ts
 * vi.mock('@confect/react', async (importOriginal) => ({
 *   ...(await importOriginal<typeof import('@confect/react')>()),
 *   useMutation: vi.fn(),
 *   useQuery: vi.fn(),
 * }));
 * vi.mock('convex/react', () => ({ useConvexAuth: vi.fn() }));
 * vi.mock('@workos-inc/authkit-react', () => ({ useAuth: vi.fn() }));
 * ```
 */

/** A Confect function reference, used only as a routing key here. */
type QueryRef = unknown;

/** Matches production (`main.tsx`), so atom lifetimes behave as they ship. */
const DEFAULT_ATOM_IDLE_TTL = Duration.toMillis('5 minutes');

export type WorkosSession = {
  readonly userId: string;
  /** The organization the WorkOS session is currently scoped to. */
  readonly organizationId?: string | null;
  readonly role?: string | null;
  readonly roles?: readonly string[] | null;
  /**
   * Convex has authenticated the session but the WorkOS provider is still
   * resolving — the only combination that reads as "auth loading", since a
   * session with no user at all reads as signed out.
   */
  readonly isLoading?: boolean;
};

export type FrontendStubs = {
  /**
   * Shared across every render from this harness, so a component can be
   * unmounted and remounted against the state it left behind.
   */
  readonly registry: AtomRegistry.AtomRegistry;
  /** Routes a Confect `useQuery` ref to a fixed result. */
  readonly setQuery: (
    ref: QueryRef,
    result: QueryResult.QueryResult<never, never>
  ) => void;
  /**
   * Every args value a ref was queried with, in call order. `'skip'` entries are
   * how a test asserts that a subscription was never opened.
   */
  readonly queryArgsFor: (ref: QueryRef) => readonly unknown[];
  /** The single mutation stub. Resolve or reject it to drive the flow. */
  readonly mutation: Mock;
  /** Mock `useAction` to enable this stub; the first argument identifies the action. */
  readonly action: Mock;
  readonly switchToOrganization: Mock;
  readonly signIn: (session: WorkosSession) => void;
  readonly signOut: () => void;
  readonly Wrapper: (props: { children: ReactNode }) => React.ReactElement;
};

export function installFrontendStubs(
  options: {
    /** `'none'` disposes unmounted atoms on the next task, forcing remount paths. */
    readonly atomIdleTTL?: number | 'none';
  } = {}
): FrontendStubs {
  assertMocked({ useQuery, useMutation, useConvexAuth, useAuth });

  const registry =
    options.atomIdleTTL === 'none'
      ? AtomRegistry.make()
      : AtomRegistry.make({
          defaultIdleTTL: options.atomIdleTTL ?? DEFAULT_ATOM_IDLE_TTL,
        });

  const queryResults = new Map<
    QueryRef,
    QueryResult.QueryResult<never, never>
  >();
  const queryArgs = new Map<QueryRef, unknown[]>();

  // A ref with no configured result reads as loading, which is what Confect
  // reports both for a pending subscription and for `'skip'`.
  const pending = QueryResult.load(true) as QueryResult.QueryResult<
    never,
    never
  >;

  vi.mocked(useQuery).mockImplementation(((ref: QueryRef, args: unknown) => {
    const recorded = queryArgs.get(ref) ?? [];
    recorded.push(args);
    queryArgs.set(ref, recorded);

    if (args === 'skip') return pending;

    return queryResults.get(ref) ?? pending;
  }) as never);

  const mutation = vi.fn();
  // A fresh handle on every render, which is the conservative assumption about
  // the real hook. Anything guarding against duplicate work must hold even when
  // the mutation function does not keep its identity, so a stable stub here
  // would quietly excuse a missing guard.
  vi.mocked(useMutation).mockImplementation(
    (() =>
      (...args: readonly unknown[]): unknown =>
        mutation(...args)) as never
  );

  const action = vi.fn();
  if (vi.isMockFunction(useAction))
    vi.mocked(useAction).mockImplementation(
      ((ref: unknown) =>
        (...args: readonly unknown[]): unknown =>
          action(ref, ...args)) as never
    );

  const switchToOrganization = vi.fn().mockResolvedValue(undefined);

  const setWorkosAuth = (auth: {
    isLoading: boolean;
    user: { id: string } | null;
    organizationId?: string | null;
    role?: string | null;
    roles?: readonly string[] | null;
  }) => {
    vi.mocked(useAuth).mockReturnValue({
      ...auth,
      switchToOrganization,
    } as never);
  };

  const signedOut = {
    isLoading: false,
    user: null,
    organizationId: null,
    role: null,
    roles: null,
  };

  vi.mocked(useConvexAuth).mockReturnValue({
    isLoading: false,
    isAuthenticated: false,
    isRefreshing: false,
  });
  setWorkosAuth(signedOut);

  return {
    registry,
    setQuery: (ref, result) => {
      queryResults.set(ref, result);
    },
    queryArgsFor: (ref) => queryArgs.get(ref) ?? [],
    mutation,
    action,
    switchToOrganization,
    signIn: ({
      userId,
      organizationId = null,
      role = null,
      roles = null,
      isLoading = false,
    }) => {
      vi.mocked(useConvexAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        isRefreshing: false,
      });
      setWorkosAuth({
        isLoading,
        user: { id: userId },
        organizationId,
        role,
        roles,
      });
    },
    signOut: () => {
      vi.mocked(useConvexAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        isRefreshing: false,
      });
      setWorkosAuth(signedOut);
    },
    // StrictMode is not incidental: double-invoked effects are what the
    // "start exactly once" guarantees are defended against.
    Wrapper: ({ children }) => (
      <StrictMode>
        <RegistryContext.Provider value={registry}>
          {children}
        </RegistryContext.Provider>
      </StrictMode>
    ),
  };
}

function assertMocked(subjects: Record<string, unknown>): void {
  const missing = Object.entries(subjects)
    .filter(([, subject]) => !vi.isMockFunction(subject))
    .map(([name]) => name);

  if (missing.length > 0)
    throw new Error(
      `installFrontendStubs() needs these mocked by the test file: ${missing.join(', ')}. See the vi.mock block in src/test-harness.tsx.`
    );
}
