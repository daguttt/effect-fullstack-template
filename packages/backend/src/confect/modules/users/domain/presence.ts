import * as Effect from 'effect/Effect';

import type { UsersDoc } from '../../../_generated/docs';

// -*******************************************************************************-
// API
// -*******************************************************************************-

/**
 * Resolves a raw User lookup to a present User, treating a missing row as a
 * broken invariant rather than a domain failure. Compose this at call sites
 * that have already established the User must exist.
 *
 * Declared as an explicit generic over the input effect so the error channel is
 * fixed here. Inlining the equivalent `Effect.catchTag` chain as an
 * `Effect.all` array element instead lets that call's `Effect<any, any, any>`
 * constraint bind `catchTag`'s error type parameter to `any`, which erases the
 * error channel of every sibling effect in the array.
 */
export const isPresentOrDie = <E, R>(
  effectWithUserDoc: Effect.Effect<UsersDoc | null, E, R>
) =>
  effectWithUserDoc.pipe(
    Effect.andThen((user) => Effect.fromNullishOr(user)),
    Effect.catchTag('NoSuchElementError', Effect.die)
  );
