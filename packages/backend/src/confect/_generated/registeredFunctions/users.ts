import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../users.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../users.spec")["default"]>(databaseSchema, groupLayer);

export default {
["me"]: RegisteredConvexFunction.register({ ...definitions["me"], handler: forward(definitions["me"].handler) }),
["getOneByIdentityTokenIdentifier"]: RegisteredConvexFunction.register({ ...definitions["getOneByIdentityTokenIdentifier"], handler: forward(definitions["getOneByIdentityTokenIdentifier"].handler) }),
["getOneByExternalId"]: RegisteredConvexFunction.register({ ...definitions["getOneByExternalId"], handler: forward(definitions["getOneByExternalId"].handler) }),
["upsertFromWorkOS"]: RegisteredConvexFunction.register({ ...definitions["upsertFromWorkOS"], handler: forward(definitions["upsertFromWorkOS"].handler) }),
["softDeleteByExternalId"]: RegisteredConvexFunction.register({ ...definitions["softDeleteByExternalId"], handler: forward(definitions["softDeleteByExternalId"].handler) }),
["notifyInvalidWorkOSUserSchema"]: RegisteredConvexFunction.register({ ...definitions["notifyInvalidWorkOSUserSchema"], handler: forward(definitions["notifyInvalidWorkOSUserSchema"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../users.spec")["default"]>;
