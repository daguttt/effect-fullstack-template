// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedText } from './use-debounced-text.hooks';

const DEBOUNCE_MS = 300;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useDebouncedText', () => {
  it('settles once the text has been quiet for the debounce window', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedText('', DEBOUNCE_MS));

    act(() => result.current.setText('a'));
    act(() => result.current.setText('ab'));
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    });
    expect(result.current.getSettledText()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.getSettledText()).toBe('ab');
  });

  it('never settles a value that setText has replaced mid-window', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedText('', DEBOUNCE_MS));

    act(() => result.current.setText('stale'));
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
      result.current.setText('fresh');
    });
    expect(result.current.getSettledText()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.getSettledText()).toBe('fresh');
  });

  it('reads the latest text at call time, not at render time', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedText('', DEBOUNCE_MS));

    act(() => result.current.setText('term'));
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const { getSettledText } = result.current;
    expect(getSettledText()).toBe('term');

    // A setText after the timer fired — the same shape as an adoption effect
    // running earlier in the pass — turns the settled reading stale even
    // through the previously captured function.
    act(() => result.current.setText('adopted'));
    expect(getSettledText()).toBeNull();
  });
});
