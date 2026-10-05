/**
 * Typed wrapper around the workspace-pinned Convex CLI.
 *
 * Convex reports failures through exit codes and writes diagnostics to both
 * streams. Worktree deployments cannot be deleted through this interface;
 * their five-day expiration is the only remote cleanup mechanism.
 */
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Spawner from 'effect/process/ChildProcessSpawner';

import * as CliRunner from './cliRunner.ts';

export { CONVEX_EXPIRATION, ConvexCli, ConvexCliError };

/** Matches the window documented in `docs/agents/linked-git-worktree.md`. */
const CONVEX_EXPIRATION = 'in 5 days';

/**
 * Captured commands have no TTY. Disabling anonymous mode makes a missing
 * deployment selection fail directly instead of falling through to a local
 * anonymous deployment flow.
 */
const CONVEX_BASE_ENV = { CONVEX_ALLOW_ANONYMOUS: 'false' } as const;

class ConvexCliError extends Schema.TaggedError<ConvexCliError>()(
  'ConvexCliError',
  { message: Schema.String }
) {}

class ConvexCli extends Context.Service<
  ConvexCli,
  {
    readonly deploymentSelect: (
      reference: string,
      cwd: string
    ) => Effect.Effect<
      { readonly selected: boolean; readonly diagnostics: string },
      CliRunner.CliExecutionError
    >;
    readonly deploymentCreate: (
      reference: string,
      cwd: string
    ) => Effect.Effect<string, ConvexCliError | CliRunner.CliExecutionError>;
    readonly envSet: (
      key: string,
      value: string | Redacted.Redacted<string>,
      cwd: string
    ) => Effect.Effect<void, ConvexCliError | CliRunner.CliExecutionError>;
    readonly devOnce: (
      cwd: string
    ) => Effect.Effect<void, ConvexCliError | CliRunner.CliExecutionError>;
    readonly run: (
      functionName: string,
      cwd: string
    ) => Effect.Effect<void, ConvexCliError | CliRunner.CliExecutionError>;
  }
>()('@repo/scripts/worktree/ConvexCli') {
  static readonly layer: Layer.Layer<
    ConvexCli,
    never,
    Spawner.ChildProcessSpawner
  > = Layer.effect(
    ConvexCli,
    Effect.gen(function* () {
      const runCli = yield* CliRunner.make;

      const runConvex = Effect.fn('runConvexCli')(function* (options: {
        readonly args: ReadonlyArray<CliRunner.CliValue>;
        readonly cwd: string;
        readonly env?:
          Record<string, string | Redacted.Redacted<string>> | undefined;
        readonly label: string;
      }) {
        const result = yield* runCli({
          command: 'pnpm',
          args: ['-w', 'convex', ...options.args],
          cwd: options.cwd,
          env: { ...CONVEX_BASE_ENV, ...options.env },
        });

        if (result.exitCode !== 0) {
          return yield* new ConvexCliError({
            message: CliRunner.redactSecrets(
              `${options.label} failed (exit ${result.exitCode}).\n${[result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n')}`
            ),
          });
        }

        return CliRunner.redactSecrets(
          [result.stdout.trim(), result.stderr.trim()]
            .filter(Boolean)
            .join('\n')
        );
      });

      /**
       * Returns `selected: false` when the reference does not exist. The caller
       * uses that result to choose creation without discarding diagnostics.
       */
      const deploymentSelect = Effect.fn('convexDeploymentSelect')(function* (
        reference: string,
        cwd: string
      ) {
        const result = yield* runCli({
          command: 'pnpm',
          args: ['-w', 'convex', 'deployment', 'select', reference],
          cwd,
          env: CONVEX_BASE_ENV,
        });

        return {
          selected: result.exitCode === 0,
          diagnostics: CliRunner.redactSecrets(
            [result.stdout.trim(), result.stderr.trim()]
              .filter(Boolean)
              .join('\n')
          ),
        };
      });

      /** Creates an expiring dev deployment and selects it for the worktree. */
      const deploymentCreate = Effect.fn('convexDeploymentCreate')(function* (
        reference: string,
        cwd: string
      ) {
        return yield* runConvex({
          args: [
            'deployment',
            'create',
            reference,
            '--type',
            'dev',
            '--expiration',
            CONVEX_EXPIRATION,
            '--select',
          ],
          cwd,
          label: `convex deployment create ${reference}`,
        });
      });

      /**
       * The Convex CLI has no environment or stdin input for values. Keeping a
       * `Redacted` value intact until `runCli` builds the child preserves exact
       * scrubbing for errors and recorded invocations despite the argv sink.
       */
      const envSet = Effect.fn('convexEnvSet')(function* (
        key: string,
        value: string | Redacted.Redacted<string>,
        cwd: string
      ) {
        yield* runConvex({
          args: ['env', 'set', key, value],
          cwd,
          label: `convex env set ${key}`,
        });
      });

      const devOnce = Effect.fn('convexDevOnce')(function* (cwd: string) {
        yield* runConvex({
          args: ['dev', '--once'],
          cwd,
          label: 'convex dev --once',
        });
      });

      const run = Effect.fn('convexRun')(function* (
        functionName: string,
        cwd: string
      ) {
        yield* runConvex({
          args: ['run', functionName],
          cwd,
          label: `convex run ${functionName}`,
        });
      });

      return ConvexCli.of({
        deploymentSelect,
        deploymentCreate,
        envSet,
        devOnce,
        run,
      });
    })
  );
}
