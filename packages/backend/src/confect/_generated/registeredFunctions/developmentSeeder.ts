import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import developmentSeeder from "../../developmentSeeder.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../developmentSeeder.spec")["default"]>(databaseSchema, developmentSeeder, RegisteredConvexFunction.make);
