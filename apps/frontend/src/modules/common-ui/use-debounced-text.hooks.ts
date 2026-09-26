import { useCallback, useRef, useState } from 'react';

import { useDebounce } from '@uidotdev/usehooks';

/**
 * Responsive local text with a debounced, staleness-checked reading.
 *
 * The input renders from `text` on every keystroke; `getSettledText` returns
 * the debounced value once it has caught up with the latest `setText`, and
 * `null` while a newer edit is still inside the debounce window.
 *
 * `getSettledText` reads the latest text at call time, not at render time.
 * Call it from an effect: a `setText` performed by an earlier effect in the
 * same pass (adopting an external value, for example) is already visible, so
 * a timer that fired for the replaced text reads as stale instead of settling.
 */
export function useDebouncedText(initialText: string, debounceMs: number) {
  const [text, setText] = useState(initialText);
  const latestTextRef = useRef(text);
  const debouncedText = useDebounce(text, debounceMs);

  const updateText = useCallback((nextText: string) => {
    latestTextRef.current = nextText;
    setText(nextText);
  }, []);

  const getSettledText = useCallback(
    () => (debouncedText === latestTextRef.current ? debouncedText : null),
    [debouncedText]
  );

  return { text, setText: updateText, getSettledText };
}
