import * as NodeServices from '@effect/platform-node/NodeServices';
import { expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';

import * as ConvexPlatform from './convexPlatform.ts';

type Sent = {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
};

/** Runs `use` against a Platform API that answers every request with `answer`. */
const withPlatform = <A, E>(
  answer: { readonly status: number; readonly body?: string },
  use: (
    platform: ConvexPlatform.ConvexPlatform['Service'],
    sent: Array<Sent>
  ) => Effect.Effect<A, E>,
  options: { readonly loggedIn: boolean } = { loggedIn: true }
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: 'convex-home-' });
    if (options.loggedIn) {
      yield* fs.makeDirectory(path.join(home, '.convex'));
      yield* fs.writeFileString(
        path.join(home, '.convex', 'config.json'),
        '{"accessToken":"token-fixture"}'
      );
    }
    const sent: Array<Sent> = [];
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        sent.push({
          method: request.method,
          url: url.toString(),
          authorization: request.headers['authorization'],
        });
        return HttpClientResponse.fromWeb(
          request,
          new Response(answer.body ?? '{}', {
            status: answer.status,
          })
        );
      })
    );
    return yield* Effect.gen(function* () {
      return yield* use(yield* ConvexPlatform.ConvexPlatform, sent);
    }).pipe(
      Effect.provide(
        ConvexPlatform.ConvexPlatform.layer.pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, client))
        )
      ),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ HOME: home })
      )
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

it.effect('reads a deployment with the saved Convex login', () =>
  withPlatform(
    {
      status: 200,
      body: '{"name":"calm-otter-1","reference":"dev/codex-abc","deploymentType":"dev","isDefault":false,"kind":"cloud"}',
    },
    (platform, sent) =>
      Effect.gen(function* () {
        expect(yield* platform.findDeployment('calm-otter-1')).toEqual(
          Option.some({
            name: 'calm-otter-1',
            reference: 'dev/codex-abc',
            deploymentType: 'dev',
            isDefault: false,
          })
        );
        expect(sent).toEqual([
          {
            method: 'GET',
            url: 'https://api.convex.dev/v1/deployments/calm-otter-1',
            authorization: 'Bearer token-fixture',
          },
        ]);
      })
  )
);

it.effect('finds nothing when Convex has no such deployment', () =>
  withPlatform({ status: 404 }, (platform) =>
    Effect.gen(function* () {
      expect(yield* platform.findDeployment('gone-1')).toEqual(Option.none());
    })
  )
);

it.effect('deletes a deployment by name', () =>
  withPlatform({ status: 200 }, (platform, sent) =>
    Effect.gen(function* () {
      yield* platform.deleteDeployment('calm-otter-1');
      expect(sent.map(({ method, url }) => `${method} ${url}`)).toEqual([
        'POST https://api.convex.dev/v1/deployments/calm-otter-1/delete',
      ]);
    })
  )
);

it.effect('fails when Convex refuses the deletion', () =>
  withPlatform({ status: 403 }, (platform) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        platform.deleteDeployment('calm-otter-1')
      );
      expect(error.message).toContain('HTTP 403');
    })
  )
);

it.effect('asks for a Convex login when none is saved', () =>
  withPlatform(
    { status: 200 },
    (platform, sent) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          platform.findDeployment('calm-otter-1')
        );
        expect(error.message).toContain('convex login');
        expect(sent).toEqual([]);
      }),
    { loggedIn: false }
  )
);
