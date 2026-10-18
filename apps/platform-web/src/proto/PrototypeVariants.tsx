// THROWAWAY #423 — never merge.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PrototypeContext, type ProtoVariant } from '@ap/ui';
import { FIXED } from './fixed';

const choices: ProtoVariant[] = ['A', 'B', 'C'];
const names = ['A 팝오버 카드', 'B 펼침 패널', 'C 검색형'];
const KEY = 'platform:proto-423:v1';

function read(): ProtoVariant {
  const q = new URLSearchParams(window.location.search).get('variant');
  if (q === 'A' || q === 'B' || q === 'C') return q;
  const s = localStorage.getItem(KEY);
  return s === 'B' || s === 'C' ? s : 'A';
}
function apply(value: ProtoVariant) {
  localStorage.setItem(KEY, value);
  const next = new URL(window.location.href);
  next.searchParams.set('variant', value);
  window.location.assign(next.pathname + next.search + next.hash);
}

export function PrototypeVariants({ children }: { children: ReactNode }) {
  const current = import.meta.env.DEV ? read() : 'A';
  useEffect(() => { localStorage.setItem(KEY, current); }, [current]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (t instanceof Element && t.closest('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="dialog"]'))) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      apply(choices[(choices.indexOf(current) + (e.key === 'ArrowLeft' ? -1 : 1) + 3) % 3]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);
  return <PrototypeContext.Provider value={{ variant: current, fixed: FIXED }}>{children}{import.meta.env.DEV && createPortal(
    <nav aria-label="Prototype variants" className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-md border border-border-control bg-surface-card px-3 py-2 text-xs text-text-primary shadow-lg">
      <button type="button" aria-label="Previous variant" onClick={() => apply(choices[(choices.indexOf(current) + 2) % 3]!)} className="px-2 py-1">←</button>
      <span aria-live="polite">#423 · {names[choices.indexOf(current)]}</span>
      <button type="button" aria-label="Next variant" onClick={() => apply(choices[(choices.indexOf(current) + 1) % 3]!)} className="px-2 py-1">→</button>
    </nav>, document.body)}</PrototypeContext.Provider>;
}
