// THROWAWAY: Q1 chart expression, Q2 filters, Q3 shared widget states, Q4 Context compression.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePlatform } from '@ap/kernel';
import { isProductionEnv, PrototypeContext, type ProtoVariant } from '@ap/ui';
const questions = {
  context: { title: 'Q4 · #56', names: ['현재 · 줄바꿈', '우선순위 overflow', '요약 + 편집 펼치기'] },
  chart: { title: 'Q1 · #207', names: ['현재', '기간별 범례 그룹', '분위수별 범례 표'] },
  filters: { title: 'Q2 · #54', names: ['현재', '공통 필터 행', '필터 팝오버 + 칩'] },
  states: { title: 'Q3 · #55', names: ['현재', '배너 + compact 위젯', '배너 + 상태 칩'] },
};
type Question = keyof typeof questions;
const choices: ProtoVariant[] = ['A', 'B', 'C'];
const key = (q: Question) => `platform:proto-m2-batch2:v1:${q}`;
const production = isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis);
function available(path: string): Question[] {
  if (path === '/analytics/productivity') return ['chart', 'states', 'context'];
  if (path === '/analytics/cycle-time') return ['chart', 'context'];
  if (['/equipment', '/metrics', '/admin/audit'].includes(path)) return ['filters', 'context'];
  return ['context'];
}
const entry = new URL(window.location.href);
const entryQ = entry.searchParams.get('protoQuestion') as Question;
const initialQ = available(entry.pathname).includes(entryQ) ? entryQ : available(entry.pathname)[0];
if (!production && initialQ && choices.includes(entry.searchParams.get('variant') as ProtoVariant)) localStorage.setItem(key(initialQ), entry.searchParams.get('variant')!);
const read = (q: Question): ProtoVariant => { const v = localStorage.getItem(key(q)) as ProtoVariant; return choices.includes(v) ? v : 'A'; };
export function PrototypeVariants({ children }: { children: ReactNode }) {
  const { url } = usePlatform();
  const options = available(new URL(url, window.location.origin).pathname);
  const [selected, setSelected] = useState<Question>(initialQ ?? 'chart');
  const question = options.includes(selected) ? selected : options[0];
  const [values, setValues] = useState(() => ({ chart: read('chart'), filters: read('filters'), states: read('states'), context: read('context') }));
  const current = question ? values[question] : 'A';
  const choose = (value: ProtoVariant, q = question) => {
    if (!q) return;
    setSelected(q); localStorage.setItem(key(q), value); setValues(old => ({ ...old, [q]: value }));
    const next = new URL(window.location.href); next.searchParams.set('variant', value); next.searchParams.set('protoQuestion', q);
    window.history.replaceState(window.history.state, '', next);
  };
  const cycle = (delta: number) => choose(choices[(choices.indexOf(current) + delta + 3) % 3]);
  useEffect(() => {
    if (production || !question) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="tablist"], [role="combobox"], [role="dialog"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [question, current]);
  if (production) return children;
  return <PrototypeContext.Provider value={values}>{children}{question && createPortal(<nav aria-label="Prototype variants" className="fixed bottom-4 left-1/2 z-[100] flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-border-control bg-surface-card px-3 py-2 text-xs text-text-primary shadow-lg">
    {options.map(q => <button type="button" key={q} aria-pressed={q === question} onClick={() => choose(values[q], q)} className="rounded-sm border border-border-control px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">{questions[q].title}</button>)}
    <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">←</button>
    <span aria-live="polite">{questions[question].title} · {current} — {questions[question].names[choices.indexOf(current)]}</span>
    <button type="button" aria-label="Next variant" onClick={() => cycle(1)} className="px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">→</button>
  </nav>, document.body)}</PrototypeContext.Provider>;
}
