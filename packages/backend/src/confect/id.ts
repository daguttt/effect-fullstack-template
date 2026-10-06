// Document IDs for the frontend. `Id('users')` is the generated schema, which
// decodes an ID that arrives as a string; `Id<'users'>` is its type.
import type { GenericId } from '@confect/core';

import { Id as IdSchema, type TableNames } from './_generated/id';

export type { TableNames };

export const Id = IdSchema;
export type Id<TableName extends TableNames> = GenericId.GenericId<TableName>;
