import { Table } from '@confect/server';

import * as ExampleWorkflowsDomain from '../modules/exampleWorkflows/domain';

export default Table.make(
  () => ExampleWorkflowsDomain.ExampleWorkflowRunsTableSchema
).index('by_requestedBy', ['requestedBy']);
