/**
 * Git and host lookups shared by setup and teardown: locating the worktree,
 * proving it is a *linked* worktree, and probing for a free TCP port.
 */
import net from 'node:net';

import * as Effect from 'effect/Effect';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';

import * as CliRunner from './cliRunner.ts';
import * as Domain from './domain.ts';

export {
  RepoError,
  envFilePathFor,
  findAvailablePort,
  listWorktreePaths,
  portHasListener,
  resolveWorktree,
  type WorktreeContext,
};

/**
 * Where a worktree keeps its isolated credentials.
 *
 * `gc` applies this to worktrees other than the current one, so the convention
 * has to be stated once rather than inlined per call site.
 */
const envFilePathFor = (worktreeRoot: string) => `${worktreeRoot}/.env.local`;

class RepoError extends Schema.TaggedError<RepoError>()('RepoError', {
  message: Schema.String,
}) {}

type WorktreeContext = {
  readonly repoRoot: string;
  readonly gitDir: string;
  readonly worktreeId: string;
  readonly envFilePath: string;
  readonly mainEnvFilePath: string;
};

const git = Effect.fn('git')(function* (
  args: ReadonlyArray<string>
): Effect.fn.Return<
  string,
  RepoError | CliRunner.CliExecutionError,
  CliRunner.Spawner
> {
  const result = yield* CliRunner.runCli({ command: 'git', args });

  if (result.exitCode !== 0) {
    return yield* new RepoError({
      message: `git ${args.join(' ')} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    });
  }

  return result.stdout.trim();
});

/**
 * Resolves the current worktree, refusing to continue unless it is linked.
 * Setup and teardown provision and destroy isolated external resources, so
 * running them against the main checkout would clobber the developer's
 * primary environment.
 */
const resolveWorktree = Effect.fn('resolveWorktree')(
  function* (): Effect.fn.Return<
    WorktreeContext,
    RepoError | CliRunner.CliExecutionError,
    CliRunner.Spawner | Path.Path
  > {
    const path = yield* Path.Path;
    const repoRoot = yield* git(['rev-parse', '--show-toplevel']);
    const gitDir = yield* git([
      'rev-parse',
      '--path-format=absolute',
      '--git-dir',
    ]);
    const commonGitDir = yield* git([
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);

    if (gitDir === commonGitDir) {
      return yield* new RepoError({
        message:
          'This command manages isolated external resources and must only run from a linked Git worktree.',
      });
    }

    const worktreeId = Domain.deriveWorktreeId(gitDir);

    if (!Domain.isValidWorktreeId(worktreeId)) {
      return yield* new RepoError({
        message: `Derived an invalid resource identifier from ${gitDir}: '${worktreeId}'.`,
      });
    }

    const mainWorktreeRoot = path.dirname(commonGitDir);

    return {
      repoRoot,
      gitDir,
      worktreeId,
      envFilePath: envFilePathFor(repoRoot),
      mainEnvFilePath: envFilePathFor(mainWorktreeRoot),
    };
  }
);

/** Absolute paths of every worktree registered on this checkout. */
const listWorktreePaths = Effect.fn('listWorktreePaths')(
  function* (): Effect.fn.Return<
    ReadonlyArray<string>,
    RepoError | CliRunner.CliExecutionError,
    CliRunner.Spawner
  > {
    const output = yield* git(['worktree', 'list', '--porcelain']);

    return output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length).trim());
  }
);

const portHasListener = (port: Domain.Port) =>
  Effect.callback<boolean, RepoError>((resume) => {
    const server = net.createServer();

    server.once('error', (cause: NodeJS.ErrnoException) => {
      resume(
        cause.code === 'EADDRINUSE'
          ? Effect.succeed(true)
          : Effect.fail(
              new RepoError({
                message: `Could not determine whether port ${port} is available: ${String(cause)}`,
              })
            )
      );
    });

    server.listen({ host: 'localhost', port }, () => {
      server.close(() => resume(Effect.succeed(false)));
    });
  });

/** Probes upward from `candidate` until a port with no listener is found. */
const findAvailablePort = Effect.fn('findAvailablePort')(function* (
  candidate: Domain.Port
): Effect.fn.Return<Domain.Port, RepoError> {
  for (let port = candidate; port <= Domain.MAX_PORT; port += 1) {
    if (!(yield* portHasListener(port))) {
      return port;
    }
  }

  return yield* new RepoError({
    message: `Could not find an available development server port at or above ${candidate}.`,
  });
});
