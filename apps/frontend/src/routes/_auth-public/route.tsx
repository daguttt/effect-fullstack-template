import { useEffect } from 'react';

import { Outlet, createFileRoute } from '@tanstack/react-router';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';

import * as Authentication from '#modules/authentication';
import * as CommonUI from '#modules/common-ui';

import * as AuthPublicRouteFeat from './-feat';

export const Route = createFileRoute('/_auth-public')({
  validateSearch: (search) => {
    // oxlint-disable-next-line effecttsgo/schema-sync -- TanStack Router requires synchronous search validation.
    const { returnTo } = Schema.decodeSync(
      Schema.Struct({
        returnTo: Schema.optionalKey(
          Schema.UndefinedOr(Schema.String).pipe(
            Schema.catchDecoding(() => Effect.succeedSome(undefined))
          )
        ),
      })
    )(search);

    const isSafeReturnTo =
      Predicate.isNotUndefined(returnTo) &&
      Authentication.checkSafeReturnTo(returnTo);

    return {
      returnTo: isSafeReturnTo
        ? returnTo
        : Authentication.REDIRECT_AUTH_FALLBACK_PATH,
    };
  },
  beforeLoad: ({ search }) => ({
    postLoginReturnTo: search.returnTo,
  }),
  component: AuthPublicLayout,
});

function AuthPublicLayout() {
  const { returnTo } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { isLoading, isAuthenticated } = Authentication.useAuthState();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      void navigate({ href: returnTo, replace: true });
      return;
    }

    // This will be consumed later in `/callback`
    Authentication.setPostLoginReturnTo(returnTo);
  }, [isAuthenticated, isLoading, navigate, returnTo]);

  if (isAuthenticated) return <CommonUI.GlobalSpinner />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AuthPublicRouteFeat.Navigation />
      <main className="mx-auto max-w-5xl px-6 py-10">
        {isLoading ? <CommonUI.GlobalSpinner /> : <Outlet />}
      </main>
    </div>
  );
}
