import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

import * as CommandEnvironment from '../commandEnvironment.ts';
import * as ConfectCli from '../confectCli.ts';
import * as ConvexCli from '../convexCli.ts';
import * as Domain from '../domain.ts';
import * as EnvFile from '../envFile.ts';
import * as Lock from '../lock.ts';
import * as Repo from '../repo.ts';
import * as WorkosApi from '../workosApi.ts';
import * as WorkosCli from '../workosCli.ts';
import * as WorkosState from './workosState.ts';

export {
  CONVEX_SELECTION_KEYS,
  OVERRIDING_KEYS,
  STALE_CONVEX_URL_KEYS,
  SetupError,
  setupWorktree,
};

const LOG_PREFIX = '[setup-worktree]';

class SetupError extends Schema.TaggedError<SetupError>()('SetupError', {
  message: Schema.String,
}) {}

/**
 * Inherited values that must be gone before any environment-sensitive CLI
 * runs.
 *
 * The WorkOS credentials belong to another environment. The Convex deploy key
 * and self-hosted values outrank `CONVEX_DEPLOYMENT` in the CLI's deployment
 * selection, so leaving them in place would redirect every Convex command
 * regardless of what the worktree selects.
 */
const OVERRIDING_KEYS = [
  'CONVEX_DEPLOY_KEY',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'CONVEX_SELF_HOSTED_URL',
  'WORKOS_API_KEY',
  'WORKOS_CLIENT_ID',
  'WORKOS_WEBHOOK_SECRET',
  'WORKOS_AUTHKIT_DOMAIN',
  'VITE_WORKOS_CLIENT_ID',
  Domain.WORKOS_ENV_NAME_KEY,
] as const;

/**
 * Convex URLs cleared before the deployment is selected.
 *
 * The CLI refuses to rewrite a URL whose value appears more than once in
 * `.env.local` and skips both URLs when either is ambiguous. This repo stores
 * the same URL under `CONVEX_URL` and `VITE_CONVEX_URI`, so leaving them in
 * place can make select or create update only `CONVEX_DEPLOYMENT` while the
 * URLs still target the main deployment.
 */
const STALE_CONVEX_URL_KEYS = [
  'CONVEX_URL',
  'CONVEX_SITE_URL',
  'VITE_CONVEX_URI',
] as const;

/**
 * The inherited Convex deployment, deliberately left in place until the
 * worktree's own deployment has been selected.
 *
 * `convex deployment create` names a reference within a project, and the CLI
 * infers that project from the current selection. Removing this value sooner
 * sends the non-interactive CLI through its anonymous path, where creation
 * fails. Setup removes it only after the written URLs prove the switch.
 */
const CONVEX_SELECTION_KEYS = ['CONVEX_DEPLOYMENT'] as const;

/**
 * The first removal stage shared by the process environment and `.env.local`.
 * It deliberately excludes `CONVEX_DEPLOYMENT`, which select and create need.
 */
const STAGE_ONE_UNSET_KEYS = [
  ...OVERRIDING_KEYS,
  ...STALE_CONVEX_URL_KEYS,
] as const;

const log = (message: string) => Console.log(`${LOG_PREFIX} ${message}`);

const selectDevServerPort = Effect.fn('selectDevServerPort')(function* (
  worktreeId: string,
  existing: Option.Option<string>
) {
  if (Option.isSome(existing)) {
    const port = yield* Effect.fromResult(Domain.parsePort(existing.value));
    yield* log(`Reusing development server port ${port}`);
    return port;
  }

  const port = yield* Repo.findAvailablePort(
    Domain.derivePortCandidate(worktreeId)
  );
  yield* log(`Assigned development server port ${port}`);
  return port;
});

