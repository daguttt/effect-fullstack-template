import * as NodeServices from '@effect/platform-node/NodeServices';
import { describe, expect, layer } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';

import { WorkosRegistryLock } from './lock.ts';

class TestError extends Schema.TaggedError<TestError>()('TestError', {
  message: Schema.String,
}) {}

/**
 * Each test gets its own lock file from a scoped temporary directory, so the
 * suite needs no shared fixture state and no explicit cleanup.
 */
const withLockFile = <A, E, R>(
  use: (
    lockPath: string,
    registryLock: WorkosRegistryLock['Service']
  ) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const registryLock = yield* WorkosRegistryLock;

    const directory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: 'repo-lock-',
    });

    return yield* use(path.join(directory, 'workos.lock'), registryLock);
  });

// The retry, publication-window and serialisation tests all depend on real
// elapsed time, so the suite opts out of the injected TestClock.
layer(WorkosRegistryLock.layer.pipe(Layer.provideMerge(NodeServices.layer)), {
  excludeTestServices: true,
})('WorkosRegistryLock', (it) => {
  describe('withLock', () => {
    it.effect(
      'holds the lock for the duration of the effect and releases it after',
      () =>
        withLockFile((lockPath, registryLock) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;

            let heldPid: string | undefined;

            const result = yield* registryLock.withLock(
              Effect.gen(function* () {
                heldPid = yield* fileSystem.readFileString(lockPath);

                return 'done';
              }),
              lockPath
            );

            expect(result).toBe('done');
            expect(heldPid).toBe(String(process.pid));
            expect(yield* fileSystem.exists(lockPath)).toBe(false);
          })
        )
    );

    it.effect('releases the lock when the effect fails', () =>
      withLockFile((lockPath, registryLock) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;

          const error = yield* Effect.flip(
            registryLock.withLock(
              Effect.fail(new TestError({ message: 'boom' })),
              lockPath
            )
          );

          expect(error._tag).toBe('TestError');
          expect(yield* fileSystem.exists(lockPath)).toBe(false);
        })
      )
    );

    it.effect('reclaims a lock whose owning process is gone', () =>
      withLockFile((lockPath, registryLock) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;

          // PID 2^22 + 1 is above the maximum on both macOS and Linux, so it
          // can never name a live process.
          yield* fileSystem.writeFileString(lockPath, String(2 ** 22 + 1));

          expect(
            yield* registryLock.withLock(Effect.succeed('done'), lockPath)
          ).toBe('done');
        })
      )
    );

    it.effect('does not reclaim a lock before its owner is published', () =>
      withLockFile((lockPath, registryLock) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;

          yield* fileSystem.writeFileString(lockPath, '');

          let lockSurvivedPublicationWindow = false;

          const [result] = yield* Effect.all(
            [
              registryLock.withLock(Effect.succeed('done'), lockPath),
              // Releases the unpublished lock only after the contender has had
              // time to see it and decline to reclaim it.
              Effect.gen(function* () {
                yield* Effect.sleep(10);

                lockSurvivedPublicationWindow =
                  yield* fileSystem.exists(lockPath);

                yield* fileSystem.remove(lockPath, { force: true });
              }),
            ],
            { concurrency: 'unbounded' }
          );

          expect(result).toBe('done');
          expect(lockSurvivedPublicationWindow).toBe(true);
        })
      )
    );

    it.effect('serialises concurrent holders', () =>
      withLockFile((lockPath, registryLock) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;

          const order: Array<string> = [];

          const hold = (label: string) =>
            registryLock.withLock(
              Effect.gen(function* () {
                order.push(`${label}:enter`);
                yield* Effect.sleep(20);
                order.push(`${label}:exit`);
              }),
              lockPath
            );

          yield* Effect.all([hold('a'), hold('b')], {
            concurrency: 'unbounded',
          });

          // Whichever wins, its exit must precede the other's entry.
          expect(order).toSatisfy(
            (entries: Array<string>) =>
              entries.indexOf('a:exit') < entries.indexOf('b:enter') ||
              entries.indexOf('b:exit') < entries.indexOf('a:enter')
          );
          expect(yield* fileSystem.exists(lockPath)).toBe(false);
        })
      )
    );
  });
});
