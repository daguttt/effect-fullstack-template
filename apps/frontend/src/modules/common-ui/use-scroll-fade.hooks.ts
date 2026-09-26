import { type RefObject, useEffect } from 'react';

import * as Predicate from 'effect/Predicate';

/**
 * Marks a mounted scroll container with the directions it can still scroll,
 * so the `overflow-fade` utility can band those edges. Watches the container
 * and its content for size changes.
 */
export function useScrollFade(
  scrollContainerRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (Predicate.isNull(scrollContainer)) return;

    const updateScrollFade = () => {
      const canScrollDown =
        scrollContainer.scrollHeight -
          scrollContainer.clientHeight -
          scrollContainer.scrollTop >
        1;
      const canScrollRight =
        scrollContainer.scrollWidth -
          scrollContainer.clientWidth -
          scrollContainer.scrollLeft >
        1;
      const canScrollLeft = scrollContainer.scrollLeft > 1;
      scrollContainer.toggleAttribute('data-scrollable-below', canScrollDown);
      scrollContainer.toggleAttribute('data-scrollable-right', canScrollRight);
      scrollContainer.toggleAttribute('data-scrollable-left', canScrollLeft);
      // The overlay cannot size itself to an auto-height scrollport.
      scrollContainer.style.setProperty(
        '--overflow-fade-viewport-height',
        `${scrollContainer.clientHeight}px`
      );
    };

    updateScrollFade();
    scrollContainer.addEventListener('scroll', updateScrollFade, {
      passive: true,
    });
    const observer = new ResizeObserver(updateScrollFade);
    observer.observe(scrollContainer);
    const content = scrollContainer.firstElementChild;
    if (Predicate.isNotNull(content)) observer.observe(content);

    return () => {
      scrollContainer.removeEventListener('scroll', updateScrollFade);
      observer.disconnect();
    };
  }, [scrollContainerRef]);
}
