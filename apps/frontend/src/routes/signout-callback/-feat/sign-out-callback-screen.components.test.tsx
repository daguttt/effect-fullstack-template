// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useConvexAuth } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type FrontendStubs, installFrontendStubs } from '#/test-harness';

import { SignOutCallbackScreen } from './sign-out-callback-screen.components';

vi.mock('@confect/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@confect/react')>()),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock('convex/react', () => ({ useConvexAuth: vi.fn() }));
vi.mock('@workos-inc/authkit-react', () => ({ useAuth: vi.fn() }));

const USER = 'user_a';

/** Uses a real router because navigation destinations are under test. */
function renderScreen(stubs: FrontendStubs) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });
  const signOutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/signout',
    component: () => null,
  });
  const signOutCallbackRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/signout-callback',
    component: SignOutCallbackScreen,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      signOutRoute,
      signOutCallbackRoute,
    ]),
    history: createMemoryHistory({
      initialEntries: ['/signout-callback'],
    }),
  });

  return {
    router,
    ...render(<RouterProvider router={router as never} />, {
      wrapper: stubs.Wrapper,
    }),
  };
}

const findFailureHeading = () =>
  screen.findByRole('heading', { name: /sign-out did not complete/i });

const queryFailureHeading = () =>
  screen.queryByRole('heading', { name: /sign-out did not complete/i });

let stubs: FrontendStubs;

beforeEach(() => {
  vi.clearAllMocks();
  stubs = installFrontendStubs();
});

afterEach(cleanup);

describe('SignOutCallbackScreen', () => {
  it('waits on the spinner while AuthKit is still resolving the session', async () => {
    stubs.signIn({ userId: USER, isLoading: true });

    const { router } = renderScreen(stubs);

    expect(await screen.findByText('Signing you out')).toBeDefined();
    expect(router.state.location.pathname).toBe('/signout-callback');
    expect(queryFailureHeading()).toBeNull();
  });

  it('lands on the home page once signed out', async () => {
    const { router } = renderScreen(stubs);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('holds a still-authenticated session on an explicit failure with a retry link', async () => {
    stubs.signIn({ userId: USER });

    const { router } = renderScreen(stubs);

    expect(await findFailureHeading()).toBeDefined();
    expect(router.state.location.pathname).toBe('/signout-callback');
    expect(screen.queryByText('Signing you out')).toBeNull();

    const retryLink = screen.getByRole('link', {
      name: /try signing out again/i,
    });
    expect(retryLink.getAttribute('href')).toBe('/signout');
  });

  it('does not read a Convex outage as a completed sign-out', async () => {
    stubs.signIn({ userId: USER });
    vi.mocked(useConvexAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      isRefreshing: false,
    });

    const { router } = renderScreen(stubs);

    expect(await findFailureHeading()).toBeDefined();
    expect(router.state.location.pathname).toBe('/signout-callback');
  });
});
