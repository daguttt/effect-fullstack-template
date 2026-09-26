import { NotFoundException } from '@workos-inc/node';
import * as Effect from 'effect/Effect';

import * as Domain from '../domain';

export const mapNotFoundEntityError =
  (resource: string) =>
  <A, R>(effect: Effect.Effect<A, Domain.WorkOSError, R>) =>
    effect.pipe(
      Effect.mapError((error) => {
        const cause = error.cause;

        return cause instanceof NotFoundException
          ? new Domain.WorkOSNotFoundEntity({
              resource,
              message: cause.message,
              code: cause.code ?? null,
              requestId: cause.requestID,
            })
          : error;
      })
    );
