import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';

import * as ConvexCli from './convexCli.ts';
import * as TestSpawner from './testSpawner.ts';

const withRecorded = async <A, E>(
  use: (convexCli: ConvexCli.ConvexCli['Service']) => Effect.Effect<A, E>,
  response: {
    readonly stdout?: string;
    readonly stderr?: string;
    readonly exitCode?: number;
  }
) => {
  const invocations: Array<TestSpawner.RecordedInvocation> = [];
  const layer = TestSpawner.recordedSpawnerLayer(() => response, invocations);
  const value = await Effect.runPromise(
    Effect.gen(function* () {
      const convexCli = yield* ConvexCli.ConvexCli;
      return yield* use(convexCli);
    }).pipe(
      Effect.provide(ConvexCli.ConvexCli.layer.pipe(Layer.provide(layer)))
    )
  );

  return { value, invocations };
};

describe('deploymentCreate', () => {
  it('returns successful stderr diagnostics instead of discarding warnings', async () => {
    const { value } = await withRecorded(
      (convexCli) =>
        convexCli.deploymentCreate('dev/worktree-example', '/repo'),
      {
        stdout: 'Created and selected new dev deployment.\n',
        stderr: "Can't safely modify .env.local for CONVEX_URL.\n",
      }
    );

    expect(value).toBe(
      "Created and selected new dev deployment.\nCan't safely modify .env.local for CONVEX_URL."
    );
  });

  it('creates an expiring dev deployment and selects it', async () => {
    const { invocations } = await withRecorded(
      (convexCli) =>
        convexCli.deploymentCreate('dev/worktree-example', '/repo'),
      { stdout: 'ok' }
    );

    expect(invocations[0]?.command).toBe('pnpm');
    expect(invocations[0]?.args).toStrictEqual([
      '-w',
      'convex',
      'deployment',
      'create',
      'dev/worktree-example',
      '--type',
      'dev',
      '--expiration',
      'in 5 days',
      '--select',
    ]);
    expect(invocations[0]?.env.CONVEX_ALLOW_ANONYMOUS).toBe('false');
  });
});

describe('envSet', () => {
  it('redacts secret values in recorded argv', async () => {
    const secret = 'an-unprefixed-argv-secret';
    const { invocations } = await withRecorded(
      (convexCli) =>
        convexCli.envSet('WORKOS_API_KEY', Redacted.make(secret), '/repo'),
      { stdout: 'ok' }
    );

    expect(invocations[0]?.args).toStrictEqual([
      '-w',
      'convex',
      'env',
      'set',
      'WORKOS_API_KEY',
      '[redacted]',
    ]);
    expect(invocations[0]?.args).not.toContain(secret);
  });
});
