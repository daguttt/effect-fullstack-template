/**
 * Quote-aware reader and writer for the worktree's root `.env.local`.
 *
 * Values are always written unquoted. The legacy shell reader was
 * `sed -n "s/^KEY=//p"`, which returns everything after `KEY=` verbatim, so a
 * quoted value silently carried its quotes into Convex and WorkOS. Reading
 * strips surrounding quotes explicitly; writing refuses to add them.
 */
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';

export {
  EnvFile,
  EnvFileError,
  ENV_FILE_MODE,
  isBlankEnvValue,
  parseEnvFileContents,
  removeLines,
  renderEnvValue,
  upsertLines,
};

class EnvFileError extends Schema.TaggedError<EnvFileError>()('EnvFileError', {
  message: Schema.String,
}) {}

/** `.env.local` holds unrecoverable credentials, so keep it owner-only. */
const ENV_FILE_MODE = 0o600;

const isBlankEnvValue = (value: string | undefined) =>
  Predicate.isUndefined(value) || value === '';

const unquote = (rawValue: string) => {
  const trimmed = rawValue.trim();
  const quote = trimmed[0];

  const lacksMatchingQuotes =
    (quote !== '"' && quote !== "'") ||
    trimmed.length < 2 ||
    trimmed.at(-1) !== quote;

  if (lacksMatchingQuotes) {
    return trimmed;
  }

  return trimmed.slice(1, -1);
};

/**
 * Parses `KEY=value` lines into a map. Later duplicates win, matching the
 * `sed … | tail -n 1` behaviour the shell scripts relied on. Malformed lines
 * are skipped rather than fatal: `.env.local` is copied from the main worktree
 * and may legitimately contain content this tool does not own.
 */
const parseEnvFileContents = (contents: string) => {
  const values = new Map<string, string>();

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    const isBlankOrComment = trimmed === '' || trimmed.startsWith('#');

    if (isBlankOrComment) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    values.set(key, unquote(trimmed.slice(separatorIndex + 1)));
  }

  return values;
};

/**
 * Rejects values that cannot survive a round trip through the unquoted
 * `KEY=value` format.
 */
const renderEnvValue = (key: string, value: string) =>
  /[\n\r]/.test(value)
    ? Effect.fail(
        new EnvFileError({
          message: `Refusing to write a multi-line value for ${key}.`,
        })
      )
    : Effect.succeed(`${key}=${value}`);

const upsertLines = (
  lines: ReadonlyArray<string>,
  rendered: ReadonlyMap<string, string>
) => {
  const pending = new Set(rendered.keys());

  const updated = lines.flatMap((line) => {
    const managedKey = [...rendered.keys()].find((key) =>
      line.startsWith(`${key}=`)
    );

    if (Predicate.isUndefined(managedKey)) {
      return [line];
    }

    if (!pending.delete(managedKey)) {
      return [];
    }

    return [rendered.get(managedKey)!];
  });

  return [...updated, ...[...pending].map((key) => rendered.get(key)!)];
};

const removeLines = (
  lines: ReadonlyArray<string>,
  keys: ReadonlyArray<string>
) => lines.filter((line) => !keys.some((key) => line.startsWith(`${key}=`)));

/** Every filesystem failure surfaces as an `EnvFileError` naming the path. */
const asEnvFileError = (action: string, filePath: string) => (cause: unknown) =>
  new EnvFileError({
    message: `Failed to ${action} ${filePath}: ${String(cause)}`,
  });

class EnvFile extends Context.Service<
  EnvFile,
  {
    /** Reads the whole file. A missing file decodes to an empty map, not an error. */
    readonly read: (
      filePath: string
    ) => Effect.Effect<ReadonlyMap<string, string>, EnvFileError>;
    readonly readValue: (
      filePath: string,
      key: string
    ) => Effect.Effect<Option.Option<string>, EnvFileError>;
    /**
     * Replaces the first line assigning each key and appends the rest,
     * preserving unrelated lines, comments and ordering.
     */
    readonly upsert: (
      filePath: string,
      entries: ReadonlyArray<readonly [key: string, value: string]>
    ) => Effect.Effect<void, EnvFileError>;
    readonly remove: (
      filePath: string,
      keys: ReadonlyArray<string>
    ) => Effect.Effect<void, EnvFileError>;
    /** Installs a fully transformed source file without exposing partial contents. */
    readonly replaceFrom: (options: {
      readonly sourcePath: string;
      readonly targetPath: string;
      readonly removeKeys: ReadonlyArray<string>;
      readonly upsertEntries: ReadonlyArray<
        readonly [key: string, value: string]
      >;
    }) => Effect.Effect<void, EnvFileError>;
  }
