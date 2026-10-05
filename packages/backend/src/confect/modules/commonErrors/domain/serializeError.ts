import * as Result from 'effect/Result';

export const stringifyUnknownError = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;

  return Result.getOrElse(
    Result.try(() => {
      const serialized = JSON.stringify(error);
      return serialized ?? String(error);
    }),
    () => String(error)
  );
};
