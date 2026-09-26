// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { LoginRequiredError, RefreshError } from '@workos-inc/authkit-js';
import { useAuth } from '@workos-inc/authkit-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConvexAuthFromWorkOS } from './use-convex-auth-from-workos.hooks';

vi.mock('@workos-inc/authkit-react', () => ({ useAuth: vi.fn() }));

describe('useConvexAuthFromWorkOS', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('forwards a forced refresh request from Convex to WorkOS', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('access-token');
    vi.mocked(useAuth).mockReturnValue({
      getAccessToken,
      isLoading: false,
      user: { id: 'user-id' },
    } as never);

    const { result } = renderHook(() => useConvexAuthFromWorkOS());

    await expect(
      result.current.fetchAccessToken({ forceRefreshToken: true })
    ).resolves.toBe('access-token');
    expect(getAccessToken).toHaveBeenCalledExactlyOnceWith({
      forceRefresh: true,
    });
  });

  it.each([
    new RefreshError('Service unavailable', { isTransient: true }),
    new TypeError('Failed to fetch'),
  ])(
    'retries a transient token failure without reporting a sign-out',
    async (error) => {
      vi.useFakeTimers();
      const getAccessToken = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('refreshed-access-token');
      vi.mocked(useAuth).mockReturnValue({
        getAccessToken,
        isLoading: false,
        user: { id: 'user-id' },
      } as never);

      const { result } = renderHook(() => useConvexAuthFromWorkOS());
      const token = result.current.fetchAccessToken({
        forceRefreshToken: true,
      });

      await vi.advanceTimersByTimeAsync(600);

      await expect(token).resolves.toBe('refreshed-access-token');
      expect(getAccessToken).toHaveBeenCalledTimes(2);
    }
  );

  it('stops retrying a transient failure after two minutes and reports a sign-out', async () => {
    vi.useFakeTimers();
    const getAccessToken = vi
      .fn()
      .mockRejectedValue(
        new RefreshError('Service unavailable', { isTransient: true })
      );
    vi.mocked(useAuth).mockReturnValue({
      getAccessToken,
      isLoading: false,
      user: { id: 'user-id' },
    } as never);

    const { result } = renderHook(() => useConvexAuthFromWorkOS());
    const token = result.current.fetchAccessToken({ forceRefreshToken: true });

    await vi.advanceTimersByTimeAsync(3 * 60_000);

    await expect(token).resolves.toBeNull();
    const attempts = getAccessToken.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getAccessToken).toHaveBeenCalledTimes(attempts);
  });

  it.each([
    new LoginRequiredError(),
    new RefreshError('Refresh token rejected', { isTransient: false }),
    new Error('Unexpected SDK failure'),
  ])(
    'reports a sign-out instead of rejecting when the session is gone',
    async (error) => {
      const getAccessToken = vi.fn().mockRejectedValue(error);
      vi.mocked(useAuth).mockReturnValue({
        getAccessToken,
        isLoading: false,
        user: { id: 'user-id' },
      } as never);

      const { result } = renderHook(() => useConvexAuthFromWorkOS());

      await expect(
        result.current.fetchAccessToken({ forceRefreshToken: false })
      ).resolves.toBeNull();
      expect(getAccessToken).toHaveBeenCalledExactlyOnceWith();
    }
  );

  it('stops retrying once the WorkOS session is replaced', async () => {
    vi.useFakeTimers();
    const getAccessToken = vi
      .fn()
      .mockRejectedValue(
        new RefreshError('Service unavailable', { isTransient: true })
      );
    const session = (organizationId: string) =>
      ({
        getAccessToken,
        isLoading: false,
        organizationId,
        user: { id: 'user-id' },
      }) as never;
    vi.mocked(useAuth).mockReturnValue(session('organization-a'));

    const { rerender, result } = renderHook(() => useConvexAuthFromWorkOS());
    const obsoleteToken = result.current.fetchAccessToken({
      forceRefreshToken: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(getAccessToken).toHaveBeenCalledTimes(1);

    vi.mocked(useAuth).mockReturnValue(session('organization-b'));
    rerender();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(obsoleteToken).resolves.toBeNull();
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });

  it('hands Convex a new fetcher only when the WorkOS session changes', () => {
    const getAccessToken = vi.fn().mockResolvedValue('access-token');
    const session = (organizationId: string) =>
      ({
        getAccessToken,
        isLoading: false,
        organizationId,
        user: { id: 'user-id' },
      }) as never;
    vi.mocked(useAuth).mockReturnValue(session('organization-a'));

    const { rerender, result } = renderHook(() => useConvexAuthFromWorkOS());
    const initialFetcher = result.current.fetchAccessToken;

    rerender();
    expect(result.current.fetchAccessToken).toBe(initialFetcher);

    vi.mocked(useAuth).mockReturnValue(session('organization-b'));
    rerender();
    expect(result.current.fetchAccessToken).not.toBe(initialFetcher);
  });
});
