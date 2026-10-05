/**
 * Machine-scoped advisory lock around the `workos` CLI's local registry.
 *
 * The registry is a single global file (`~/.workos/config.json`) that
 * `env provision` and `env remove` read-modify-write, so concurrent worktree
 * setups can clobber each other's credentials. Nothing else the CLI does
 * touches the registry, so nothing else needs this lock.
 */
import os from 'node:os';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import * as Random from 'effect/Random';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

export { LockError, WorkosRegistryLock };

class LockError extends Schema.TaggedError<LockError>()('LockError', {
  message: Schema.String,
}) {}

const MAX_ATTEMPTS = 60;
const BASE_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 1000;

const LOCK_FILE_MODE = 0o600;

const isProcessAlive = (pid: number) =>
  Result.match(
    // Signal 0 performs the permission and existence check without delivering.
    Result.try(() => process.kill(pid, 0)),
    {
      onSuccess: () => true,
      onFailure: (cause) => (cause as NodeJS.ErrnoException).code === 'EPERM',
    }
  );

/** The `wx` flag fails with this reason when another holder won the race. */
const isAlreadyExists = (error: PlatformError) =>
  error.reason._tag === 'AlreadyExists';

const asLockError = (lockPath: string) => (cause: unknown) =>
  new LockError({
    message: `Failed to acquire ${lockPath}: ${String(cause)}`,
  });

const retryDelayMs = Effect.fn('WorkosRegistryLock.retryDelayMs')(function* (
  attempt: number
) {
  const backoff = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** attempt,
    MAX_RETRY_DELAY_MS
  );

  // Jitter so worktrees released at the same instant do not re-collide.
  const jitter = yield* Random.next;

  return backoff / 2 + jitter * (backoff / 2);
});

class WorkosRegistryLock extends Context.Service<
  WorkosRegistryLock,
  {
    /**
     * Runs `effect` while holding the registry lock. The lock is released
     * through a scoped finalizer so it survives interrupts and failures.
     */
    readonly withLock: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      lockPath?: string
    ) => Effect.Effect<A, E | LockError, R>;
  }
>()('@repo/scripts/worktree/WorkosRegistryLock') {
  static readonly layer: Layer.Layer<
    WorkosRegistryLock,
    never,
    FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    WorkosRegistryLock,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const defaultLockPath = path.join(
        os.tmpdir(),
        'workos-cli-registry.lock'
      );

      /** Returns `true` when the lock was taken, `false` when a live holder owns it. */
      const tryAcquire = Effect.fn('WorkosRegistryLock.tryAcquire')(function* (
        lockPath: string
      ): Effect.fn.Return<boolean, LockError> {
        // `wx` is O_CREAT | O_EXCL | O_WRONLY: creation is the atomic step
        // that decides the winner. The scoped open closes the descriptor.
        const claimed = yield* Effect.scoped(
          Effect.gen(function* () {
            const file = yield* fileSystem.open(lockPath, {
              flag: 'wx',
              mode: LOCK_FILE_MODE,
            });

            yield* file.writeAll(new TextEncoder().encode(String(process.pid)));

            return true;
          })
        ).pipe(
          Effect.catch((error) =>
            isAlreadyExists(error)
              ? Effect.succeed(false)
              : Effect.fail(asLockError(lockPath)(error))
          )
        );

        if (claimed) {
          return true;
        }

        const contents = yield* fileSystem
          .readFileString(lockPath)
          .pipe(Effect.mapError(asLockError(lockPath)));

        const owner = Number.parseInt(contents.trim(), 10);

        // The holder creates the file before writing its PID. An unreadable
        // owner may therefore still be in the publication window and must not
        // be reclaimed by a contender.
        const hasPublishedOwner = Number.isInteger(owner) && owner > 0;

        const mayStillBeHeld = !hasPublishedOwner || isProcessAlive(owner);

        if (mayStillBeHeld) {
          return false;
        }

        yield* fileSystem
          .remove(lockPath, { force: true })
          .pipe(Effect.mapError(asLockError(lockPath)));

        return false;
      });

      const acquire = Effect.fn('WorkosRegistryLock.acquire')(function* (
        lockPath: string
      ): Effect.fn.Return<void, LockError> {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          if (yield* tryAcquire(lockPath)) {
            return;
          }

          yield* Effect.sleep(yield* retryDelayMs(attempt));
        }

        return yield* new LockError({
          message: `Timed out waiting for the WorkOS CLI registry lock at ${lockPath}. If no other worktree setup or teardown is running, remove that file and retry.`,
        });
      });

      const withLock = <A, E, R>(
        effect: Effect.Effect<A, E, R>,
        lockPath: string = defaultLockPath
      ) =>
        Effect.acquireUseRelease(
          acquire(lockPath),
          () => effect,
          () => Effect.orDie(fileSystem.remove(lockPath, { force: true }))
        );

      return WorkosRegistryLock.of({ withLock });
    })
  );
}
