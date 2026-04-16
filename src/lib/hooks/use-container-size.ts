"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Hook that measures a container element's dimensions.
 * Returns a callback ref to attach and the current width/height.
 * Uses a callback ref + ResizeObserver so measurement works
 * reliably across client-side navigations (back/forward).
 */
export function useContainerSize() {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      const measure = () => {
        const rect = node.getBoundingClientRect();
        setWidth(Math.floor(rect.width));
        setHeight(Math.floor(rect.height));
      };

      measure();
      observerRef.current = new ResizeObserver(measure);
      observerRef.current.observe(node);
    }
  }, []);

  return { ref, width, height };
}
