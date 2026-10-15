// THROWAWAY #303/#307 — never merge.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, usePlatform } from '@ap/kernel';
import { Button, isProductionEnv, PrototypeContext, type ProtoQuestion, type ProtoVariant } from '@ap/ui';

const choices: ProtoVariant[] = ['A', 'B', 'C'];
const storageKey = (question: Exclude<ProtoQuestion, null>) => `platform:proto-${question === 'header' ? '303' : '307'}:${question}:v1`;
const questionLabel = (question: Exclude<ProtoQuestion, null>, lang: string) => question === 'header'
  ? (lang === 'ko' ? '#303 · 페이지 머리' : '#303 · Page header')
  : (lang === 'ko' ? '#307 · 구간 선택' : '#307 · Range selection');
const variantLabels = {
  header: ['순서 양보', '정보 줄 분리', '정보 팝오버'],
  brush: ['시작·끝 입력 + 프리셋', '키보드 커서 선택', '두 손잡이 슬라이더'],
} as const;

const production = isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis);

function readVariant(question: Exclude<ProtoQuestion, null>): ProtoVariant {
  try {
    const stored = localStorage.getItem(storageKey(question));
    return choices.includes(stored as ProtoVariant) ? stored as ProtoVariant : 'A';
  } catch {
    return 'A';
  }
}

function storeVariant(question: Exclude<ProtoQuestion, null>, variant: ProtoVariant) {
  try { localStorage.setItem(storageKey(question), variant); } catch { /* prototype preference only */ }
}

export function PrototypeVariants({ children }: { children: ReactNode }) {
  const { url, navigate } = usePlatform();
  const { lang } = useI18n();
  const location = new URL(url, window.location.origin);
  const requestedQuestion = location.searchParams.get('protoQuestion');
  const question: Exclude<ProtoQuestion, null> = requestedQuestion === 'brush' ? 'brush' : 'header';
  const requested = location.searchParams.get('variant') as ProtoVariant | null;
  const explicit = (requestedQuestion === null || requestedQuestion === question) && choices.includes(requested as ProtoVariant) ? requested as ProtoVariant : undefined;
  const current = production ? 'A' : explicit ?? readVariant(question);

  useEffect(() => {
    if (!production && explicit) storeVariant(question, explicit);
  }, [question, explicit]);

  useEffect(() => {
    if (production) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable], [role="menu"], [role="listbox"], [role="tablist"], [role="combobox"], [role="dialog"], [role="radiogroup"], [role="radio"], [role="slider"], [data-prototype-chart-plot]'))) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = choices[(choices.indexOf(current) + (event.key === 'ArrowLeft' ? -1 : 1) + choices.length) % choices.length];
      storeVariant(question, next);
      const targetUrl = new URL(url, window.location.origin);
      targetUrl.searchParams.set('protoQuestion', question);
      targetUrl.searchParams.set('variant', next);
      navigate(targetUrl.pathname + targetUrl.search + targetUrl.hash, { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, question, url, navigate]);

  const cycle = (delta: number) => {
    const next = choices[(choices.indexOf(current) + delta + choices.length) % choices.length];
    storeVariant(question, next);
    const targetUrl = new URL(url, window.location.origin);
    targetUrl.searchParams.set('protoQuestion', question);
    targetUrl.searchParams.set('variant', next);
    navigate(targetUrl.pathname + targetUrl.search + targetUrl.hash, { replace: true });
  };

  const state = production ? { question: null, variant: 'A' as const } : { question, variant: current };
  if (production) return <PrototypeContext.Provider value={state}>{children}</PrototypeContext.Provider>;
  return <PrototypeContext.Provider value={state}>{children}{createPortal(
    <nav aria-label="Prototype variants" className="fixed bottom-4 left-1/2 z-50 flex max-w-xl -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-border-control bg-surface-card px-3 py-2 text-xs text-text-primary">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={lang === 'ko' ? '이전 안' : 'Previous variant'} title={lang === 'ko' ? '이전 안' : 'Previous variant'} onClick={() => cycle(-1)}>←</Button>
      <span aria-live="polite">{questionLabel(question, lang)} · {current} — {variantLabels[question][choices.indexOf(current)]}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={lang === 'ko' ? '다음 안' : 'Next variant'} title={lang === 'ko' ? '다음 안' : 'Next variant'} onClick={() => cycle(1)}>→</Button>
    </nav>, document.body,
  )}</PrototypeContext.Provider>;
}
