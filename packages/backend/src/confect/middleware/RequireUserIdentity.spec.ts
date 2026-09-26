import { MiddlewareSpec } from '@confect/core';

import * as AuthenticationDomain from '../modules/authentication/domain';

/**
 * Attach to authenticated entry points individually; internal workflow steps
 * have no caller identity.
 */
export default class RequireUserIdentity extends MiddlewareSpec.MiddlewareSpec<
  RequireUserIdentity,
  { provides: AuthenticationDomain.CurrentUserIdentity }
>()('RequireUserIdentity', {
  error: () => AuthenticationDomain.NoUserIdentityFoundError,
  functionTypes: { query: true, mutation: true, action: false },
}) {}
