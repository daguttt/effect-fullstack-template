import { FunctionSpec, GroupSpec } from '@confect/core';

import type { authKitEvent } from './workosAuth';

export default GroupSpec.make()
  // -*******************************************************************************-
  // Internal
  // -*******************************************************************************-
  .addFunction(
    FunctionSpec.convexInternalMutation<typeof authKitEvent>()('authKitEvent')
  );
