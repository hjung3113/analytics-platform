// THROWAWAY #306 — never merge.
// Three table/filter variants on every route, selected with ?protoQuestion=table&variant=A|B|C.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePlatform } from '@ap/kernel';
import { isProductionEnv, PrototypeContext, type ProtoVariant } from '@ap/ui';

const question = 'table';
const title = '#306 · 표·필터';
const names = ['남은 높이 채움 + 오른쪽 고정 동작', '행 수만큼 · 페이지 스크롤 + 행 클릭', '즉시 적용 + 촘촘한 밀도'];
const choices: ProtoVariant[] = ['A', 'B', 'C'];
const key = 'platform:proto-306:table:v1';
const production = isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis);
function read(): ProtoVariant {
  if (production) return 'A';
  const stored = localStorage.getItem(key) as ProtoVariant;
  return choices.includes(stored) ? stored : 'A';
}

export function PrototypeVariants({ children }: { children: ReactNode }) {
  const { url, navigate } = usePlatform();
  const location = new URL(url, window.location.origin);
  const requested = location.searchParams.get('variant') as ProtoVariant;
  const requestedQuestion = location.searchParams.get('protoQuestion');
  const explicit = (requestedQuestion === null || requestedQuestion === question) && choices.includes(requested) ? requested : undefined;
  const current = production ? 'A' : explicit ?? read();

  useEffect(() => {
    if (!production && explicit) localStorage.setItem(key, explicit);
  }, [explicit]);

  useEffect(() => {
    if (production) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="tablist"], [role="combobox"], [role="dialog"], [role="radiogroup"], [role="radio"]'))) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const value = choices[(choices.indexOf(current) + (event.key === 'ArrowLeft' ? -1 : 1) + choices.length) % choices.length];
      localStorage.setItem(key, value);
      const next = new URL(url, window.location.origin);
      next.searchParams.set('protoQuestion', question);
      next.searchParams.set('variant', value);
      navigate(next.pathname + next.search + next.hash, { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, url, navigate]);

  const cycle = (delta: number) => {
    const value = choices[(choices.indexOf(current) + delta + choices.length) % choices.length];
    localStorage.setItem(key, value);
    const next = new URL(url, window.location.origin);
    next.searchParams.set('protoQuestion', question);
    next.searchParams.set('variant', value);
    navigate(next.pathname + next.search + next.hash, { replace: true });
  };
  if (production) return <PrototypeContext.Provider value="A">{children}</PrototypeContext.Provider>;
  return <PrototypeContext.Provider value={current}>{children}{createPortal(
    <nav aria-label="Prototype variants" className="fixed bottom-4 left-1/2 z-50 flex max-w-xl -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-border-control bg-surface-card px-3 py-2 text-xs text-text-primary">
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">←</button>
      <span aria-live="polite">{title} · {current} — {names[choices.indexOf(current)]}</span>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">→</button>
    </nav>, document.body,
  )}</PrototypeContext.Provider>;
}
