import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type ExampleWorkflowRunsDoc = Document.Document<typeof schemaDefinition, "exampleWorkflowRuns">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;

export interface Docs {
  exampleWorkflowRuns: ExampleWorkflowRunsDoc;
  users: UsersDoc;
}
