import { FunctionSpec, GroupSpec } from '@confect/core';
import * as Schema from 'effect/Schema';

import { Id } from './_generated/id';
import RequireUserIdentity from './middleware/RequireUserIdentity.spec';
import * as UsersDomain from './modules/users/domain';
import * as WorkOSDomain from './modules/workos/domain';

export default GroupSpec.make()
  // -*******************************************************************************-
  // Public
  // -*******************************************************************************-
  .addFunction(
    FunctionSpec.publicQuery({
      name: 'me',
      args: () => ({}),
      returns: () => Schema.NullOr(UsersDomain.UsersDocSchema),
      error: () => Schema.Never,
    }).middleware(RequireUserIdentity)
  )

  // -*******************************************************************************-
  // Internal
  // -*******************************************************************************-
  .addFunction(
    FunctionSpec.internalQuery({
      name: 'getOneByIdentityTokenIdentifier',
      args: () => ({ identityTokenIdentifier: Schema.String }),
      returns: () => Schema.NullOr(UsersDomain.UsersDocSchema),
      error: () => Schema.Never,
    })
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: 'getOneByExternalId',
      args: () => ({ externalId: Schema.String }),
      returns: () => Schema.NullOr(UsersDomain.UsersDocSchema),
      error: () => Schema.Never,
    })
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: 'upsertFromWorkOS',
      args: () => ({
        workosUser: WorkOSDomain.WorkOSUser,
      }),
      returns: () => UsersDomain.UsersDocSchema,
      error: () => UsersDomain.IdentityConflictError,
    })
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: 'softDeleteByExternalId',
      args: () => ({ externalId: Schema.String }),
      returns: () => Schema.Union([Schema.Literal(false), Id('users')]),
      error: () => Schema.Never,
    })
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: 'notifyInvalidWorkOSUserSchema',
      args: () => ({
        message: Schema.String,
        serializedError: Schema.String,
      }),
      returns: () => Schema.Null,
      error: () => Schema.Never,
    })
  );
