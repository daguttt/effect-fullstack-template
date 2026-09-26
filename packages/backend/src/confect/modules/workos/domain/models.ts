import type { User } from '@workos-inc/node';
import * as Schema from 'effect/Schema';

type SchemaFieldsFor<T extends object> = {
  readonly [K in keyof T]-?: Schema.Schema<T[K]>;
};

const WorkOSUserFields = {
  object: Schema.Literal('user'),
  id: Schema.String,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  profilePictureUrl: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
  lastSignInAt: Schema.NullOr(Schema.String),
  locale: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  externalId: Schema.NullOr(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.String),
} satisfies SchemaFieldsFor<User>;

export const WorkOSUser = Schema.Struct(WorkOSUserFields);
export type WorkOSUser = typeof WorkOSUser.Type;