const requireConvexUrl = Effect.fn('requireConvexUrl')(function* (
  values: ReadonlyMap<string, string>,
  key: 'CONVEX_URL' | 'CONVEX_SITE_URL',
  suffix: string
) {
  const value = values.get(key);
  const isInvalidUrl =
    Predicate.isUndefined(value) ||
    !value.startsWith('https://') ||
    !value.endsWith(suffix);

  if (isInvalidUrl) {
    return yield* new SetupError({
      message: `Convex did not write a valid ${key} to .env.local after selecting the deployment (expected https://*${suffix}, got ${value ?? 'nothing'}).`,
    });
  }

  return value;
});

const assertDeploymentChanged = Effect.fn('assertDeploymentChanged')(function* (
  inherited: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>
) {
  for (const key of ['CONVEX_URL', 'CONVEX_SITE_URL'] as const) {
    const before = inherited.get(key);
    const after = current.get(key);
    const stayedOnInheritedDeployment =
      Predicate.isNotUndefined(before) && before === after;

    if (stayedOnInheritedDeployment) {
      return yield* new SetupError({
        message: `Convex left ${key} pointing at the deployment inherited from the main worktree (${after}). Refusing to continue, because the following steps would push this worktree's WorkOS credentials onto it and reseed it.`,
      });
    }
  }
});

const provisionConvexDeployment = Effect.fn('provisionConvexDeployment')(
  function* (reference: string, repoRoot: string) {
    const convexCli = yield* ConvexCli.ConvexCli;
    const selection = yield* convexCli.deploymentSelect(reference, repoRoot);

    if (selection.selected) {
      yield* log(`Reusing Convex deployment ${reference}`);
      return;
    }

    yield* log(
      `Could not select Convex deployment ${reference}; creating it (expires ${ConvexCli.CONVEX_EXPIRATION}).`
    );

    if (selection.diagnostics !== '') {
      yield* log(
        `convex deployment select reported:\n${selection.diagnostics}`
      );
    }

    const created = yield* convexCli.deploymentCreate(reference, repoRoot);

    if (created !== '') {
      yield* log(`convex deployment create reported:\n${created}`);
    }
  }
);

