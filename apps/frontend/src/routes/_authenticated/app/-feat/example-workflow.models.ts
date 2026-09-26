import type * as Ref from '@confect/core/Ref';
import * as Match from 'effect/Match';
import * as Schema from 'effect/Schema';

import type refs from '@repo/backend/refs';
import * as ExampleWorkflowsShared from '@repo/backend/shared/exampleWorkflows';

export type ExampleWorkflowRun = Ref.Returns<
  typeof refs.public.exampleWorkflows.listMine
>[number];

/** Validates with the backend's own payload schema, so both sides agree. */
export const StartExampleWorkflowFormStandardSchema = Schema.toStandardSchemaV1(
  ExampleWorkflowsShared.StartExampleWorkflowDto
);

export const EXAMPLE_INPUT_MAX_LENGTH = ExampleWorkflowsShared.INPUT_MAX_LENGTH;
export const EXAMPLE_REJECTED_INPUT = ExampleWorkflowsShared.REJECTED_INPUT;

export function deriveFailureMessage(
  errorTag: ExampleWorkflowsShared.ExampleWorkflowErrorTag
): string {
  return Match.value(errorTag).pipe(
    Match.when(
      'ExampleWorkflows/InputRejectedError',
      () => 'The greeting step rejected this input.'
    ),
    Match.when(
      'Workflows/UnknownError',
      () => 'The workflow failed unexpectedly.'
    ),
    Match.exhaustive
  );
}
