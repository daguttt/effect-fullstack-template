import { useAuth } from '@workos-inc/authkit-react';
import { useConvexAuth } from 'convex/react';
import * as Predicate from 'effect/Predicate';

export function useAuthState(): {
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const convexAuth = useConvexAuth();
  const workosAuth = useAuth();

  const isLoading = convexAuth.isLoading || workosAuth.isLoading;
  const isAuthenticated =
    convexAuth.isAuthenticated && Predicate.isNotNull(workosAuth.user);

  return { isLoading, isAuthenticated };
}
