import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as PlatformError from 'effect/PlatformError';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Ref from 'effect/Ref';

import * as TestSpawner from './testSpawner.ts';
import * as WorkosCli from './workosCli.ts';

const API_KEY = `sk_test_${'a'.repeat(75)}`;
const CLIENT_ID = `client_${'0'.repeat(26)}`;

const PROVISION_BODY = JSON.stringify({
  status: 'ok',
  message: 'Environment provisioned',
  data: {
    name: 'unclaimed-2',
    type: 'sandbox',
    active: true,
    apiKey: API_KEY,
    clientId: CLIENT_ID,
    claimToken: '0'.repeat(25),
    authkitDomain: 'scholarly-night-29-sandbox.authkit.app',
  },
});

const SEED_BODY = JSON.stringify({
  status: 'ok',
  message: 'Seed complete',
  state: {
    permissions: [],
    roles: [],
    organizations: [],
    createdAt: '2026-09-03T00:00:00.000Z',
  },
});

const NO_ENVIRONMENTS_BODY =
  '{"error":{"code":"no_environments","message":"No environments configured. Run `workos env add` to get started."}}';

const AUTHKIT_CONFIGURATION = {
  redirectUri: 'http://localhost:5175/callback',
  corsOrigin: 'http://localhost:5175',
  homepageUrl: 'http://localhost:5175/signout-callback',
};

/** Runs `use` against a spawner that replays `body`, then reports what it saw. */
const withRecorded = async <A, E>(
  body: string,
  use: (
    workosCli: WorkosCli.WorkosCli['Service']
  ) => Effect.Effect<A, E, FileSystem.FileSystem>,
  options?: {
    readonly exitCode?: number;
    readonly spawnError?: PlatformError.PlatformError;
    readonly stderr?: string;
    readonly beforeResponse?: Effect.Effect<void>;
  }
) => {
  const invocations: Array<TestSpawner.RecordedInvocation> = [];
  const layer = TestSpawner.recordedSpawnerLayer(
    () => ({
      stdout: body,
      stderr: options?.stderr,
      exitCode: options?.exitCode,
      spawnError: options?.spawnError,
      beforeResponse: options?.beforeResponse,
    }),
    invocations
  );

  const value = await Effect.runPromise(
    Effect.gen(function* () {
      const workosCli = yield* WorkosCli.WorkosCli;
      return yield* use(workosCli);
    }).pipe(
      Effect.provide(
        WorkosCli.WorkosCli.layer.pipe(
          Layer.provideMerge(
            Layer.mergeAll(layer, NodeFileSystem.layer, NodePath.layer)
          )
        )
      )
    )
  );

  return { value, invocations };
};

const asStderrFailure = (body: string) => ({ stderr: body, exitCode: 1 });

describe('assertInstalled', () => {
  it('checks that the WorkOS CLI can be resolved from PATH', async () => {
    const { invocations } = await withRecorded(
      '0.22.0\n',
      (workosCli) => workosCli.assertInstalled
    );

    expect(invocations[0]?.command).toBe('workos');
    expect(invocations[0]?.args).toStrictEqual(['--version']);
  });

  it('explains that the WorkOS CLI is a required dependency when it is missing', async () => {
    const spawnError = PlatformError.systemError({
      _tag: 'NotFound',
      module: 'ChildProcess',
      method: 'spawn',
      pathOrDescriptor: 'workos',
    });

    await expect(
      withRecorded('', (workosCli) => workosCli.assertInstalled, {
        spawnError,
      })
    ).rejects.toThrow(/WorkOS CLI is required.*PATH/i);
  });
});

describe('envProvision', () => {
  it('pins --insecure-storage and returns the credentials redacted', async () => {
    const { value, invocations } = await withRecorded(
      PROVISION_BODY,
      (workosCli) => workosCli.envProvision
    );

    expect(invocations[0]?.command).toBe('workos');
    expect(invocations[0]?.args).toStrictEqual([
      'env',
      'provision',
      '--json',
      '--insecure-storage',
    ]);
    expect(value.name).toBe('unclaimed-2');
    expect(value.clientId).toBe(CLIENT_ID);
    expect(value.authkitDomain).toBe('scholarly-night-29-sandbox.authkit.app');
    expect(Redacted.value(value.apiKey)).toBe(API_KEY);
    // A Redacted never leaks through string interpolation or console output.
    // oxlint-disable-next-line typescript/no-base-to-string -- Redacted implements toString() (effect/src/Redacted.ts), returning '<redacted>'; the type just does not declare it.
    expect(String(value.apiKey)).not.toContain(API_KEY);
  });

  it('never passes the API key on argv', async () => {
    const { invocations } = await withRecorded(
      PROVISION_BODY,
      (workosCli) => workosCli.envProvision
    );

    expect(invocations[0]?.args.join(' ')).not.toContain('sk_test_');
  });
});

