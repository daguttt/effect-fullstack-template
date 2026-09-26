import { useEffect, useRef } from 'react';

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';

import * as Authentication from '#modules/authentication';
import * as CommonUI from '#modules/common-ui';

import * as CallbackRouteFeat from './-feat';

export const Route = createFileRoute('/callback/')({
  // WorkOS echoes the sign-in `state` here. AuthKit strips it from the address
  // bar after the code exchange, but the router keeps the parsed search.
  validateSearch: (search) => {
    // oxlint-disable-next-line effecttsgo/schema-sync -- TanStack Router requires synchronous search validation.
    const { state } = Schema.decodeSync(
      Schema.Struct({
        state: Schema.optionalKey(
          Schema.UndefinedOr(
            Schema.Struct({
              returnTo: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
            })
          ).pipe(Schema.catchDecoding(() => Effect.succeedSome(undefined)))
        ),
      })
    )(search);
    const stateReturnTo = state?.returnTo;

    return Predicate.isUndefined(stateReturnTo)
      ? {}
      : { returnTo: stateReturnTo };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { returnTo: stateReturnTo } = Route.useSearch();
  const { isLoading, isAuthenticated } = Authentication.useAuthState();
  // Resolution clears the stored return target, so preserve it across effect runs.
  const intendedReturnToRef = useRef<string | null>(null);

  useEffect(() => {
    intendedReturnToRef.current ??= CallbackRouteFeat.resolveCallbackReturnTo({
      stateReturnTo,
    });
    const intendedReturnTo = intendedReturnToRef.current;

    if (isLoading) return;

    if (isAuthenticated) {
      void navigate({ href: intendedReturnTo, replace: true });
      return;
    }

    void navigate({
      to: '/signin',
      search: { returnTo: intendedReturnTo },
      replace: true,
    });
  }, [isAuthenticated, isLoading, navigate, stateReturnTo]);

  return <CommonUI.GlobalSpinner message="Finishing sign-in" />;
}
