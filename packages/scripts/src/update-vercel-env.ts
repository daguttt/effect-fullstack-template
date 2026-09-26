#!/usr/bin/env tsx

import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const ENVIRONMENTS = ['production', 'preview', 'development'] as const;

type EnvEntry = {
  readonly key: string;
  readonly value: string;
};

class EnvFileError extends Schema.TaggedError<EnvFileError>()('EnvFileError', {
  message: Schema.String,
}) {}

class VercelCommandError extends Schema.TaggedError<VercelCommandError>()(
  'VercelCommandError',
  {
    message: Schema.String,
  }
) {}

const optionalStringFlag = (name: string) =>
  Flag.optional(Flag.String(name).pipe(Flag.withSchema(Schema.NonEmptyString)));

const envFile = Flag.String('file').pipe(
  Flag.withAlias('f'),
  Flag.withDescription('Env file to read.')
);

const environment = Flag.Literals('environment', ENVIRONMENTS).pipe(
  Flag.withAlias('e'),
  Flag.withDescription('Vercel environment to update.')
);

const gitBranch = optionalStringFlag('git-branch').pipe(
  Flag.withAlias('b'),
  Flag.withDescription('Preview/development branch target.')
);

const cwd = optionalStringFlag('cwd').pipe(
  Flag.withDescription('Directory containing the Vercel project link.')
);

const scope = optionalStringFlag('scope').pipe(
  Flag.withDescription('Vercel team/user scope.')
);

const token = optionalStringFlag('token').pipe(
  Flag.withDescription('Vercel token. Prefer VERCEL_TOKEN instead.')
);

// `Flag.Boolean` is required as of effect 4.0.0-rc.111, which dropped the
// implicit `false` for an absent boolean flag, so every boolean needs its
// default spelled out.
const dryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDescription('Print actions without calling Vercel.'),
  Flag.withDefault(false)
);

// One tri-state flag rather than a `--sensitive`/`--no-sensitive` pair: the CLI
// already derives `--no-sensitive` as this flag's negation, so a second flag by
// that name would shadow it. `None` leaves the choice to Vercel's own default.
const sensitive = Flag.optional(
  Flag.Boolean('sensitive').pipe(
    Flag.withDescription(
      'Add values as sensitive variables. Use --no-sensitive for readable ones.'
    )
  )
);

const skipEmpty = Flag.Boolean('skip-empty').pipe(
  Flag.withDescription('Skip keys with empty values.'),
  Flag.withDefault(false)
);

const unquoteValue = (value: string) => {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) {
    return trimmed;
  }

  const inner = trimmed.slice(1, -1);
  if (quote === "'") {
    return inner;
  }

  return inner
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
    .replaceAll('\\t', '\t')
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\');
};

const stripInlineComment = (value: string) => {
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const previous = value[index - 1];

    if ((character === '"' || character === "'") && previous !== '\\') {
      quote = quote === character ? undefined : (quote ?? character);
    }

    if (character === '#' && !quote && /\s/.test(previous ?? '')) {
      return value.slice(0, index);
    }
  }

  return value;
};

