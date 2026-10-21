/** #575 PoC (throwaway): gives a panel's content the pixel box it fills, keeping the last real size while the panel is hidden (0px). */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function DockFill({ children }: { children: (size: { width: number; height: number }) => ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setSize(previous => (previous.width === Math.round(width) && previous.height === Math.round(height) ? previous : { width: Math.round(width), height: Math.round(height) }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);
  return <div ref={root} className="relative h-full min-h-0 w-full min-w-0 overflow-auto">{size.height > 0 ? children(size) : null}</div>;
}
