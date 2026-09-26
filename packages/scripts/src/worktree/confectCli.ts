/** Typed wrapper around the Confect CLI used by worktree setup. */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  type CliExecutionError,
  type Spawner,
  redactSecrets,
  runCli,
} from './cliRunner.ts';

export { codegen, ConfectCliError };

class ConfectCliError extends Schema.TaggedError<ConfectCliError>()(
  'ConfectCliError',
  {
    message: Schema.String,
  }
) {}

/**
 * Regenerates the Confect-owned files before Convex deploys them.
 *
 * The root script supplies disposable WorkOS values needed while Confect loads
 * and validates implementation modules during codegen.
 */
const codegen = Effect.fn('confectCodegen')(function* (
  cwd: string
): Effect.fn.Return<void, ConfectCliError | CliExecutionError, Spawner> {
  const result = yield* runCli({
    command: 'pnpm',
    args: ['-w', 'run', 'confect:codegen'],
    cwd,
  });

  if (result.exitCode !== 0) {
    return yield* new ConfectCliError({
      message: redactSecrets(
        `confect codegen failed (exit ${result.exitCode}).\n${[
          result.stdout.trim(),
          result.stderr.trim(),
        ]
          .filter(Boolean)
          .join('\n')}`
      ),
    });
  }
});
