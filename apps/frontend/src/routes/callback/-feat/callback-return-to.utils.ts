import * as Predicate from 'effect/Predicate';

import * as Authentication from '#modules/authentication';

/**
 * Picks where to land after the WorkOS redirect. The `state` echoed in the
 * callback URL wins because it survives finishing sign-in in another tab; the
 * sessionStorage copy only exists in the tab that started sign-in.
 */
export function resolveCallbackReturnTo({
  stateReturnTo,
}: {
  stateReturnTo: string | undefined;
}): string {
  const storedReturnTo = Authentication.consumePostLoginReturnTo();
  const safeReturnTo = [stateReturnTo, storedReturnTo].find(
    (candidate): candidate is string =>
      Predicate.isString(candidate) &&
      Authentication.checkSafeReturnTo(candidate)
  );

  return safeReturnTo ?? Authentication.REDIRECT_AUTH_FALLBACK_PATH;
}
