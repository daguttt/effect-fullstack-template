import { WorkflowManager } from '@convex-dev/workflow';

import { components } from '../../../_generated/components';

export const workflowManager = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 100,
      base: 2,
    },
    retryActionsByDefault: true,
    maxParallelism: 10,
  },
});
