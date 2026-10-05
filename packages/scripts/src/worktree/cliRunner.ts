/**
 * Subprocess execution shared by the WorkOS and Convex CLI wrappers.
 *
 * Commands are always spawned from an argument array, never a shell string.
 * Secret-bearing arguments and environment values retain their redaction
 * metadata while the child runs, so errors and recorded test diagnostics
 * cannot expose them.
 */
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import * as ChildProcess from 'effect/process/ChildProcess';
import * as Spawner from 'effect/process/ChildProcessSpawner';

import * as CommandEnvironment from './commandEnvironment.ts';

export {
  CliExecutionError,
  InvocationRedactor,
  make,
  redactSecrets,
  runCli,
  type CliValue,
  type CliResult,
  type Spawner,
};

/** The one service every CLI wrapper in this directory requires. */
type Spawner = Spawner.ChildProcessSpawner;

/**
 * Scrubs recognizable inherited or untyped secrets when no `Redacted`
 * metadata is available.
 */
const SECRET_PATTERN = /\b(?:sk|whsec|pk|client)_[A-Za-z0-9_-]+/g;

const redactSecrets = (text: string) =>
  text.replaceAll(SECRET_PATTERN, '[redacted]');

class CliExecutionError extends Schema.TaggedError<CliExecutionError>()(
  'CliExecutionError',
  {
    message: Schema.String,
  }
) {}

type CliResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

type CliValue = string | Redacted.Redacted<string>;

type RunOptions = {
  readonly command: string;
  readonly args: ReadonlyArray<CliValue>;
  readonly cwd?: string | undefined;
  readonly env?: Record<string, CliValue | undefined> | undefined;
};

type InvocationRedactor = {
  readonly redactArgs: (args: ReadonlyArray<string>) => ReadonlyArray<string>;
  readonly redactEnvironment: (
    environment: Record<string, string | undefined>
  ) => Record<string, string | undefined>;
  readonly redactText: (text: string) => string;
};

const makeInvocationRedactor = (
  redactedArgumentIndices: ReadonlySet<number>,
  redactedEnvironmentKeys: ReadonlySet<string>,
  explicitSecrets: ReadonlySet<string>
): InvocationRedactor => {
  const redactText = (text: string) => {
    const withoutExplicitSecrets = [...explicitSecrets].reduce(
      (redacted, secret) => redacted.replaceAll(secret, '[redacted]'),
      text
    );

    return redactSecrets(withoutExplicitSecrets);
  };

  return {
    redactArgs: (args) =>
      args.map((argument, index) =>
        redactedArgumentIndices.has(index) ? '[redacted]' : redactText(argument)
      ),
    redactEnvironment: (environment) =>
      Object.fromEntries(
        Object.entries(environment).map(([key, value]) => {
          if (Predicate.isUndefined(value)) {
            return [key, undefined];
          }

          const recordedValue = redactedEnvironmentKeys.has(key)
            ? '[redacted]'
            : redactText(value);
          return [key, recordedValue];
        })
      ),
    redactText,
  };
};

/** Redaction policy for the command currently crossing the spawner seam. */
const InvocationRedactor = Context.Reference<InvocationRedactor>(
  '@repo/scripts/worktree/CliRunner/InvocationRedactor',
  {
    defaultValue: () => makeInvocationRedactor(new Set(), new Set(), new Set()),
  }
);

/**
 * Runs a command and returns its captured output.
 *
 * `stdout` is returned rather than logged: `workos env provision` and
 * `workos webhook create` both emit live credentials there, so the caller
 * decodes it and must never tee it to a log.
 */
const runCli = Effect.fn('runCli')(function* (
  options: RunOptions
): Effect.fn.Return<CliResult, CliExecutionError, Spawner> {
  const spawner = yield* Spawner.ChildProcessSpawner;
  const unsetKeys = yield* CommandEnvironment.UnsetKeys;
  const plainArguments: Array<string> = [];
  const redactedArgumentIndices = new Set<number>();
  const explicitEnvironmentEntries: Array<
    readonly [key: string, value: string | undefined]
  > = [];
  const redactedEnvironmentKeys = new Set<string>();
  const explicitSecrets = new Set<string>();

  for (const [index, argument] of options.args.entries()) {
    if (!Redacted.isRedacted(argument)) {
      plainArguments.push(argument);
      continue;
    }

    const secret = Redacted.value(argument);
    plainArguments.push(secret);
    redactedArgumentIndices.add(index);

    if (secret !== '') {
      explicitSecrets.add(secret);
    }
  }

  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (!Redacted.isRedacted(value)) {
      explicitEnvironmentEntries.push([key, value]);
      continue;
    }

    const secret = Redacted.value(value);
    explicitEnvironmentEntries.push([key, secret]);
    redactedEnvironmentKeys.add(key);

    if (secret !== '') {
      explicitSecrets.add(secret);
    }
  }

  const invocationRedactor = makeInvocationRedactor(
    redactedArgumentIndices,
    redactedEnvironmentKeys,
    explicitSecrets
  );

  const env = Object.fromEntries([
    ...[...unsetKeys].map((key) => [key, undefined] as const),
    ...explicitEnvironmentEntries,
  ]);

  const command = ChildProcess.make(options.command, plainArguments, {
    cwd: options.cwd,
    env,
    extendEnv: true,
    stdin: 'ignore',
  });

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);

      // Drained concurrently: a child that fills one pipe's buffer while the
      // parent reads the other would deadlock.
      const captured = yield* Effect.all(
        {
          stdout: Stream.mkString(Stream.decodeText(handle.stdout)),
          stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
          exitCode: handle.exitCode,
        },
        { concurrency: 'unbounded' }
      );

      return { ...captured, exitCode: captured.exitCode as number };
    }).pipe(Effect.provideService(InvocationRedactor, invocationRedactor))
  ).pipe(
    Effect.mapError(
      (cause) =>
        new CliExecutionError({
          message: invocationRedactor.redactText(
            `Failed to run ${options.command} ${plainArguments.join(' ')}: ${String(cause)}`
          ),
        })
    )
  );
});

/** Captures a layer's spawner so CLI adapter methods need no services. */
const make = Effect.gen(function* () {
  const spawner = yield* Spawner.ChildProcessSpawner;

  return (options: RunOptions) =>
    runCli(options).pipe(
      Effect.provideService(Spawner.ChildProcessSpawner, spawner)
    );
});
