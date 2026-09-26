import { describe, expect, layer } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

import * as Lock from '../lock.ts';
import * as TestProviders from '../testProviders.ts';
import * as TestSpawner from '../testSpawner.ts';
import * as WorkosCli from '../workosCli.ts';
import * as Teardown from './teardown.ts';

layer(TestProviders.worktreeFixtureLayer)('teardownWorktree', (it) => {
  describe('local teardown', () => {
    it.effect('makes no registry or filesystem writes during dry-run', () =>
      TestProviders.withWorktreeFixture((worktree) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const removed = yield* Ref.make<Array<string>>([]);
          yield* fileSystem.writeFileString(
            worktree.envFilePath,
            'WORKOS_LOCAL_ENV_NAME=unclaimed-existing\n'
          );

          yield* Teardown.teardownWorktree(worktree, { dryRun: true }).pipe(
            Effect.provideService(
              WorkosCli.WorkosCli,
              TestProviders.fakeWorkosCli({
                envRemove: (name) =>
                  Ref.update(removed, (names) => [...names, name]),
              })
            ),
            Effect.provideService(
              Lock.WorkosRegistryLock,
              TestProviders.unlockedRegistry
            )
          );

          expect(yield* Ref.get(removed)).toStrictEqual([]);
          expect(yield* fileSystem.exists(worktree.envFilePath)).toBe(true);
        })
      )
    );

    it.effect('succeeds when repeated and forgets the profile once', () =>
      TestProviders.withWorktreeFixture((worktree) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const removed = yield* Ref.make<Array<string>>([]);
          const workosCli = TestProviders.fakeWorkosCli({
            envRemove: (name) =>
              Ref.update(removed, (names) => [...names, name]),
          });
          yield* fileSystem.writeFileString(
            worktree.envFilePath,
            'WORKOS_LOCAL_ENV_NAME=unclaimed-existing\n'
          );

          const run = Teardown.teardownWorktree(worktree, {
            dryRun: false,
          }).pipe(
            Effect.provideService(WorkosCli.WorkosCli, workosCli),
            Effect.provideService(
              Lock.WorkosRegistryLock,
              TestProviders.unlockedRegistry
            )
          );
          yield* run;
          yield* run;

          expect(yield* Ref.get(removed)).toStrictEqual(['unclaimed-existing']);
          expect(yield* fileSystem.exists(worktree.envFilePath)).toBe(false);
        })
      )
    );

    it.effect(
      'survives the CLI reporting the absent environment on stderr',
      () =>
        TestProviders.withWorktreeFixture((worktree) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            yield* fileSystem.writeFileString(
              worktree.envFilePath,
              'WORKOS_LOCAL_ENV_NAME=unclaimed-gone\n'
            );

            const spawnerLayer = TestSpawner.recordedSpawnerLayer(() => ({
              stdout: '',
              stderr:
                '{"error":{"code":"not_found","message":"Environment unclaimed-gone not found. Run `workos env list` to see configured environments."}}',
              exitCode: 1,
            }));

            yield* Teardown.teardownWorktree(worktree, {
              dryRun: false,
            }).pipe(
              Effect.provideService(
                Lock.WorkosRegistryLock,
                TestProviders.unlockedRegistry
              ),
              Effect.provide(
                WorkosCli.WorkosCli.layer.pipe(Layer.provide(spawnerLayer))
              )
            );

            expect(yield* fileSystem.exists(worktree.envFilePath)).toBe(false);
          })
        )
    );
  });

  describe('gcWorktreeEnvironments', () => {
    it.effect('prunes only profiles no readable live worktree claims', () =>
      TestProviders.withWorktreeFixture((worktree) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const removed = yield* Ref.make<Array<string>>([]);
          yield* fileSystem.writeFileString(
            worktree.envFilePath,
            'WORKOS_LOCAL_ENV_NAME=claimed\n'
          );
          const spawnerLayer = TestSpawner.recordedSpawnerLayer(() => ({
            stdout: `worktree ${worktree.repoRoot}\nHEAD abc\nbranch refs/heads/test\n`,
          }));

          yield* Teardown.gcWorktreeEnvironments({ prune: true }).pipe(
            Effect.provideService(
              WorkosCli.WorkosCli,
              TestProviders.fakeWorkosCli({
                envList: Effect.succeed([
                  { name: 'claimed', active: true },
                  { name: 'orphaned', active: false },
                ]),
                envRemove: (name) =>
                  Ref.update(removed, (names) => [...names, name]),
              })
            ),
            Effect.provideService(
              Lock.WorkosRegistryLock,
              TestProviders.unlockedRegistry
            ),
            Effect.provide(spawnerLayer)
          );

          expect(yield* Ref.get(removed)).toStrictEqual(['orphaned']);
        })
      )
    );
  });
});
