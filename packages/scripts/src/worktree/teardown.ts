#!/usr/bin/env tsx

import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import * as Prompt from 'effect/cli/Prompt';

import * as ConvexPlatform from './convexPlatform.ts';
import * as EnvFile from './envFile.ts';
import * as Lifecycle from './lifecycle/index.ts';
import * as Lock from './lock.ts';
import * as Repo from './repo.ts';
import * as WorkosCli from './workosCli.ts';

const LOG_PREFIX = '[teardown-worktree]';
const log = (message: string) => Console.log(`${LOG_PREFIX} ${message}`);

const teardown = Command.make(
  'teardown-worktree',
  {
    // `Flag.Boolean` is required as of Effect 4.0.0-rc.111, which dropped the
    // implicit `false` for an absent boolean flag. Without the explicit
    // default, omitting either flag fails with `Missing required flag`.
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDescription('Print the resolved plan and change nothing.'),
      Flag.withDefault(false)
    ),
    yes: Flag.Boolean('yes').pipe(
      Flag.withDescription('Skip the confirmation prompt.'),
      Flag.withDefault(false)
    ),
  },
  Effect.fn('teardownWorktreeCommand')(function* (options) {
    const worktree = yield* Repo.resolveWorktree();
    const needsConfirmation = !options.dryRun && !options.yes;
    const cannotPrompt = needsConfirmation && !process.stdin.isTTY;

    if (cannotPrompt) {
      return yield* new Lifecycle.TeardownError({
        message:
          'Refusing to delete the Convex deployment and .env.local without confirmation. Re-run with --yes, or use --dry-run to inspect the plan.',
      });
    }

    const confirmed = needsConfirmation
      ? yield* Prompt.run(
          Prompt.Confirm({
            message:
              "Delete this worktree's Convex deployment, with its data, and .env.local? The file holds the only copy of this worktree's WorkOS API key.",
          })
        ).pipe(Effect.catchTag('QuitError', () => Effect.succeed(false)))
      : true;

    if (!confirmed) {
      yield* log('Cancelled. Nothing was changed.');
      return;
    }

    yield* Lifecycle.teardownWorktree(worktree, { dryRun: options.dryRun });
  })
).pipe(
  Command.withDescription(
    "Delete this linked worktree's Convex deployment, forget its WorkOS environment and delete its .env.local."
  ),
  Command.withExamples([
    {
      command: 'pnpm teardown:worktree --dry-run',
      description: 'Inspect the resolved plan without changing anything.',
    },
    {
      command: 'pnpm teardown:worktree --yes',
      description: 'Tear the worktree environment down without prompting.',
    },
  ])
);

/**
 * Reports local profiles and optionally removes profiles no readable live
 * worktree claims.
 *
 * Setup holds the same registry lock from `workos env provision` through the
 * atomic write of the fresh claim. GC holds it across list, claim discovery,
 * and removal. A concurrent `--prune` therefore cannot observe a new profile
 * before the corresponding `.env.local` makes its ownership durable.
 */
const gc = Command.make(
  'gc',
  {
    prune: Flag.Boolean('prune').pipe(
      Flag.withDescription(
        'Remove every profile no readable live worktree claims.'
      ),
      Flag.withDefault(false)
    ),
  },
  Effect.fn('gcWorktreeEnvironmentsCommand')(function* (options) {
    yield* Lifecycle.gcWorktreeEnvironments(options);
  })
).pipe(
  Command.withDescription(
    'Report local WorkOS CLI profiles against the worktrees claiming them, and optionally remove the unclaimed ones.'
  ),
  Command.withExamples([
    {
      command: 'pnpm teardown:worktree gc',
      description: 'List which profiles are claimed and which are orphaned.',
    },
    {
      command: 'pnpm teardown:worktree gc --prune',
      description: 'Remove profiles no readable live worktree claims.',
    },
  ])
);

const liveLayer = Layer.mergeAll(
  EnvFile.EnvFile.layer,
  Lock.WorkosRegistryLock.layer,
  WorkosCli.WorkosCli.layer,
  ConvexPlatform.ConvexPlatform.layer.pipe(
    Layer.provide(NodeHttpClient.layerUndici)
  )
).pipe(Layer.provideMerge(NodeServices.layer));

const program = Command.runWith(Command.withSubcommands(teardown, [gc]), {
  version: '1.0.0',
})(process.argv.slice(2).filter((arg) => arg !== '--')).pipe(
  Effect.provide(liveLayer)
);

NodeRuntime.runMain(program);
