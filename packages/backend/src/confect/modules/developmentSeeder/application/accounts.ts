import * as Effect from 'effect/Effect';

import refs from '../../../_generated/refs';
import { MutationRunner } from '../../../_generated/services';
import * as WorkOSApplication from '../../workos/application';
import type * as Domain from '../domain';

/**
 * Creates the WorkOS user, then upserts the local User directly instead of
 * waiting for the `user.created` webhook, so the account works on first sign-in.
 */
export const createDevelopmentAccount = Effect.fn(
  'DevelopmentSeeder.createDevelopmentAccount'
)(
  function* (account: Domain.DevelopmentAccount) {
    const mutationRunner = yield* MutationRunner;
    const workos = yield* WorkOSApplication.WorkOSService;

    const { user: externalUser, outcome } =
      yield* workos.users.createIfNotExists({
        email: account.email,
        externalId: account.externalId,
        password: account.password,
        firstName: account.firstName,
        lastName: account.lastName,
        emailVerified: true,
      });

    yield* mutationRunner(refs.internal.users.upsertFromWorkOS, {
      workosUser: externalUser,
    });

    yield* Effect.logInfo('Development account seeded', {
      email: account.email,
      password: account.password,
      outcome,
    });
  },
  Effect.catchTag('SchemaError', (err) => Effect.die(err))
);
