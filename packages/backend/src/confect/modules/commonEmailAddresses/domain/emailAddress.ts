import * as SchemaTransformation from 'effect/SchemaTransformation';

/** Normalize writes and lookup keys alike so exact indexes match addresses case-insensitively. */
export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

export const emailAddressNormalization =
  SchemaTransformation.composeTransformation(
    SchemaTransformation.trim(),
    SchemaTransformation.toLowerCase()
  );
