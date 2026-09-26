import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

function subscribeToViewportChange(onViewportChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', onViewportChange);
  return () => mql.removeEventListener('change', onViewportChange);
}

const getIsMobileSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT;

const getIsMobileServerSnapshot = () => false;

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToViewportChange,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot
  );
}
