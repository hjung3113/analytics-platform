// THROWAWAY #156 — never merge.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePlatform } from '@ap/kernel';
import { isProductionEnv, PrototypeContext, type ProtoVariant } from '@ap/ui';

const questions = {
  management: { title: '#156 · Management', names: ['현재 · 화면마다 다름', '표 안 필터', '왼쪽 필터 레일'] },
  analysis: { title: '#156 · Analysis', names: ['현재 · 세로 쌓기', 'KPI 띠 + 차트 2열', 'KPI 레일'] },
};
type Question = keyof typeof questions;
const choices: ProtoVariant[] = ['A', 'B', 'C'];
const key = (question: Question) => `platform:proto-156:v1:${question}`;
const production = isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis);
function available(path: string): Question | undefined {
  if (path === '/equipment' || path === '/admin/audit') return 'management';
  if (path === '/analytics/cycle-time') return 'analysis';
  return undefined;
}
function read(question: Question): ProtoVariant {
  if (production) return 'A';
  const stored = localStorage.getItem(key(question)) as ProtoVariant;
  return choices.includes(stored) ? stored : 'A';
}

export function PrototypeVariants({ children }: { children: ReactNode }) {
  const { url, navigate } = usePlatform();
  const location = new URL(url, window.location.origin);
  const question = available(location.pathname);
  const requested = location.searchParams.get('variant') as ProtoVariant;
  const requestedQuestion = location.searchParams.get('protoQuestion');
  const explicit = question && (requestedQuestion === null || requestedQuestion === question) && choices.includes(requested) ? requested : undefined;
  const values = { management: read('management'), analysis: read('analysis') };
  if (!production && question && explicit) values[question] = explicit;
  const current = question ? values[question] : 'A';

  useEffect(() => {
    if (!production && question && explicit) localStorage.setItem(key(question), explicit);
  }, [question, explicit]);

  useEffect(() => {
    if (production || !question) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="tablist"], [role="combobox"], [role="dialog"]'))) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const value = choices[(choices.indexOf(current) + (event.key === 'ArrowLeft' ? -1 : 1) + 3) % 3];
      localStorage.setItem(key(question), value);
      const next = new URL(url, window.location.origin);
      next.searchParams.set('protoQuestion', question);
      next.searchParams.set('variant', value);
      navigate(next.pathname + next.search, { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, current, url, navigate]);

  const cycle = (delta: number) => {
    if (!question) return;
    const value = choices[(choices.indexOf(current) + delta + 3) % 3];
    localStorage.setItem(key(question), value);
    const next = new URL(url, window.location.origin);
    next.searchParams.set('protoQuestion', question);
    next.searchParams.set('variant', value);
    navigate(next.pathname + next.search, { replace: true });
  };
  if (production) return children;
  return <PrototypeContext.Provider value={values}>{children}{question && createPortal(
    <nav aria-label="Prototype variants" className="fixed bottom-4 left-1/2 z-[100] flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-border-control bg-surface-card px-3 py-2 text-xs text-text-primary">
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">←</button>
      <span aria-live="polite">{questions[question].title} · {current} — {questions[question].names[choices.indexOf(current)]}</span>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">→</button>
    </nav>, document.body,
  )}</PrototypeContext.Provider>;
}
