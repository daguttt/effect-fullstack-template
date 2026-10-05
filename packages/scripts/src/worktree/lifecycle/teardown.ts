import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';

import * as ConvexPlatform from '../convexPlatform.ts';
import * as Domain from '../domain.ts';
import * as EnvFile from '../envFile.ts';
import * as Lock from '../lock.ts';
import * as Repo from '../repo.ts';
import * as WorkosCli from '../workosCli.ts';

export {
  TeardownError,
  gcWorktreeEnvironments,
  teardownWorktree,
  type GcOptions,
  type TeardownOptions,
};

const LOG_PREFIX = '[teardown-worktree]';

class TeardownError extends Schema.TaggedError<TeardownError>()(
  'TeardownError',
  { message: Schema.String }
) {}

type TeardownOptions = { readonly dryRun: boolean };
type GcOptions = { readonly prune: boolean };

const log = (message: string) => Console.log(`${LOG_PREFIX} ${message}`);

const asTeardownError =
  (action: string, filePath: string) => (cause: unknown) =>
    new TeardownError({
      message: `Failed to ${action} ${filePath}: ${String(cause)}`,
    });

const teardownWorktree = Effect.fn('teardownWorktree')(function* (
  worktree: Repo.WorktreeContext,
  options: TeardownOptions
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const envFile = yield* EnvFile.EnvFile;
  const registryLock = yield* Lock.WorkosRegistryLock;
  const workosCli = yield* WorkosCli.WorkosCli;
  const convexPlatform = yield* ConvexPlatform.ConvexPlatform;

  const { envFilePath, repoRoot, worktreeId } = worktree;
  const [environmentName, envFileExists] = yield* Effect.all(
    [
      envFile.readValue(envFilePath, Domain.WORKOS_ENV_NAME_KEY),
      fileSystem
        .exists(envFilePath)
        .pipe(Effect.mapError(asTeardownError('inspect', envFilePath))),
    ],
    { concurrency: 'unbounded' }
  );

  // Only a dev deployment carrying this worktree's reference is deleted, and
  // never the project default, the main checkout's selection or one since
  // promoted to production.
  const reference = Domain.convexReference(worktreeId);
  // A selection names its deployment last, as in `dev:calm-otter-1`, which is
  // how the Convex CLI reads it too.
  const selectedName = Option.getOrUndefined(
    yield* envFile.readValue(envFilePath, 'CONVEX_DEPLOYMENT')
  )
    ?.split(':')
    .at(-1);
  const mainName = Predicate.isUndefined(selectedName)
    ? undefined
    : Option.getOrUndefined(
        yield* envFile.readValue(worktree.mainEnvFilePath, 'CONVEX_DEPLOYMENT')
      )
        ?.split(':')
        .at(-1);
  const isOwnSelection =
    Predicate.isNotUndefined(selectedName) &&
    /^[a-z0-9-]+$/.test(selectedName) &&
    selectedName !== mainName;
  const deployment = isOwnSelection
    ? yield* convexPlatform.findDeployment(selectedName)
    : Option.none();
  const ownedDeployment = Option.filter(deployment, (found) => {
    const isOwnedDevDeployment =
      found.name === selectedName &&
      Domain.isExpectedConvexReference(found.reference, worktreeId) &&
      found.deploymentType === 'dev' &&
      !found.isDefault;
    return isOwnedDevDeployment;
  });

  yield* log(`Worktree: ${repoRoot}`);
  yield* log(
    Option.isSome(ownedDeployment)
      ? `Convex deployment to delete: ${ownedDeployment.value.name} (${reference})`
      : `No Convex deployment of this worktree to delete (${reference})`
  );
  yield* log(
    Option.isSome(environmentName)
      ? `WorkOS local environment to forget: ${environmentName.value}`
      : 'No WorkOS local environment recorded in .env.local'
  );
  yield* log(
    envFileExists
      ? `.env.local to delete: ${envFilePath}`
      : 'No .env.local to delete'
  );

  if (options.dryRun) {
    yield* log('Dry run: nothing was changed.');
    return;
  }

  if (Option.isSome(ownedDeployment)) {
    yield* convexPlatform.deleteDeployment(ownedDeployment.value.name);
    yield* log(`Deleted Convex deployment ${ownedDeployment.value.name}`);
  }

  if (Option.isSome(environmentName)) {
    yield* registryLock.withLock(workosCli.envRemove(environmentName.value));
    yield* log(`Forgot WorkOS local environment ${environmentName.value}`);
  }

  if (envFileExists) {
    yield* fileSystem
      .remove(envFilePath, { force: true })
      .pipe(Effect.mapError(asTeardownError('delete', envFilePath)));
    yield* log('Deleted .env.local');
  }

  yield* log('Teardown complete. The linked worktree can now be removed.');
});

