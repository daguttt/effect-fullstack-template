import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

/**
 * Client schema for environment variables.
 * To use in `vite.config.ts` and `env.ts`
 */
/** `new URL` is in Vite's baseline; `URL.canParse` (Safari 16.4, Chrome 111) is not. */
const isValidUrl = Schema.makeFilter((value: string) =>
  Result.isSuccess(Result.try(() => new URL(value)))
    ? undefined
    : 'Must be a valid URL'
);

export const clientSchema = {
  VITE_PR_PREVIEW: Schema.toStandardSchemaV1(
    Schema.UndefinedOr(Schema.Literals(['true', 'false']))
  ),
  VITE_CONVEX_URI: Schema.toStandardSchemaV1(Schema.String.check(isValidUrl)),
  VITE_WORKOS_CLIENT_ID: Schema.toStandardSchemaV1(
    Schema.String.check(Schema.isStartingWith('client_'))
  ),
  VITE_DEV_SERVER_PORT: Schema.toStandardSchemaV1(
    Schema.UndefinedOr(
      Schema.FiniteFromString.pipe(
        Schema.check(
          Schema.isInt(),
          Schema.isBetween({ minimum: 1, maximum: 65535 })
        )
      )
    )
  ),
} as const;
