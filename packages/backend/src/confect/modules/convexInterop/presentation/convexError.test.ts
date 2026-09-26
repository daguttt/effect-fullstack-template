import { describe, expect, it } from '@effect/vitest';
import { ConvexError } from 'convex/values';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { dieWithConvexError } from './convexError';

const ErrorPayload = Schema.TaggedStruct('ExampleError', {
  message: Schema.NonEmptyString,
});

describe('dieWithConvexError', () => {
  it.effect('preserves the encoded payload in a ConvexError defect', () =>
    Effect.gen(function* () {
      const payload = { _tag: 'ExampleError' as const, message: 'Unavailable' };
      const exit = yield* Effect.exit(
        dieWithConvexError(ErrorPayload)(payload)
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;

      const defect = Cause.squash(exit.cause);
      expect(defect).toBeInstanceOf(ConvexError);
      if (!(defect instanceof ConvexError)) return;
      expect(defect.data).toEqual(payload);
    })
  );

  it.effect('captures invalid encoding as a defect when the effect runs', () =>
    Effect.gen(function* () {
      const program = dieWithConvexError(ErrorPayload)({
        _tag: 'ExampleError',
        message: '',
      });
      const exit = yield* Effect.exit(program);

      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;

      expect(exit.cause.reasons.every(Cause.isDieReason)).toBe(true);
      expect(Cause.squash(exit.cause)).toMatchObject({ _tag: 'SchemaError' });
    })
  );
});
