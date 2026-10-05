/** Registry commands require `--insecure-storage` to target the provisioned credential store. */
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Spawner from 'effect/process/ChildProcessSpawner';

import * as CliRunner from './cliRunner.ts';
import * as Envelope from './envelope.ts';

export {
  ProvisionedEnvironment,
  WORKOS_CLI,
  WorkosCli,
  WorkosCliError,
  WorkosEnvironmentSummary,
  type ConfigureAuthKitDto,
};

const WORKOS_CLI = 'workos';

const SEED_FILE_NAME = 'workos-seed.yml';

class WorkosCliError extends Schema.TaggedError<WorkosCliError>()(
  'WorkosCliError',
  {
    message: Schema.String,
    code: Schema.optionalKey(Schema.String),
  }
) {}

const ProvisionedEnvironment = Schema.Struct({
  name: Schema.NonEmptyString,
  apiKey: Schema.RedactedFromValue(Schema.NonEmptyString),
  clientId: Schema.NonEmptyString,
  authkitDomain: Schema.NonEmptyString,
});

type ProvisionedEnvironment = typeof ProvisionedEnvironment.Type;

type ConfigureAuthKitDto = {
  readonly redirectUri: string;
  readonly corsOrigin: string;
  readonly homepageUrl: string;
};

/** JSON is valid YAML, so the seed file needs no YAML encoder. */
const ConfigureAuthKitSeedDto = Schema.Struct({
  config: Schema.Struct({
    redirect_uris: Schema.Array(Schema.NonEmptyString),
    cors_origins: Schema.Array(Schema.NonEmptyString),
    homepage_url: Schema.NonEmptyString,
  }),
});

const encodeSeedFile = Schema.encodeEffect(
  Schema.fromJsonString(ConfigureAuthKitSeedDto)
);

const WorkosEnvironmentSummary = Schema.Struct({
  name: Schema.String,
  type: Schema.optionalKey(Schema.String),
  active: Schema.optionalKey(Schema.Boolean),
});

type WorkosEnvironmentSummary = typeof WorkosEnvironmentSummary.Type;

/** Accepted by `envRemove`: either result means nothing remains to forget. */
const ABSENT_ENVIRONMENT_CODES = new Set([
  'no_environments',
  'environment_not_found',
  'not_found',
]);

class WorkosCli extends Context.Service<
  WorkosCli,
  {
    readonly assertInstalled: Effect.Effect<
      void,
      WorkosCliError | CliRunner.CliExecutionError
    >;
    readonly envProvision: Effect.Effect<
      ProvisionedEnvironment,
      WorkosCliError | CliRunner.CliExecutionError
    >;
    readonly envRemove: (
      name: string
    ) => Effect.Effect<void, WorkosCliError | CliRunner.CliExecutionError>;
    readonly envList: Effect.Effect<
      ReadonlyArray<WorkosEnvironmentSummary>,
      WorkosCliError | CliRunner.CliExecutionError
    >;
    readonly configureAuthKit: (
      configuration: ConfigureAuthKitDto,
      apiKey: Redacted.Redacted<string>
    ) => Effect.Effect<
      void,
      WorkosCliError | CliRunner.CliExecutionError | PlatformError.PlatformError
    >;
  }