>()('@repo/scripts/worktree/EnvFile') {
  /**
   * The filesystem and path services are acquired once here rather than in
   * every operation, so the service's own methods carry no requirements.
   */
  static readonly layer: Layer.Layer<
    EnvFile,
    never,
    FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    EnvFile,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const exists = (filePath: string) =>
        fileSystem
          .exists(filePath)
          .pipe(Effect.mapError(asEnvFileError('inspect', filePath)));

      const readContents = Effect.fn('EnvFile.readContents')(function* (
        filePath: string
      ): Effect.fn.Return<Option.Option<string>, EnvFileError> {
        if (!(yield* exists(filePath))) {
          return Option.none();
        }

        const contents = yield* fileSystem
          .readFileString(filePath)
          .pipe(Effect.mapError(asEnvFileError('read', filePath)));

        return Option.some(contents);
      });

      const read = Effect.fn('EnvFile.read')(function* (filePath: string) {
        const contents = yield* readContents(filePath);

        return Option.match(contents, {
          onNone: () =>
            new Map<string, string>() as ReadonlyMap<string, string>,
          onSome: parseEnvFileContents,
        });
      });

      const readValue = Effect.fn('EnvFile.readValue')(function* (
        filePath: string,
        key: string
      ) {
        const values = yield* read(filePath);
        const value = values.get(key);

        return isBlankEnvValue(value) ? Option.none() : Option.some(value);
      });

      const writeAtomically = Effect.fn('EnvFile.writeAtomically')(function* (
        filePath: string,
        lines: ReadonlyArray<string>
      ): Effect.fn.Return<void, EnvFileError> {
        const temporaryFile = `${filePath}.${process.pid}.tmp`;

        // The temporary file is written and renamed so a reader never observes
        // a half-written `.env.local`.
        yield* Effect.gen(function* () {
          yield* fileSystem.makeDirectory(path.dirname(filePath), {
            recursive: true,
          });
          yield* fileSystem.writeFileString(
            temporaryFile,
            `${lines.join('\n')}\n`,
            { mode: ENV_FILE_MODE }
          );
          yield* fileSystem.rename(temporaryFile, filePath);
        }).pipe(
          Effect.onError(() =>
            fileSystem
              .remove(temporaryFile, { force: true })
              .pipe(Effect.ignore)
          ),
          Effect.mapError(asEnvFileError('write', filePath))
        );
      });

      const linesFromContents = (contents: Option.Option<string>) =>
        Option.match(contents, {
          onNone: (): ReadonlyArray<string> => [],
          onSome: (text) => {
            const lines = text.split(/\r?\n/);
            return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
          },
        });

      const renderEntries = Effect.fn('EnvFile.renderEntries')(function* (
        entries: ReadonlyArray<readonly [key: string, value: string]>
      ) {
        const rendered = new Map<string, string>();

        for (const [key, value] of entries) {
          rendered.set(key, yield* renderEnvValue(key, value));
        }

        return rendered as ReadonlyMap<string, string>;
      });

      const withLines = Effect.fn('EnvFile.withLines')(function* (
        filePath: string,
        update: (lines: ReadonlyArray<string>) => ReadonlyArray<string>
      ): Effect.fn.Return<void, EnvFileError> {
        const contents = yield* readContents(filePath);
        const existing = linesFromContents(contents);

        yield* writeAtomically(filePath, update(existing));
      });

      const upsert = Effect.fn('EnvFile.upsert')(function* (
        filePath: string,
        entries: ReadonlyArray<readonly [key: string, value: string]>
      ): Effect.fn.Return<void, EnvFileError> {
        const rendered = yield* renderEntries(entries);

        yield* withLines(filePath, (lines) => upsertLines(lines, rendered));
      });

      const remove = Effect.fn('EnvFile.remove')(function* (
        filePath: string,
        keys: ReadonlyArray<string>
      ): Effect.fn.Return<void, EnvFileError> {
        // Removing from a file that does not exist should not create one.
        if (!(yield* exists(filePath))) {
          return;
        }

        yield* withLines(filePath, (lines) => removeLines(lines, keys));
      });

      const replaceFrom = Effect.fn('EnvFile.replaceFrom')(function* (options: {
        readonly sourcePath: string;
        readonly targetPath: string;
        readonly removeKeys: ReadonlyArray<string>;
        readonly upsertEntries: ReadonlyArray<
          readonly [key: string, value: string]
        >;
      }): Effect.fn.Return<void, EnvFileError> {
        const source = yield* readContents(options.sourcePath);
        const startingContents = Option.isSome(source)
          ? source
          : yield* readContents(options.targetPath);
        const rendered = yield* renderEntries(options.upsertEntries);
        const lines = upsertLines(
          removeLines(linesFromContents(startingContents), options.removeKeys),
          rendered
        );

        yield* writeAtomically(options.targetPath, lines);
      });

      return EnvFile.of({ read, readValue, upsert, remove, replaceFrom });
    })
  );
}
