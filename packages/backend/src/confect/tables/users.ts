import { Table } from '@confect/core';

import * as UsersDomain from '../modules/users/domain';

export default Table.make(() => UsersDomain.UsersTableSchema)
  .index('by_externalId', ['externalId'])
  .index('by_identityTokenIdentifier', ['identityTokenIdentifier'])
  .index('by_email', ['email']);
