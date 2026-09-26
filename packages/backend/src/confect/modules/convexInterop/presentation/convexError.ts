import { ConvexError, type Value } from 'convex/values';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/**
 * Encodes a tagged Effect error into a `ConvexError` defect.
 */
export const dieWithConvexError =
  <TSchema extends Schema.Encoder<Value>>(schema: TSchema) =>
  (error: TSchema['Type']): Effect.Effect<never> =>
    Schema.encodeEffect(schema)(error).pipe(
      Effect.orDie,
      Effect.flatMap((encodedError) =>
        Effect.die(new ConvexError(encodedError))
      )
    );
