import { RouterProvider } from '@tanstack/react-router';
import type { ConvexReactClient } from 'convex/react';

import { router } from './router';

export const App = ({ convex }: { convex: ConvexReactClient }) => {
  return (
    <RouterProvider
      router={router}
      context={{
        convex,
      }}
    />
  );
};
