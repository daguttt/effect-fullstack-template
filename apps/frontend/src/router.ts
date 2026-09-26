import { createRouter } from '@tanstack/react-router';

import * as CommonUI from '#modules/common-ui';

import { routeTree } from './routeTree.gen';

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export const router = createRouter({
  routeTree,
  context: {
    convex: undefined!,
  },
  defaultPreload: 'intent',
  defaultErrorComponent: CommonUI.DefaultRouteErrorComponent,
  scrollRestoration: true,
});
