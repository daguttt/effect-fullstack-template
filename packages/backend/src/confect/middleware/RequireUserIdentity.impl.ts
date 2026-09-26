import { MiddlewareImpl } from '@confect/server';
import * as Effect from 'effect/Effect';

import databaseSchema from '../_generated/schema';
import { Auth } from '../_generated/services';
import * as AuthenticationDomain from '../modules/authentication/domain';
import RequireUserIdentity from './RequireUserIdentity.spec';

export default MiddlewareImpl.provides(
  databaseSchema,
  RequireUserIdentity,
  AuthenticationDomain.CurrentUserIdentity,
  Effect.gen(function* () {
    const auth = yield* Auth;

    return yield* auth.getUserIdentity;
  }).pipe(
    Effect.mapError(() => new AuthenticationDomain.NoUserIdentityFoundError())
  )
);
