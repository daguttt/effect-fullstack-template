import { Outlet, createFileRoute } from '@tanstack/react-router';

import * as Authentication from '#modules/authentication';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    return {
      publicHref: location.publicHref,
    };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { publicHref } = Route.useRouteContext();

  return (
    <Authentication.AuthenticatedGate publicHref={publicHref}>
      <Outlet />
    </Authentication.AuthenticatedGate>
  );
}
