import * as Schema from 'effect/Schema';

export class InputRejectedError extends Schema.TaggedError<InputRejectedError>()(
  'ExampleWorkflows/InputRejectedError',
  {
    input: Schema.String,
  }
) {}

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()(
  'ExampleWorkflows/RunNotFoundError',
  {}
) {}
