import { FunctionSpec, GroupSpec } from '@confect/core';
import * as Schema from 'effect/Schema';

export default GroupSpec.make()
  // -*******************************************************************************-
  // Internal
  // -*******************************************************************************-
  .addFunction(
    /** Idempotent: `pnpm setup:worktree` runs it on every setup. */
    FunctionSpec.internalAction({
      name: 'seed',
      args: () => ({}),
      returns: () => Schema.Null,
      error: () => Schema.Never,
    })
  );
