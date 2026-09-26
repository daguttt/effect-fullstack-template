import { type ReactNode, useEffect } from 'react';

import { useNavigate } from '@tanstack/react-router';

import * as CommonUI from '#modules/common-ui';

import { useAuthState } from './use-auth-state.hooks';

export function AuthenticatedGate({
  publicHref,
  children,
}: {
  publicHref: string;
  children: ReactNode;
}) {
  const { isLoading, isAuthenticated } = useAuthState();
  const navigate = useNavigate();
  const isAnonymous = !isLoading && !isAuthenticated;
  const isSignedIn = !isLoading && isAuthenticated;

  useEffect(() => {
    if (!isAnonymous) return;

    void navigate({
      to: '/signin',
      search: { returnTo: publicHref },
      replace: true,
    });
  }, [isAnonymous, publicHref, navigate]);

  if (!isSignedIn) return <CommonUI.GlobalSpinner />;

  return <>{children}</>;
}
