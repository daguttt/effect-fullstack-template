/** Typed client for the Convex Platform API calls the Convex CLI has no command for. */
import * as Config from 'effect/Config';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest';

export { ConvexPlatform, ConvexPlatformError, Deployment };

const PLATFORM_API = 'https://api.convex.dev/v1';

class ConvexPlatformError extends Schema.TaggedError<ConvexPlatformError>()(
  'ConvexPlatformError',
  { message: Schema.String }
) {}

/** What teardown reads of a deployment before it may delete it. */
const Deployment = Schema.Struct({
  name: Schema.NonEmptyString,
  reference: Schema.String,
  // A deployment keeps its reference when it is promoted to production.
  deploymentType: Schema.String,
  // The deployment a project's `dev` selects, as the main checkout's does.
  isDefault: Schema.Boolean,
});
type Deployment = typeof Deployment.Type;

// The Convex CLI saves the login it uses for these same calls here.
const CliLogin = Schema.fromJsonString(
  Schema.Struct({
    accessToken: Schema.RedactedFromValue(Schema.NonEmptyString),
  })
);

class ConvexPlatform extends Context.Service<
  ConvexPlatform,
  {
    /** None when no deployment has that name. */
    readonly findDeployment: (
      name: string
    ) => Effect.Effect<Option.Option<Deployment>, ConvexPlatformError>;
    /** Deletes the deployment with all its data and files. */
    readonly deleteDeployment: (
      name: string
    ) => Effect.Effect<void, ConvexPlatformError>;
  }
>()('@repo/scripts/worktree/ConvexPlatform') {
  static readonly layer = Layer.effect(
    ConvexPlatform,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const client = yield* HttpClient.HttpClient;

      const accessToken = Effect.gen(function* () {
        const home = yield* Config.String('HOME');
        const login = yield* fs.readFileString(
          path.join(home, '.convex', 'config.json')
        );
        return (yield* Schema.decodeEffect(CliLogin)(login)).accessToken;
      }).pipe(
        Effect.mapError(
          () =>
            new ConvexPlatformError({
              message:
                'No Convex login found in ~/.convex/config.json. Run `pnpm exec convex login` and retry.',
            })
        )
      );

      const authorized = client.pipe(
        HttpClient.mapRequestEffect((request) =>
          Effect.map(accessToken, (token) =>
            request.pipe(
              HttpClientRequest.bearerToken(Redacted.value(token)),
              HttpClientRequest.acceptJson
            )
          )
        )
      );

      const findDeployment = Effect.fn('ConvexPlatform.findDeployment')(
        function* (name: string) {
          const response = yield* authorized
            .execute(
              HttpClientRequest.get(`${PLATFORM_API}/deployments/${name}`)
            )
            .pipe(
              Effect.catchTag(
                'HttpClientError',
                () =>
                  new ConvexPlatformError({
                    message: `Could not reach Convex to look up deployment ${name}.`,
                  })
              )
            );
          if (response.status === 404) return Option.none<Deployment>();
          if (response.status !== 200)
            return yield* new ConvexPlatformError({
              message: `Convex refused to look up deployment ${name} (HTTP ${response.status}).`,
            });
          const deployment = yield* response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Deployment)),
            Effect.mapError(
              () =>
                new ConvexPlatformError({
                  message: `Convex returned an unrecognised deployment for ${name}.`,
                })
            )
          );
          return Option.some(deployment);
        }
      );

      const deleteDeployment = Effect.fn('ConvexPlatform.deleteDeployment')(
        function* (name: string) {
          const response = yield* authorized
            .execute(
              HttpClientRequest.post(
                `${PLATFORM_API}/deployments/${name}/delete`
              )
            )
            .pipe(
              Effect.catchTag(
                'HttpClientError',
                () =>
                  new ConvexPlatformError({
                    message: `Could not reach Convex to delete deployment ${name}.`,
                  })
              )
            );
          if (response.status !== 200)
            return yield* new ConvexPlatformError({
              message: `Convex refused to delete deployment ${name} (HTTP ${response.status}).`,
            });
        }
      );

      return ConvexPlatform.of({ findDeployment, deleteDeployment });
    })
  );
}
