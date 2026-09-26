import * as Effect from 'effect/Effect';

import { ExternalProviderError } from './errors';
import { stringifyUnknownError } from './serializeError';

// -*******************************************************************************-
// API
// -*******************************************************************************-

/**
 * Reports every way a call into an external provider can fail as one
 * `ExternalProviderError`.
 *
 * The catch is deliberately broad rather than a `catchTag` list. These calls
 * run as workflow steps, and an error escaping one untyped terminalizes its
 * request as `Workflows/UnknownError` — which tells the submitter nothing and
 * tells us less. Naming the provider is strictly better than that, and there is
 * no provider failure a caller could act on differently for having it narrowed.
 *
 * Pipe this *after* the provider's layer, so a layer that fails to build is
 * classified alongside the calls it would have served — `workOSClientLayer`
 * fails on a missing `WORKOS_API_KEY`, and that failure is no more actionable
 * than a rejected request. The spec's declared `error` is what enforces the
 * order: provide second and the layer's error stays in the channel, which no
 * longer matches the handler's declared one.
 *
 * `message` is the whole difference between call sites, which is why the
 * combinator takes it and nothing else.
 */
export const orExternalProviderError =
  (message: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, ExternalProviderError, R> =>
    effect.pipe(
      Effect.catch(
        (error) =>
          new ExternalProviderError({
            message,
            serializedError: stringifyUnknownError(error),
          })
      )
    );
