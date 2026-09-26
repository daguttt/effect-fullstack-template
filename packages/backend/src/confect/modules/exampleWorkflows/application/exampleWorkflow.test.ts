import type { WorkflowCtx } from '@convex-dev/workflow';
import * as Effect from 'effect/Effect';
import { describe, expect, it, vi } from 'vitest';

import type { Id } from '#convex/_generated/dataModel';

import { exampleWorkflow } from './exampleWorkflow';

const runId = 'run_1' as Id<'exampleWorkflowRuns'>;

const makeWorkflowCtx = (overrides: Partial<WorkflowCtx> = {}): WorkflowCtx =>
  ({
    workflowId: 'workflow_1',
    runQuery: vi.fn(async () => 'World'),
    runMutation: vi.fn(),
    runAction: vi.fn(async () => 'Hello, World!'),
    ...overrides,
  }) as unknown as WorkflowCtx;

describe('exampleWorkflow', () => {
  it('reads the durable input before greeting with it', async () => {
    const step = makeWorkflowCtx();

    const result = await Effect.runPromise(exampleWorkflow(step, { runId }));

    expect(result).toBe('Hello, World!');
    // oxlint-disable-next-line typescript/unbound-method -- The mock reference is asserted on, never invoked, so `this` is never rebound.
    expect(step.runQuery).toHaveBeenCalledWith(
      expect.anything(),
      { runId },
      undefined
    );
    // oxlint-disable-next-line typescript/unbound-method -- The mock reference is asserted on, never invoked, so `this` is never rebound.
    expect(step.runAction).toHaveBeenCalledWith(
      expect.anything(),
      { input: 'World' },
      undefined
    );
  });
});