describe('envRemove', () => {
  it('pins --insecure-storage so it targets the same store as provision', async () => {
    const { invocations } = await withRecorded(
      JSON.stringify({ status: 'ok', data: { name: 'unclaimed-2' } }),
      (workosCli) => workosCli.envRemove('unclaimed-2')
    );

    expect(invocations[0]?.args).toStrictEqual([
      'env',
      'remove',
      'unclaimed-2',
      '--json',
      '--insecure-storage',
    ]);
  });

  it('treats a no_environments failure on stderr as success', async () => {
    await expect(
      withRecorded(
        '',
        (workosCli) => workosCli.envRemove('unclaimed-2'),
        asStderrFailure(NO_ENVIRONMENTS_BODY)
      )
    ).resolves.toBeDefined();
  });

  it('treats a not_found failure on stderr as success', async () => {
    await expect(
      withRecorded(
        '',
        (workosCli) => workosCli.envRemove('unclaimed-2'),
        asStderrFailure(
          '{"error":{"code":"not_found","message":"Environment unclaimed-2 not found."}}'
        )
      )
    ).resolves.toBeDefined();
  });

  it('reports the code and message of a failure it does not tolerate', async () => {
    await expect(
      withRecorded(
        '',
        (workosCli) => workosCli.envRemove('unclaimed-2'),
        asStderrFailure(
          '{"error":{"code":"unauthorized","message":"Invalid credentials"}}'
        )
      )
    ).rejects.toThrow(/unauthorized.*Invalid credentials/);
  });

  it('redacts a key the CLI echoed back inside its error message', async () => {
    const failure = withRecorded(
      '',
      (workosCli) => workosCli.envRemove('unclaimed-2'),
      asStderrFailure(
        `{"error":{"code":"unauthorized","message":"Key ${API_KEY} was rejected"}}`
      )
    );

    await expect(failure).rejects.toThrow(/unauthorized.*\[redacted\]/);
    await expect(failure).rejects.not.toThrow(new RegExp(API_KEY));
  });
});

describe('envList', () => {
  it('returns an empty list rather than failing on no_environments', async () => {
    const { value } = await withRecorded(
      '',
      (workosCli) => workosCli.envList,
      asStderrFailure(NO_ENVIRONMENTS_BODY)
    );

    expect(value).toStrictEqual([]);
  });

  it('decodes the empty-registry body, which omits status', async () => {
    const { value } = await withRecorded(
      '{"data":[]}',
      (workosCli) => workosCli.envList
    );

    expect(value).toStrictEqual([]);
  });

  it('decodes the recorded list payload', async () => {
    const { value } = await withRecorded(
      JSON.stringify({
        status: 'ok',
        data: [
          {
            name: 'unclaimed',
            type: 'sandbox',
            active: true,
            endpoint: 'https://api.workos.com',
            hasApiKey: true,
            hasClientId: true,
          },
        ],
      }),
      (workosCli) => workosCli.envList
    );

    expect(value).toHaveLength(1);
    expect(value[0]?.name).toBe('unclaimed');
  });
});

