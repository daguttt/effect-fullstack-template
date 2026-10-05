import * as Console from 'effect/Console';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientRequest from 'effect/http/HttpClientRequest';
import * as HttpClientResponse from 'effect/http/HttpClientResponse';

import * as CliRunner from '../worktree/cliRunner.ts';
import * as CommandEnvironment from '../worktree/commandEnvironment.ts';
import * as ConfectCli from '../worktree/confectCli.ts';
import * as ConvexCli from '../worktree/convexCli.ts';
import * as EnvFile from '../worktree/envFile.ts';
import * as WorkosApi from '../worktree/workosApi.ts';
import * as WorkosCli from '../worktree/workosCli.ts';

export {
  PreviewError,
  PreviewOptions,
  PreviewInfo,
  preparePreview,
  configurePreview,
};

const PreviewInfo = Schema.Struct({
  reference: Schema.String,
  convexUrl: Schema.String,
  expiresAt: Schema.Finite,
  clientId: Schema.String,
});

class PreviewError extends Schema.TaggedError<PreviewError>()('PreviewError', {
  message: Schema.String,
}) {}

const PreviewOptions = Schema.Struct({
  project: Schema.String.check(Schema.isPattern(/^[a-z0-9-]+:[a-z0-9-]+$/)),
  pr: Schema.Int.check(Schema.isGreaterThan(0)),
  repoRoot: Schema.NonEmptyString,
});
type PreviewOptions = typeof PreviewOptions.Type;

// One write persists the complete, otherwise unrecoverable WorkOS credential.
const STATE_KEY = 'PR_PREVIEW_WORKOS';
const PreviewState = Schema.Struct({
  reference: Schema.NonEmptyString,
  environment: WorkosCli.ProvisionedEnvironment,
});
const PreviewStateJson = Schema.fromJsonString(PreviewState);
const ConvexCloudUrl = Schema.String.check(
  Schema.isPattern(/^https:\/\/[a-z0-9-]+\.convex\.cloud$/)
);
const VercelOrigin = Schema.String.check(
  Schema.isPattern(/^https:\/\/[a-z0-9-]+\.vercel\.app$/)
);

// No inherited deploy key or local selection may override the explicit PR ref.
const UNSET_KEYS = [
  'CONVEX_DEPLOY_KEY',
  'CONVEX_DEPLOYMENT',
  'CONVEX_SELF_HOSTED_URL',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'CONVEX_URL',
  'CONVEX_SITE_URL',
  'WORKOS_API_KEY',
  'WORKOS_CLIENT_ID',
  'WORKOS_WEBHOOK_SECRET',
] as const;

/** Captures secret-bearing stdout; failure reports never include its body. */
const readState = Effect.fn('readPreviewState')(function* (
  options: PreviewOptions,
  reference: string
) {
  const result = yield* CliRunner.runCli({
    command: 'pnpm',
    args: ['-w', 'convex', 'env', 'get', STATE_KEY, '--deployment', reference],
    cwd: options.repoRoot,
  });
  if (result.exitCode !== 0) {
    return yield* new PreviewError({
      message: 'Cannot read preview credentials from Convex.',
    });
  }
  // Convex 1.45 returns exit 0 and empty stdout for an absent variable.
  if (result.stdout.trim() === '') return undefined;

  const state = yield* Schema.decodeEffect(PreviewStateJson)(
    result.stdout.trim()
  ).pipe(
    Effect.mapError(
      () =>
        new PreviewError({
          message:
            'Stored preview credentials are invalid; refusing to replace them.',
        })
    )
  );
  if (state.reference !== reference) {
    return yield* new PreviewError({
      message: 'Stored preview credentials belong to a different PR.',
    });
  }
  return state;
});

