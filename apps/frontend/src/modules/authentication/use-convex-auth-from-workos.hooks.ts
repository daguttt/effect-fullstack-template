import * as React from 'react';

import { RefreshError } from '@workos-inc/authkit-js';
import { useAuth } from '@workos-inc/authkit-react';
import type { AuthTokenFetcher } from 'convex/react';
import { Effect, Predicate, Schedule } from 'effect';

type WorkosAuthTokenFetcher = (
  args: Parameters<AuthTokenFetcher>[0]
) => Promise<string | null>;

const transientTokenRetrySchedule = Schedule.min([
  Schedule.exponential('500 millis'),
  Schedule.spaced('30 seconds'),
]).pipe(Schedule.jittered, Schedule.upTo({ duration: '2 minutes' }));

const isTransientTokenError = (error: unknown) =>
  (error instanceof RefreshError && error.isTransient) ||
  error instanceof TypeError;

/** Keeps transient WorkOS refresh failures from becoming Convex sign-outs. */
export function useConvexAuthFromWorkOS(): {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: WorkosAuthTokenFetcher;
} {
  const { getAccessToken, isLoading, organizationId, user } = useAuth();
  const isAuthenticated = Predicate.isNotNull(user);

  // Changing the fetcher identity makes Convex re-authenticate on organization switches.
  const workosSession = React.useMemo(
    () => ({ getAccessToken, organizationId, userId: user?.id ?? null }),
    [getAccessToken, organizationId, user?.id]
  );

  // Stop retries from replaced sessions so they do not compete with the active session.
  const currentSession = React.useRef(workosSession);
  React.useEffect(() => {
    currentSession.current = workosSession;
  }, [workosSession]);

  const fetchAccessToken = React.useCallback<WorkosAuthTokenFetcher>(
    ({ forceRefreshToken }) =>
      Effect.runPromise(
        Effect.tryPromise(() =>
          forceRefreshToken
            ? workosSession.getAccessToken({ forceRefresh: true })
            : workosSession.getAccessToken()
        ).pipe(
          Effect.retry({
            while: (error) =>
              currentSession.current === workosSession &&
              isTransientTokenError(error.cause),
            schedule: transientTokenRetrySchedule,
          }),
          // Convex expects `null` on token failure and does not catch fetcher rejections.
          Effect.orElseSucceed(() => null)
        )
      ),
    [workosSession]
  );

  return React.useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [fetchAccessToken, isAuthenticated, isLoading]
  );
}
