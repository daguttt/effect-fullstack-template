import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';

import type { UsersDoc } from '../../../_generated/docs';

// -*******************************************************************************-
// API
// -*******************************************************************************-

/**
 * Filters a raw User lookup to active records while preserving a missing User
 * as null. Compose this at call sites where soft-deleted Users are unavailable.
 */
export const isActiveOrNull = Effect.map((user: UsersDoc | null) => {
  const isDeletedUser =
    Predicate.isNotNull(user) && Predicate.isNotUndefined(user.deletedAt);
  const isMissingOrDeletedUser = Predicate.isNull(user) || isDeletedUser;

  if (isMissingOrDeletedUser) return null;

  return user;
});
