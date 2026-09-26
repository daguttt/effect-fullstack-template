import { Ref } from '@confect/core';
import type { WorkflowCtx } from '@convex-dev/workflow';
import type * as Effect from 'effect/Effect';
import type * as Schema from 'effect/Schema';

import * as Domain from '../domain';

type QueryOptions = NonNullable<Parameters<WorkflowCtx['runQuery']>[2]>;
type MutationOptions = NonNullable<Parameters<WorkflowCtx['runMutation']>[2]>;
type ActionOptions = NonNullable<Parameters<WorkflowCtx['runAction']>[2]>;

/** Normalizes Confect's erased error marker for refs without a declared error. */
type RefError<R> = 0 extends 1 & Ref.Error<R>
  ? never
  : Exclude<Ref.Error<R>, undefined>;

export interface ConfectRunner<E> {
  readonly runQuery: <R extends Ref.AnyQuery>(
    ref: R,
    args: Ref.Args<R>,
    options?: QueryOptions
  ) => Effect.Effect<Ref.Returns<R>, RefError<R> | E | Schema.SchemaError>;
  readonly runMutation: <R extends Ref.AnyMutation>(
    ref: R,
    args: Ref.Args<R>,
    options?: MutationOptions
  ) => Effect.Effect<Ref.Returns<R>, RefError<R> | E | Schema.SchemaError>;
  readonly runAction: <R extends Ref.AnyAction>(
    ref: R,
    args: Ref.Args<R>,
    options?: ActionOptions
  ) => Effect.Effect<Ref.Returns<R>, RefError<R> | E | Schema.SchemaError>;
}

export function makeConfectWorkflowRunner(
  step: WorkflowCtx
): ConfectRunner<Domain.UnknownError>;
export function makeConfectWorkflowRunner<E>(
  step: WorkflowCtx,
  mapUnknownWorkflowError: (error: unknown) => E
): ConfectRunner<E>;
export function makeConfectWorkflowRunner<E>(
  step: WorkflowCtx,
  mapUnknownWorkflowError: (
    error: unknown
  ) => E | Domain.UnknownError = Domain.mapUnknownError
): ConfectRunner<E | Domain.UnknownError> {
  return {
    runQuery: (ref, args, options) =>
      Ref.runWithCodec(
        ref,
        args,
        (functionReference, encodedArgs) =>
          step.runQuery(functionReference, encodedArgs, options),
        mapUnknownWorkflowError
      ),
    runMutation: (ref, args, options) =>
      Ref.runWithCodec(
        ref,
        args,
        (functionReference, encodedArgs) =>
          step.runMutation(functionReference, encodedArgs, options),
        mapUnknownWorkflowError
      ),
    runAction: (ref, args, options) =>
      Ref.runWithCodec(
        ref,
        args,
        (functionReference, encodedArgs) =>
          step.runAction(functionReference, encodedArgs, options),
        mapUnknownWorkflowError
      ),
  };
}
