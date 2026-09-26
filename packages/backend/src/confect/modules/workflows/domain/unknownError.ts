import * as CommonErrorsDomain from '../../commonErrors/domain';
import { UnknownError } from './errors';

export const mapUnknownError = (error: unknown): UnknownError =>
  new UnknownError({
    rawWorkflowError: CommonErrorsDomain.stringifyUnknownError(error),
  });
