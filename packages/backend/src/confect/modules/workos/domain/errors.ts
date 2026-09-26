import * as Schema from 'effect/Schema';

export class WorkOSError extends Schema.TaggedError<WorkOSError>()(
  'WorkOSError',
  {
    message: Schema.String,
    cause: Schema.Unknown,
  }
) {}

export class WorkOSNotFoundEntity extends Schema.TaggedError<WorkOSNotFoundEntity>()(
  'WorkOSNotFoundEntity',
  {
    resource: Schema.String,
    message: Schema.String,
    code: Schema.NullOr(Schema.String),
    requestId: Schema.String,
  }
) {}
