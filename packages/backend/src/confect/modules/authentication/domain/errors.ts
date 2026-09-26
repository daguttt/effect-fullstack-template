import * as Schema from 'effect/Schema';

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  'Authentication/UnauthorizedError',
  {}
) {}

/** Shared with browser specs, so this error must not import the server runtime. */
export class NoUserIdentityFoundError extends Schema.TaggedError<NoUserIdentityFoundError>()(
  'Authentication/NoUserIdentityFoundError',
  {}
) {}
