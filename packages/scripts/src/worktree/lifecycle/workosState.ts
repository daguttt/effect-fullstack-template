import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

import * as EnvFile from '../envFile.ts';
import * as WorkosCli from '../workosCli.ts';

export {
  CarriedWorkosState,
  PartialWorkosStateError,
  decodeCarriedWorkosState,
  persistedEntries,
  type CompleteCarriedWorkosState,
};

const REQUIRED_KEYS = [
  'WORKOS_LOCAL_ENV_NAME',
  'WORKOS_API_KEY',
  'WORKOS_CLIENT_ID',
  'WORKOS_AUTHKIT_DOMAIN',
] as const;

class PartialWorkosStateError extends Schema.TaggedError<PartialWorkosStateError>()(
  'PartialWorkosStateError',
  {
    missingKeys: Schema.Array(Schema.String),
    message: Schema.String,
  }
) {}

type CarriedWorkosState = Data.TaggedEnum<{
  Absent: Record<never, never>;
  Complete: {
    readonly environment: WorkosCli.ProvisionedEnvironment;
    readonly webhookSecret?: Redacted.Redacted<string> | undefined;
  };
}>;

const CarriedWorkosState = Data.taggedEnum<CarriedWorkosState>();

type CompleteCarriedWorkosState = Extract<
  CarriedWorkosState,
  { readonly _tag: 'Complete' }
>;

const partialStateError = (missingKeys: ReadonlyArray<string>) =>
  new PartialWorkosStateError({
    missingKeys: [...missingKeys],
    message: `Incomplete carried WorkOS state. Missing or empty keys: ${missingKeys.join(', ')}.`,
  });

const decodeCarriedWorkosState = Effect.fn('decodeCarriedWorkosState')(
  function* (
    values: ReadonlyMap<string, string>
  ): Effect.fn.Return<CarriedWorkosState, PartialWorkosStateError> {
    const hasAnyRequiredKey = REQUIRED_KEYS.some((key) => values.has(key));

    if (!hasAnyRequiredKey) {
      return CarriedWorkosState.Absent();
    }

    const missingKeys = REQUIRED_KEYS.filter((key) => {
      const value = values.get(key);
      return EnvFile.isBlankEnvValue(value);
    });

    if (missingKeys.length > 0) {
      return yield* partialStateError(missingKeys);
    }

    const environment = yield* Schema.decodeUnknownEffect(
      WorkosCli.ProvisionedEnvironment
    )({
      name: values.get('WORKOS_LOCAL_ENV_NAME'),
      apiKey: values.get('WORKOS_API_KEY'),
      clientId: values.get('WORKOS_CLIENT_ID'),
      authkitDomain: values.get('WORKOS_AUTHKIT_DOMAIN'),
    }).pipe(
      Effect.mapError(
        () =>
          new PartialWorkosStateError({
            missingKeys: [],
            message:
              'Carried WorkOS state does not match the provisioned environment schema.',
          })
      )
    );

    const secret = values.get('WORKOS_WEBHOOK_SECRET');
    const webhookSecret = EnvFile.isBlankEnvValue(secret)
      ? undefined
      : Redacted.make(secret);

    return CarriedWorkosState.Complete({ environment, webhookSecret });
  }
);

const persistedEntries = (
  state: CompleteCarriedWorkosState
): ReadonlyArray<readonly [string, string]> => {
  const { environment, webhookSecret } = state;
  const required = [
    ['WORKOS_LOCAL_ENV_NAME', environment.name],
    ['WORKOS_API_KEY', Redacted.value(environment.apiKey)],
    ['WORKOS_CLIENT_ID', environment.clientId],
    ['WORKOS_AUTHKIT_DOMAIN', environment.authkitDomain],
    ['VITE_WORKOS_CLIENT_ID', environment.clientId],
  ] as const;

  return Predicate.isUndefined(webhookSecret)
    ? required
    : [
        ...required,
        ['WORKOS_WEBHOOK_SECRET', Redacted.value(webhookSecret)] as const,
      ];
};
