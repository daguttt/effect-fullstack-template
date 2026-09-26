import * as Match from 'effect/Match';
import * as Struct from 'effect/Struct';

import type { ExampleWorkflowRunsDoc } from '../../../_generated/docs';
import type {
  ExampleWorkflowRun,
  TerminalExampleWorkflowOutcome,
} from './models';

type InProgressExampleWorkflowRunDoc = Extract<
  ExampleWorkflowRunsDoc,
  { status: 'inProgress' }
>;

/** Preserves all base fields while replacing the run state. */
export function toTerminalExampleWorkflowRun(args: {
  run: InProgressExampleWorkflowRunDoc;
  outcome: TerminalExampleWorkflowOutcome;
  now: number;
}): ExampleWorkflowRun {
  const baseRun = Struct.omit(args.run, ['_id', '_creationTime', 'status']);

  return Match.value(args.outcome).pipe(
    Match.when(
      { type: 'completed' },
      (outcome) =>
        ({
          ...baseRun,
          status: 'completed',
          completedAt: args.now,
          output: outcome.output,
        }) as const
    ),
    Match.when(
      { type: 'failed' },
      (outcome) =>
        ({
          ...baseRun,
          status: 'failed',
          failedAt: args.now,
          errorTag: outcome.errorTag,
          serializedRawWorkflowError: outcome.serializedRawWorkflowError,
        }) as const
    ),
    Match.exhaustive
  );
}
