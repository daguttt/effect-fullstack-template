import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import workosAuth from "../../workosAuth.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../workosAuth.spec")["default"]>(databaseSchema, workosAuth, RegisteredConvexFunction.make);
