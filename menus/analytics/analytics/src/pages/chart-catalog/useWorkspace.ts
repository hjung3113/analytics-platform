import { useLayoutEffect, useRef, useState } from 'react';

/** Measurements stay menu-local until #575 defines a reusable workspace contract. */
export function useWorkspace() {
  const root = useRef<HTMLDivElement>(null);
  const chart = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1024);
  const [plotHeight, setPlotHeight] = useState(360);
  useLayoutEffect(() => {
    const element = root.current;
    const scrollport = chart.current;
    if (!element || !scrollport) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const content = element.closest('[data-platform-page-content]');
      const bottomPadding = content ? Number.parseFloat(getComputedStyle(content).paddingBottom) || 0 : 0;
      // Includes the actual shell header/Context, page padding and any outcome banners above us.
      element.style.height = `${Math.max(240, window.innerHeight - bounds.top - bottomPadding)}px`;
      if (bounds.width > 0) setWidth(bounds.width);
      const section = scrollport.querySelector('section');
      const plot = section?.querySelector<HTMLElement>('[role="img"], [aria-busy]');
      if (section && plot && scrollport.clientHeight > 0) {
        const chrome = section.getBoundingClientRect().height - plot.getBoundingClientRect().height;
        // Short viewports keep every control reachable in the chart scrollport.
        setPlotHeight(Math.max(200, Math.floor(scrollport.clientHeight - chrome - 4)));
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    observer?.observe(scrollport);
    const observeContent = () => {
      for (const child of scrollport.querySelectorAll('section > *, header, footer')) observer?.observe(child);
      measure();
    };
    const mutations = new MutationObserver(observeContent);
    mutations.observe(scrollport, { childList: true, subtree: true });
    observeContent();
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return { root, chart, width, plotHeight };
}
