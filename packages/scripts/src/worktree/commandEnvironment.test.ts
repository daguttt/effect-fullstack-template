import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as PlatformError from 'effect/PlatformError';
import * as Redacted from 'effect/Redacted';

import * as CliRunner from './cliRunner.ts';
import * as CommandEnvironment from './commandEnvironment.ts';
import * as TestSpawner from './testSpawner.ts';

describe('CommandEnvironment', () => {
  it.effect('defaults to an empty unset-key set', () =>
    Effect.gen(function* () {
      expect([...(yield* CommandEnvironment.UnsetKeys)]).toStrictEqual([]);
    })
  );

  it.effect('adds scoped keys to child command environments', () => {
    const invocations: Array<TestSpawner.RecordedInvocation> = [];

    return Effect.scoped(
      Effect.gen(function* () {
        yield* CommandEnvironment.unsetScoped(['WORKOS_API_KEY']);
        yield* CliRunner.runCli({ command: 'tool', args: [] });

        expect(invocations[0]?.env.WORKOS_API_KEY).toBeUndefined();
        expect(invocations[0]?.env).toHaveProperty('WORKOS_API_KEY');
      })
    ).pipe(
      Effect.provide(TestSpawner.recordedSpawnerLayer(() => ({}), invocations))
    );
  });

  it.effect('unions nested scopes and restores the outer set', () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* CommandEnvironment.unsetScoped(['OUTER']);
        const outer = yield* CommandEnvironment.UnsetKeys;
        const nested = yield* Effect.scoped(
          Effect.gen(function* () {
            yield* CommandEnvironment.unsetScoped(['INNER']);
            return yield* CommandEnvironment.UnsetKeys;
          })
        );
        const restored = yield* CommandEnvironment.UnsetKeys;

        expect([...outer]).toStrictEqual(['OUTER']);
        expect([...nested]).toStrictEqual(['OUTER', 'INNER']);
        expect([...restored]).toStrictEqual(['OUTER']);
      })
    )
  );

  it.effect('keeps concurrent scoped updates fiber-local', () =>
    Effect.gen(function* () {
      const [left, right] = yield* Effect.all(
        [
          Effect.scoped(
            Effect.gen(function* () {
              yield* CommandEnvironment.unsetScoped(['LEFT']);
              yield* Effect.yieldNow;
              return [...(yield* CommandEnvironment.UnsetKeys)];
            })
          ),
          Effect.scoped(
            Effect.gen(function* () {
              yield* CommandEnvironment.unsetScoped(['RIGHT']);
              yield* Effect.yieldNow;
              return [...(yield* CommandEnvironment.UnsetKeys)];
            })
          ),
        ],
        { concurrency: 'unbounded' }
      );

      expect(left).toStrictEqual(['LEFT']);
      expect(right).toStrictEqual(['RIGHT']);
    })
  );

  it.effect('lets an explicit command value override a scoped unset', () => {
    const invocations: Array<TestSpawner.RecordedInvocation> = [];
    const secret = 'an-unprefixed-secret';

    return CliRunner.runCli({
      command: 'tool',
      args: [],
      env: { WORKOS_API_KEY: Redacted.make(secret) },
    }).pipe(
      CommandEnvironment.without(['WORKOS_API_KEY']),
      Effect.provide(TestSpawner.recordedSpawnerLayer(() => ({}), invocations)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(invocations[0]?.env.WORKOS_API_KEY).toBe('[redacted]');
          expect(Object.values(invocations[0]?.env ?? {})).not.toContain(
            secret
          );
        })
      )
    );
  });

  it.effect(
    'does not expose redacted explicit values in command errors',
    () => {
      const secret = 'another-unprefixed-secret';
      const spawnError = PlatformError.systemError({
        _tag: 'PermissionDenied',
        module: 'ChildProcess',
        method: 'spawn',
        pathOrDescriptor: secret,
      });

      return Effect.flip(
        CliRunner.runCli({
          command: 'tool',
          args: [],
          env: { WORKOS_API_KEY: Redacted.make(secret) },
        }).pipe(
          Effect.provide(
            TestSpawner.recordedSpawnerLayer(() => ({ spawnError }))
          )
        )
      ).pipe(
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error.message).not.toContain(secret);
            expect(error.message).toContain('[redacted]');
          })
        )
      );
    }
  );

  it.effect('does not expose redacted arguments in command errors', () => {
    const secret = 'an-unprefixed-argument-error-secret';
    const spawnError = PlatformError.systemError({
      _tag: 'PermissionDenied',
      module: 'ChildProcess',
      method: 'spawn',
      pathOrDescriptor: secret,
    });

    return Effect.flip(
      CliRunner.runCli({
        command: 'tool',
        args: [Redacted.make(secret)],
      }).pipe(
        Effect.provide(TestSpawner.recordedSpawnerLayer(() => ({ spawnError })))
      )
    ).pipe(
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error.message).not.toContain(secret);
          expect(error.message).toContain('[redacted]');
        })
      )
    );
  });
});
