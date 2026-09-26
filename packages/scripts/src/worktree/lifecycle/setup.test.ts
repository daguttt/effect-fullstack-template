import { describe, expect, layer } from '@effect/vitest';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as Redacted from 'effect/Redacted';
import * as Ref from 'effect/Ref';

import * as ConvexCli from '../convexCli.ts';
import * as EnvFile from '../envFile.ts';
import * as Lock from '../lock.ts';
import type * as Repo from '../repo.ts';
import * as TestProviders from '../testProviders.ts';
import * as TestSpawner from '../testSpawner.ts';
import * as WorkosApi from '../workosApi.ts';
import * as WorkosCli from '../workosCli.ts';
import * as Setup from './setup.ts';
import * as Teardown from './teardown.ts';

const API_KEY = `sk_test_${'a'.repeat(40)}`;
const WEBHOOK_SECRET = `whsec_${'b'.repeat(32)}`;

const writeMainEnvironment = (
  worktree: Repo.WorktreeContext,
  fileSystem: FileSystem.FileSystem
) =>
  fileSystem.writeFileString(
    worktree.mainEnvFilePath,
    [
      'CONVEX_DEPLOYMENT=dev:main-project',
      'CONVEX_URL=https://main.convex.cloud',
      'CONVEX_SITE_URL=https://main.convex.site',
      'VITE_CONVEX_URI=https://main.convex.cloud',
      'KEEP=main',
      '',
    ].join('\n')
  );

const convexFakeThatSelects = (
  envFile: EnvFile.EnvFile['Service'],
  envFilePath: string
) =>
  TestProviders.fakeConvexCli({
    deploymentSelect: () =>
      envFile
        .upsert(envFilePath, [
          ['CONVEX_DEPLOYMENT', 'dev:test-worktree'],
          ['CONVEX_URL', 'https://test.convex.cloud'],
          ['CONVEX_SITE_URL', 'https://test.convex.site'],
        ])
        .pipe(Effect.orDie, Effect.as({ selected: true, diagnostics: '' })),
  });

const ordinaryCommandLayer = TestSpawner.recordedSpawnerLayer(() => ({}));
const realServiceLayer = layer(TestProviders.worktreeFixtureLayer, {
  excludeTestServices: true,
});

