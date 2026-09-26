import { Context, type Effect } from 'effect';

import type * as Domain from '../domain';

export type CreateExternalUserDto = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string;
  password?: string;
  emailVerified?: boolean;
};

export type IdempotentCreationOutcome = 'created' | 'existing';

export type CreatedExternalUserResult = {
  user: Domain.WorkOSUser;
  outcome: IdempotentCreationOutcome;
};

export class WorkOSService extends Context.Service<
  WorkOSService,
  {
    users: {
      createIfNotExists(
        args: CreateExternalUserDto
      ): Effect.Effect<CreatedExternalUserResult, Domain.WorkOSError>;
      getOneById(args: {
        externalUserId: string;
      }): Effect.Effect<Domain.WorkOSUser | null, Domain.WorkOSError>;
      getOneByEmail(args: {
        email: string;
      }): Effect.Effect<Domain.WorkOSUser | null, Domain.WorkOSError>;
      /**
       * Permanently deletes the user. Succeeds when the user is already absent:
       * the caller asks for an end state, not for an event.
       */
      deleteById(args: {
        externalUserId: string;
      }): Effect.Effect<void, Domain.WorkOSError>;
    };
  }
>()('@repo/backend/confect/modules/workos/application/WorkOSService') {}
