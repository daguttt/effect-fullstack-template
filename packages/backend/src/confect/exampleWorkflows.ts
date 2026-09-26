import { vResultValidator, vWorkflowId } from '@convex-dev/workflow';
import { v } from 'convex/values';
import * as Effect from 'effect/Effect';
import * as Match from 'effect/Match';

import { internal } from '#convex/_generated/api';
import { internalMutation } from '#convex/_generated/server';

import * as ConvexInterop from './modules/convexInterop';
import * as ExampleWorkflows from './modules/exampleWorkflows';
import * as Workflows from './modules/workflows';

export const exampleWorkflow = Workflows.workflowManager
  .define({
    args: ExampleWorkflows.ExampleWorkflowDto,
    returns: v.string(),
  })
  .handler(async (step, args): Promise<string> => {
    const workflow = ExampleWorkflows.exampleWorkflow(step, args);

    return await Effect.runPromise(
      workflow.pipe(
        Effect.catchTags({
          'ExampleWorkflows/InputRejectedError':
            ConvexInterop.dieWithConvexError(
              ExampleWorkflows.InputRejectedError
            ),
          'Workflows/UnknownError': ConvexInterop.dieWithConvexError(
            Workflows.UnknownError
          ),
        })
      )
    );
  });

/** Kept outside Confect to avoid a self-referential codegen type cycle. */
export const startExampleWorkflow = internalMutation({
  args: { runId: v.id('exampleWorkflowRuns') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const workflowId = await Workflows.workflowManager.start(
      ctx,
      internal.exampleWorkflows.exampleWorkflow,
      { runId: args.runId },
      {
        startAsync: true,
        onComplete: internal.exampleWorkflows.handleExampleWorkflowComplete,
        context: { runId: args.runId },
      }
    );

    await ctx.db.patch('exampleWorkflowRuns', args.runId, { workflowId });

    return null;
  },
});

/**
 * `@convex-dev/workflow` records a throwing `onComplete` in its
 * `onCompleteFailures` table and does not retry it, so a run whose
 * terminalization fails stays `inProgress` over a terminal workflow.
 */
export const handleExampleWorkflowComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id('exampleWorkflowRuns') }),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const outcome: ExampleWorkflows.ExampleWorkflowOutcome = Match.value(
      args.result
    ).pipe(
      Match.when(
        { kind: 'success' },
        (result) =>
          ({
            type: 'completed',
            output: result.returnValue as string,
          }) as const
      ),
      Match.when(
        { kind: 'failed' },
        (result) =>
          ({
            type: 'failed',
            serializedRawWorkflowError: result.error,
          }) as const
      ),
      Match.when({ kind: 'canceled' }, () => ({ type: 'canceled' }) as const),
      Match.exhaustive
    );

    await ctx.runMutation(internal.exampleWorkflows.terminalizeRun, {
      runId: args.context.runId,
      outcome,
    });

    return null;
  },
});
