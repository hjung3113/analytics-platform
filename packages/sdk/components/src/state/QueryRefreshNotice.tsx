import { useLayoutEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@ap/ui';

/** An in-section notice: never lifted over sticky or workspace headers. */
export function QueryRefreshNotice({ label, placement }: { label: string; placement: 'bottom-end' | 'top-end' }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const notice = ref.current;
    const section = notice?.parentElement;
    if (!notice || !section) return;
    const atBottom = placement === 'bottom-end';
    function place() {
      if (!notice || !section) return;
      const anchor = section.getBoundingClientRect();
      const { height, width } = notice.getBoundingClientRect();
      const right = anchor.right - 12;
      const left = right - width;
      // Footer pagination, row links and chart selection actions may occupy the default corner.
      // Keep the nearest free vertical slot at that edge without reserving any layout space.
      const controls = [...section.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"], [role="slider"]')]
        .map(control => control.getBoundingClientRect())
        .filter(box => box.width > 0 && box.height > 0 && box.right > left && box.left < right)
        .sort((a, b) => atBottom ? b.bottom - a.bottom : a.top - b.top);
      let inset = 0;
      for (const box of controls) {
        const top = atBottom ? anchor.bottom - inset - height : anchor.top + inset;
        if (box.bottom > top && box.top < top + height) {
          inset = atBottom ? anchor.bottom - box.top + 4 : box.bottom - anchor.top + 4;
        }
      }
      inset = Math.max(0, Math.min(inset, anchor.height - height));
      notice.style[atBottom ? 'top' : 'bottom'] = '';
      notice.style[atBottom ? 'bottom' : 'top'] = `${inset}px`;
    }
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(section);
    observer?.observe(notice);
    const mutations = new MutationObserver(place);
    mutations.observe(section, { childList: true, subtree: true });
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      mutations.disconnect();
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [label, placement]);
  return <span ref={ref} role="status" aria-label={label} className={cn('pointer-events-none absolute right-3 z-[2] m-0 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 text-xs font-medium leading-4 text-text-secondary', placement === 'bottom-end' ? 'bottom-0' : 'top-0')}>
    <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />{label}
  </span>;
}
