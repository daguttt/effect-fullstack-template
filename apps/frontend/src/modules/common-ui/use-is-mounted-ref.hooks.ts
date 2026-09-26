import { useEffect, useRef } from 'react';

/** Reset during effect setup because Strict Mode reruns setup after cleanup. */
export function useIsMountedRef() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}
