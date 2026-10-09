// THROWAWAY #250 — never merge.
// Workspace shell A/B/C. Switching reloads so the registry, built at module load, matches the variant.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isProductionEnv, PrototypeContext, type ProtoVariant } from '@ap/ui';
import { readProtoVariant } from './ia';

const question = 'workspaces';
const title = '#250 · 멀티 워크스페이스 셸';
const names = ['런처 페이지 · 하단 고정 협업', '레일 팝오버 런처 · 사이드바 머리 전환기', '최근 작업 홈 · 업무/협업 탭'];
const choices: ProtoVariant[] = ['A', 'B', 'C'];
const key = 'platform:proto-250:v1';
const production = isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis);

function apply(value: ProtoVariant) {
  localStorage.setItem(key, value);
  const next = new URL(window.location.href);
  next.searchParams.set('protoQuestion', question);
  next.searchParams.set('variant', value);
  window.location.assign(next.pathname + next.search + next.hash);
}

export function PrototypeVariants({ children }: { children: ReactNode }) {
  const current = production ? 'A' : readProtoVariant();
  useEffect(() => { if (!production) localStorage.setItem(key, current); }, [current]);
  useEffect(() => {
    if (production) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="tablist"], [role="combobox"], [role="dialog"], [role="radiogroup"], [role="radio"]'))) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const value = choices[(choices.indexOf(current) + (event.key === 'ArrowLeft' ? -1 : 1) + choices.length) % choices.length];
      apply(value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);
  if (production) return <PrototypeContext.Provider value="A">{children}</PrototypeContext.Provider>;
  return <PrototypeContext.Provider value={current}>{children}{createPortal(
    <nav aria-label="Prototype variants" className="fixed bottom-4 left-1/2 z-50 flex max-w-xl -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-border-control bg-surface-card px-3 py-2 text-xs text-text-primary">
      <button type="button" aria-label="Previous variant" onClick={() => apply(choices[(choices.indexOf(current) - 1 + choices.length) % choices.length])} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">←</button>
      <span aria-live="polite">{title} · {current} — {names[choices.indexOf(current)]}</span>
      <button type="button" aria-label="Next variant" onClick={() => apply(choices[(choices.indexOf(current) + 1) % choices.length])} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">→</button>
    </nav>, document.body,
  )}</PrototypeContext.Provider>;
}
