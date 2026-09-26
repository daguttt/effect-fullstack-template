import * as SystemFields from '@confect/core/SystemFields';
import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';

import * as WorkflowsDomain from '../../workflows/domain';
import { InputRejectedError } from './errors';

export const INPUT_MAX_LENGTH = 120;

/** The input the example workflow rejects, so the failure path is easy to exercise. */
export const REJECTED_INPUT = 'fail';

export const ExampleWorkflowError = Schema.Union([
  InputRejectedError,
  WorkflowsDomain.UnknownError,
]).pipe(Schema.toTaggedUnion('_tag'));

export type ExampleWorkflowError = typeof ExampleWorkflowError.Type;

export const ExampleWorkflowErrorTag = Schema.Literals(
  Struct.keys(ExampleWorkflowError.cases)
);

export type ExampleWorkflowErrorTag = typeof ExampleWorkflowErrorTag.Type;

const ExampleWorkflowRunBase = Schema.Struct({
  /** The `tokenIdentifier` of the identity that started the run. */
  requestedBy: Schema.String,
  input: Schema.String,
  workflowId: Schema.optional(Schema.String),
});

const InProgressExampleWorkflowRun = Schema.Struct({
  ...ExampleWorkflowRunBase.fields,
  status: Schema.Literal('inProgress'),
});

const CompletedExampleWorkflowRun = Schema.Struct({
  ...ExampleWorkflowRunBase.fields,
  status: Schema.Literal('completed'),
  completedAt: Schema.Finite,
  output: Schema.String,
});

const FailedExampleWorkflowRun = Schema.Struct({
  ...ExampleWorkflowRunBase.fields,
  status: Schema.Literal('failed'),
  failedAt: Schema.Finite,
  errorTag: ExampleWorkflowErrorTag,
  serializedRawWorkflowError: Schema.String,
});

export const ExampleWorkflowRunsTableSchema = Schema.Union([
  InProgressExampleWorkflowRun,
  CompletedExampleWorkflowRun,
  FailedExampleWorkflowRun,
]);

export type ExampleWorkflowRun = typeof ExampleWorkflowRunsTableSchema.Type;

export const ExampleWorkflowRunsDocSchema = SystemFields.extendWithSystemFields(
  'exampleWorkflowRuns',
  ExampleWorkflowRunsTableSchema
);

export const StartExampleWorkflowDto = Schema.Struct({
  input: Schema.Trim.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(INPUT_MAX_LENGTH)
  ),
});

export type StartExampleWorkflowDto = typeof StartExampleWorkflowDto.Type;

/** What the workflow component reports to `onComplete`, before classification. */
export const ExampleWorkflowOutcome = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('completed'),
    output: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('failed'),
    serializedRawWorkflowError: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal('canceled') }),
]);

export type ExampleWorkflowOutcome = typeof ExampleWorkflowOutcome.Type;

export type TerminalExampleWorkflowOutcome =
  | ({ readonly type: 'completed' } & Pick<
      typeof CompletedExampleWorkflowRun.Type,
      'output'
    >)
  | ({ readonly type: 'failed' } & Pick<
      typeof FailedExampleWorkflowRun.Type,
      'errorTag' | 'serializedRawWorkflowError'
    >);
