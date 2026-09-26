#!/usr/bin/env tsx

import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Command from 'effect/unstable/cli/Command';

import * as ConvexCli from './convexCli.ts';
import * as EnvFile from './envFile.ts';
import * as Lifecycle from './lifecycle/index.ts';
import * as Lock from './lock.ts';
import * as Repo from './repo.ts';
import * as WorkosApi from './workosApi.ts';
import * as WorkosCli from './workosCli.ts';

const setup = Command.make(
  'setup-worktree',
  {},
  Effect.fn('setupWorktreeCommand')(function* () {
    const worktree = yield* Repo.resolveWorktree();
    yield* Lifecycle.setupWorktree(worktree);
  })
).pipe(
  Command.withDescription(
    'Provision the isolated Convex deployment and WorkOS environment for this linked worktree.'
  )
);

const liveLayer = Layer.mergeAll(
  EnvFile.EnvFile.layer,
  Lock.WorkosRegistryLock.layer,
  WorkosCli.WorkosCli.layer,
  WorkosApi.WorkosApi.layer.pipe(Layer.provide(NodeHttpClient.layerUndici)),
  ConvexCli.ConvexCli.layer
).pipe(Layer.provideMerge(NodeServices.layer));

const program = Command.runWith(setup, { version: '1.0.0' })(
  process.argv.slice(2).filter((arg) => arg !== '--')
).pipe(Effect.provide(liveLayer));

NodeRuntime.runMain(program);
