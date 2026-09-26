import { QueryResult, useMutation, useQuery } from '@confect/react';
import * as Match from 'effect/Match';
import * as Result from 'effect/Result';

import refs from '@repo/backend/refs';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  toast,
} from '@repo/ui';

import * as Forms from '#modules/forms';

import {
  EXAMPLE_INPUT_MAX_LENGTH,
  EXAMPLE_REJECTED_INPUT,
  type ExampleWorkflowRun,
  StartExampleWorkflowFormStandardSchema,
  deriveFailureMessage,
} from './example-workflow.models';

/**
 * Starts a durable workflow and watches its runs reactively. Delete this panel
 * together with the backend `exampleWorkflows` group once the app has real
 * features.
 */
export function ExampleWorkflowPanel() {
  const startExampleWorkflow = useMutation(refs.public.exampleWorkflows.start);
  const runs = useQuery(refs.public.exampleWorkflows.listMine, {});

  const form = Forms.useAppForm({
    defaultValues: { input: '' },
    validators: { onSubmit: StartExampleWorkflowFormStandardSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await startExampleWorkflow({ input: value.input.trim() });

      if (Result.isFailure(result)) {
        toast.error('Could not start the workflow.');
        return;
      }

      formApi.reset();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Example workflow</CardTitle>
        <CardDescription>
          A durable `@convex-dev/workflow` run with journaled Confect steps.
          Enter “{EXAMPLE_REJECTED_INPUT}” to watch a typed failure travel back.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="input">
            {(field) => (
              <field.InputField
                label="Name to greet"
                className="flex-1"
                maxLength={EXAMPLE_INPUT_MAX_LENGTH}
                required
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                Start
              </Button>
            )}
          </form.Subscribe>
        </form>

        {QueryResult.isSuccess(runs) ? (
          <ExampleWorkflowRunList runs={runs.value} />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

function ExampleWorkflowRunList({
  runs,
}: {
  runs: ReadonlyArray<ExampleWorkflowRun>;
}) {
  if (runs.length === 0)
    return <p className="text-sm text-muted-foreground">No runs yet.</p>;

  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {runs.map((run) => (
        <li
          key={run._id}
          className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
        >
          <span className="truncate font-medium">{run.input}</span>
          <ExampleWorkflowRunStatus run={run} />
        </li>
      ))}
    </ul>
  );
}

function ExampleWorkflowRunStatus({ run }: { run: ExampleWorkflowRun }) {
  return Match.value(run).pipe(
    Match.when({ status: 'inProgress' }, () => (
      <Badge variant="secondary">Running…</Badge>
    )),
    Match.when({ status: 'completed' }, (completed) => (
      <span className="text-muted-foreground">{completed.output}</span>
    )),
    Match.when({ status: 'failed' }, (failed) => (
      <span className="text-destructive">
        {deriveFailureMessage(failed.errorTag)}
      </span>
    )),
    Match.exhaustive
  );
}