realServiceLayer('setupWorktree outcomes', (it) => {
  describe('carried state', () => {
    it.effect('reuses a complete environment and webhook secret', () =>
      TestProviders.withWorktreeFixture((worktree, envFile) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const provisionCalls = yield* Ref.make(0);
          const webhookCalls = yield* Ref.make(0);
          yield* writeMainEnvironment(worktree, fileSystem);
          yield* fileSystem.writeFileString(
            worktree.envFilePath,
            [
              'VITE_DEV_SERVER_PORT=5175',
              'WORKOS_LOCAL_ENV_NAME=unclaimed-existing',
              `WORKOS_API_KEY=${API_KEY}`,
              'WORKOS_CLIENT_ID=client_existing',
              'WORKOS_AUTHKIT_DOMAIN=existing.authkit.app',
              `WORKOS_WEBHOOK_SECRET=${WEBHOOK_SECRET}`,
              '',
            ].join('\n')
          );

          const workosCli = TestProviders.fakeWorkosCli({
            envProvision: Ref.update(provisionCalls, (count) => count + 1).pipe(
              Effect.andThen(
                Effect.die(new Error('rerun must not provision WorkOS'))
              )
            ),
          });
          const workosApi = TestProviders.fakeWorkosApi({
            ensureWebhookEndpoint: () =>
              Ref.update(webhookCalls, (count) => count + 1).pipe(
                Effect.andThen(
                  Effect.die(new Error('rerun must reuse the webhook secret'))
                )
              ),
          });

          yield* Setup.setupWorktree(worktree).pipe(
            Effect.provideService(WorkosCli.WorkosCli, workosCli),
            Effect.provideService(WorkosApi.WorkosApi, workosApi),
            Effect.provideService(
              ConvexCli.ConvexCli,
              convexFakeThatSelects(envFile, worktree.envFilePath)
            ),
            Effect.provideService(
              Lock.WorkosRegistryLock,
              TestProviders.unlockedRegistry
            ),
            Effect.provide(ordinaryCommandLayer)
          );

          expect(yield* Ref.get(provisionCalls)).toBe(0);
          expect(yield* Ref.get(webhookCalls)).toBe(0);
          const values = yield* envFile.read(worktree.envFilePath);
          expect(values.get('WORKOS_LOCAL_ENV_NAME')).toBe(
            'unclaimed-existing'
          );
          expect(values.get('WORKOS_WEBHOOK_SECRET')).toBe(WEBHOOK_SECRET);
          expect(values.get('KEEP')).toBe('main');
        })
      )
    );

    it.effect(
      'refuses partial credentials before provisioning or replacement',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const provisionCalls = yield* Ref.make(0);
            const original = [
              'KEEP=original',
              'WORKOS_LOCAL_ENV_NAME=unclaimed-partial',
              `WORKOS_API_KEY=${API_KEY}`,
              '',
            ].join('\n');
            yield* writeMainEnvironment(worktree, fileSystem);
            yield* fileSystem.writeFileString(worktree.envFilePath, original);

            const error = yield* Effect.flip(
              Setup.setupWorktree(worktree).pipe(
                Effect.provideService(
                  WorkosCli.WorkosCli,
                  TestProviders.fakeWorkosCli({
                    envProvision: Ref.update(
                      provisionCalls,
                      (count) => count + 1
                    ).pipe(
                      Effect.andThen(Effect.die(new Error('must not run')))
                    ),
                  })
                ),
                Effect.provideService(
                  WorkosApi.WorkosApi,
                  TestProviders.fakeWorkosApi()
                ),
                Effect.provideService(
                  ConvexCli.ConvexCli,
                  convexFakeThatSelects(envFile, worktree.envFilePath)
                ),
                Effect.provideService(
                  Lock.WorkosRegistryLock,
                  TestProviders.unlockedRegistry
                ),
                Effect.provide(ordinaryCommandLayer)
              )
            );

            expect(error._tag).toBe('PartialWorkosStateError');
            expect(yield* Ref.get(provisionCalls)).toBe(0);
            expect(yield* fileSystem.readFileString(worktree.envFilePath)).toBe(
              original
            );
          })
        )
    );

    it.effect(
      'keeps the fresh registry lock until credentials are durable',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const lockHeld = yield* Ref.make(false);
            const claimAtRelease = yield* Ref.make<string | undefined>(
              undefined
            );
            yield* writeMainEnvironment(worktree, fileSystem);

            const registryLock = Lock.WorkosRegistryLock.of({
              withLock: (effect) =>
                Effect.acquireUseRelease(
                  Ref.set(lockHeld, true),
                  () => effect,
                  () =>
                    envFile
                      .readValue(worktree.envFilePath, 'WORKOS_LOCAL_ENV_NAME')
                      .pipe(
                        Effect.orDie,
                        Effect.flatMap((value) =>
                          Ref.set(
                            claimAtRelease,
                            value._tag === 'Some' ? value.value : undefined
                          )
                        ),
                        Effect.andThen(Ref.set(lockHeld, false))
                      )
                ),
            });
            const workosCli = TestProviders.fakeWorkosCli({
              envProvision: Effect.gen(function* () {
                const held = yield* Ref.get(lockHeld);
                if (!held) {
                  return yield* Effect.die(
                    new Error('provision ran outside registry lock')
                  );
                }

                return {
                  name: 'unclaimed-fresh',
                  apiKey: Redacted.make(API_KEY),
                  clientId: 'client_fresh',
                  authkitDomain: 'fresh.authkit.app',
                };
              }),
              configureAuthKit: () =>
                Effect.fail(
                  new WorkosCli.WorkosCliError({
                    message: 'stop after persistence',
                  })
                ),
            });

            yield* Effect.flip(
              Setup.setupWorktree(worktree).pipe(
                Effect.provideService(WorkosCli.WorkosCli, workosCli),
                Effect.provideService(
                  WorkosApi.WorkosApi,
                  TestProviders.fakeWorkosApi()
                ),
                Effect.provideService(
                  ConvexCli.ConvexCli,
                  convexFakeThatSelects(envFile, worktree.envFilePath)
                ),
                Effect.provideService(Lock.WorkosRegistryLock, registryLock),
                Effect.provide(ordinaryCommandLayer)
              )
            );

            expect(yield* Ref.get(lockHeld)).toBe(false);
            expect(yield* Ref.get(claimAtRelease)).toBe('unclaimed-fresh');
            const values = yield* envFile.read(worktree.envFilePath);
            expect(values.get('WORKOS_API_KEY')).toBe(API_KEY);
            expect(values.get('WORKOS_CLIENT_ID')).toBe('client_fresh');
            expect(values.get('WORKOS_AUTHKIT_DOMAIN')).toBe(
              'fresh.authkit.app'
            );

            const rerunProvisionCalls = yield* Ref.make(0);
            yield* Setup.setupWorktree(worktree).pipe(
              Effect.provideService(
                WorkosCli.WorkosCli,
                TestProviders.fakeWorkosCli({
                  envProvision: Ref.update(
                    rerunProvisionCalls,
                    (count) => count + 1
                  ).pipe(
                    Effect.andThen(
                      Effect.die(
                        new Error('rerun must reuse the persisted environment')
                      )
                    )
                  ),
                })
              ),
              Effect.provideService(
                WorkosApi.WorkosApi,
                TestProviders.fakeWorkosApi()
              ),
              Effect.provideService(
                ConvexCli.ConvexCli,
                convexFakeThatSelects(envFile, worktree.envFilePath)
              ),
              Effect.provideService(
                Lock.WorkosRegistryLock,
                TestProviders.unlockedRegistry
              ),
              Effect.provide(ordinaryCommandLayer)
            );

            expect(yield* Ref.get(rerunProvisionCalls)).toBe(0);
            const rerunValues = yield* envFile.read(worktree.envFilePath);
            expect(rerunValues.get('WORKOS_LOCAL_ENV_NAME')).toBe(
              'unclaimed-fresh'
            );
          })
        )
    );

    it.effect(
      'keeps concurrent GC behind the fresh claim using the real lock',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const fileRegistryLock = yield* Lock.WorkosRegistryLock;
            const provisionStarted = yield* Deferred.make<void>();
            const allowProvision = yield* Deferred.make<void>();
            const removed = yield* Ref.make<Array<string>>([]);
            yield* writeMainEnvironment(worktree, fileSystem);

            const lockPath = path.join(
              path.dirname(worktree.repoRoot),
              'workos-registry.lock'
            );
            const registryLock = Lock.WorkosRegistryLock.of({
              withLock: (effect) => fileRegistryLock.withLock(effect, lockPath),
            });
            const workosCli = TestProviders.fakeWorkosCli({
              envProvision: Deferred.succeed(provisionStarted, undefined).pipe(
                Effect.andThen(Deferred.await(allowProvision)),
                Effect.as({
                  name: 'unclaimed-racing',
                  apiKey: Redacted.make(API_KEY),
                  clientId: 'client_racing',
                  authkitDomain: 'racing.authkit.app',
                })
              ),
              envList: Effect.succeed([
                { name: 'unclaimed-racing', active: true },
              ]),
              envRemove: (name) =>
                Ref.update(removed, (names) => [...names, name]),
              configureAuthKit: () =>
                Effect.fail(
                  new WorkosCli.WorkosCliError({
                    message: 'stop after persistence',
                  })
                ),
            });
            const convexCli = convexFakeThatSelects(
              envFile,
              worktree.envFilePath
            );
            const spawnerLayer = TestSpawner.recordedSpawnerLayer(
              (invocation) => ({
                stdout:
                  invocation.command === 'git'
                    ? `worktree ${worktree.repoRoot}\nHEAD abc\nbranch refs/heads/test\n`
                    : '',
              })
            );

            const setupFiber = yield* Setup.setupWorktree(worktree).pipe(
              Effect.provideService(WorkosCli.WorkosCli, workosCli),
              Effect.provideService(
                WorkosApi.WorkosApi,
                TestProviders.fakeWorkosApi()
              ),
              Effect.provideService(ConvexCli.ConvexCli, convexCli),
              Effect.provideService(Lock.WorkosRegistryLock, registryLock),
              Effect.provide(spawnerLayer),
              Effect.forkChild({ startImmediately: true })
            );
            yield* Deferred.await(provisionStarted);

            const gcFiber = yield* Teardown.gcWorktreeEnvironments({
              prune: true,
            }).pipe(
              Effect.provideService(WorkosCli.WorkosCli, workosCli),
              Effect.provideService(Lock.WorkosRegistryLock, registryLock),
              Effect.provide(spawnerLayer),
              Effect.forkChild({ startImmediately: true })
            );
            yield* Effect.yieldNow;
            yield* Deferred.succeed(allowProvision, undefined);
            yield* Fiber.await(setupFiber);
            yield* Fiber.join(gcFiber);

            expect(yield* Ref.get(removed)).toStrictEqual([]);
            expect(
              yield* envFile.readValue(
                worktree.envFilePath,
                'WORKOS_LOCAL_ENV_NAME'
              )
            ).toMatchObject({ _tag: 'Some', value: 'unclaimed-racing' });
          })
        )
    );
  });

  describe('AuthKit and webhook provisioning', () => {
    const runSetup = (
      worktree: Repo.WorktreeContext,
      envFile: EnvFile.EnvFile['Service'],
      overrides: {
        readonly workosCli?: Partial<WorkosCli.WorkosCli['Service']>;
        readonly workosApi?: Partial<WorkosApi.WorkosApi['Service']>;
      } = {}
    ) =>
      Setup.setupWorktree(worktree).pipe(
        Effect.provideService(
          WorkosCli.WorkosCli,
          TestProviders.fakeWorkosCli(overrides.workosCli)
        ),
        Effect.provideService(
          WorkosApi.WorkosApi,
          TestProviders.fakeWorkosApi(overrides.workosApi)
        ),
        Effect.provideService(
          ConvexCli.ConvexCli,
          convexFakeThatSelects(envFile, worktree.envFilePath)
        ),
        Effect.provideService(
          Lock.WorkosRegistryLock,
          TestProviders.unlockedRegistry
        ),
        Effect.provide(ordinaryCommandLayer)
      );

    it.effect(
      'configures the callback, origin, and sign-out homepage for this port',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const configured = yield* Ref.make<
              WorkosCli.ConfigureAuthKitDto | undefined
            >(undefined);
            yield* writeMainEnvironment(worktree, fileSystem);
            yield* fileSystem.writeFileString(
              worktree.envFilePath,
              'VITE_DEV_SERVER_PORT=5175\n'
            );

            yield* runSetup(worktree, envFile, {
              workosCli: {
                configureAuthKit: (configuration) =>
                  Ref.set(configured, configuration),
              },
            });

            expect(yield* Ref.get(configured)).toStrictEqual({
              redirectUri: 'http://localhost:5175/callback',
              corsOrigin: 'http://localhost:5175',
              homepageUrl: 'http://localhost:5175/signout-callback',
            });
          })
        )
    );

    it.effect(
      'subscribes the Convex site URL to the WorkOS events Convex handles',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const requested = yield* Ref.make<
              | {
                  readonly url: string;
                  readonly events: ReadonlyArray<string>;
                }
              | undefined
            >(undefined);
            yield* writeMainEnvironment(worktree, fileSystem);

            yield* runSetup(worktree, envFile, {
              workosApi: {
                ensureWebhookEndpoint: (options) =>
                  Ref.set(requested, options).pipe(
                    Effect.as({
                      id: 'we_fresh',
                      endpoint_url: options.url,
                      secret: Redacted.make(WEBHOOK_SECRET),
                      status: 'enabled' as const,
                      events: options.events,
                    })
                  ),
              },
            });

            expect(yield* Ref.get(requested)).toStrictEqual({
              url: 'https://test.convex.site/workos/webhook',
              events: WorkosApi.WORKOS_WEBHOOK_EVENTS,
            });
            const values = yield* envFile.read(worktree.envFilePath);
            expect(values.get('WORKOS_WEBHOOK_SECRET')).toBe(WEBHOOK_SECRET);
          })
        )
    );

    it.effect(
      'provisions only the webhook when credentials survived without one',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const provisionCalls = yield* Ref.make(0);
            const requested = yield* Ref.make<string | undefined>(undefined);
            yield* writeMainEnvironment(worktree, fileSystem);
            yield* fileSystem.writeFileString(
              worktree.envFilePath,
              [
                'VITE_DEV_SERVER_PORT=5175',
                'WORKOS_LOCAL_ENV_NAME=unclaimed-resumed',
                `WORKOS_API_KEY=${API_KEY}`,
                'WORKOS_CLIENT_ID=client_resumed',
                'WORKOS_AUTHKIT_DOMAIN=resumed.authkit.app',
                '',
              ].join('\n')
            );

            yield* runSetup(worktree, envFile, {
              workosCli: {
                envProvision: Ref.update(
                  provisionCalls,
                  (count) => count + 1
                ).pipe(
                  Effect.andThen(
                    Effect.die(new Error('must reuse the carried environment'))
                  )
                ),
              },
              workosApi: {
                ensureWebhookEndpoint: (options) =>
                  Ref.set(requested, options.url).pipe(
                    Effect.as({
                      id: 'we_resumed',
                      endpoint_url: options.url,
                      secret: Redacted.make(WEBHOOK_SECRET),
                      status: 'enabled' as const,
                      events: options.events,
                    })
                  ),
              },
            });

            expect(yield* Ref.get(provisionCalls)).toBe(0);
            expect(yield* Ref.get(requested)).toBe(
              'https://test.convex.site/workos/webhook'
            );
            const values = yield* envFile.read(worktree.envFilePath);
            expect(values.get('WORKOS_LOCAL_ENV_NAME')).toBe(
              'unclaimed-resumed'
            );
            expect(values.get('WORKOS_WEBHOOK_SECRET')).toBe(WEBHOOK_SECRET);
          })
        )
    );

    it.effect('pushes the provisioned secret onto the Convex deployment', () =>
      TestProviders.withWorktreeFixture((worktree, envFile) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const convexEnvironment = yield* Ref.make<
            ReadonlyArray<readonly [string, string]>
          >([]);
          yield* writeMainEnvironment(worktree, fileSystem);

          yield* Setup.setupWorktree(worktree).pipe(
            Effect.provideService(
              WorkosCli.WorkosCli,
              TestProviders.fakeWorkosCli()
            ),
            Effect.provideService(
              WorkosApi.WorkosApi,
              TestProviders.fakeWorkosApi({
                ensureWebhookEndpoint: (options) =>
                  Effect.succeed({
                    id: 'we_fresh',
                    endpoint_url: options.url,
                    secret: Redacted.make(WEBHOOK_SECRET),
                    status: 'enabled' as const,
                    events: options.events,
                  }),
              })
            ),
            Effect.provideService(ConvexCli.ConvexCli, {
              ...convexFakeThatSelects(envFile, worktree.envFilePath),
              envSet: (key, value) =>
                Ref.update(convexEnvironment, (entries) => [
                  ...entries,
                  [
                    key,
                    Redacted.isRedacted(value) ? Redacted.value(value) : value,
                  ] as const,
                ]),
            }),
            Effect.provideService(
              Lock.WorkosRegistryLock,
              TestProviders.unlockedRegistry
            ),
            Effect.provide(ordinaryCommandLayer)
          );

          expect(yield* Ref.get(convexEnvironment)).toContainEqual([
            'WORKOS_WEBHOOK_SECRET',
            WEBHOOK_SECRET,
          ]);
        })
      )
    );

    it.effect(
      'leaves the environment resumable when AuthKit seeding fails',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const webhookCalls = yield* Ref.make(0);
            yield* writeMainEnvironment(worktree, fileSystem);

            yield* Effect.flip(
              runSetup(worktree, envFile, {
                workosCli: {
                  configureAuthKit: () =>
                    Effect.fail(
                      new WorkosCli.WorkosCliError({
                        code: 'seed_failed',
                        message: 'workos seed failed (seed_failed)',
                      })
                    ),
                },
                workosApi: {
                  ensureWebhookEndpoint: () =>
                    Ref.update(webhookCalls, (count) => count + 1).pipe(
                      Effect.andThen(
                        Effect.die(new Error('must not reach the webhook API'))
                      )
                    ),
                },
              })
            );

            expect(yield* Ref.get(webhookCalls)).toBe(0);
            const values = yield* envFile.read(worktree.envFilePath);
            expect(values.get('WORKOS_LOCAL_ENV_NAME')).toBe('unclaimed-test');
            expect(values.get('WORKOS_API_KEY')).toBe('sk_test_default');
          })
        )
    );

    it.effect(
      'writes no webhook secret and no Convex values when provisioning fails',
      () =>
        TestProviders.withWorktreeFixture((worktree, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            const convexEnvironment = yield* Ref.make<Array<string>>([]);
            yield* writeMainEnvironment(worktree, fileSystem);

            yield* Effect.flip(
              Setup.setupWorktree(worktree).pipe(
                Effect.provideService(
                  WorkosCli.WorkosCli,
                  TestProviders.fakeWorkosCli()
                ),
                Effect.provideService(
                  WorkosApi.WorkosApi,
                  TestProviders.fakeWorkosApi({
                    ensureWebhookEndpoint: () =>
                      Effect.fail(
                        new WorkosApi.WorkosApiError({
                          message:
                            'WorkOS webhook endpoint create failed: TransportError.',
                        })
                      ),
                  })
                ),
                Effect.provideService(ConvexCli.ConvexCli, {
                  ...convexFakeThatSelects(envFile, worktree.envFilePath),
                  envSet: (key) =>
                    Ref.update(convexEnvironment, (keys) => [...keys, key]),
                }),
                Effect.provideService(
                  Lock.WorkosRegistryLock,
                  TestProviders.unlockedRegistry
                ),
                Effect.provide(ordinaryCommandLayer)
              )
            );

            expect(yield* Ref.get(convexEnvironment)).toStrictEqual([]);
            const values = yield* envFile.read(worktree.envFilePath);
            expect(values.has('WORKOS_WEBHOOK_SECRET')).toBe(false);
          })
        )
    );
  });
});

