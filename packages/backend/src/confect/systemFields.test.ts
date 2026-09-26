import * as SystemFields from '@confect/core/SystemFields';
import { describe, it } from '@effect/vitest';
import * as EffectVitestUtils from '@effect/vitest/utils';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';

describe('Confect system fields with transformed schemas', () => {
  it.effect(
    'preserves system fields across effectful decoding and synchronous encoding',
    () =>
      Effect.gen(function* () {
        const fields = Schema.Struct({ value: Schema.String }).pipe(
          Schema.decodeTo(Schema.Struct({ value: Schema.Finite }), {
            decode: SchemaGetter.transformEffect((input: { value: string }) => {
              EffectVitestUtils.deepStrictEqual(Object.keys(input), ['value']);
              return Effect.succeed({ value: Number(input.value) });
            }),
            encode: SchemaGetter.transform((input: { value: number }) => {
              EffectVitestUtils.deepStrictEqual(Object.keys(input), ['value']);
              return { value: String(input.value) };
            }),
          })
        );
        const document = SystemFields.extendWithSystemFields(
          'fixtures',
          fields
        );
        const encoded = { _id: 'fixture', _creationTime: 123, value: '42' };
        const decoded = yield* Schema.decodeUnknownEffect(document)(encoded);

        EffectVitestUtils.deepStrictEqual(decoded, {
          _id: 'fixture',
          _creationTime: 123,
          value: 42,
        });
        EffectVitestUtils.deepStrictEqual(
          yield* Schema.encodeUnknownEffect(document)(decoded),
          encoded
        );
      })
  );
});
