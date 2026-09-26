/**
 * A {@link ChildProcessSpawner} that replays recorded CLI responses instead of
 * spawning anything, so the CLI wrappers can be tested without live calls.
 */
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as PlatformError from 'effect/PlatformError';
import * as Sink from 'effect/Sink';
import * as Stream from 'effect/Stream';
import * as ChildProcess from 'effect/unstable/process/ChildProcess';
import * as Spawner from 'effect/unstable/process/ChildProcessSpawner';

import * as CliRunner from './cliRunner.ts';

export { recordedSpawnerLayer, type RecordedInvocation, type RecordedResponse };

type RecordedResponse = {
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;
  readonly exitCode?: number | undefined;
  readonly spawnError?: PlatformError.PlatformError | undefined;
  readonly beforeResponse?: Effect.Effect<void> | undefined;
};

type RecordedInvocation = {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Record<string, string | undefined>;
  readonly cwd?: string | undefined;
};

const bytes = (text: string) => Stream.encodeText(Stream.succeed(text));

/**
 * @param respond Chooses the recorded response for an invocation.
 * @param invocations Appended to as commands are "run", so tests can assert on
 *   argv and on the effective environment. The invocation-scoped policy from
 *   `runCli` scrubs exact `Redacted` values and recognizable inherited secrets
 *   before recording so failed assertions cannot print them.
 */
const recordedSpawnerLayer = (
  respond: (invocation: RecordedInvocation) => RecordedResponse,
  invocations: Array<RecordedInvocation> = [],
  inheritedEnvironment: Record<string, string | undefined> = {}
) =>
  Layer.succeed(Spawner.ChildProcessSpawner)(
    Spawner.make((command: ChildProcess.Command) =>
      Effect.gen(function* () {
        if (!ChildProcess.isStandardCommand(command)) {
          throw new Error(
            'The recorded spawner only supports standard commands.'
          );
        }

        const invocationRedactor = yield* CliRunner.InvocationRedactor;
        const effectiveEnvironment = command.options.extendEnv
          ? { ...inheritedEnvironment, ...command.options.env }
          : { ...command.options.env };
        const invocation: RecordedInvocation = {
          command: command.command,
          args: invocationRedactor.redactArgs(command.args),
          env: invocationRedactor.redactEnvironment(effectiveEnvironment),
          cwd: command.options.cwd,
        };
        invocations.push(invocation);

        const response = respond(invocation);

        const stdout = bytes(response.stdout ?? '');
        const stderr = bytes(response.stderr ?? '');
        const result = response.spawnError
          ? Effect.fail(response.spawnError)
          : Effect.succeed(
              Spawner.makeHandle({
                pid: Spawner.ProcessId(1),
                exitCode: Effect.succeed(
                  Spawner.ExitCode(response.exitCode ?? 0)
                ),
                isRunning: Effect.succeed(false),
                kill: () => Effect.void,
                stdin: Sink.drain,
                stdout,
                stderr,
                all: bytes(`${response.stdout ?? ''}${response.stderr ?? ''}`),
                getInputFd: () => Sink.drain,
                getOutputFd: () => Stream.empty,
                unref: Effect.succeed(Effect.void),
              })
            );

        return yield* Effect.andThen(
          response.beforeResponse ?? Effect.void,
          result
        );
      })
    )
  );
