import * as Schema from 'effect/Schema';

export class IdentityConflictError extends Schema.TaggedError<IdentityConflictError>()(
  'Users/IdentityConflictError',
  {
    externalUserId: Schema.String,
    email: Schema.String,
  }
) {}
