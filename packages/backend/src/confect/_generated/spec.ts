import { GroupSpec, Spec } from "@confect/core";
import developmentSeeder from "../developmentSeeder.spec";
import exampleWorkflows from "../exampleWorkflows.spec";
import users from "../users.spec";
import workosAuth from "../workosAuth.spec";

const spec: Spec.Spec<{
  readonly developmentSeeder: GroupSpec.NamedAt<typeof developmentSeeder, "developmentSeeder">;
  readonly exampleWorkflows: GroupSpec.NamedAt<typeof exampleWorkflows, "exampleWorkflows">;
  readonly users: GroupSpec.NamedAt<typeof users, "users">;
  readonly workosAuth: GroupSpec.NamedAt<typeof workosAuth, "workosAuth">;
}> = Spec.fromGroups({
  ["developmentSeeder"]: developmentSeeder,
  ["exampleWorkflows"]: exampleWorkflows,
  ["users"]: users,
  ["workosAuth"]: workosAuth,
}) as typeof spec;

export default spec;
