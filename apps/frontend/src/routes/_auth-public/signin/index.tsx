import { useEffect } from 'react';

import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';

import * as CommonUI from '#modules/common-ui';

export const Route = createFileRoute('/_auth-public/signin/')({
  errorComponent: ({ error }) => (
    <p>
      Something went wrong: {CommonUI.getErrorMessage(error) ?? 'Unknown error'}
    </p>
  ),

  component: RouteComponent,
});

/** Hands off to the AuthKit hosted page; WorkOS returns through `/callback`. */
function RouteComponent() {
  const { signIn } = useAuth();
  const { postLoginReturnTo } = Route.useRouteContext();

  useEffect(() => {
    void signIn({ state: { returnTo: postLoginReturnTo } });
  }, [postLoginReturnTo, signIn]);

  return <CommonUI.GlobalSpinner message="Signing you in" />;
}
