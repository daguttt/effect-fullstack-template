import { expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as ChildProcess from 'effect/process/ChildProcess';
import * as Spawner from 'effect/process/ChildProcessSpawner';

import * as TestSpawner from './testSpawner.ts';

it.effect('keeps native redacted subprocess values out of recordings', () => {
  const invocations: Array<TestSpawner.RecordedInvocation> = [];

  return Effect.gen(function* () {
    const spawner = yield* Spawner.ChildProcessSpawner;

    yield* spawner.spawn(
      ChildProcess.make('tool', ['visible', Redacted.make('private-arg')], {
        env: { SECRET: Redacted.make('private-env'), VISIBLE: 'public' },
        extendEnv: true,
      })
    );

    expect(invocations).toStrictEqual([
      {
        command: 'tool',
        args: ['visible', '[redacted]'],
        env: { INHERITED: 'safe', SECRET: '[redacted]', VISIBLE: 'public' },
        cwd: undefined,
      },
    ]);
    expect(JSON.stringify(invocations)).not.toContain('private-arg');
    expect(JSON.stringify(invocations)).not.toContain('private-env');
  }).pipe(
    Effect.scoped,
    Effect.provide(
      TestSpawner.recordedSpawnerLayer(() => ({}), invocations, {
        INHERITED: 'safe',
      })
    )
  );
});
