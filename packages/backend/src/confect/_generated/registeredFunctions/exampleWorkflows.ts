import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import exampleWorkflows from "../../exampleWorkflows.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../exampleWorkflows.spec")["default"]>(databaseSchema, exampleWorkflows, RegisteredConvexFunction.make);
