import { useLayoutEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

/** A border tab, outside the result's header. The top layer escapes scroll/clip ancestors without a portal. */
export function QueryRefreshNotice({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !element.parentElement) return;
    const notice = element;
    const section = element.parentElement;
    let lifted = false;
    function reset() {
      if (lifted) notice.hidePopover();
      lifted = false;
      notice.removeAttribute('popover');
      notice.removeAttribute('style');
    }
    function place() {
      const anchor = section.getBoundingClientRect();
      const height = notice.getBoundingClientRect().height;
      // Use at most 12px of existing card padding; an unpadded table gets only a 1px border overlap.
      const header = section.querySelector('header');
      const tableHead = section.querySelector('thead');
      const headerInset = header ? header.getBoundingClientRect().top + (parseFloat(getComputedStyle(header).paddingTop) || 0) - anchor.top : 12;
      const tableInset = tableHead ? tableHead.getBoundingClientRect().top - anchor.top : 12;
      const inset = header || tableHead ? Math.max(1, Math.min(12, headerInset, tableInset)) : 1;
      const top = anchor.top - height + inset;
      let clipped = false;
      let edgeVisible = anchor.top >= 0 && anchor.top < window.innerHeight;
      for (let ancestor = section.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor);
        const clipsY = /^(auto|scroll|hidden|clip)$/.test(css.overflowY || css.overflow);
        const clipsX = /^(auto|scroll|hidden|clip)$/.test(css.overflowX || css.overflow);
        if (!clipsY && !clipsX) continue;
        const box = ancestor.getBoundingClientRect();
        const innerTop = box.top + ancestor.clientTop;
        const innerLeft = box.left + ancestor.clientLeft;
        if (clipsY) {
          clipped ||= top < innerTop;
          edgeVisible &&= anchor.top >= innerTop && anchor.top < box.bottom;
        }
        if (clipsX) {
          clipped ||= anchor.left < innerLeft || anchor.right > box.right;
          edgeVisible &&= anchor.right > innerLeft && anchor.left < box.right;
        }
      }
      if (!clipped || typeof notice.showPopover !== 'function') {
        if (lifted) reset();
        notice.style.top = `${top - anchor.top}px`;
        return;
      }
      // Manual popovers neither move focus nor dismiss another open popover. DOM/aria-busy ancestry stays intact.
      if (!lifted) {
        notice.setAttribute('popover', 'manual');
        notice.showPopover();
        lifted = true;
      }
      Object.assign(notice.style, {
        position: 'fixed', inset: 'auto', margin: '0', translate: 'none',
        top: `${top}px`, right: `${window.innerWidth - anchor.right + 12}px`,
        maxWidth: `${Math.max(0, anchor.width - 24)}px`, visibility: edgeVisible ? 'visible' : 'hidden',
      });
    }
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(section);
    observer?.observe(notice);
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      reset();
    };
  }, [label]);
  return <span ref={ref} role="status" aria-label={label} className="pointer-events-none absolute right-3 -top-2.5 z-[2] m-0 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 text-xs font-medium leading-4 text-text-secondary backdrop:pointer-events-none backdrop:bg-transparent">
    <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />{label}
  </span>;
}
