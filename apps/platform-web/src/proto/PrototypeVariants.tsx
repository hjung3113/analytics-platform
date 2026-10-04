// THROWAWAY #203/#195: two independent questions on existing routes.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePlatform } from '@ap/kernel';
import { isProductionEnv, PrototypeContext, type ChartPrototypeVariant, type DetailPrototypeVariant } from '@ap/ui';

const questions = {
  chart: { title: '#203 Chart stroke', variants: ['A', 'B1', 'B2', 'B3'], names: ['Current colours', 'Light darkening', 'Medium darkening', 'Strong darkening'] },
  detail: { title: '#195 Detail panel', variants: ['A', 'B', 'C'], names: ['Current overlay', 'Docked · 440px', 'Responsive · 1440px'] },
};
function questionFor(path: string): 'chart' | 'detail' | null {
  if (['/analytics/cycle-time', '/analytics/productivity'].includes(path)) return 'chart';
  return path === '/equipment' ? 'detail' : null;
}
// Capture before Kernel initialization canonicalizes unknown query params.
const production = isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } });
const entry = new URL(window.location.href);
const entryQuestion = questionFor(entry.pathname);
if (!production && entryQuestion) {
  const v = entry.searchParams.get('variant');
  if (v && questions[entryQuestion].variants.includes(v)) localStorage.setItem(`platform:proto-m2:v1:${entryQuestion}`, v);
}
function read(question: 'chart' | 'detail'): string {
  const value = localStorage.getItem(`platform:proto-m2:v1:${question}`);
  return value && questions[question].variants.includes(value) ? value : 'A';
}

export function PrototypeVariants({ children }: { children: ReactNode }) {
  const { url } = usePlatform();
  const path = new URL(url, window.location.origin).pathname;
  const question = questionFor(path);
  const [chart, setChart] = useState(() => read('chart') as ChartPrototypeVariant);
  const [detail, setDetail] = useState(() => read('detail') as DetailPrototypeVariant);
  const current = question === 'chart' ? chart : detail;
  function choose(value: string) {
    if (!question) return;
    localStorage.setItem(`platform:proto-m2:v1:${question}`, value);
    if (question === 'chart') setChart(value as ChartPrototypeVariant);
    else setDetail(value as DetailPrototypeVariant);
    const next = new URL(window.location.href);
    next.searchParams.set('variant', value);
    // Keep the Kernel's history state and page keys. Unknown params may be
    // dropped on its next navigation; localStorage owns prototype persistence.
    window.history.replaceState(window.history.state, '', next);
  }
  function cycle(delta: number) {
    if (!question) return;
    const choices = questions[question].variants;
    choose(choices[(choices.indexOf(current) + delta + choices.length) % choices.length]);
  }
  useEffect(() => {
    if (production || !question) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || target.closest('[role="tablist"], [role="menu"], [role="listbox"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, current]);
  if (production) return children;
  const config = question ? questions[question] : null;
  return <PrototypeContext.Provider value={{ chartActive: question === 'chart', chart: question === 'chart' ? chart : 'A', detail: question === 'detail' ? detail : 'A', detailHost: null, detailOpen: false, setDetailOpen: () => {} }}>
    {children}
    {config && createPortal(<nav aria-label="Prototype variants" className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-pill border border-border-control bg-surface-card px-4 py-2 text-[12px] text-text-primary shadow-lg">
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)} className="rounded-sm px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">←</button>
      <span aria-live="polite">{config.title} · {current} — {config.names[config.variants.indexOf(current)]}</span>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)} className="rounded-sm px-2 py-1 focus-visible:outline-2 focus-visible:outline-focus-ring">→</button>
    </nav>, document.body)}
  </PrototypeContext.Provider>;
}
