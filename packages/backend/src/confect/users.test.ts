import { describe, it } from '@effect/vitest';
import * as EffectVitestUtils from '@effect/vitest/utils';
import type { User } from '@workos-inc/node';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';

import refs from './_generated/refs';
import { DatabaseWriter } from './_generated/services';
import * as Authentication from './modules/authentication';
import * as Users from './modules/users';
import * as TestConfect from './test.setup';

const workOSClientId = 'client_test';
const externalUserId = 'user_test';
const userEmail = 'user@example.test';

const makeWorkOSUser = (overrides: Partial<User> = {}): User => ({
  object: 'user',
  id: externalUserId,
  email: userEmail,
  emailVerified: true,
  profilePictureUrl: null,
  name: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  lastSignInAt: '2026-07-01T12:00:00.000Z',
  locale: 'en-US',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
  externalId: null,
  metadata: {},
  ...overrides,
});

const seedUser = Effect.fn('seedUser')(function* (args: {
  externalId: string;
  email: string;
}) {
  const writer = yield* DatabaseWriter;

  return yield* writer.table('users').insert({
    externalId: args.externalId,
    identityTokenIdentifier: `seed|${args.externalId}`,
    email: args.email,
    firstName: 'Seeded',
    lastName: 'User',
    profilePictureUrl: null,
    lastSignInAt: null,
    locale: null,
    externalCreatedAt: 0,
    externalUpdatedAt: 0,
  });
});

describe('users', () => {
  it.effect('creates and updates a user from WorkOS', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;
      const workOSUser = makeWorkOSUser();

      const created = yield* confect.mutation(
        refs.internal.users.upsertFromWorkOS,
        { workosUser: workOSUser }
      );

      EffectVitestUtils.strictEqual(created.externalId, externalUserId);
      EffectVitestUtils.strictEqual(created.email, userEmail);
      EffectVitestUtils.strictEqual(
        created.identityTokenIdentifier,
        `https://api.workos.com/user_management/${workOSClientId}|${externalUserId}`
      );
      EffectVitestUtils.strictEqual(
        created.externalCreatedAt,
        Date.parse(workOSUser.createdAt)
      );
      EffectVitestUtils.strictEqual(
        created.externalUpdatedAt,
        Date.parse(workOSUser.updatedAt)
      );
      EffectVitestUtils.strictEqual(
        created.lastSignInAt,
        Date.parse(workOSUser.lastSignInAt!)
      );

      const updated = yield* confect.mutation(
        refs.internal.users.upsertFromWorkOS,
        {
          workosUser: makeWorkOSUser({
            email: 'updated@example.test',
            firstName: 'Updated',
            updatedAt: '2026-07-02T12:00:00.000Z',
          }),
        }
      );

      EffectVitestUtils.strictEqual(updated._id, created._id);
      EffectVitestUtils.strictEqual(updated.email, 'updated@example.test');
      EffectVitestUtils.strictEqual(updated.firstName, 'Updated');
      EffectVitestUtils.strictEqual(
        updated.externalUpdatedAt,
        Date.parse('2026-07-02T12:00:00.000Z')
      );
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect(
    'stores the Sign-in Email normalized and reconciles by it in any case',
    () =>
      Effect.gen(function* () {
        const confect = yield* TestConfect.TestConfect;

        const created = yield* confect.mutation(
          refs.internal.users.upsertFromWorkOS,
          { workosUser: makeWorkOSUser({ email: ' User@Example.TEST ' }) }
        );

        EffectVitestUtils.strictEqual(created.email, userEmail);

        const reconciled = yield* confect.mutation(
          refs.internal.users.upsertFromWorkOS,
          {
            workosUser: makeWorkOSUser({
              id: 'user_recreated',
              email: 'USER@example.test',
            }),
          }
        );

        EffectVitestUtils.strictEqual(reconciled._id, created._id);
        EffectVitestUtils.strictEqual(reconciled.externalId, 'user_recreated');
        EffectVitestUtils.strictEqual(reconciled.email, userEmail);
      }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('fails when external ID and email resolve to different users', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      yield* confect.run(
        Effect.gen(function* () {
          yield* seedUser({
            externalId: externalUserId,
            email: 'first@example.test',
          });
          yield* seedUser({
            externalId: 'user_other',
            email: userEmail,
          });
        })
      );

      const result = yield* Effect.result(
        confect.mutation(refs.internal.users.upsertFromWorkOS, {
          workosUser: makeWorkOSUser(),
        })
      );

      EffectVitestUtils.assertFailure(
        result,
        new Users.IdentityConflictError({
          externalUserId,
          email: userEmail,
        })
      );
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('soft-deletes the user once', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const created = yield* confect.mutation(
        refs.internal.users.upsertFromWorkOS,
        { workosUser: makeWorkOSUser() }
      );

      const deletedUserId = yield* confect.mutation(
        refs.internal.users.softDeleteByExternalId,
        { externalId: externalUserId }
      );

      EffectVitestUtils.strictEqual(deletedUserId, created._id);

      const deletedUser = yield* confect.query(
        refs.internal.users.getOneByExternalId,
        { externalId: externalUserId }
      );

      EffectVitestUtils.assertTrue(Predicate.isNotNull(deletedUser));
      EffectVitestUtils.assertTrue(
        Predicate.isNotUndefined(deletedUser.deletedAt)
      );

      const repeatedDeletion = yield* confect.mutation(
        refs.internal.users.softDeleteByExternalId,
        { externalId: externalUserId }
      );

      EffectVitestUtils.strictEqual(repeatedDeletion, false);
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('reactivates a soft-deleted user during upsert', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const created = yield* confect.mutation(
        refs.internal.users.upsertFromWorkOS,
        { workosUser: makeWorkOSUser() }
      );

      yield* confect.mutation(refs.internal.users.softDeleteByExternalId, {
        externalId: externalUserId,
      });

      const reactivated = yield* confect.mutation(
        refs.internal.users.upsertFromWorkOS,
        {
          workosUser: makeWorkOSUser({
            firstName: 'Reactivated',
            updatedAt: '2026-07-03T12:00:00.000Z',
          }),
        }
      );

      EffectVitestUtils.strictEqual(reactivated._id, created._id);
      EffectVitestUtils.strictEqual(reactivated.deletedAt, undefined);
      EffectVitestUtils.strictEqual(reactivated.firstName, 'Reactivated');
      EffectVitestUtils.strictEqual(
        reactivated.externalUpdatedAt,
        Date.parse('2026-07-03T12:00:00.000Z')
      );
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('answers the signed-in User through `me`', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const created = yield* confect.mutation(
        refs.internal.users.upsertFromWorkOS,
        { workosUser: makeWorkOSUser() }
      );

      const me = yield* confect
        .withIdentity({
          subject: externalUserId,
          tokenIdentifier: created.identityTokenIdentifier,
        })
        .query(refs.public.users.me, {});

      EffectVitestUtils.strictEqual(me?._id, created._id);
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('rejects an anonymous caller of `me`', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const result = yield* Effect.result(
        confect.query(refs.public.users.me, {})
      );

      EffectVitestUtils.assertFailure(
        result,
        new Authentication.NoUserIdentityFoundError()
      );
    }).pipe(Effect.provide(TestConfect.layer))
  );
});
