import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';

import type { Spawner } from './cliRunner.ts';
import { codegen } from './confectCli.ts';
import {
  type RecordedInvocation,
  recordedSpawnerLayer,
} from './testSpawner.ts';

const withRecorded = async <A, E>(
  use: () => Effect.Effect<A, E, Spawner>,
  response: {
    readonly stdout?: string;
    readonly stderr?: string;
    readonly exitCode?: number;
  }
) => {
  const invocations: Array<RecordedInvocation> = [];
  const layer = recordedSpawnerLayer(() => response, invocations);
  const value = await Effect.runPromise(Effect.provide(use(), layer));

  return { value, invocations };
};

describe('codegen', () => {
  it('runs the workspace Confect codegen script', async () => {
    const { invocations } = await withRecorded(() => codegen('/repo'), {});

    expect(invocations[0]?.command).toBe('pnpm');
    expect(invocations[0]?.args).toStrictEqual([
      '-w',
      'run',
      'confect:codegen',
    ]);
  });

  it('reports codegen diagnostics when generation fails', async () => {
    await expect(
      withRecorded(() => codegen('/repo'), {
        exitCode: 1,
        stderr: 'Could not generate Confect files',
      })
    ).rejects.toThrow(/Could not generate Confect files/);
  });
});
