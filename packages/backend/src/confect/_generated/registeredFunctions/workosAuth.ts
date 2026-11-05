import { RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../workosAuth.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../workosAuth.spec")["default"]>(databaseSchema, groupLayer);
