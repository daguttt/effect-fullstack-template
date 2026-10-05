import type { WorkflowCtx } from '@convex-dev/workflow';
import { type Infer, v } from 'convex/values';
import * as Effect from 'effect/Effect';

import refs from '../../../_generated/refs';
import * as WorkflowsApplication from '../../workflows/application';
import type * as Domain from '../domain';

const RunExampleWorkflowDto = {
  runId: v.id('exampleWorkflowRuns'),
};

const vRunExampleWorkflowDto = v.object(RunExampleWorkflowDto);
type RunExampleWorkflowDto = Infer<typeof vRunExampleWorkflowDto>;

export { RunExampleWorkflowDto };

/**
 * Each `workflowRunner` call is a journaled step: a restarted workflow replays
 * completed steps from the journal instead of running them again.
 */
export const exampleWorkflow = Effect.fn('exampleWorkflow')(function* (
  step: WorkflowCtx,
  args: RunExampleWorkflowDto
): Effect.fn.Return<string, Domain.ExampleWorkflowError> {
  const workflowRunner = WorkflowsApplication.makeConfectWorkflowRunner(step);

  const input = yield* workflowRunner
    .runQuery(refs.internal.exampleWorkflows.getRunInput, {
      runId: args.runId,
    })
    .pipe(Effect.catchTag('SchemaError', Effect.die));

  // `onComplete` persists the returned output, so the body stays read-only.
  return yield* workflowRunner
    .runAction(refs.internal.exampleWorkflows.greet, { input })
    .pipe(Effect.catchTag('SchemaError', Effect.die));
});
