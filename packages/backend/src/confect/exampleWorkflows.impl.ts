import { FunctionImpl, GroupImpl } from '@confect/server';
import * as Clock from 'effect/Clock';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import refs from './_generated/refs';
import databaseSchema from './_generated/schema';
import {
  DatabaseReader,
  DatabaseWriter,
  MutationRunner,
} from './_generated/services';
import {
  exampleWorkflow,
  handleExampleWorkflowComplete,
  startExampleWorkflow,
} from './exampleWorkflows';
import exampleWorkflowsSpec from './exampleWorkflows.spec';
import RequireUserIdentity from './middleware/RequireUserIdentity.impl';
import * as Authentication from './modules/authentication';
import * as ExampleWorkflows from './modules/exampleWorkflows';

const LIST_MINE_LIMIT = 10;

/** Long enough to watch a run move through `inProgress` in the UI. */
const SIMULATED_LATENCY = Duration.seconds(2);

// -*******************************************************************************-
// Public
// -*******************************************************************************-

const startImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'start',
  (args) =>
    Effect.gen(function* () {
      const identity = yield* Authentication.CurrentUserIdentity;
      const writer = yield* DatabaseWriter;
      const { runMutation: mutationRunner } = yield* MutationRunner;

      const runId = yield* writer
        .table('exampleWorkflowRuns')
        .insert({
          requestedBy: identity.tokenIdentifier,
          input: args.input,
          status: 'inProgress',
        })
        .pipe(Effect.catchTag('DocumentEncodeError', Effect.die));

      yield* mutationRunner(
        refs.internal.exampleWorkflows.startExampleWorkflow,
        { runId }
      ).pipe(Effect.catchTag('SchemaError', Effect.die));

      return runId;
    })
);

const listMineImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'listMine',
  () =>
    Effect.gen(function* () {
      const identity = yield* Authentication.CurrentUserIdentity;
      const reader = yield* DatabaseReader;

      return yield* reader
        .table('exampleWorkflowRuns')
        .index(
          'by_requestedBy',
          (q) => q.eq('requestedBy', identity.tokenIdentifier),
          'desc'
        )
        .take(LIST_MINE_LIMIT)
        .pipe(Effect.catchTag('DocumentDecodeError', Effect.die));
    })
);

// -*******************************************************************************-
// Internal
// -*******************************************************************************-

const getRunInputImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'getRunInput',
  (args) =>
    ExampleWorkflows.getOneRunByIdOrDie(args.runId).pipe(
      Effect.map((run) => run.input)
    )
);

const greetImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'greet',
  (args) =>
    Effect.sleep(SIMULATED_LATENCY).pipe(
      Effect.andThen(ExampleWorkflows.greet(args.input))
    )
);

const terminalizeRunImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'terminalizeRun',
  (args) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      const run = yield* ExampleWorkflows.getOneRunByIdOrDie(args.runId);

      // The first terminal outcome wins when completion is replayed.
      if (run.status !== 'inProgress') {
        yield* Effect.logWarning(
          '[terminalizeRun] Skipped a run that is already terminal',
          { runId: args.runId, status: run.status }
        );

        return null;
      }

      const terminalRun = ExampleWorkflows.toTerminalExampleWorkflowRun({
        run,
        outcome: ExampleWorkflows.toTerminalExampleWorkflowOutcome(
          args.outcome
        ),
        now: yield* Clock.currentTimeMillis,
      });

      yield* writer
        .table('exampleWorkflowRuns')
        .replace(run._id, terminalRun)
        .pipe(Effect.catchTag('DocumentEncodeError', Effect.die));

      return null;
    })
);

const startExampleWorkflowImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'startExampleWorkflow',
  startExampleWorkflow
);

const exampleWorkflowImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'exampleWorkflow',
  exampleWorkflow
);

const handleExampleWorkflowCompleteImpl = FunctionImpl.make(
  databaseSchema,
  exampleWorkflowsSpec,
  'handleExampleWorkflowComplete',
  handleExampleWorkflowComplete
);

// -*******************************************************************************-
// API
// -*******************************************************************************-

export default GroupImpl.make(databaseSchema, exampleWorkflowsSpec).pipe(
  Layer.provide(startImpl),
  Layer.provide(listMineImpl),
  Layer.provide(getRunInputImpl),
  Layer.provide(greetImpl),
  Layer.provide(terminalizeRunImpl),
  Layer.provide(startExampleWorkflowImpl),
  Layer.provide(exampleWorkflowImpl),
  Layer.provide(handleExampleWorkflowCompleteImpl),
  Layer.provide(RequireUserIdentity),

  GroupImpl.finalize
);