realServiceLayer('setupWorktree command environment', (it) => {
  it.effect('stages inherited removals and lets the current API key win', () =>
    TestProviders.withWorktreeFixture((worktree, envFile) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const invocations: Array<TestSpawner.RecordedInvocation> = [];
        yield* writeMainEnvironment(worktree, fileSystem);

        const inheritedEnvironment = Object.fromEntries([
          ...Setup.OVERRIDING_KEYS.map(
            (key) => [key, `inherited-${key}`] as const
          ),
          ...Setup.STALE_CONVEX_URL_KEYS.map(
            (key) => [key, `inherited-${key}`] as const
          ),
          ['CONVEX_DEPLOYMENT', 'dev:main-project'] as const,
        ]);
        const spawnerLayer = TestSpawner.recordedSpawnerLayer(
          (invocation) => {
            const commandLine = invocation.args.join(' ');
            const isSelect = commandLine.includes('convex deployment select');
            const isCreate = commandLine.includes('convex deployment create');
            if (isSelect) {
              return {
                exitCode: 1,
                stderr: 'deployment not found',
              };
            }

            if (isCreate) {
              return {
                beforeResponse: envFile
                  .upsert(worktree.envFilePath, [
                    ['CONVEX_DEPLOYMENT', 'dev:test-worktree'],
                    ['CONVEX_URL', 'https://test.convex.cloud'],
                    ['CONVEX_SITE_URL', 'https://test.convex.site'],
                  ])
                  .pipe(Effect.orDie),
              };
            }

            if (invocation.command === 'workos') {
              if (invocation.args[0] === '--version') {
                return { stdout: '0.22.0\n' };
              }
              if (invocation.args[0] === 'env') {
                return {
                  stdout: JSON.stringify({
                    status: 'ok',
                    data: {
                      name: 'unclaimed-live',
                      apiKey: API_KEY,
                      clientId: 'client_live',
                      authkitDomain: 'live.authkit.app',
                    },
                  }),
                };
              }
              return {
                stdout: JSON.stringify({
                  status: 'ok',
                  message: 'Seed complete',
                  state: {},
                }),
              };
            }

            return {};
          },
          invocations,
          inheritedEnvironment
        );
        const cliLayer = Layer.mergeAll(
          WorkosCli.WorkosCli.layer,
          ConvexCli.ConvexCli.layer
        ).pipe(Layer.provideMerge(spawnerLayer));

        yield* Setup.setupWorktree(worktree).pipe(
          Effect.provideService(
            Lock.WorkosRegistryLock,
            TestProviders.unlockedRegistry
          ),
          Effect.provideService(
            WorkosApi.WorkosApi,
            TestProviders.fakeWorkosApi({
              ensureWebhookEndpoint: (options) =>
                Effect.succeed({
                  id: 'we_live',
                  endpoint_url: options.url,
                  secret: Redacted.make(WEBHOOK_SECRET),
                  status: 'enabled' as const,
                  events: options.events,
                }),
            })
          ),
          Effect.provide(cliLayer)
        );

        expect(invocations[0]).toMatchObject({
          command: 'workos',
          args: ['--version'],
        });
        for (const key of [
          ...Setup.OVERRIDING_KEYS,
          ...Setup.STALE_CONVEX_URL_KEYS,
        ]) {
          expect(invocations[0]?.env).toHaveProperty(key, undefined);
        }

        const select = invocations.find((invocation) =>
          invocation.args.join(' ').includes('convex deployment select')
        );
        const create = invocations.find((invocation) =>
          invocation.args.join(' ').includes('convex deployment create')
        );
        for (const deploymentCommand of [select, create]) {
          expect(deploymentCommand?.env.CONVEX_DEPLOYMENT).toBe(
            'dev:main-project'
          );
        }
        for (const key of [
          ...Setup.OVERRIDING_KEYS,
          ...Setup.STALE_CONVEX_URL_KEYS,
        ]) {
          expect(select?.env).toHaveProperty(key, undefined);
          expect(create?.env).toHaveProperty(key, undefined);
        }

        const seed = invocations.find(
          (invocation) =>
            invocation.command === 'workos' && invocation.args[0] === 'seed'
        );
        expect(seed).toBeDefined();
        expect(seed?.env.CONVEX_DEPLOYMENT).toBeUndefined();
        expect(seed?.env).toHaveProperty(Setup.CONVEX_SELECTION_KEYS[0]);
        expect(seed?.env.WORKOS_API_KEY).toBe('[redacted]');
        const recordedArguments = invocations.flatMap(
          (invocation) => invocation.args
        );
        expect(recordedArguments).not.toContain(API_KEY);
        expect(recordedArguments).not.toContain(WEBHOOK_SECRET);
      })
    )
  );
});
