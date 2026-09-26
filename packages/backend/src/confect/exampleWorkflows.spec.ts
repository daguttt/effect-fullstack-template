import { FunctionSpec, GroupSpec } from '@confect/core';
import * as Schema from 'effect/Schema';

import { Id } from './_generated/id';
import type {
  exampleWorkflow,
  handleExampleWorkflowComplete,
  startExampleWorkflow,
} from './exampleWorkflows';
import RequireUserIdentity from './middleware/RequireUserIdentity.spec';
import * as ExampleWorkflowsDomain from './modules/exampleWorkflows/domain';

export default GroupSpec.make()
  // -*******************************************************************************-
  // Public
  // -*******************************************************************************-
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'start',
      args: () => ExampleWorkflowsDomain.StartExampleWorkflowDto.fields,
      returns: () => Id('exampleWorkflowRuns'),
      error: () => Schema.Never,
    }).middleware(RequireUserIdentity)
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: 'listMine',
      args: () => ({}),
      returns: () =>
        Schema.Array(ExampleWorkflowsDomain.ExampleWorkflowRunsDocSchema),
      error: () => Schema.Never,
    }).middleware(RequireUserIdentity)
  )
  // -*******************************************************************************-
  // Internal
  // -*******************************************************************************-
  .addFunction(
    FunctionSpec.internalQuery({
      name: 'getRunInput',
      args: () => ({ runId: Id('exampleWorkflowRuns') }),
      returns: () => Schema.String,
      error: () => Schema.Never,
    })
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: 'greet',
      args: () => ({ input: Schema.String }),
      returns: () => Schema.String,
      error: () => ExampleWorkflowsDomain.InputRejectedError,
    })
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: 'terminalizeRun',
      args: () => ({
        runId: Id('exampleWorkflowRuns'),
        outcome: ExampleWorkflowsDomain.ExampleWorkflowOutcome,
      }),
      returns: () => Schema.Null,
      error: () => Schema.Never,
    })
  )
  .addFunction(
    FunctionSpec.convexInternalMutation<typeof startExampleWorkflow>()(
      'startExampleWorkflow'
    )
  )
  .addFunction(
    FunctionSpec.convexInternalMutation<typeof exampleWorkflow>()(
      'exampleWorkflow'
    )
  )
  .addFunction(
    FunctionSpec.convexInternalMutation<typeof handleExampleWorkflowComplete>()(
      'handleExampleWorkflowComplete'
    )
  );
