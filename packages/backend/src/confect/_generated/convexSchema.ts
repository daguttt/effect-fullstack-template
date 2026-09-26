import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import exampleWorkflowRuns from "./tables/exampleWorkflowRuns";
import users from "./tables/users";

export default $defineSchema({
  exampleWorkflowRuns: $Table.tableDefinition(exampleWorkflowRuns),
  users: $Table.tableDefinition(users),
});
