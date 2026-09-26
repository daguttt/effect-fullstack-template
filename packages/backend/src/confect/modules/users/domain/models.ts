import * as SystemFields from '@confect/core/SystemFields';
import * as Schema from 'effect/Schema';

export const UsersTableSchema = Schema.Struct({
  /**
   * WorkOS id
   */
  externalId: Schema.String,
  identityTokenIdentifier: Schema.String,
  email: Schema.String,
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
  profilePictureUrl: Schema.NullOr(Schema.String),
  lastSignInAt: Schema.NullOr(Schema.Finite),
  locale: Schema.NullOr(Schema.String),
  externalCreatedAt: Schema.Finite,
  externalUpdatedAt: Schema.Finite,
  deletedAt: Schema.optional(Schema.Finite),
});

export const UsersDocSchema = SystemFields.extendWithSystemFields(
  'users',
  UsersTableSchema
);
