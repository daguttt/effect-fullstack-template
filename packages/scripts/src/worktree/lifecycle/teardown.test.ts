import { describe, expect, layer } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import * as TestConsole from 'effect/testing/TestConsole';

import * as ConvexPlatform from '../convexPlatform.ts';
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
            ),
            Effect.provideService(
              ConvexPlatform.ConvexPlatform,
              TestProviders.fakeConvexPlatform()
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
            ),
            Effect.provideService(
              ConvexPlatform.ConvexPlatform,
              TestProviders.fakeConvexPlatform()
            )
          );
          yield* run;
          yield* run;

          expect(yield* Ref.get(removed)).toStrictEqual(['unclaimed-existing']);
          expect(yield* fileSystem.exists(worktree.envFilePath)).toBe(false);
          expect(
            (yield* TestConsole.logLines).filter(
              (line) => line === '[teardown-worktree] Deleted .env.local'
            )
          ).toHaveLength(1);
        }).pipe(Effect.provide(Layer.fresh(TestConsole.layer)))
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
              Effect.provideService(
                ConvexPlatform.ConvexPlatform,
                TestProviders.fakeConvexPlatform()
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

  describe('Convex deployment', () => {
    /**
     * Tears down a worktree that selected `selection`, against a Convex that
     * reports `remote` for it, and returns the names it deleted.
     */
    const deletedBy = (options: {
      readonly selection?: string;
      readonly mainSelection?: string;
      readonly remote?: Partial<ConvexPlatform.Deployment>;
      readonly dryRun?: boolean;
      readonly failDelete?: boolean;
    }) =>
      TestProviders.withWorktreeFixture((worktree, envFile) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const deleted = yield* Ref.make<Array<string>>([]);
          yield* envFile.upsert(worktree.envFilePath, [
            ['CONVEX_DEPLOYMENT', options.selection ?? 'dev:calm-otter-1'],
          ]);
          if (options.mainSelection)
            yield* envFile.upsert(worktree.mainEnvFilePath, [
              ['CONVEX_DEPLOYMENT', options.mainSelection],
            ]);

          const result = yield* Teardown.teardownWorktree(worktree, {
            dryRun: options.dryRun ?? false,
          }).pipe(
            Effect.provideService(
              WorkosCli.WorkosCli,
              TestProviders.fakeWorkosCli()
            ),
            Effect.provideService(
              Lock.WorkosRegistryLock,
              TestProviders.unlockedRegistry
            ),
            Effect.provideService(
              ConvexPlatform.ConvexPlatform,
              TestProviders.fakeConvexPlatform({
                findDeployment: (name) =>
                  Effect.succeedSome({
                    name,
                    reference: 'dev/worktree-test-worktree',
                    deploymentType: 'dev',
                    isDefault: false,
                    ...options.remote,
                  }),
                deleteDeployment: (name) =>
                  options.failDelete
                    ? Effect.fail(
                        new ConvexPlatform.ConvexPlatformError({
                          message: 'platform unavailable',
                        })
                      )
                    : Ref.update(deleted, (names) => [...names, name]),
              })
            ),
            Effect.result
          );

          return {
            result,
            deleted: yield* Ref.get(deleted),
            envFileExists: yield* fileSystem.exists(worktree.envFilePath),
          };
        })
      );

    it.effect('deletes the deployment that carries its reference', () =>
      Effect.gen(function* () {
        const run = yield* deletedBy({});
        expect(run.deleted).toStrictEqual(['calm-otter-1']);
        expect(run.envFileExists).toBe(false);
      })
    );

    it.effect('deletes its deployment selected by bare name', () =>
      Effect.gen(function* () {
        const run = yield* deletedBy({ selection: 'calm-otter-1' });
        expect(run.deleted).toStrictEqual(['calm-otter-1']);
      })
    );

    it.effect('deletes nothing during dry-run', () =>
      Effect.gen(function* () {
        const run = yield* deletedBy({ dryRun: true });
        expect(run.deleted).toStrictEqual([]);
        expect(run.envFileExists).toBe(true);
      })
    );

    for (const [why, options] of [
      ['carries another reference', { remote: { reference: 'dev' } }],
      ['was promoted to production', { remote: { deploymentType: 'prod' } }],
      ['is the project default', { remote: { isDefault: true } }],
      [
        'is selected by the main checkout',
        { mainSelection: 'dev:calm-otter-1' },
      ],
      [
        'is selected by the main checkout by bare name',
        { mainSelection: 'calm-otter-1' },
      ],
      [
        'is selected by the main checkout under a doubled kind',
        { mainSelection: 'dev:dev:calm-otter-1' },
      ],
      [
        'is not selected by a plain name',
        { selection: 'dev:calm-otter-1/delete' },
      ],
    ] as const)
      it.effect(`leaves a deployment that ${why}`, () =>
        Effect.gen(function* () {
          const run = yield* deletedBy(options);
          expect(run.result._tag).toBe('Success');
          expect(run.deleted).toStrictEqual([]);
          expect(run.envFileExists).toBe(false);
        })
      );

    it.effect('keeps .env.local when the deployment is not deleted', () =>
      Effect.gen(function* () {
        const run = yield* deletedBy({ failDelete: true });
        expect(run.result._tag).toBe('Failure');
        expect(run.envFileExists).toBe(true);
      })
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
