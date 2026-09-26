import { WorkOS as WorkOSWorkerClient } from '@workos-inc/node/worker';
import { Config, ConfigProvider, Context, Effect, Layer } from 'effect';

import { env } from '#convex/_generated/server';

import * as Domain from '../domain';

type ConstructorArgs<T extends new (...args: any) => any> = T extends new (
  ...args: infer A
) => infer _R
  ? A
  : never;

type WorkOSWorkerClientArgs = ConstructorArgs<typeof WorkOSWorkerClient>[0];

const convexEnvConfigLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    WORKOS_API_KEY: env.WORKOS_API_KEY,
  })
);

export class WorkOSClient extends Context.Service<
  WorkOSClient,
  {
    readonly use: <T>(
      fn: (client: WorkOSWorkerClient) => T
    ) => Effect.Effect<Awaited<T>, Domain.WorkOSError>;
  }
>()('@repo/backend/confect/modules/workos/infrastructure/WorkOSClient', {
  make: (clientArgs: WorkOSWorkerClientArgs) =>
    Effect.gen(function* () {
      const client = yield* Effect.try({
        try: () => new WorkOSWorkerClient(clientArgs),
        catch: (error) =>
          new Domain.WorkOSError({
            message: 'Error initilizating the WorkOS client',
            cause: error,
          }),
      });

      const use = Effect.fn('WorkOSClient.use')(function* <T>(
        fn: (client: WorkOSWorkerClient) => T
      ) {
        const result = yield* Effect.try({
          try: () => fn(client),
          catch: (error) =>
            new Domain.WorkOSError({
              message: 'Synchronous error in WorkOSClient.use',
              cause: error,
            }),
        });

        return yield* Effect.tryPromise({
          try: () => Promise.resolve(result),
          catch: (error) =>
            new Domain.WorkOSError({
              cause: error,
              message: 'Asynchronous error in `WorkOSClient.use`',
            }),
        });
      });

      return {
        use,
      } as const;
    }),
}) {}

const workOSClientLayerNoDeps = Layer.unwrap(
  Effect.gen(function* () {
    const apiKey = yield* Config.String('WORKOS_API_KEY');

    return Layer.effect(WorkOSClient, WorkOSClient.make({ apiKey }));
  })
);

export const workOSClientLayer = workOSClientLayerNoDeps.pipe(
  Layer.provide(convexEnvConfigLayer)
);
