import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as Redacted from 'effect/Redacted';

import * as ConvexCli from './convexCli.ts';
import * as ConvexPlatform from './convexPlatform.ts';
import * as EnvFile from './envFile.ts';
import * as Lock from './lock.ts';
import type * as Repo from './repo.ts';
import * as WorkosApi from './workosApi.ts';
import * as WorkosCli from './workosCli.ts';

export {
  fakeConvexCli,
  fakeConvexPlatform,
  fakeWorkosApi,
  fakeWorkosCli,
  unlockedRegistry,
  withWorktreeFixture,
  worktreeFixtureLayer,
};

const worktreeFixtureLayer = Layer.mergeAll(
  EnvFile.EnvFile.layer,
  Lock.WorkosRegistryLock.layer
).pipe(Layer.provideMerge(NodeServices.layer));

const withWorktreeFixture = <A, E, R>(
  use: (
    worktree: Repo.WorktreeContext,
    envFile: EnvFile.EnvFile['Service']
  ) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const envFile = yield* EnvFile.EnvFile;
    const directory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: 'repo-worktree-workflow-',
    });
    const mainWorktreeRoot = path.join(directory, 'main');
    const repoRoot = path.join(directory, 'linked');
    yield* fileSystem.makeDirectory(mainWorktreeRoot, { recursive: true });
    yield* fileSystem.makeDirectory(repoRoot, { recursive: true });

    return yield* use(
      {
        repoRoot,
        gitDir: path.join(directory, '.git/worktrees/test-worktree'),
        worktreeId: 'test-worktree',
        envFilePath: path.join(repoRoot, '.env.local'),
        mainEnvFilePath: path.join(mainWorktreeRoot, '.env.local'),
      },
      envFile
    );
  });

const unlockedRegistry = Lock.WorkosRegistryLock.of({
  withLock: (effect) => effect,
});

const defaultEnvironment = {
  name: 'unclaimed-test',
  apiKey: Redacted.make('sk_test_default'),
  clientId: 'client_default',
  authkitDomain: 'default.authkit.app',
};

const fakeWorkosCli = (
  overrides: Partial<WorkosCli.WorkosCli['Service']> = {}
): WorkosCli.WorkosCli['Service'] =>
  WorkosCli.WorkosCli.of({
    assertInstalled: Effect.void,
    envProvision: Effect.succeed(defaultEnvironment),
    envRemove: () => Effect.void,
    envList: Effect.succeed([]),
    configureAuthKit: () => Effect.void,
    ...overrides,
  });

const fakeWorkosApi = (
  overrides: Partial<WorkosApi.WorkosApi['Service']> = {}
): WorkosApi.WorkosApi['Service'] =>
  WorkosApi.WorkosApi.of({
    ensureWebhookEndpoint: (options) =>
      Effect.succeed({
        id: 'we_test',
        endpoint_url: options.url,
        secret: Redacted.make('whsec_default'),
        status: 'enabled' as const,
        events: options.events,
      }),
    ...overrides,
  });

const fakeConvexCli = (
  overrides: Partial<ConvexCli.ConvexCli['Service']> = {}
): ConvexCli.ConvexCli['Service'] =>
  ConvexCli.ConvexCli.of({
    deploymentSelect: () => Effect.succeed({ selected: true, diagnostics: '' }),
    deploymentCreate: () => Effect.succeed(''),
    envSet: () => Effect.void,
    devOnce: () => Effect.void,
    run: () => Effect.void,
    ...overrides,
  });

const fakeConvexPlatform = (
  overrides: Partial<ConvexPlatform.ConvexPlatform['Service']> = {}
): ConvexPlatform.ConvexPlatform['Service'] =>
  ConvexPlatform.ConvexPlatform.of({
    findDeployment: () => Effect.succeedNone,
    deleteDeployment: () => Effect.void,
    ...overrides,
  });