const parseEnvFile = Effect.fn('parseEnvFile')(function* (
  filePath: string,
  options: { readonly skipEmpty: boolean }
): Effect.fn.Return<
  ReadonlyArray<EnvEntry>,
  EnvFileError,
  FileSystem.FileSystem
> {
  const fileSystem = yield* FileSystem.FileSystem;

  const contents = yield* fileSystem.readFileString(filePath).pipe(
    Effect.mapError(
      (cause) =>
        new EnvFileError({
          message: `Failed to read ${filePath}: ${String(cause)}`,
        })
    )
  );

  const entries: Array<EnvEntry> = [];
  const seen = new Set<string>();

  for (const [lineIndex, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trimStart()
      : trimmed;
    const separatorIndex = withoutExport.indexOf('=');

    if (separatorIndex === -1) {
      return yield* new EnvFileError({
        message: `Invalid env line ${lineIndex + 1}: expected KEY=value`,
      });
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    const rawValue = withoutExport.slice(separatorIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return yield* new EnvFileError({
        message: `Invalid env key on line ${lineIndex + 1}: ${key}`,
      });
    }

    if (seen.has(key)) {
      return yield* new EnvFileError({
        message: `Duplicate env key: ${key}`,
      });
    }

    const value = unquoteValue(stripInlineComment(rawValue));

    if (options.skipEmpty && value === '') {
      continue;
    }

    seen.add(key);
    entries.push({ key, value });
  }

  return entries;
});

const vercelArgs = (
  options: {
    readonly environment: (typeof ENVIRONMENTS)[number];
    readonly gitBranch: Option.Option<string>;
    readonly cwd: Option.Option<string>;
    readonly scope: Option.Option<string>;
    readonly token: Option.Option<string>;
    readonly sensitive: Option.Option<boolean>;
  },
  entry: EnvEntry
) => {
  const args = ['exec', 'vercel', 'env', 'add', entry.key, options.environment];

  options.gitBranch.pipe(
    Option.andThen((branch) => {
      args.push(branch);
    })
  );

  args.push('--force', '--value', entry.value, '--yes', '--non-interactive');

  options.cwd.pipe(
    Option.andThen((projectCwd) => {
      args.push('--cwd', projectCwd);
    })
  );

  options.scope.pipe(
    Option.andThen((projectScope) => {
      args.push('--scope', projectScope);
    })
  );

  options.token.pipe(
    Option.andThen((projectToken) => {
      args.push('--token', projectToken);
    })
  );

  options.sensitive.pipe(
    Option.andThen((isSensitive) => {
      args.push(isSensitive ? '--sensitive' : '--no-sensitive');
    })
  );

  return args;
};

const runPnpm = Effect.fn('runPnpm')(function* (
  args: ReadonlyArray<string>
): Effect.fn.Return<
  void,
  VercelCommandError,
  ChildProcessSpawner.ChildProcessSpawner
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  // stdout and stderr are inherited so the Vercel CLI's own progress output
  // reaches the terminal unbuffered.
  const command = ChildProcess.make('pnpm', args, {
    cwd: process.cwd(),
    extendEnv: true,
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = yield* spawner.exitCode(command).pipe(
    Effect.mapError(
      (cause) =>
        new VercelCommandError({
          message: cause instanceof Error ? cause.message : String(cause),
        })
    )
  );

  if (exitCode !== 0) {
    return yield* new VercelCommandError({
      message: `pnpm ${args.join(' ')} failed with exit code ${exitCode}`,
    });
  }
});

const updateEnv = Command.make(
  'update-vercel-env',
  {
    cwd,
    dryRun,
    environment,
    file: envFile,
    gitBranch,
    scope,
    sensitive,
    skipEmpty,
    token,
  },
  Effect.fn('updateEnv')(function* (options) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const filePath = path.resolve(process.cwd(), options.file);

    const fileExists = yield* fileSystem.exists(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new EnvFileError({
            message: `Failed to inspect ${filePath}: ${String(cause)}`,
          })
      )
    );

    if (!fileExists) {
      return yield* new EnvFileError({
        message: `Env file does not exist: ${filePath}`,
      });
    }

    const entries = yield* parseEnvFile(filePath, {
      skipEmpty: options.skipEmpty,
    });
    if (entries.length === 0) {
      return yield* new EnvFileError({
        message: `No environment variables found in ${filePath}`,
      });
    }

    const target = options.gitBranch.pipe(
      Option.match({
        onNone: () => options.environment,
        onSome: (branch) => `${options.environment}/${branch}`,
      })
    );
    yield* Console.log(
      `Updating ${entries.length} Vercel env var(s) for ${target}`
    );

    for (const entry of entries) {
      if (options.dryRun) {
        yield* Console.log(`[dry-run] replace ${entry.key}`);
        continue;
      }

      yield* Console.log(`Replacing ${entry.key}`);
      yield* runPnpm(vercelArgs(options, entry));
    }
  })
).pipe(
  Command.withDescription(
    'Read a .env-style file and create or replace Vercel env vars.'
  ),
  Command.withExamples([
    {
      command:
        'pnpm vercel:env:update -- --file .env.staging --environment preview --dry-run',
      description: 'Preview updates without changing Vercel.',
    },
    {
      command:
        'pnpm vercel:env:update -- --file .env.local --environment development --cwd apps/frontend',
      description: 'Update a linked Vercel project in a workspace directory.',
    },
  ])
);

const program = Command.runWith(updateEnv, { version: '1.0.0' })(
  process.argv.slice(2).filter((arg) => arg !== '--')
).pipe(Effect.provide(NodeServices.layer));

// `runMain` owns exit codes, error reporting and SIGINT/SIGTERM handling.
// It already suppresses re-printing the CLI's own help and parse errors:
// `CliError.ShowHelp` and rendered `UserError`s are marked as reported.
NodeRuntime.runMain(program);
