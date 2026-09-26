import { FunctionImpl, GroupImpl } from '@confect/server';
import * as Layer from 'effect/Layer';

import databaseSchema from './_generated/schema';
import { authKitEvent } from './workosAuth';
import workosAuth from './workosAuth.spec';

// -*******************************************************************************-
// Public
// -*******************************************************************************-

const authKitEventImpl = FunctionImpl.make(
  databaseSchema,
  workosAuth,
  'authKitEvent',
  authKitEvent
);

// -*******************************************************************************-
// API
// -*******************************************************************************-

export default GroupImpl.make(databaseSchema, workosAuth).pipe(
  Layer.provide(authKitEventImpl),
  GroupImpl.finalize
);
