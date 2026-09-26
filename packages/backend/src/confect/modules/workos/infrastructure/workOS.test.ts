import { describe, it } from '@effect/vitest';
import * as EffectVitestUtils from '@effect/vitest/utils';
import { NotFoundException } from '@workos-inc/node';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { vi } from 'vitest';

import * as Application from '../application';
import * as Domain from '../domain';
import { WorkOSClient } from './client';
import { workOSLayerNoDeps } from './workOS';

const makeWorkOSServiceLayer = (userManagement: {
  listUsers?: (...args: unknown[]) => Promise<unknown>;
  createUser?: (...args: unknown[]) => Promise<unknown>;
  getUser?: (...args: unknown[]) => Promise<unknown>;
  deleteUser?: (...args: unknown[]) => Promise<unknown>;
}) =>
  workOSLayerNoDeps.pipe(
    Layer.provide(
      Layer.succeed(
        WorkOSClient,
        WorkOSClient.of({
          use: (fn) =>
            Effect.tryPromise({
              try: async () => (await fn({ userManagement } as never)) as never,
              catch: (cause) =>
                new Domain.WorkOSError({
                  message: 'WorkOS call failed',
                  cause,
                }),
            }),
        })
      )
    )
  );

const notFound = new NotFoundException({
  path: '/user_management/users/user_gone',
  requestID: 'request_test',
});

describe('WorkOSService.users', () => {
  it.effect('finds a user by address regardless of case', () =>
    Effect.gen(function* () {
      const workos = yield* Application.WorkOSService;

      const user = yield* workos.users.getOneByEmail({
        email: 'Rosa@Example.test',
      });

      EffectVitestUtils.strictEqual(user?.id, 'user_rosa');
    }).pipe(
      Effect.provide(
        makeWorkOSServiceLayer({
          listUsers: () =>
            Promise.resolve({
              data: [{ id: 'user_rosa', email: 'rosa@example.test' }],
            }),
        })
      )
    )
  );

  it.effect('reuses the user an address already resolves to', () => {
    const createUser = vi.fn();

    return Effect.gen(function* () {
      const workos = yield* Application.WorkOSService;

      const result = yield* workos.users.createIfNotExists({
        email: 'rosa@example.test',
      });

      EffectVitestUtils.strictEqual(result.outcome, 'existing');
      EffectVitestUtils.strictEqual(createUser.mock.calls.length, 0);
    }).pipe(
      Effect.provide(
        makeWorkOSServiceLayer({
          listUsers: () =>
            Promise.resolve({
              data: [{ id: 'user_rosa', email: 'rosa@example.test' }],
            }),
          createUser,
        })
      )
    );
  });

  it.effect('reuses a user created concurrently after a failed create', () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ id: 'user_rosa', email: 'rosa@example.test' }],
      });

    return Effect.gen(function* () {
      const workos = yield* Application.WorkOSService;

      const result = yield* workos.users.createIfNotExists({
        email: 'rosa@example.test',
      });

      EffectVitestUtils.strictEqual(result.user.id, 'user_rosa');
      EffectVitestUtils.strictEqual(result.outcome, 'existing');
    }).pipe(
      Effect.provide(
        makeWorkOSServiceLayer({
          listUsers,
          createUser: () => Promise.reject(new Error('conflict')),
        })
      )
    );
  });

  it.effect('answers null for a user this environment never had', () =>
    Effect.gen(function* () {
      const workos = yield* Application.WorkOSService;

      const user = yield* workos.users.getOneById({
        externalUserId: 'user_gone',
      });

      EffectVitestUtils.strictEqual(user, null);
    }).pipe(
      Effect.provide(
        makeWorkOSServiceLayer({ getUser: () => Promise.reject(notFound) })
      )
    )
  );

  it.effect('treats deleting an absent user as done', () =>
    Effect.gen(function* () {
      const workos = yield* Application.WorkOSService;

      const result = yield* Effect.result(
        workos.users.deleteById({ externalUserId: 'user_gone' })
      );

      EffectVitestUtils.strictEqual(result._tag, 'Success');
    }).pipe(
      Effect.provide(
        makeWorkOSServiceLayer({ deleteUser: () => Promise.reject(notFound) })
      )
    )
  );
});
