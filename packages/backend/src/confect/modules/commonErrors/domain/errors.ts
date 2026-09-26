import * as Schema from 'effect/Schema';

export class ExternalProviderError extends Schema.TaggedError<ExternalProviderError>()(
  'ExternalProviderError',
  {
    message: Schema.String,
    serializedError: Schema.String,
  }
) {}
