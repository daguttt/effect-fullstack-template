import { FunctionSpec, Ref } from '@confect/core';
import type { WorkflowCtx } from '@convex-dev/workflow';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import * as Domain from '../domain';
import { makeConfectWorkflowRunner } from './runner';

const queryRef = Ref.make(
  'tests/workflows',
  FunctionSpec.internalQuery({
    name: 'query',
    args: () => ({ requestedAt: Schema.DateFromString }),
    returns: () => Schema.DateFromString,
    error: () => Schema.Never,
  })
);

const mutationRef = Ref.make(
  'tests/workflows',
  FunctionSpec.internalMutation({
    name: 'mutation',
    args: () => ({ requestedAt: Schema.DateFromString }),
    returns: () => Schema.DateFromString,
    error: () => Schema.Never,
  })
);

const actionRef = Ref.make(
  'tests/workflows',
  FunctionSpec.internalAction({
    name: 'action',
    args: () => ({ requestedAt: Schema.DateFromString }),
    returns: () => Schema.DateFromString,
    error: () => Schema.Never,
  })
);

// oxlint-disable-next-line effecttsgo/global-date -- A fixed literal used as test data, not a clock read.
const requestedAt = new Date('2026-07-23T12:34:56.000Z');
const encodedRequestedAt = requestedAt.toISOString();

type IsAny<A> = 0 extends 1 & A ? true : false;

const makeWorkflowCtx = (overrides: Partial<WorkflowCtx> = {}): WorkflowCtx =>
  ({
    workflowId: 'workflow-id',
    runQuery: vi.fn(async () => encodedRequestedAt),
    runMutation: vi.fn(async () => encodedRequestedAt),
    runAction: vi.fn(async () => encodedRequestedAt),
    ...overrides,
  }) as unknown as WorkflowCtx;

describe('makeConfectRunner', () => {
  it('forwards encoded query args/options and decodes transformed returns', async () => {
    const step = makeWorkflowCtx();
    const options = { inline: true, name: 'transformed-query' } as const;
    const effect = makeConfectWorkflowRunner(step).runQuery(
      queryRef,
      { requestedAt },
      options
    );

    expectTypeOf<IsAny<Ref.Returns<typeof queryRef>>>().toEqualTypeOf<false>();
    expectTypeOf<Ref.Error<typeof queryRef>>().toEqualTypeOf<never>();
    expectTypeOf<Effect.Success<typeof effect>>().toEqualTypeOf<Date>();

    await expect(Effect.runPromise(effect)).resolves.toEqual(requestedAt);
    // oxlint-disable-next-line typescript/unbound-method -- The mock reference is asserted on, never invoked, so `this` is never rebound.
    expect(step.runQuery).toHaveBeenCalledWith(
      expect.anything(),
      { requestedAt: encodedRequestedAt },
      options
    );
  });

  it('forwards encoded mutation args/options and decodes transformed returns', async () => {
    const step = makeWorkflowCtx();
    const options = { inline: true, name: 'transformed-mutation' } as const;
    const effect = makeConfectWorkflowRunner(step).runMutation(
      mutationRef,
      { requestedAt },
      options
    );

    expectTypeOf<
      IsAny<Ref.Returns<typeof mutationRef>>
    >().toEqualTypeOf<false>();
    expectTypeOf<Effect.Success<typeof effect>>().toEqualTypeOf<Date>();

    await expect(Effect.runPromise(effect)).resolves.toEqual(requestedAt);
    // oxlint-disable-next-line typescript/unbound-method -- The mock reference is asserted on, never invoked, so `this` is never rebound.
    expect(step.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      { requestedAt: encodedRequestedAt },
      options
    );
  });

  it('forwards encoded action args/options and decodes transformed returns', async () => {
    const step = makeWorkflowCtx();
    const options = { name: 'transformed-action', retry: true } as const;
    const effect = makeConfectWorkflowRunner(step).runAction(
      actionRef,
      { requestedAt },
      options
    );

    expectTypeOf<IsAny<Ref.Returns<typeof actionRef>>>().toEqualTypeOf<false>();
    expectTypeOf<Effect.Success<typeof effect>>().toEqualTypeOf<Date>();

    await expect(Effect.runPromise(effect)).resolves.toEqual(requestedAt);
    // oxlint-disable-next-line typescript/unbound-method -- The mock reference is asserted on, never invoked, so `this` is never rebound.
    expect(step.runAction).toHaveBeenCalledWith(
      expect.anything(),
      { requestedAt: encodedRequestedAt },
      options
    );
  });

  it('maps unknown failures to the shared workflow error by default', async () => {
    const step = makeWorkflowCtx({
      runQuery: vi.fn(async () => {
        throw new Error('workflow step failed');
      }) as WorkflowCtx['runQuery'],
    });
    const effect = makeConfectWorkflowRunner(step).runQuery(queryRef, {
      requestedAt,
    });

    const error = await Effect.runPromise(Effect.flip(effect));

    expect(error).toEqual(
      new Domain.UnknownError({
        rawWorkflowError: 'Error: workflow step failed',
      })
    );
  });

  it('preserves the precise custom unknown-error mapper type', async () => {
    const step = makeWorkflowCtx({
      runQuery: vi.fn(async () => {
        throw new Error('workflow step failed');
      }) as WorkflowCtx['runQuery'],
    });
    const mapUnknownError = (error: unknown) =>
      ({ _tag: 'CustomWorkflowError', error }) as const;

    // @ts-expect-error A custom error type requires a corresponding mapper.
    makeConfectWorkflowRunner<ReturnType<typeof mapUnknownError>>(step);

    const effect = makeConfectWorkflowRunner(step, mapUnknownError).runQuery(
      queryRef,
      {
        requestedAt,
      }
    );

    expectTypeOf<Effect.Error<typeof effect>>().toEqualTypeOf<
      | Schema.SchemaError
      | {
          readonly _tag: 'CustomWorkflowError';
          readonly error: unknown;
        }
    >();

    const error = await Effect.runPromise(Effect.flip(effect));
    expect(error).toMatchObject({ _tag: 'CustomWorkflowError' });
  });
});
