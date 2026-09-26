import { useAuth } from '@workos-inc/authkit-react';
import { useConvexAuth } from 'convex/react';

export function useAuthState(): {
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const convexAuth = useConvexAuth();
  const workosAuth = useAuth();

  const isLoading = convexAuth.isLoading || workosAuth.isLoading;
  const isAuthenticated =
    convexAuth.isAuthenticated && workosAuth.user !== null;

  return { isLoading, isAuthenticated };
}
