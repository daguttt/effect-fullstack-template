// @vitest-environment jsdom
import { StrictMode } from 'react';

import { cleanup, render } from '@testing-library/react';
import { useAuth } from '@workos-inc/authkit-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSignOutOnce } from './use-sign-out-once.hooks';

vi.mock('@workos-inc/authkit-react', () => ({ useAuth: vi.fn() }));

const signOut = vi.fn<(options: { returnTo: string }) => void>();

function installAuthKit() {
  vi.mocked(useAuth).mockImplementation((() => ({ signOut })) as never);
}

function SignOutHarness() {
  useSignOutOnce();

  return null;
}

const renderHarness = () => render(<SignOutHarness />, { wrapper: StrictMode });

const singleReturnTo = () => {
  expect(signOut).toHaveBeenCalledTimes(1);

  const [options] = signOut.mock.calls[0] as [{ returnTo: string }];

  return new URL(options.returnTo);
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  installAuthKit();
});

afterEach(cleanup);

describe('useSignOutOnce', () => {
  it('starts sign-out once under a replayed effect, not twice', () => {
    renderHarness();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('hands WorkOS the absolute same-origin sign-out callback', () => {
    renderHarness();

    const returnTo = singleReturnTo();
    expect(returnTo.origin).toBe(window.location.origin);
    expect(returnTo.pathname).toBe('/signout-callback');
    expect(returnTo.search).toBe('');
  });

  it('holds through re-renders that change the bound signOut', () => {
    const { rerender } = renderHarness();

    rerender(<SignOutHarness />);
    rerender(<SignOutHarness />);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('starts one new sign-out on a genuine new mount', () => {
    const { unmount } = renderHarness();
    unmount();

    renderHarness();

    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
