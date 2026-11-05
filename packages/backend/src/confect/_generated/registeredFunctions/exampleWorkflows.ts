import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../exampleWorkflows.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../exampleWorkflows.spec")["default"]>(databaseSchema, groupLayer);

export default {
["start"]: RegisteredConvexFunction.register({ ...definitions["start"], handler: forward(definitions["start"].handler) }),
["listMine"]: RegisteredConvexFunction.register({ ...definitions["listMine"], handler: forward(definitions["listMine"].handler) }),
["getRunInput"]: RegisteredConvexFunction.register({ ...definitions["getRunInput"], handler: forward(definitions["getRunInput"].handler) }),
["greet"]: RegisteredConvexFunction.register({ ...definitions["greet"], handler: forward(definitions["greet"].handler) }),
["terminalizeRun"]: RegisteredConvexFunction.register({ ...definitions["terminalizeRun"], handler: forward(definitions["terminalizeRun"].handler) }),
["startExampleWorkflow"]: definitions["startExampleWorkflow"].handler,
["exampleWorkflow"]: definitions["exampleWorkflow"].handler,
["handleExampleWorkflowComplete"]: definitions["handleExampleWorkflowComplete"].handler,
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../exampleWorkflows.spec")["default"]>;
