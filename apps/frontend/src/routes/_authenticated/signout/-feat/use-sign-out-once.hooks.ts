import { useEffect, useRef } from 'react';

import { useAuth } from '@workos-inc/authkit-react';

/** Keep this absolute URL equal to a configured WorkOS sign-out URI. */
function getSignOutCallbackUrl(): string {
  return new URL('/signout-callback', window.location.origin).href;
}

/**
 * Starts WorkOS sign-out once per mount. AuthKit removes local session data
 * before navigation, so Strict Mode's replay would call `signOut` again without
 * a token.
 *
 * `_authenticated` guarantees that AuthKit has loaded an active session here.
 */
export function useSignOutOnce(): void {
  const { signOut } = useAuth();
  const hasStartedSignOutRef = useRef(false);

  useEffect(() => {
    if (hasStartedSignOutRef.current) return;

    hasStartedSignOutRef.current = true;
    signOut({ returnTo: getSignOutCallbackUrl() });
  }, [signOut]);
}
