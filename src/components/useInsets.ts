"use client";

import { useEffect, useState, type RefObject } from "react";

export type Insets = { top: number; right: number; bottom: number; left: number };

/**
 * Measures floating UI (header, side/bottom card, dock) so the 3D stage can frame its content
 * in the free area instead of hiding it under cards or leaving empty bands.
 */
export function useInsets(refs: { header?: RefObject<HTMLElement | null>; side?: RefObject<HTMLElement | null>; dock?: RefObject<HTMLElement | null> }, deps: unknown[] = []): Insets {
  const [insets, setInsets] = useState<Insets>({ top: 72, right: 0, bottom: 0, left: 0 });

  useEffect(() => {
    const measure = () => {
      const h = window.innerHeight;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const header = refs.header?.current?.getBoundingClientRect();
      const side = refs.side?.current?.getBoundingClientRect();
      const dock = refs.dock?.current?.getBoundingClientRect();
      const top = header ? header.bottom + 4 : 0;
      if (wide) {
        setInsets({
          top,
          right: 12,
          left: side && side.width ? side.right + 8 : 0,
          bottom: dock && dock.height ? h - dock.top + 8 : 12,
        });
      } else {
        const lowest = Math.min(side && side.height ? side.top : h, dock && dock.height ? dock.top : h);
        setInsets({ top, right: 0, left: 0, bottom: h - lowest + 4 });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const r of [refs.header, refs.side, refs.dock]) if (r?.current) ro.observe(r.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return insets;
}
