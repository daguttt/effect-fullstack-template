import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../developmentSeeder.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../developmentSeeder.spec")["default"]>(databaseSchema, groupLayer);

export default {
["seed"]: RegisteredConvexFunction.register({ ...definitions["seed"], handler: forward(definitions["seed"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../developmentSeeder.spec")["default"]>;
