import { Effect, Layer } from 'effect';

import * as Application from '../application';
import * as Domain from '../domain';
import { WorkOSClient, workOSClientLayer } from './client';
import { mapNotFoundEntityError } from './errorMapping';

type WorkOSServiceTestOverrides = {
  users?: Partial<Application.WorkOSService['Service']['users']>;
};

export const makeWorkOSUserFixture = (
  overrides: Partial<Domain.WorkOSUser> = {}
): Domain.WorkOSUser => ({
  object: 'user',
  id: 'user_test',
  email: 'user@example.test',
  emailVerified: false,
  profilePictureUrl: null,
  name: null,
  firstName: null,
  lastName: null,
  lastSignInAt: null,
  locale: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  externalId: null,
  metadata: {},
  ...overrides,
});

export const makeWorkOSTestLayer = (
  overrides: WorkOSServiceTestOverrides = {}
) =>
  Layer.succeed(
    Application.WorkOSService,
    Application.WorkOSService.of({
      users: {
        createIfNotExists:
          overrides.users?.createIfNotExists ??
          ((input) =>
            Effect.succeed({
              user: makeWorkOSUserFixture({
                id: input.externalId ?? 'user_test',
                email: input.email,
                emailVerified: input.emailVerified ?? false,
                firstName: input.firstName ?? null,
                lastName: input.lastName ?? null,
                externalId: input.externalId ?? null,
              }),
              outcome: 'existing' as const,
            })),
        getOneById: overrides.users?.getOneById ?? (() => Effect.succeed(null)),
        getOneByEmail:
          overrides.users?.getOneByEmail ?? (() => Effect.succeed(null)),
        deleteById: overrides.users?.deleteById ?? (() => Effect.void),
      },
    })
  );

export const workOSLayerNoDeps = Layer.effect(
  Application.WorkOSService,
  Effect.gen(function* () {
    const workos = yield* WorkOSClient;

    const getOneUserByEmail = Effect.fn('WorkOSService.getOneUserByEmail')(
      function* (email: string) {
        const users = yield* workos.use((client) =>
          client.userManagement.listUsers({ email })
        );
        const normalizedEmail = email.toLowerCase();

        return (
          users.data.find(
            (user) => user.email.toLowerCase() === normalizedEmail
          ) ?? null
        );
      }
    );

    return Application.WorkOSService.of({
      users: {
        createIfNotExists: Effect.fn(
          'WorkOSService.users.createUserIfNotExists'
        )(function* (input: Application.CreateExternalUserDto) {
          const existingUser = yield* getOneUserByEmail(input.email);

          if (existingUser)
            return {
              user: existingUser,
              outcome: 'existing' as const,
            };

          const createdUser = yield* workos
            .use((client) =>
              client.userManagement.createUser({
                email: input.email,
                emailVerified: input.emailVerified,
                firstName: input.firstName ?? undefined,
                lastName: input.lastName ?? undefined,
                externalId: input.externalId,
                password: input.password,
              })
            )
            .pipe(
              Effect.map((createdUser) => ({
                outcome: 'created' as const,
                user: createdUser,
              })),
              Effect.catch((createError) =>
                getOneUserByEmail(input.email).pipe(
                  Effect.flatMap((concurrentlyCreatedUser) =>
                    concurrentlyCreatedUser
                      ? Effect.succeed({
                          outcome: 'reused-after-race' as const,
                          user: concurrentlyCreatedUser,
                        })
                      : Effect.fail(createError)
                  )
                )
              )
            );

          return {
            user: createdUser.user,
            outcome:
              createdUser.outcome === 'created'
                ? ('created' as const)
                : ('existing' as const),
          };
        }),
        getOneById: Effect.fn('WorkOSService.users.getOneById')(
          function* (args) {
            return yield* workos
              .use((client) =>
                client.userManagement.getUser(args.externalUserId)
              )
              .pipe(
                mapNotFoundEntityError('user'),
                Effect.catchTag('WorkOSNotFoundEntity', () =>
                  Effect.succeed(null)
                )
              );
          }
        ),
        getOneByEmail: Effect.fn('WorkOSService.users.getOneByEmail')(
          function* (args) {
            return yield* getOneUserByEmail(args.email);
          }
        ),
        deleteById: Effect.fn('WorkOSService.users.deleteById')(
          function* (args) {
            yield* workos
              .use((client) =>
                client.userManagement.deleteUser(args.externalUserId)
              )
              .pipe(
                mapNotFoundEntityError('user'),
                Effect.catchTag('WorkOSNotFoundEntity', () => Effect.void)
              );
          }
        ),
      },
    });
  })
);

export const workOSLayer = workOSLayerNoDeps.pipe(
  Layer.provide(workOSClientLayer)
);
