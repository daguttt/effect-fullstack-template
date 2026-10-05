#!/usr/bin/env tsx
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';

import * as ConvexCli from '../worktree/convexCli.ts';
import * as EnvFile from '../worktree/envFile.ts';
import * as WorkosApi from '../worktree/workosApi.ts';
import * as WorkosCli from '../worktree/workosCli.ts';
import * as Preview from './lifecycle.ts';

const options = { project: Flag.String('project'), pr: Flag.Int('pr') };
const prepare = Command.make(
  'prepare',
  options,
  Effect.fn(function* (input) {
    const path = yield* Path.Path;
    const repoRoot = path.resolve(import.meta.dirname, '../../../..');
    const token = yield* Config.Redacted('CONVEX_OVERRIDE_ACCESS_TOKEN');
    const result = yield* Preview.preparePreview({ ...input, repoRoot }, token);
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(
      path.join(repoRoot, '.preview-info.json'),
      yield* Schema.encodeEffect(Schema.fromJsonString(Preview.PreviewInfo))(
        result
      )
    );
  })
);
const configure = Command.make(
  'configure',
  { ...options, url: Flag.String('url') },
  Effect.fn(function* (input) {
    const path = yield* Path.Path;
    yield* Preview.configurePreview(
      { ...input, repoRoot: path.resolve(import.meta.dirname, '../../../..') },
      input.url
    );
  })
);
const command = Command.make('pr-preview').pipe(
  Command.withSubcommands([prepare, configure])
);
const live = Layer.mergeAll(
  EnvFile.EnvFile.layer,
  ConvexCli.ConvexCli.layer,
  WorkosCli.WorkosCli.layer,
  WorkosApi.WorkosApi.layer
).pipe(
  Layer.provideMerge(NodeHttpClient.layerUndici),
  Layer.provideMerge(NodeServices.layer)
);
const program = Effect.gen(function* () {
  if (
    (yield* Config.String('GITHUB_ACTIONS').pipe(
      Config.withDefault('false')
    )) !== 'true'
  ) {
    return yield* new Preview.PreviewError({
      message:
        'This command is for fresh GitHub Actions checkouts. Use setup:worktree locally.',
    });
  }
  yield* Command.runWith(command, { version: '1.0.0' })(process.argv.slice(2));
}).pipe(Effect.provide(live));
NodeRuntime.runMain(program);
