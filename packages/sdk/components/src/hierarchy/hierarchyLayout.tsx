import { useLayoutEffect, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';

/** Measure actual overflow; a fitting label never creates a tooltip or a native title. */
export function ClippedLabel({ label, className = '' }: { label: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setClipped(element.scrollWidth > element.clientWidth);
    const owner = element.closest<HTMLElement>('a, button, [role=treeitem]');
    const focus = () => { if (owner?.matches(':focus-visible')) setOpen(true); };
    const blur = () => setOpen(false);
    owner?.addEventListener('focus', focus); owner?.addEventListener('blur', blur);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => { observer.disconnect(); owner?.removeEventListener('focus', focus); owner?.removeEventListener('blur', blur); };
  }, [label]);
  return <Tooltip open={clipped && open} onOpenChange={setOpen}><TooltipTrigger asChild><span ref={ref} className={`min-w-0 truncate break-keep ${className}`}>{label}</span></TooltipTrigger>{clipped && <TooltipContent side="right" className="pointer-events-none break-keep">{label}</TooltipContent>}</Tooltip>;
}

/** A whole row pitch, at most ten rows, using the sidebar's remaining space rather than a fixed empty box. */
export function useSidebarListSpace(dependency: unknown, pitch: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState(pitch * 10);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const outer = list.closest('aside')?.querySelector<HTMLElement>('[data-sidebar-scroll]');
    if (!outer) return;
    const measure = () => {
      const bounds = outer.getBoundingClientRect();
      const bottom = Math.max(bounds.top, ...Array.from(outer.children, child => child.getBoundingClientRect().bottom));
      const contentHeight = bottom - bounds.top + outer.scrollTop + parseFloat(getComputedStyle(outer).paddingBottom || '0');
      const available = outer.clientHeight - (contentHeight - list.clientHeight);
      const height = Math.max(pitch, Math.min(pitch * 10, Math.floor(available / pitch) * pitch));
      setMaxHeight(previous => previous === height ? previous : height);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(outer); observer.observe(list);
    return () => observer.disconnect();
  }, [dependency, pitch]);
  return { ref, maxHeight };
}
