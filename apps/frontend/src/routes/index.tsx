import { createFileRoute } from '@tanstack/react-router';

import * as Authentication from '#modules/authentication';
import * as CommonUI from '#modules/common-ui';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  const { isAuthenticated } = Authentication.useAuthState();

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <section className="flex max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {CommonUI.APP_NAME}
        </h1>
        <p className="text-balance text-muted-foreground">
          Convex, Confect, Effect, WorkOS AuthKit and TanStack Router, typed end
          to end.
        </p>
        <div className="flex gap-3">
          {isAuthenticated ? (
            <CommonUI.NavLinkButton to="/app" variant="default" size="lg">
              Open the app
            </CommonUI.NavLinkButton>
          ) : (
            <>
              <CommonUI.NavLinkButton
                to="/signin"
                search={{
                  returnTo: Authentication.REDIRECT_AUTH_FALLBACK_PATH,
                }}
                variant="default"
                size="lg"
              >
                Sign in
              </CommonUI.NavLinkButton>
              <CommonUI.NavLinkButton
                to="/signup"
                search={{
                  returnTo: Authentication.REDIRECT_AUTH_FALLBACK_PATH,
                }}
                variant="outline"
                size="lg"
              >
                Create an account
              </CommonUI.NavLinkButton>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
