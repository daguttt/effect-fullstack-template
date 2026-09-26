import { expect, layer } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Redacted from 'effect/Redacted';
import * as Ref from 'effect/Ref';
import * as Schema from 'effect/Schema';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';

import * as ConvexCli from '../worktree/convexCli.ts';
import * as TestProviders from '../worktree/testProviders.ts';
import * as TestSpawner from '../worktree/testSpawner.ts';
import * as WorkosApi from '../worktree/workosApi.ts';
import * as WorkosCli from '../worktree/workosCli.ts';
import * as Preview from './lifecycle.ts';

const withPreviewFixture = <A, E, R>(
  use: (fixture: {
    prepare: ReturnType<typeof Preview.preparePreview>;
    configure: (url: string) => ReturnType<typeof Preview.configurePreview>;
    stored: Map<string, string>;
    provisions: Ref.Ref<number>;
    seedFails: Ref.Ref<boolean>;
    renewals: Array<number>;
    configured: Array<WorkosCli.ConfigureAuthKitDto>;
    freshRunner: Effect.Effect<void>;
  }) => Effect.Effect<A, E, R>
) =>
  TestProviders.withWorktreeFixture((worktree, envFile) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const provisions = yield* Ref.make(0);
      const seedFails = yield* Ref.make(false);
      const stored = new Map<string, string>();
      const configured: Array<WorkosCli.ConfigureAuthKitDto> = [];
      const renewals: Array<number> = [];
      const options = {
        project: 'team:project',
        pr: 123,
        repoRoot: worktree.repoRoot,
      };
      const convex = TestProviders.fakeConvexCli({
        deploymentSelect: (reference) =>
          Effect.gen(function* () {
            expect(reference).toBe('team:project:pr/123');
            yield* envFile
              .upsert(worktree.envFilePath, [
                ['CONVEX_DEPLOYMENT', 'dev:preview-test-123'],
                ['CONVEX_URL', 'https://preview-test-123.convex.cloud'],
              ])
              .pipe(Effect.orDie);
            return { selected: true, diagnostics: '' };
          }),
        envSet: (key, value) =>
          Effect.sync(() => {
            stored.set(
              key,
              Redacted.isRedacted(value) ? Redacted.value(value) : value
            );
          }),
        run: () =>
          Effect.gen(function* () {
            if (yield* Ref.get(seedFails))
              return yield* new ConvexCli.ConvexCliError({
                message: 'Seed failed',
              });
          }),
      });
      const workos = TestProviders.fakeWorkosCli({
        envProvision: Effect.gen(function* () {
          yield* Ref.update(provisions, (count) => count + 1);
          return {
            name: 'unclaimed-preview',
            apiKey: Redacted.make('sk_test_preview'),
            clientId: 'client_preview',
            authkitDomain: 'preview.authkit.app',
          };
        }),
        configureAuthKit: (configuration) =>
          Effect.sync(() => {
            configured.push(configuration);
          }),
      });
      const client = HttpClient.make((request) =>
        Effect.gen(function* () {
          expect(request.url).toBe(
            'https://api.convex.dev/v1/deployments/preview-test-123'
          );
          expect(request.method).toBe('PATCH');
          if (request.body._tag === 'Uint8Array') {
            const body = yield* Schema.decodeEffect(
              Schema.fromJsonString(Schema.Struct({ expiresAt: Schema.Finite }))
            )(new TextDecoder().decode(request.body.body)).pipe(Effect.orDie);
            renewals.push(body.expiresAt);
          }
          return HttpClientResponse.fromWeb(request, new Response('{}'));
        })
      );
      const spawner = TestSpawner.recordedSpawnerLayer(({ args }) => ({
        stdout: args.includes('get')
          ? (stored.get('PR_PREVIEW_WORKOS') ?? '')
          : '',
      }));
      return yield* use({
        prepare: Preview.preparePreview(options, Redacted.make('test-token')),
        configure: (url) => Preview.configurePreview(options, url),
        stored,
        provisions,
        seedFails,
        configured,
        renewals,
        freshRunner: fs
          .remove(worktree.envFilePath, { force: true })
          .pipe(Effect.orDie),
      }).pipe(
        Effect.provideService(ConvexCli.ConvexCli, convex),
        Effect.provideService(WorkosCli.WorkosCli, workos),
        Effect.provideService(
          WorkosApi.WorkosApi,
          TestProviders.fakeWorkosApi()
        ),
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provide(spawner)
      );
    })
  );

