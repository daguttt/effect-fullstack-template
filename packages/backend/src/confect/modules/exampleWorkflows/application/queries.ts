import * as Effect from 'effect/Effect';

import type { Id } from '#convex/_generated/dataModel';

import { DatabaseReader } from '../../../_generated/services';

// -*******************************************************************************-
// API
// -*******************************************************************************-

export const getOneRunByIdOrDie = Effect.fn(
  'ExampleWorkflows.getOneRunByIdOrDie'
)(function* (runId: Id<'exampleWorkflowRuns'>) {
  const reader = yield* DatabaseReader;

  return yield* reader
    .table('exampleWorkflowRuns')
    .get(runId)
    .pipe(
      Effect.catchTags({
        GetByIdFailure: Effect.die,
        DocumentDecodeError: Effect.die,
      })
    );
});
