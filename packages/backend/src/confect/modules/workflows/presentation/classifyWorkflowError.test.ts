import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';

import * as Domain from '../domain';
import { classifyWorkflowError } from './classifyWorkflowError';

class ExternalProviderError extends Schema.TaggedError<ExternalProviderError>()(
  'ExternalProviderError',
  {}
) {}

class AlreadyExistsError extends Schema.TaggedError<AlreadyExistsError>()(
  'Things/AlreadyExistsError',
  {}
) {}

class IdentityConflictError extends Schema.TaggedError<IdentityConflictError>()(
  'Users/IdentityConflictError',
  {}
) {}

const { cases } = Schema.Union([
  ExternalProviderError,
  AlreadyExistsError,
  IdentityConflictError,
  Domain.UnknownError,
]).pipe(Schema.toTaggedUnion('_tag'));

describe('classifyWorkflowError', () => {
  it('reads a tag the workflow body raised itself', () => {
    expect(
      classifyWorkflowError({
        cases,
        serializedError:
          'ConvexError: {"_tag":"ExternalProviderError","message":"Failed to create the WorkOS user","serializedError":"WorkOSError: boom"}',
      })
    ).toBe('ExternalProviderError');
  });

  /**
   * The shape a *Confect step*'s typed failure actually arrives in, captured
   * from a live run: the callee encodes it as a `ConvexError`, the workflow
   * component reports the throw as text, and the runner's fallback has already
   * wrapped it in `Workflows/UnknownError` by the time it is persisted.
   *
   * Reading only the outermost tag classified every one of these as unknown,
   * which made three of this union's five tags unreachable and handed the
   * submitter generic copy for all of them.
   */
  it('unwraps a step failure the runner already wrapped as unknown', () => {
    expect(
      classifyWorkflowError({
        cases,
        serializedError:
          'ConvexError: {"_tag":"Workflows/UnknownError","rawWorkflowError":"Error: Uncaught ConvexError: {\\"_tag\\":\\"Things/AlreadyExistsError\\"}\\n    at <anonymous> (RegisteredFunction.ts:215:19)"}',
      })
    ).toBe('Things/AlreadyExistsError');
  });

  it('unwraps the other step failures the same way', () => {
    expect(
      classifyWorkflowError({
        cases,
        serializedError:
          '{"_tag":"Workflows/UnknownError","rawWorkflowError":"Uncaught ConvexError: {\\"_tag\\":\\"Users/IdentityConflictError\\",\\"externalUserId\\":\\"user_1\\",\\"email\\":\\"a@b.test\\"}"}',
      })
    ).toBe('Users/IdentityConflictError');
  });

  it('keeps the unknown tag when nothing declared appears', () => {
    expect(
      classifyWorkflowError({
        cases,
        serializedError:
          '{"_tag":"Workflows/UnknownError","rawWorkflowError":"TypeError: undefined is not a function"}',
      })
    ).toBe('Workflows/UnknownError');
  });

  it('keeps the unknown tag for a payload carrying no tag at all', () => {
    expect(
      classifyWorkflowError({ cases, serializedError: 'connection reset' })
    ).toBe('Workflows/UnknownError');
  });

  // An undeclared tag is not this union's to report, even nested.
  it('ignores a tag the workflow is not declared to fail with', () => {
    expect(
      classifyWorkflowError({
        cases,
        serializedError:
          '{"_tag":"Workflows/UnknownError","rawWorkflowError":"{\\"_tag\\":\\"WorkOSError\\",\\"message\\":\\"nope\\"}"}',
      })
    ).toBe('Workflows/UnknownError');
  });
});
