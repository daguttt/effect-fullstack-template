import * as NodeServices from '@effect/platform-node/NodeServices';
import { describe, expect, it, layer } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';

import * as EnvFile from './envFile.ts';

/**
 * Each test gets its own temporary directory from a scoped allocation, so the
 * suite needs no shared fixture state and no explicit cleanup.
 */
const withEnvFile = <A, E, R>(
  use: (
    envFilePath: string,
    envFile: EnvFile.EnvFile['Service']
  ) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const envFile = yield* EnvFile.EnvFile;

    const directory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: 'repo-envfile-',
    });

    return yield* use(path.join(directory, '.env.local'), envFile);
  });

const read = (envFilePath: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fileSystem) =>
    fileSystem.readFileString(envFilePath)
  );

const write = (envFilePath: string, contents: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fileSystem) =>
    fileSystem.writeFileString(envFilePath, contents)
  );

describe('parseEnvFileContents', () => {
  it('strips surrounding quotes rather than carrying them into the value', () => {
    const values = EnvFile.parseEnvFileContents(
      ['DOUBLE="quoted"', "SINGLE='quoted'", 'BARE=plain'].join('\n')
    );

    expect(values.get('DOUBLE')).toBe('quoted');
    expect(values.get('SINGLE')).toBe('quoted');
    expect(values.get('BARE')).toBe('plain');
  });

  it('keeps an unbalanced quote verbatim', () => {
    expect(EnvFile.parseEnvFileContents('KEY="unbalanced').get('KEY')).toBe(
      '"unbalanced'
    );
  });

  it('lets a later duplicate win, matching the shell reader it replaces', () => {
    expect(
      EnvFile.parseEnvFileContents('KEY=first\nKEY=second').get('KEY')
    ).toBe('second');
  });

  it('skips comments, blanks and malformed lines', () => {
    const values = EnvFile.parseEnvFileContents(
      ['# comment', '', 'not-an-assignment', '=novalue', 'KEY=value'].join('\n')
    );

    expect([...values.keys()]).toStrictEqual(['KEY']);
  });

  it('keeps `=` characters inside a value', () => {
    expect(EnvFile.parseEnvFileContents('KEY=a=b=c').get('KEY')).toBe('a=b=c');
  });
});

