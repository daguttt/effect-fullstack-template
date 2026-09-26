import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';

import * as WorkosState from './workosState.ts';

const REQUIRED = {
  WORKOS_LOCAL_ENV_NAME: 'unclaimed-2',
  WORKOS_API_KEY: `sk_test_${'a'.repeat(40)}`,
  WORKOS_CLIENT_ID: 'client_123',
  WORKOS_AUTHKIT_DOMAIN: 'example.authkit.app',
} as const;

const decode = (values: Record<string, string>) =>
  WorkosState.decodeCarriedWorkosState(new Map(Object.entries(values)));

describe('decodeCarriedWorkosState', () => {
  it.effect('returns Absent when none of the required keys exists', () =>
    Effect.gen(function* () {
      const state = yield* decode({ WORKOS_WEBHOOK_SECRET: 'whsec_unused' });

      expect(state).toStrictEqual(WorkosState.CarriedWorkosState.Absent());
    })
  );

  it.effect('returns a redacted Complete state for four non-empty keys', () =>
    Effect.gen(function* () {
      const state = yield* decode(REQUIRED);

      expect(state._tag).toBe('Complete');
      if (state._tag !== 'Complete') return;

      expect(state.environment.name).toBe('unclaimed-2');
      expect(Redacted.value(state.environment.apiKey)).toBe(
        REQUIRED.WORKOS_API_KEY
      );
      expect(state.webhookSecret).toBeUndefined();
    })
  );

  it.effect('preserves an optional webhook secret', () =>
    Effect.gen(function* () {
      const state = yield* decode({
        ...REQUIRED,
        WORKOS_WEBHOOK_SECRET: 'whsec_preserved',
      });

      expect(state._tag).toBe('Complete');
      if (state._tag !== 'Complete') return;

      expect(Redacted.value(state.webhookSecret!)).toBe('whsec_preserved');
      expect(
        Object.fromEntries(WorkosState.persistedEntries(state))
      ).toMatchObject({
        WORKOS_LOCAL_ENV_NAME: 'unclaimed-2',
        WORKOS_CLIENT_ID: 'client_123',
        VITE_WORKOS_CLIENT_ID: 'client_123',
        WORKOS_WEBHOOK_SECRET: 'whsec_preserved',
      });
    })
  );

  it.effect(
    'rejects every partial required-key combination by key name only',
    () =>
      Effect.gen(function* () {
        const entries = Object.entries(REQUIRED);

        for (let mask = 1; mask < 2 ** entries.length - 1; mask += 1) {
          const partial = Object.fromEntries(
            entries.filter((_, index) => (mask & (1 << index)) !== 0)
          );
          const result = yield* Effect.result(decode(partial));

          expect(Result.isFailure(result)).toBe(true);
          if (!Result.isFailure(result)) continue;

          const expectedMissing = entries
            .filter((_, index) => (mask & (1 << index)) === 0)
            .map(([key]) => key);
          expect(result.failure.missingKeys).toStrictEqual(expectedMissing);
          expect(result.failure.message).not.toContain(REQUIRED.WORKOS_API_KEY);
        }
      })
  );

  it.effect('treats empty required values as incomplete', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode({ ...REQUIRED, WORKOS_API_KEY: '' })
      );

      expect(Result.isFailure(result)).toBe(true);
      if (!Result.isFailure(result)) return;

      expect(result.failure.missingKeys).toStrictEqual(['WORKOS_API_KEY']);
    })
  );
});