/** Runs only in a fresh CI checkout. Reuses the worktree adapters and seeder. */
const preparePreview = Effect.fn('preparePreview')(function* (
  input: PreviewOptions,
  accessToken: Redacted.Redacted<string>
) {
  const options = yield* Schema.decodeEffect(PreviewOptions)(input);
  const reference = `${options.project}:pr/${options.pr}`;
  const envFile = yield* EnvFile.EnvFile;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convex = yield* ConvexCli.ConvexCli;
  const workos = yield* WorkosCli.WorkosCli;
  const workosApi = yield* WorkosApi.WorkosApi;
  const envPath = path.join(options.repoRoot, '.env.local');

  if (yield* fs.exists(envPath)) {
    return yield* new PreviewError({
      message: 'Preview setup requires a fresh checkout without .env.local.',
    });
  }

  yield* Console.log(`target: dev (${reference}, isolated PR deployment)`);
  yield* workos.assertInstalled;
  const selection = yield* convex.deploymentSelect(reference, options.repoRoot);
  if (!selection.selected) {
    yield* Console.log(
      'Creating the PR deployment with a five-day expiration.'
    );
    yield* convex.deploymentCreate(reference, options.repoRoot);
  }

  const values = yield* envFile.read(envPath);
  const convexUrl = yield* Schema.decodeUnknownEffect(ConvexCloudUrl)(
    values.get('CONVEX_URL')
  );
  const deploymentName = new URL(convexUrl).hostname.split('.')[0]!;
  const siteUrl = `https://${deploymentName}.convex.site`;
  const matchesDevSelection =
    values.get('CONVEX_DEPLOYMENT')?.startsWith(`dev:${deploymentName}`) ===
    true;
  if (!matchesDevSelection) {
    return yield* new PreviewError({
      message: 'Selected deployment is not the expected cloud dev deployment.',
    });
  }

  const expiresAt = DateTime.toEpochMillis(
    DateTime.add(yield* DateTime.now, { days: 5 })
  );
  yield* HttpClientRequest.patch(
    `https://api.convex.dev/v1/deployments/${deploymentName}`
  ).pipe(
    HttpClientRequest.bearerToken(accessToken),
    HttpClientRequest.bodyJson({ expiresAt }),
    Effect.flatMap(HttpClient.execute),
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.mapError(
      () =>
        new PreviewError({
          message: 'Could not renew the Convex deployment expiration.',
        })
    )
  );
  yield* Console.log(
    `Convex expiration renewed to ${DateTime.formatIso(DateTime.makeUnsafe(expiresAt))}`
  );

  const previous = yield* readState(options, reference);
  const state =
    previous ??
    (yield* Effect.gen(function* () {
      const environment = yield* workos.envProvision;
      const created = { reference, environment };
      const encoded = yield* Schema.encodeEffect(PreviewStateJson)(created);
      // Persist before configuration, webhook registration, deployment or seeding.
      yield* convex.envSet(STATE_KEY, Redacted.make(encoded), options.repoRoot);
      return created;
    }));
  const { environment } = state;
  yield* Console.log(
    previous
      ? 'Reusing the PR WorkOS environment.'
      : 'Persisted the new PR WorkOS environment.'
  );

  const webhook = yield* workosApi.ensureWebhookEndpoint(
    {
      url: `${siteUrl}/workos/webhook`,
      events: WorkosApi.WORKOS_WEBHOOK_EVENTS,
    },
    environment.apiKey
  );

  // Convex stores these in one record; serialize writes as in worktree setup.
  yield* convex.envSet(
    'WORKOS_CLIENT_ID',
    environment.clientId,
    options.repoRoot
  );
  yield* convex.envSet('WORKOS_API_KEY', environment.apiKey, options.repoRoot);
  yield* convex.envSet(
    'WORKOS_WEBHOOK_SECRET',
    webhook.secret,
    options.repoRoot
  );
  yield* Console.log('Generating and deploying the backend.');
  yield* ConfectCli.codegen(options.repoRoot);
  yield* convex.devOnce(options.repoRoot);
  yield* Console.log('Seeding the isolated PR environment.');
  yield* convex.run('developmentSeeder:seed', options.repoRoot);

  // Only public frontend configuration goes into the build environment.
  yield* envFile.upsert(envPath, [
    ['VITE_CONVEX_URI', convexUrl],
    ['VITE_WORKOS_CLIENT_ID', environment.clientId],
    ['VITE_PR_PREVIEW', 'true'],
  ]);
  return { reference, convexUrl, expiresAt, clientId: environment.clientId };
}, CommandEnvironment.without(UNSET_KEYS));

/** Register the actual URL returned by Vercel after its static upload is ready. */
const configurePreview = Effect.fn('configurePreview')(function* (
  input: PreviewOptions,
  url: string
) {
  const options = yield* Schema.decodeEffect(PreviewOptions)(input);
  const origin = yield* Schema.decodeEffect(VercelOrigin)(url.trim());
  const reference = `${options.project}:pr/${options.pr}`;
  const state = yield* readState(options, reference);
  if (!state)
    return yield* new PreviewError({
      message: 'Prepare the preview before configuring its URL.',
    });
  const workos = yield* WorkosCli.WorkosCli;
  yield* workos.configureAuthKit(
    {
      redirectUri: `${origin}/callback`,
      corsOrigin: origin,
      homepageUrl: `${origin}/signout-callback`,
    },
    state.environment.apiKey
  );
  yield* Console.log(`Preview ready: ${origin}`);
}, CommandEnvironment.without(UNSET_KEYS));
