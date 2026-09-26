import { useEffect, useRef } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';
import { Predicate } from 'effect';
import { CircleAlert, RefreshCw } from 'lucide-react';

import * as CommonUI from '#modules/common-ui';

/**
 * Leaves only after AuthKit reports no user. Convex auth is not authoritative
 * here because a token or backend failure can report unauthenticated while the
 * WorkOS session remains active.
 */
export function SignOutCallbackScreen() {
  const { isLoading, user } = useAuth();
  const navigate = useNavigate();
  const hasLeftAfterSignOutRef = useRef(false);

  const isSignedOut = !isLoading && Predicate.isNull(user);
  const hasSignOutFailed = !isLoading && Predicate.isNotNull(user);

  useEffect(() => {
    if (!isSignedOut) return;
    // Strict Mode replays effects. Guard so the replay does not navigate twice.
    if (hasLeftAfterSignOutRef.current) return;

    hasLeftAfterSignOutRef.current = true;

    void navigate({ to: '/', replace: true });
  }, [isSignedOut, navigate]);

  if (!hasSignOutFailed)
    return <CommonUI.GlobalSpinner message="Signing you out" />;

  return (
    <main className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-hidden bg-background px-6 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,hsl(var(--destructive)/0.12),transparent_28%),radial-gradient(circle_at_20%_84%,hsl(var(--primary)/0.12),transparent_26%)]" />
      <section
        className="relative flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border border-border/70 bg-card/90 px-7 py-9 text-center shadow-2xl shadow-black/10 backdrop-blur-xl sm:px-10 sm:py-11"
        aria-labelledby="sign-out-failed-title"
      >
        <div className="grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive ring-8 ring-destructive/5">
          <CircleAlert
            className="size-9"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </div>
        <div className="space-y-3">
          <h1 id="sign-out-failed-title" className="text-lg tracking-tight">
            Sign-out did not complete
          </h1>
          <p className="leading-6 text-balance text-muted-foreground">
            You are still signed in, so we kept you here instead of sending you
            away as though the session had ended.
          </p>
        </div>
        <CommonUI.NavLinkButton to="/signout" variant="default" size="lg">
          <RefreshCw aria-hidden="true" />
          Try signing out again
        </CommonUI.NavLinkButton>
      </section>
    </main>
  );
}
