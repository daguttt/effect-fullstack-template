import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { env } from '#/env';

/** Development-only playground for screens that are hard to reach otherwise. */
export const Route = createFileRoute('/sandbox')({
  beforeLoad: () => {
    if (!env.DEV) throw redirect({ to: '/' });
  },
  component: SandboxLayout,
});

function SandboxLayout() {
  return <Outlet />;
}