layer(TestProviders.worktreeFixtureLayer, { excludeTestServices: true })(
  'PR preview lifecycle',
  (it) => {
    it.effect(
      'reuses backend identity and WorkOS credentials across fresh runners, renewing expiry each time',
      () =>
        withPreviewFixture((fixture) =>
          Effect.gen(function* () {
            const first = yield* fixture.prepare;
            yield* fixture.freshRunner;
            const second = yield* fixture.prepare;
            expect(second.convexUrl).toBe(first.convexUrl);
            expect(second.clientId).toBe(first.clientId);
            expect(yield* Ref.get(fixture.provisions)).toBe(1);
            expect(fixture.renewals).toHaveLength(2);
            expect(second.expiresAt).toBeGreaterThanOrEqual(first.expiresAt);
          })
        )
    );

    it.effect('recovers saved credentials after a seed failure', () =>
      withPreviewFixture((fixture) =>
        Effect.gen(function* () {
          yield* Ref.set(fixture.seedFails, true);
          const failed = yield* Effect.result(fixture.prepare);
          expect(failed._tag).toBe('Failure');
          expect(fixture.stored.has('PR_PREVIEW_WORKOS')).toBe(true);
          yield* fixture.freshRunner;
          yield* Ref.set(fixture.seedFails, false);
          yield* fixture.prepare;
          expect(yield* Ref.get(fixture.provisions)).toBe(1);
        })
      )
    );

    it.effect(
      'fails closed on corrupted saved state without provisioning or printing its contents',
      () =>
        withPreviewFixture((fixture) =>
          Effect.gen(function* () {
            fixture.stored.set('PR_PREVIEW_WORKOS', 'secret-corrupt-state');
            const result = yield* Effect.result(fixture.prepare);
            expect(result._tag).toBe('Failure');
            if (result._tag === 'Failure')
              expect(String(result.failure)).not.toContain(
                'secret-corrupt-state'
              );
            expect(yield* Ref.get(fixture.provisions)).toBe(0);
          })
        )
    );

    it.effect(
      'refuses an existing checkout environment before provisioning',
      () =>
        withPreviewFixture((fixture) =>
          Effect.gen(function* () {
            yield* fixture.prepare;
            const result = yield* Effect.result(fixture.prepare);
            expect(result._tag).toBe('Failure');
            expect(yield* Ref.get(fixture.provisions)).toBe(1);
            expect(fixture.renewals).toHaveLength(1);
          })
        )
    );

    it.effect(
      'configures the actual Vercel origin and rejects credential-bearing or non-Vercel URLs',
      () =>
        withPreviewFixture((fixture) =>
          Effect.gen(function* () {
            yield* fixture.prepare;
            yield* fixture.configure('https://app-abc.vercel.app');
            expect(fixture.configured).toEqual([
              {
                redirectUri: 'https://app-abc.vercel.app/callback',
                corsOrigin: 'https://app-abc.vercel.app',
                homepageUrl: 'https://app-abc.vercel.app/signout-callback',
              },
            ]);
            for (const url of [
              'https://app-abc.vercel.app.evil.test',
              'https://secret@app-abc.vercel.app',
              'http://app-abc.vercel.app',
            ]) {
              expect((yield* Effect.result(fixture.configure(url)))._tag).toBe(
                'Failure'
              );
            }
            expect(fixture.configured).toHaveLength(1);
          })
        )
    );
  }
);
