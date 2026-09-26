import type { UserIdentity } from 'convex/server';
import * as Context from 'effect/Context';

/** `RequireUserIdentity` rejects anonymous callers even when handlers do not consume this service. */
export class CurrentUserIdentity extends Context.Service<
  CurrentUserIdentity,
  UserIdentity
>()(
  '@repo/backend/confect/modules/authentication/domain/CurrentUserIdentity'
) {}
