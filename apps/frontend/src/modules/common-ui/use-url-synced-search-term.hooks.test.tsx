// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SEARCH_DEBOUNCE_MS,
  useUrlSyncedSearchTerm,
} from './use-url-synced-search-term.hooks';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useUrlSyncedSearchTerm', () => {
  it('does not restore the previous term after an immediate clear commits', () => {
    vi.useFakeTimers();
    const commit = vi.fn<(nextSearchTerm: string) => void>();
    const { result, rerender } = renderHook(
      ({ committedSearchTerm }) =>
        useUrlSyncedSearchTerm(committedSearchTerm, commit),
      { initialProps: { committedSearchTerm: 'avery' } }
    );

    act(() => result.current.clear());
    rerender({ committedSearchTerm: '' });

    expect(result.current.text).toBe('');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('');
  });

  it('keeps characters deleted while a commit is still round-tripping', () => {
    vi.useFakeTimers();
    const commit = vi.fn<(nextSearchTerm: string) => void>();
    const { result, rerender } = renderHook(
      ({ committedSearchTerm }) =>
        useUrlSyncedSearchTerm(committedSearchTerm, commit),
      { initialProps: { committedSearchTerm: '' } }
    );

    // Typo typed out, then committed once the user pauses.
    act(() => result.current.setText('janw'));
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(commit).toHaveBeenCalledWith('janw');

    // Backspace lands before the router reports the new term back.
    act(() => result.current.setText('jan'));
    rerender({ committedSearchTerm: 'janw' });

    expect(result.current.text).toBe('jan');

    // The corrected term still reaches the URL on the next debounce.
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(commit).toHaveBeenLastCalledWith('jan');
  });

  it('keeps corrections when two commits are outstanding at once', () => {
    vi.useFakeTimers();
    const commit = vi.fn<(nextSearchTerm: string) => void>();
    const { result, rerender } = renderHook(
      ({ committedSearchTerm }) =>
        useUrlSyncedSearchTerm(committedSearchTerm, commit),
      { initialProps: { committedSearchTerm: '' } }
    );

    // Typing keeps interrupting the router's transition, so neither commit has
    // rendered back yet when the second one fires.
    act(() => result.current.setText('janw'));
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    act(() => result.current.setText('jan'));
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(commit.mock.calls.map(([term]) => term)).toEqual(['janw', 'jan']);

    // Both echoes now arrive, in commit order.
    rerender({ committedSearchTerm: 'janw' });
    expect(result.current.text).toBe('jan');

    rerender({ committedSearchTerm: 'jan' });
    expect(result.current.text).toBe('jan');
  });

  it('adopts an external term that arrives while commits are outstanding', () => {
    vi.useFakeTimers();
    const commit = vi.fn<(nextSearchTerm: string) => void>();
    const { result, rerender } = renderHook(
      ({ committedSearchTerm }) =>
        useUrlSyncedSearchTerm(committedSearchTerm, commit),
      { initialProps: { committedSearchTerm: '' } }
    );

    act(() => result.current.setText('janw'));
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    act(() => result.current.setText('jan'));
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    // A term neither commit sent is external, however many are in flight.
    rerender({ committedSearchTerm: 'bob' });

    expect(result.current.text).toBe('bob');
  });

  it('adopts a committed term the hook did not send itself', () => {
    vi.useFakeTimers();
    const commit = vi.fn<(nextSearchTerm: string) => void>();
    const { result, rerender } = renderHook(
      ({ committedSearchTerm }) =>
        useUrlSyncedSearchTerm(committedSearchTerm, commit),
      { initialProps: { committedSearchTerm: 'avery' } }
    );

    // Back/forward navigation to a term this hook never committed.
    rerender({ committedSearchTerm: 'bob' });

    expect(result.current.text).toBe('bob');

    // Adopting must not bounce back out as a fresh commit.
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(commit).not.toHaveBeenCalled();
  });
});