const setupWorktree = Effect.fn('setupWorktree')(function* (
  worktree: Repo.WorktreeContext
) {
  const envFile = yield* EnvFile.EnvFile;
  const registryLock = yield* Lock.WorkosRegistryLock;
  const workosCli = yield* WorkosCli.WorkosCli;
  const workosApi = yield* WorkosApi.WorkosApi;
  const convexCli = yield* ConvexCli.ConvexCli;

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const { envFilePath, mainEnvFilePath, repoRoot, worktreeId } = worktree;

      // Preserve the original fast failure when WorkOS is unavailable without
      // exposing inherited credentials to the version check.
      yield* workosCli.assertInstalled.pipe(
        CommandEnvironment.without(STAGE_ONE_UNSET_KEYS)
      );

      const [previous, inheritedConvex] = yield* Effect.all(
        [envFile.read(envFilePath), envFile.read(mainEnvFilePath)],
        { concurrency: 'unbounded' }
      );
      const carriedState =
        yield* WorkosState.decodeCarriedWorkosState(previous);

      // The rest of setup inherits this first removal stage. The copied
      // `CONVEX_DEPLOYMENT` remains visible so Convex can resolve the project.
      yield* CommandEnvironment.unsetScoped(STAGE_ONE_UNSET_KEYS);

      const port = yield* selectDevServerPort(
        worktreeId,
        Option.fromUndefinedOr(previous.get('VITE_DEV_SERVER_PORT'))
      );
      const frontendOrigin = `http://localhost:${port}`;
      const carriedEntries =
        carriedState._tag === 'Complete'
          ? WorkosState.persistedEntries(carriedState)
          : [];

      yield* log(
        'Installing the sanitized main-worktree environment and carried local claim'
      );
      yield* envFile.replaceFrom({
        sourcePath: mainEnvFilePath,
        targetPath: envFilePath,
        removeKeys: STAGE_ONE_UNSET_KEYS,
        upsertEntries: [
          ...carriedEntries,
          ['VITE_DEV_SERVER_PORT', String(port)],
        ],
      });

      const reference = Domain.convexReference(worktreeId);
      yield* provisionConvexDeployment(reference, repoRoot);

      const afterConvex = yield* envFile.read(envFilePath);
      yield* assertDeploymentChanged(inheritedConvex, afterConvex);

      const convexUrl = yield* requireConvexUrl(
        afterConvex,
        'CONVEX_URL',
        '.convex.cloud'
      );
      const convexSiteUrl = yield* requireConvexUrl(
        afterConvex,
        'CONVEX_SITE_URL',
        '.convex.site'
      );

      // Once URL validation proves the switch, no later command may inherit a
      // process-level route back to the main deployment.
      yield* CommandEnvironment.unsetScoped(CONVEX_SELECTION_KEYS);
      yield* envFile.upsert(envFilePath, [['VITE_CONVEX_URI', convexUrl]]);

      const resolvedWorkos = yield* WorkosState.CarriedWorkosState.$match(
        carriedState,
        {
          Complete: (state) =>
            Effect.gen(function* () {
              yield* log(
                `Reusing WorkOS local environment ${state.environment.name} from a previous run`
              );
              return state;
            }),
          Absent: () =>
            registryLock.withLock(
              Effect.gen(function* () {
                yield* log('Provisioning an unclaimed WorkOS environment');
                const environment = yield* workosCli.envProvision;
                const state = WorkosState.CarriedWorkosState.Complete({
                  environment,
                });

                yield* envFile.upsert(
                  envFilePath,
                  WorkosState.persistedEntries(state)
                );
                yield* log(
                  `WorkOS credentials written to .env.local (${environment.name})`
                );

                return state;
              })
            ),
        }
      );
      const { environment } = resolvedWorkos;

      yield* log(`Allowing ${frontendOrigin} in AuthKit`);
      yield* workosCli.configureAuthKit(
        {
          redirectUri: `${frontendOrigin}/callback`,
          corsOrigin: frontendOrigin,
          // Unclaimed environments fall back to the homepage because they cannot register a Sign-out URI.
          homepageUrl: `${frontendOrigin}/signout-callback`,
        },
        environment.apiKey
      );

      const webhookSecret = Predicate.isUndefined(resolvedWorkos.webhookSecret)
        ? yield* Effect.map(
            workosApi.ensureWebhookEndpoint(
              {
                url: `${convexSiteUrl}/workos/webhook`,
                events: WorkosApi.WORKOS_WEBHOOK_EVENTS,
              },
              environment.apiKey
            ),
            (endpoint) => endpoint.secret
          )
        : resolvedWorkos.webhookSecret;

      yield* envFile.upsert(envFilePath, [
        ['WORKOS_WEBHOOK_SECRET', Redacted.value(webhookSecret)],
      ]);

      yield* log('Pushing WorkOS values onto the Convex deployment');
      // Sequential. A deployment keeps its environment variables in one
      // record, so parallel `env set` calls race and one loses with
      // `OptimisticConcurrencyControlFailure`.
      yield* Effect.all([
        convexCli.envSet('WORKOS_CLIENT_ID', environment.clientId, repoRoot),
        convexCli.envSet('WORKOS_API_KEY', environment.apiKey, repoRoot),
        convexCli.envSet('WORKOS_WEBHOOK_SECRET', webhookSecret, repoRoot),
      ]);

      yield* log('Generating Confect and Convex bridge files');
      yield* ConfectCli.codegen(repoRoot);

      yield* log('Deploying generated Convex functions');
      yield* convexCli.devOnce(repoRoot);

      yield* log('Seeding the isolated development environment');
      yield* convexCli.run('developmentSeeder:seed', repoRoot);

      yield* log('Linked worktree environment is ready');
      yield* log(`Frontend URL: ${frontendOrigin}/`);
      yield* log(`Convex deployment: ${reference}`);
      yield* log(`WorkOS local environment: ${environment.name}`);
      yield* log(
        'Before removing this worktree, run: pnpm teardown:worktree --yes'
      );
    })
  );
});