>()('@repo/scripts/worktree/WorkosCli') {
  static readonly layer: Layer.Layer<
    WorkosCli,
    never,
    Spawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    WorkosCli,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const runCli = yield* CliRunner.make;

      const assertInstalled = Effect.asVoid(
        Effect.mapError(
          runCli({ command: WORKOS_CLI, args: ['--version'] }),
          () =>
            new WorkosCliError({
              message:
                'The WorkOS CLI is required to run setup:worktree but was not found in PATH. Install it and ensure the `workos` command is available, then rerun setup.',
            })
        )
      );

      const run = Effect.fn('runWorkosCli')(function* <
        S extends Schema.Top,
      >(options: {
        readonly args: ReadonlyArray<string>;
        readonly data: S;
        readonly apiKey?: Redacted.Redacted<string> | undefined;
        readonly cwd?: string | undefined;
        readonly tolerate?: ReadonlySet<string> | undefined;
      }): Effect.fn.Return<
        S['Type'] | undefined,
        WorkosCliError | CliRunner.CliExecutionError,
        S['DecodingServices']
      > {
        const result = yield* runCli({
          command: WORKOS_CLI,
          args: options.args,
          cwd: options.cwd,
          env: Predicate.isUndefined(options.apiKey)
            ? undefined
            : { WORKOS_API_KEY: options.apiKey },
        });

        const stdout = result.stdout.trim();
        // Preserve stdout because env provision returns the only copy of the API key.
        const stderr = CliRunner.redactSecrets(result.stderr.trim());

        // The body may contain credentials, so failures report only response
        // shape, command metadata, and redacted stderr.
        const undecodable = () =>
          new WorkosCliError({
            message:
              `The workos CLI returned an unrecognised response for '${options.args.join(' ')}' (exit ${result.exitCode}). ${stderr}`.trim(),
          });

        // The envelope shape, not the exit code, determines the outcome.
        const body = stdout === '' ? stderr : stdout;
        const envelope = yield* Schema.decodeEffect(
          Envelope.CliEnvelopeFromJsonString
        )(body).pipe(Effect.mapError(undecodable));
        const { error } = envelope;

        if (Predicate.isNotUndefined(error)) {
          if (options.tolerate?.has(error.code) === true) {
            return undefined;
          }

          return yield* new WorkosCliError({
            code: error.code,
            message: CliRunner.redactSecrets(
              `workos ${options.args.join(' ')} failed (${error.code}): ${error.message ?? 'no message'}`
            ),
          });
        }

        return yield* Schema.decodeUnknownEffect(options.data)(
          envelope.data
        ).pipe(Effect.mapError(undecodable));
      });

      const required = Effect.fn('requireWorkosData')(function* <A>(
        value: A | undefined,
        message: string
      ): Effect.fn.Return<A, WorkosCliError> {
        return Predicate.isUndefined(value)
          ? yield* new WorkosCliError({ message })
          : value;
      });

      /** Must run under the registry lock because it mutates the local store. */
      const envProvision = Effect.gen(function* () {
        const data = yield* run({
          args: ['env', 'provision', '--json', '--insecure-storage'],
          data: ProvisionedEnvironment,
        });

        return yield* required(
          data,
          'The workos CLI reported success for env provision without returning credentials.'
        );
      });

      /** Must run under the registry lock because it mutates the local store. */
      const envRemove = Effect.fn('workosEnvRemove')(function* (name: string) {
        yield* run({
          args: ['env', 'remove', name, '--json', '--insecure-storage'],
          data: Schema.Unknown,
          tolerate: ABSENT_ENVIRONMENT_CODES,
        });
      });

      const envList = Effect.gen(function* () {
        const data = yield* run({
          args: ['env', 'list', '--json', '--insecure-storage'],
          data: Schema.Array(WorkosEnvironmentSummary),
          tolerate: ABSENT_ENVIRONMENT_CODES,
        });

        return data ?? [];
      });

      /** `workos seed` accepts API-key auth and treats existing settings as success. */
      const configureAuthKit = Effect.fn('workosConfigureAuthKit')(function* (
        configuration: ConfigureAuthKitDto,
        apiKey: Redacted.Redacted<string>
      ) {
        // `workos seed` writes state beside the seed, so isolate both in a scoped directory.
        const directory = yield* fileSystem.makeTempDirectoryScoped({
          prefix: 'repo-workos-seed-',
        });
        const seedPath = path.join(directory, SEED_FILE_NAME);

        const seed = yield* encodeSeedFile({
          config: {
            redirect_uris: [configuration.redirectUri],
            cors_origins: [configuration.corsOrigin],
            homepage_url: configuration.homepageUrl,
          },
        }).pipe(
          Effect.mapError(
            () =>
              new WorkosCliError({
                message:
                  'The AuthKit configuration contains an empty redirect URI, CORS origin, or homepage URL.',
              })
          )
        );
        yield* fileSystem.writeFileString(seedPath, seed);

        yield* run({
          // `seed` uses WORKOS_API_KEY directly and does not read the local registry.
          args: ['seed', '--file', seedPath, '--json'],
          data: Schema.Unknown,
          apiKey,
          cwd: directory,
        });
      }, Effect.scoped);

      return WorkosCli.of({
        assertInstalled,
        envProvision,
        envRemove,
        envList,
        configureAuthKit,
      });
    })
  );
}
