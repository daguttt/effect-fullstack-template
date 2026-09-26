import * as Match from 'effect/Match';

import * as WorkflowsPresentation from '../../workflows/presentation';
import * as Domain from '../domain';

/** Distinguishes cancellation from an unknown failure with an empty message. */
const CANCELED_EXAMPLE_WORKFLOW = 'The example workflow was canceled';

export function toTerminalExampleWorkflowOutcome(
  outcome: Domain.ExampleWorkflowOutcome
): Domain.TerminalExampleWorkflowOutcome {
  return Match.value(outcome).pipe(
    Match.when(
      { type: 'completed' },
      (completed) => ({ type: 'completed', output: completed.output }) as const
    ),
    Match.when(
      { type: 'failed' },
      (failed) =>
        ({
          type: 'failed',
          errorTag: WorkflowsPresentation.classifyWorkflowError({
            cases: Domain.ExampleWorkflowError.cases,
            serializedError: failed.serializedRawWorkflowError,
          }),
          serializedRawWorkflowError: failed.serializedRawWorkflowError,
        }) as const
    ),
    Match.when(
      { type: 'canceled' },
      () =>
        ({
          type: 'failed',
          errorTag: 'Workflows/UnknownError',
          serializedRawWorkflowError: CANCELED_EXAMPLE_WORKFLOW,
        }) as const
    ),
    Match.exhaustive
  );
}
