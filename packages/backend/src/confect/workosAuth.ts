import { type AuthFunctions, AuthKit } from '@convex-dev/workos-authkit';

import { internal } from '#convex/_generated/api';
import type { DataModel } from '#convex/_generated/dataModel';

import { components } from './_generated/components';

const authFunctions: AuthFunctions = internal.workosAuth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
});

export const { authKitEvent } = authKit.events({
  'user.created': async (ctx, event): Promise<void> => {
    await ctx.runMutation(internal.users.upsertFromWorkOS, {
      workosUser: event.data,
    });
  },
  'user.updated': async (ctx, event): Promise<void> => {
    await ctx.runMutation(internal.users.upsertFromWorkOS, {
      workosUser: event.data,
    });
  },
  'user.deleted': async (ctx, event): Promise<void> => {
    await ctx.runMutation(internal.users.softDeleteByExternalId, {
      externalId: event.data.id,
    });
  },
});