layer(EnvFile.EnvFile.layer.pipe(Layer.provideMerge(NodeServices.layer)))(
  'env file IO',
  (it) => {
    describe('readEnvFile', () => {
      it.effect('treats a missing file as empty rather than an error', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            const values = yield* envFile.read(envFilePath);

            expect(values.size).toBe(0);
          })
        )
      );
    });

    describe('readEnvValue', () => {
      it.effect('reports an empty value as absent', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* write(envFilePath, 'KEY=\n');

            expect(yield* envFile.readValue(envFilePath, 'KEY')).toStrictEqual(
              Option.none()
            );
          })
        )
      );

      it.effect('returns a present value', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* write(envFilePath, 'KEY=value\n');

            expect(yield* envFile.readValue(envFilePath, 'KEY')).toStrictEqual(
              Option.some('value')
            );
          })
        )
      );
    });

    describe('upsertEnvValues', () => {
      it.effect('writes values unquoted', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* envFile.upsert(envFilePath, [
              ['WORKOS_LOCAL_ENV_NAME', 'unclaimed-2'],
            ]);

            expect(yield* read(envFilePath)).toBe(
              'WORKOS_LOCAL_ENV_NAME=unclaimed-2\n'
            );
          })
        )
      );

      it.effect('creates the file at mode 0600', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;

            yield* envFile.upsert(envFilePath, [['KEY', 'value']]);

            const info = yield* fileSystem.stat(envFilePath);

            expect(info.mode & 0o777).toBe(EnvFile.ENV_FILE_MODE);
          })
        )
      );

      it.effect(
        'replaces in place and preserves unrelated lines and comments',
        () =>
          withEnvFile((envFilePath, envFile) =>
            Effect.gen(function* () {
              yield* write(
                envFilePath,
                '# header\nOTHER=keep\nKEY=old\nTRAILER=keep\n'
              );

              yield* envFile.upsert(envFilePath, [['KEY', 'new']]);

              expect(yield* read(envFilePath)).toBe(
                '# header\nOTHER=keep\nKEY=new\nTRAILER=keep\n'
              );
            })
          )
      );

      it.effect('collapses duplicate assignments of a managed key', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* write(envFilePath, 'KEY=first\nOTHER=keep\nKEY=second\n');

            yield* envFile.upsert(envFilePath, [['KEY', 'new']]);

            expect(yield* read(envFilePath)).toBe('KEY=new\nOTHER=keep\n');
          })
        )
      );

      it.effect('appends keys that are not present yet', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* write(envFilePath, 'OTHER=keep\n');

            yield* envFile.upsert(envFilePath, [
              ['A', '1'],
              ['B', '2'],
            ]);

            expect(yield* read(envFilePath)).toBe('OTHER=keep\nA=1\nB=2\n');
          })
        )
      );

      it.effect('does not match a key that is only a prefix of another', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* write(envFilePath, 'WORKOS_CLIENT_ID=original\n');

            yield* envFile.upsert(envFilePath, [['WORKOS_CLIENT', 'new']]);

            expect(yield* read(envFilePath)).toBe(
              'WORKOS_CLIENT_ID=original\nWORKOS_CLIENT=new\n'
            );
          })
        )
      );

      it.effect(
        'refuses a multi-line value instead of corrupting the file',
        () =>
          withEnvFile((envFilePath, envFile) =>
            Effect.gen(function* () {
              const error = yield* Effect.flip(
                envFile.upsert(envFilePath, [['KEY', 'line1\nline2']])
              );

              expect(error.message).toMatch(/multi-line/);
            })
          )
      );
    });

    describe('removeEnvValues', () => {
      it.effect('removes every assignment of the given keys', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* write(envFilePath, 'CONVEX_URL=a\nKEEP=b\nCONVEX_URL=c\n');

            yield* envFile.remove(envFilePath, ['CONVEX_URL']);

            expect(yield* read(envFilePath)).toBe('KEEP=b\n');
          })
        )
      );

      it.effect(
        'clears inherited Convex URLs without removing the project selection',
        () =>
          withEnvFile((envFilePath, envFile) =>
            Effect.gen(function* () {
              yield* write(
                envFilePath,
                [
                  'CONVEX_DEPLOYMENT=dev:primary-deployment',
                  'CONVEX_URL=https://primary-deployment.convex.cloud',
                  'CONVEX_SITE_URL=https://primary-deployment.convex.site',
                  'VITE_CONVEX_URI=https://primary-deployment.convex.cloud',
                ].join('\n')
              );

              yield* envFile.remove(envFilePath, [
                'CONVEX_URL',
                'CONVEX_SITE_URL',
                'VITE_CONVEX_URI',
              ]);

              expect(yield* read(envFilePath)).toBe(
                'CONVEX_DEPLOYMENT=dev:primary-deployment\n'
              );
            })
          )
      );

      it.effect('does not create a file that was not there', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;

            yield* envFile.remove(envFilePath, ['CONVEX_URL']);

            expect(yield* fileSystem.exists(envFilePath)).toBe(false);
          })
        )
      );
    });

    describe('replaceFrom', () => {
      it.effect(
        'copies main values while removing inherited keys and restoring a carried claim',
        () =>
          withEnvFile((envFilePath, envFile) =>
            Effect.gen(function* () {
              const path = yield* Path.Path;
              const sourcePath = path.join(
                path.dirname(envFilePath),
                'main.env.local'
              );
              yield* write(
                sourcePath,
                [
                  '# inherited',
                  'KEEP=main',
                  'WORKOS_API_KEY=wrong',
                  'CONVEX_URL=https://stale.convex.cloud',
                  'TRAILER=keep',
                  '',
                ].join('\n')
              );

              yield* envFile.replaceFrom({
                sourcePath,
                targetPath: envFilePath,
                removeKeys: ['WORKOS_API_KEY', 'CONVEX_URL'],
                upsertEntries: [
                  ['WORKOS_LOCAL_ENV_NAME', 'unclaimed-2'],
                  ['WORKOS_API_KEY', 'current'],
                  ['VITE_DEV_SERVER_PORT', '5175'],
                ],
              });

              expect(yield* read(envFilePath)).toBe(
                [
                  '# inherited',
                  'KEEP=main',
                  'TRAILER=keep',
                  'WORKOS_LOCAL_ENV_NAME=unclaimed-2',
                  'WORKOS_API_KEY=current',
                  'VITE_DEV_SERVER_PORT=5175',
                  '',
                ].join('\n')
              );
            })
          )
      );

      it.effect('writes the final target at mode 0600', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;

            yield* envFile.replaceFrom({
              sourcePath: `${envFilePath}.missing`,
              targetPath: envFilePath,
              removeKeys: [],
              upsertEntries: [['KEY', 'value']],
            });

            const info = yield* fileSystem.stat(envFilePath);
            expect(info.mode & 0o777).toBe(EnvFile.ENV_FILE_MODE);
          })
        )
      );

      it.effect(
        'uses the current target when the main environment file is missing',
        () =>
          withEnvFile((envFilePath, envFile) =>
            Effect.gen(function* () {
              yield* write(envFilePath, '# current\nKEEP=value\nREMOVE=old\n');

              yield* envFile.replaceFrom({
                sourcePath: `${envFilePath}.missing`,
                targetPath: envFilePath,
                removeKeys: ['REMOVE'],
                upsertEntries: [['ADDED', 'new']],
              });

              expect(yield* read(envFilePath)).toBe(
                '# current\nKEEP=value\nADDED=new\n'
              );
            })
          )
      );

      it.effect('leaves the old target intact when validation fails', () =>
        withEnvFile((envFilePath, envFile) =>
          Effect.gen(function* () {
            yield* write(envFilePath, 'KEEP=old\n');

            yield* Effect.flip(
              envFile.replaceFrom({
                sourcePath: `${envFilePath}.missing`,
                targetPath: envFilePath,
                removeKeys: [],
                upsertEntries: [['BROKEN', 'line1\nline2']],
              })
            );

            expect(yield* read(envFilePath)).toBe('KEEP=old\n');
          })
        )
      );

      it.effect(
        'leaves the old target readable and cleans the temporary file when rename fails',
        () =>
          withEnvFile((envFilePath) =>
            Effect.gen(function* () {
              const fileSystem = yield* FileSystem.FileSystem;
              const path = yield* Path.Path;
              const sourcePath = path.join(
                path.dirname(envFilePath),
                'main.env.local'
              );
              const failingFileSystem = new Proxy(fileSystem, {
                get: (target, property, receiver): unknown =>
                  property === 'rename'
                    ? (oldPath: string, newPath: string) =>
                        fileSystem.rename(`${oldPath}.missing`, newPath)
                    : Reflect.get(target, property, receiver),
              });
              const failingDependencies = Layer.merge(
                Layer.succeed(FileSystem.FileSystem)(failingFileSystem),
                Layer.succeed(Path.Path)(path)
              );
              const failingEnvFile = yield* EnvFile.EnvFile.pipe(
                Effect.provide(
                  EnvFile.EnvFile.layer.pipe(
                    Layer.fresh,
                    Layer.provide(failingDependencies)
                  )
                )
              );
              yield* write(sourcePath, 'KEEP=new\n');
              yield* write(envFilePath, 'KEEP=old\n');

              yield* Effect.flip(
                failingEnvFile.replaceFrom({
                  sourcePath,
                  targetPath: envFilePath,
                  removeKeys: [],
                  upsertEntries: [],
                })
              );

              expect(yield* read(envFilePath)).toBe('KEEP=old\n');
              expect(
                yield* fileSystem.exists(`${envFilePath}.${process.pid}.tmp`)
              ).toBe(false);
            })
          )
      );
    });
  }
);
