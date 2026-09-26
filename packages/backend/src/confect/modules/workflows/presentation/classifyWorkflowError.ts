import * as Predicate from 'effect/Predicate';

import * as Domain from '../domain';

// -*******************************************************************************-
// API
// -*******************************************************************************-

export type UnknownWorkflowErrorTag = typeof Domain.UnknownError.Type._tag;

/**
 * Parses the raw workflow error string persisted by the workflow component and
 * maps the embedded Effect error `_tag` to one of a declared workflow error
 * union's own tags.
 *
 * `cases` is that union's `cases` record — pass
 * `SomeWorkflowError.cases` — so the classification cannot admit a tag the
 * workflow is not declared to fail with, and adding a member to the union
 * widens what this recognizes without a second edit here.
 *
 * The return type is `Tag | 'Workflows/UnknownError'` rather than `Tag`,
 * because an unrecognized tag has to land somewhere. Every union this is used
 * with already includes `Workflows/UnknownError` — the runner contributes it —
 * so the union collapses back to `Tag` at each call site.
 */
export function classifyWorkflowError<Tag extends string>(args: {
  readonly cases: Record<Tag, unknown>;
  readonly serializedError: string;
}): Tag | UnknownWorkflowErrorTag {
  // Every `_tag` in the payload, outermost first — not just the first one.
  //
  // A failure the workflow body raises itself arrives with its own tag on the
  // outside. A typed failure returned by a *Confect step* does not: the callee
  // encodes it as a `ConvexError`, the workflow component catches the throw and
  // reports it as text, and by the time `Ref.runWithCodec` sees a string rather
  // than a `ConvexError` it can no longer decode it — so the runner's fallback
  // has already wrapped the real error in `Workflows/UnknownError`. Reading
  // only the outer tag classified every one of those as unknown and handed the
  // submitter generic copy:
  //
  //   {"_tag":"Workflows/UnknownError","rawWorkflowError":
  //     "Error: Uncaught ConvexError: {\"_tag\":\"OrganizationMembership/…\"}"}
  //
  // So the first *declared* tag wins, and the unknown fallback is only an
  // answer when nothing else in the payload is one. Outermost-first ordering
  // keeps a genuinely locally-raised error ahead of anything nested inside its
  // own serialized cause.
  // Backslashes are optional at every quote: the outer payload is plain JSON,
  // but a nested one has been through `JSON.stringify` an extra time, so its
  // own keys arrive as `\"_tag\":\"…\"`.
  const declaredTags = [
    ...args.serializedError.matchAll(/_tag\\*"\s*:\s*\\*"([^"\\]+)/g),
  ]
    .map((match) => match[1])
    .filter(Predicate.isNotUndefined)
    .filter((candidate): candidate is Tag =>
      Object.hasOwn(args.cases, candidate)
    );

  const classifiedTag =
    declaredTags.find((candidate) => candidate !== 'Workflows/UnknownError') ??
    declaredTags[0];

  return classifiedTag ?? 'Workflows/UnknownError';
}
