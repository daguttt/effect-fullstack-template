import * as Effect from 'effect/Effect';

import type { Id } from '#convex/_generated/dataModel';

import { DatabaseReader } from '../../../_generated/services';
import * as CommonEmailAddressesDomain from '../../commonEmailAddresses/domain';

// -*******************************************************************************-
// API
// -*******************************************************************************-

export const getOneById = Effect.fn('Users.getOneById')(function* (
  id: Id<'users'>
) {
  const reader = yield* DatabaseReader;

  return yield* reader
    .table('users')
    .get(id)
    .pipe(
      Effect.catchTags({
        GetByIdFailure: () => Effect.succeed(null),
        DocumentDecodeError: Effect.die,
      })
    );
});

export const getOneByIdentityTokenIdentifier = Effect.fn(
  'Users.getOneByIdentityTokenIdentifier'
)(function* (identityTokenIdentifier: string) {
  const reader = yield* DatabaseReader;

  return yield* reader
    .table('users')
    .get('by_identityTokenIdentifier', identityTokenIdentifier)
    .pipe(
      Effect.catchTags({
        GetByIndexFailure: () => Effect.succeed(null),
        DocumentDecodeError: Effect.die,
      })
    );
});

export const getOneByExternalId = Effect.fn('Users.getOneByExternalId')(
  function* (externalId: string) {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table('users')
      .get('by_externalId', externalId)
      .pipe(
        Effect.catchTags({
          GetByIndexFailure: () => Effect.succeed(null),
          DocumentDecodeError: Effect.die,
        })
      );
  }
);

export const getOneByEmail = Effect.fn('Users.getOneByEmail')(function* (
  email: string
) {
  const reader = yield* DatabaseReader;

  return yield* reader
    .table('users')
    .get('by_email', CommonEmailAddressesDomain.normalizeEmailAddress(email))
    .pipe(
      Effect.catchTags({
        GetByIndexFailure: () => Effect.succeed(null),
        DocumentDecodeError: Effect.die,
      })
    );
});
