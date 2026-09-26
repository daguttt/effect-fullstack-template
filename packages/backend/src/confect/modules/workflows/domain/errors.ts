import * as Schema from 'effect/Schema';

export class UnknownError extends Schema.TaggedError<UnknownError>()(
  'Workflows/UnknownError',
  {
    rawWorkflowError: Schema.String,
  }
) {}
