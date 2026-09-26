import { FunctionImpl, GroupImpl } from '@confect/server';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import databaseSchema from './_generated/schema';
import developmentSeederSpec from './developmentSeeder.spec';
import * as DevelopmentSeeder from './modules/developmentSeeder';
import * as WorkOS from './modules/workos';

// -*******************************************************************************-
// Internal
// -*******************************************************************************-

const seedImpl = FunctionImpl.make(
  databaseSchema,
  developmentSeederSpec,
  'seed',
  () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('Seeding development accounts', {
        accountCount: DevelopmentSeeder.DEVELOPMENT_ACCOUNTS.length,
      });

      yield* Effect.forEach(
        DevelopmentSeeder.DEVELOPMENT_ACCOUNTS,
        DevelopmentSeeder.createDevelopmentAccount,
        { concurrency: 'unbounded', discard: true }
      );

      yield* Effect.logInfo('Development accounts seeded');

      return null;
    }).pipe(Effect.provide(WorkOS.workOSLayer), Effect.orDie)
);

// -*******************************************************************************-
// API
// -*******************************************************************************-

export default GroupImpl.make(databaseSchema, developmentSeederSpec).pipe(
  Layer.provide(seedImpl),
  GroupImpl.finalize
);