const readWorktreeClaims = Effect.fn('readWorktreeClaims')(function* () {
  const envFile = yield* EnvFile.EnvFile;

  const worktrees = yield* Repo.listWorktreePaths();
  const scanned = yield* Effect.forEach(worktrees, (worktree) =>
    envFile
      .readValue(Repo.envFilePathFor(worktree), Domain.WORKOS_ENV_NAME_KEY)
      .pipe(
        Effect.map((environment) => ({
          worktree,
          environment,
          readable: true,
        })),
        Effect.catchTag('EnvFileError', () =>
          Effect.succeed({
            worktree,
            environment: Option.none<string>(),
            readable: false,
          })
        )
      )
  );

  return {
    worktrees,
    claims: scanned.flatMap((entry) =>
      Option.isSome(entry.environment)
        ? [{ worktree: entry.worktree, environment: entry.environment.value }]
        : []
    ),
    unreadable: scanned.flatMap((entry) =>
      entry.readable ? [] : [entry.worktree]
    ),
  };
});

const gcWorktreeEnvironments = Effect.fn('gcWorktreeEnvironments')(function* (
  options: GcOptions
) {
  const registryLock = yield* Lock.WorkosRegistryLock;
  const workosCli = yield* WorkosCli.WorkosCli;

  yield* registryLock.withLock(
    Effect.gen(function* () {
      const environments = yield* workosCli.envList;
      const { claims, unreadable, worktrees } = yield* readWorktreeClaims();

      const active = new Set(
        environments.flatMap((environment) =>
          environment.active === true ? [environment.name] : []
        )
      );
      const report = Domain.classifyWorkosProfiles(
        environments.map((environment) => environment.name),
        claims
      );

      yield* log(`Local WorkOS profiles: ${environments.length}`);
      yield* log(
        `Registered worktrees: ${worktrees.length} (${claims.length} claiming a profile)`
      );

      if (environments.length === 0) {
        yield* log('Nothing to report.');
        return;
      }

      yield* log(`Claimed: ${report.claimed.length}`);
      for (const profile of report.claimed) {
        for (const worktree of profile.worktrees) {
          yield* log(`  ${profile.environment} <- ${worktree}`);
        }
      }

      for (const claim of report.dangling) {
        yield* log(
          `  WARNING ${claim.worktree} claims ${claim.environment}, which is no longer in the registry`
        );
      }

      for (const worktree of unreadable) {
        yield* log(`  WARNING could not read the .env.local in ${worktree}`);
      }

      yield* log(`Orphaned: ${report.orphaned.length}`);
      for (const profile of report.orphaned) {
        yield* log(`  ${profile}${active.has(profile) ? ' (active)' : ''}`);
      }

      if (report.orphaned.length === 0) {
        yield* log('Every profile is claimed. Nothing to prune.');
        return;
      }

      if (!options.prune) {
        yield* log(
          `Re-run with --prune to remove ${report.orphaned.length} orphaned profile(s).`
        );
        return;
      }

      if (unreadable.length > 0) {
        return yield* new TeardownError({
          message: `Refusing to prune: ${unreadable.length} worktree .env.local file(s) could not be read, so a profile in use may look orphaned. Fix or remove those worktrees, then rerun.`,
        });
      }

      for (const profile of report.orphaned) {
        yield* workosCli.envRemove(profile);
        yield* log(`Removed orphaned profile ${profile}`);
      }

      yield* log(
        `Pruned ${report.orphaned.length} profile(s). Nothing remote was destroyed; each was an unclaimed local CLI profile.`
      );
    })
  );
});
