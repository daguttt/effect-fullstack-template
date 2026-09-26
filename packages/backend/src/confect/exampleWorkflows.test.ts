import type { WorkflowId } from '@convex-dev/workflow';
import { describe, it } from '@effect/vitest';
import * as EffectVitestUtils from '@effect/vitest/utils';
import * as Effect from 'effect/Effect';
import * as Match from 'effect/Match';

import type { ExampleWorkflowRunsDoc } from './_generated/docs';
import { Id as IdSchema } from './_generated/id';
import refs from './_generated/refs';
import { DatabaseWriter } from './_generated/services';
import * as Authentication from './modules/authentication';
import * as ExampleWorkflows from './modules/exampleWorkflows';
import * as TestConfect from './test.setup';

const workflowId = 'workflow_1' as WorkflowId;
const identity = {
  subject: 'user_test',
  tokenIdentifier:
    'https://api.workos.com/user_management/client_test|user_test',
};

const seedInProgressRun = Effect.fn('seedInProgressRun')(function* (
  args: { requestedBy?: string; input?: string } = {}
) {
  const writer = yield* DatabaseWriter;

  return yield* writer.table('exampleWorkflowRuns').insert({
    requestedBy: args.requestedBy ?? identity.tokenIdentifier,
    input: args.input ?? 'World',
    status: 'inProgress',
  });
});

/** Flattens a run's terminal payload so assertions read one shape. */
const summarizeRun = (run: ExampleWorkflowRunsDoc) =>
  Match.value(run).pipe(
    Match.when({ status: 'inProgress' }, () => ({
      status: 'inProgress',
      detail: null,
    })),
    Match.when({ status: 'completed' }, (completed) => ({
      status: 'completed',
      detail: completed.output,
    })),
    Match.when({ status: 'failed' }, (failed) => ({
      status: 'failed',
      detail: failed.errorTag,
    })),
    Match.exhaustive
  );

describe('exampleWorkflows', () => {
  it.effect('greets through the action a workflow step calls', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const output = yield* confect.action(
        refs.internal.exampleWorkflows.greet,
        { input: 'World' }
      );

      EffectVitestUtils.strictEqual(output, 'Hello, World!');
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('fails the action with a typed error for the rejected input', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const result = yield* Effect.result(
        confect.action(refs.internal.exampleWorkflows.greet, {
          input: ExampleWorkflows.REJECTED_INPUT,
        })
      );

      EffectVitestUtils.assertFailure(
        result,
        new ExampleWorkflows.InputRejectedError({
          input: ExampleWorkflows.REJECTED_INPUT,
        })
      );
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('terminalizes each workflow outcome once', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const [completedRunId, failedRunId, canceledRunId] = yield* Effect.all(
        [
          confect.run(seedInProgressRun(), IdSchema('exampleWorkflowRuns')),
          confect.run(seedInProgressRun(), IdSchema('exampleWorkflowRuns')),
          confect.run(seedInProgressRun(), IdSchema('exampleWorkflowRuns')),
        ],
        { concurrency: 'unbounded' }
      );

      const serializedRawWorkflowError =
        '{"_tag":"Workflows/UnknownError","rawWorkflowError":"Uncaught ConvexError: {\\"_tag\\":\\"ExampleWorkflows/InputRejectedError\\",\\"input\\":\\"fail\\"}"}';

      yield* confect.mutation(
        refs.internal.exampleWorkflows.handleExampleWorkflowComplete,
        {
          workflowId,
          result: { kind: 'success', returnValue: 'Hello, World!' },
          context: { runId: completedRunId },
        }
      );
      yield* confect.mutation(
        refs.internal.exampleWorkflows.handleExampleWorkflowComplete,
        {
          workflowId,
          result: { kind: 'failed', error: serializedRawWorkflowError },
          context: { runId: failedRunId },
        }
      );
      yield* confect.mutation(
        refs.internal.exampleWorkflows.handleExampleWorkflowComplete,
        {
          workflowId,
          result: { kind: 'canceled' },
          context: { runId: canceledRunId },
        }
      );
      // A replayed completion must not overwrite the first terminal outcome.
      yield* confect.mutation(
        refs.internal.exampleWorkflows.handleExampleWorkflowComplete,
        {
          workflowId,
          result: { kind: 'canceled' },
          context: { runId: completedRunId },
        }
      );

      const runs = yield* confect
        .withIdentity(identity)
        .query(refs.public.exampleWorkflows.listMine, {});
      const summaries = new Map(
        runs.map((run) => [run._id, summarizeRun(run)] as const)
      );

      EffectVitestUtils.deepStrictEqual(summaries.get(completedRunId), {
        status: 'completed',
        detail: 'Hello, World!',
      });
      EffectVitestUtils.deepStrictEqual(summaries.get(failedRunId), {
        status: 'failed',
        detail: 'ExampleWorkflows/InputRejectedError',
      });
      EffectVitestUtils.deepStrictEqual(summaries.get(canceledRunId), {
        status: 'failed',
        detail: 'Workflows/UnknownError',
      });
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('lists only the runs the caller started', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const ownRunId = yield* confect.run(
        seedInProgressRun(),
        IdSchema('exampleWorkflowRuns')
      );
      yield* confect.run(
        seedInProgressRun({ requestedBy: 'someone-else' }),
        IdSchema('exampleWorkflowRuns')
      );

      const runs = yield* confect
        .withIdentity(identity)
        .query(refs.public.exampleWorkflows.listMine, {});

      EffectVitestUtils.deepStrictEqual(
        runs.map((run) => run._id),
        [ownRunId]
      );
    }).pipe(Effect.provide(TestConfect.layer))
  );

  it.effect('rejects an anonymous caller', () =>
    Effect.gen(function* () {
      const confect = yield* TestConfect.TestConfect;

      const result = yield* Effect.result(
        confect.mutation(refs.public.exampleWorkflows.start, { input: 'World' })
      );

      EffectVitestUtils.assertFailure(
        result,
        new Authentication.NoUserIdentityFoundError()
      );
    }).pipe(Effect.provide(TestConfect.layer))
  );
});
