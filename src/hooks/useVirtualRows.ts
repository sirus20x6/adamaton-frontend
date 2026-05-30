import * as React from "react";

/**
 * Minimal fixed-height row virtualizer.
 *
 * Renders only the slice of rows that intersect the scroll viewport (plus an
 * overscan margin) so a list of thousands of items stays cheap to render. No
 * external dependency — the app ships no virtualization library and the build
 * gates forbid adding one, so this implements the small amount of windowing
 * math we actually need.
 *
 * Usage:
 *   const scrollRef = React.useRef<HTMLDivElement>(null);
 *   const v = useVirtualRows({ count, rowHeight: 64, scrollRef });
 *   // outer scroller: ref={scrollRef}
 *   // spacer:         style={{ height: v.totalHeight }}
 *   // rows container: style={{ transform: `translateY(${v.offsetY}px)` }}
 *   // map v.range -> rows[i]
 */
export type VirtualRows = {
  /** Indices [start, end) that should be rendered this frame. */
  start: number;
  end: number;
  /** Convenience array of the visible indices. */
  range: number[];
  /** Pixel height of the full list (drives the scrollbar). */
  totalHeight: number;
  /** Pixel offset to translate the rendered window to its true position. */
  offsetY: number;
};

export function useVirtualRows({
  count,
  rowHeight,
  scrollRef,
  overscan = 8,
}: {
  count: number;
  rowHeight: number;
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Extra rows rendered above/below the viewport to hide scroll seams. */
  overscan?: number;
}): VirtualRows {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const sync = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    };
    sync();

    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [scrollRef]);

  // Clamp the count change (e.g. a filter shrank the list while scrolled to the
  // bottom) so we never compute a window past the end.
  const safeCount = Math.max(0, count);

  const start = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - overscan,
  );
  const visibleCount =
    viewportHeight > 0
      ? Math.ceil(viewportHeight / rowHeight) + overscan * 2
      : overscan * 2;
  const end = Math.min(safeCount, start + visibleCount);

  const range = React.useMemo(() => {
    const out: number[] = [];
    for (let i = start; i < end; i++) out.push(i);
    return out;
  }, [start, end]);

  return {
    start,
    end,
    range,
    totalHeight: safeCount * rowHeight,
    offsetY: start * rowHeight,
  };
}
