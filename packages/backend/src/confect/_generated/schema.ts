import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import exampleWorkflowRuns from "./tables/exampleWorkflowRuns";
import users from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly exampleWorkflowRuns: typeof exampleWorkflowRuns;
  readonly users: typeof users;
}> = $DatabaseSchema.make({
  exampleWorkflowRuns,
  users,
});

export default databaseSchema;