describe('configureAuthKit', () => {
  /** Captures the seed before its scoped directory is removed. */
  const runConfigureAuthKit = (
    response: TestSpawner.RecordedResponse,
    configuration = AUTHKIT_CONFIGURATION
  ) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const invocations: Array<TestSpawner.RecordedInvocation> = [];
      const seedFile = yield* Ref.make<string | undefined>(undefined);
      const captureSeedFile = Effect.gen(function* () {
        const seedPath = seedPathOf(invocations.at(-1));

        if (Predicate.isUndefined(seedPath)) {
          return;
        }

        yield* Ref.set(seedFile, yield* fileSystem.readFileString(seedPath));
      }).pipe(Effect.orDie);

      const workosCli = yield* WorkosCli.WorkosCli.pipe(
        Effect.provide(
          WorkosCli.WorkosCli.layer.pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                TestSpawner.recordedSpawnerLayer(
                  () => ({ ...response, beforeResponse: captureSeedFile }),
                  invocations
                ),
                NodeFileSystem.layer,
                NodePath.layer
              )
            )
          )
        )
      );
      const outcome = yield* Effect.result(
        workosCli.configureAuthKit(configuration, Redacted.make(API_KEY))
      );

      return {
        invocations,
        outcome,
        seedFile: yield* Ref.get(seedFile),
        directoryExists: (directory: string) => fileSystem.exists(directory),
      };
    }).pipe(
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      Effect.runPromise
    );

  const seedPathOf = (invocation: TestSpawner.RecordedInvocation | undefined) =>
    invocation?.args.at(invocation.args.indexOf('--file') + 1);

  const seeded = () => runConfigureAuthKit({ stdout: SEED_BODY });

  it.each(['redirectUri', 'corsOrigin', 'homepageUrl'] as const)(
    'rejects an empty %s before invoking the CLI',
    async (field) => {
      const { outcome, invocations, seedFile } = await runConfigureAuthKit(
        { stdout: SEED_BODY },
        { ...AUTHKIT_CONFIGURATION, [field]: '' }
      );

      expect(outcome._tag).toBe('Failure');
      if (outcome._tag !== 'Failure') return;
      expect(outcome.failure).toBeInstanceOf(WorkosCli.WorkosCliError);
      expect(outcome.failure.message).toContain('AuthKit configuration');
      expect(outcome.failure.message).not.toContain(API_KEY);
      expect(invocations).toHaveLength(0);
      expect(seedFile).toBeUndefined();
    }
  );

  it('seeds the configuration instead of running the removed config commands', async () => {
    const { invocations, outcome } = await seeded();

    expect(outcome._tag).toBe('Success');
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.command).toBe('workos');
    expect(invocations[0]?.args[0]).toBe('seed');
    expect(invocations[0]?.args).not.toContain('config');
    expect(invocations[0]?.args).not.toContain('webhook');
  });

  it('passes an absolute seed path and keeps the API key out of argv', async () => {
    const { invocations } = await seeded();
    const seedPath = seedPathOf(invocations[0]);

    expect(seedPath?.startsWith('/')).toBe(true);
    expect(seedPath?.endsWith('workos-seed.yml')).toBe(true);
    expect(invocations[0]?.args).not.toContain('--api-key');
    expect(invocations[0]?.args.join(' ')).not.toContain('sk_test_');
  });

  it('reaches the child process with the API key in a redacted environment', async () => {
    const { invocations } = await seeded();

    expect(invocations[0]?.env.WORKOS_API_KEY).toBe('[redacted]');
  });

  it('runs from the directory holding the seed, not the repository', async () => {
    const { invocations } = await seeded();

    expect(invocations[0]?.cwd).toBeDefined();
    expect(seedPathOf(invocations[0])).toBe(
      `${invocations[0]?.cwd}/workos-seed.yml`
    );
  });

  it('writes only the requested redirect, CORS, and homepage settings', async () => {
    const { seedFile } = await seeded();

    expect(JSON.parse(seedFile ?? '')).toStrictEqual({
      config: {
        redirect_uris: ['http://localhost:5175/callback'],
        cors_origins: ['http://localhost:5175'],
        homepage_url: 'http://localhost:5175/signout-callback',
      },
    });
  });

  it('takes the seed file and the seed state directory with it', async () => {
    const { invocations, directoryExists } = await seeded();

    expect(
      await Effect.runPromise(directoryExists(invocations[0]?.cwd ?? ''))
    ).toBe(false);
  });

  it('reports a seed failure from stderr without leaking the API key', async () => {
    const { outcome } = await runConfigureAuthKit(
      asStderrFailure(
        '{"error":{"code":"seed_failed","message":"Seed failed: Unauthorized."}}'
      )
    );

    expect(outcome._tag).toBe('Failure');
    const message =
      outcome._tag === 'Failure' ? String(outcome.failure.message) : '';
    expect(message).toContain('seed_failed');
    expect(message).not.toContain(API_KEY);
  });
});

describe('error channel', () => {
  it('still recognises an error envelope on stdout', async () => {
    await expect(
      withRecorded(
        JSON.stringify({ error: { code: 'unauthorized', message: 'bad key' } }),
        (workosCli) => workosCli.envProvision,
        { exitCode: 0 }
      )
    ).rejects.toThrow(/unauthorized/);
  });

  it('does not treat a non-zero exit with a valid success body as a failure', async () => {
    const { value } = await withRecorded(
      PROVISION_BODY,
      (workosCli) => workosCli.envProvision,
      {
        exitCode: 1,
      }
    );

    expect(value.name).toBe('unclaimed-2');
  });

  it('redacts secrets in stderr that is neither JSON nor an envelope', async () => {
    await expect(
      withRecorded('', (workosCli) => workosCli.envProvision, {
        exitCode: 1,
        stderr: `panic: leaked ${API_KEY}`,
      })
    ).rejects.toThrow(/unrecognised response.*\[redacted\]/s);
  });
});
