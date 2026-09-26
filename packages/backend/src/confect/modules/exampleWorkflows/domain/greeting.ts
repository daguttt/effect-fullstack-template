import * as Effect from 'effect/Effect';

import { InputRejectedError } from './errors';
import { REJECTED_INPUT } from './models';

/** Stands in for the external call a real workflow step would make. */
export const greet = (input: string) =>
  input.toLowerCase() === REJECTED_INPUT
    ? Effect.fail(new InputRejectedError({ input }))
    : Effect.succeed(`Hello, ${input}!`);
