/**
 * PROTOTYPE (#1195, never merged): three variants of the five-step catalog import, mounted on the catalog route via `?variant=A|B|C`.
 * `&step=1..5` picks the step, `&state=` forces a notable state (dup | errors | partial | applying). Read-only stub data (./fixture).
 */
import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlatform } from '@ap/kernel';
import { cn, isProductionEnv } from '@ap/ui';
import type { StepNo } from './fixture';
import { useStepState } from './Steps';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';

const VARIANTS = [{ id: 'A', name: '전체 화면 단계 표시' }, { id: 'B', name: '옆 시트 (목록 유지)' }, { id: 'C', name: '가져오기 작업 페이지' }] as const;
type VariantId = typeof VARIANTS[number]['id'];
const STATES = [{ id: null, label: '기본' }, { id: 'dup', label: '매핑 중복' }, { id: 'errors', label: '오류만' }, { id: 'partial', label: '일부 실패' }, { id: 'applying', label: '적용 중' }] as const;

export function importVariantOf(raw: string | null): VariantId | null { return raw === 'A' || raw === 'B' || raw === 'C' ? raw : null; }

export function ImportPrototype({ variant, table }: { variant: VariantId; table: ReactNode }) {
  const { pageParam, setPage } = usePlatform();
  const rawStep = Number(pageParam('step'));
  const step = (rawStep >= 1 && rawStep <= 5 ? rawStep : 1) as StepNo;
  const forced = pageParam('state');
  const s = useStepState(forced);
  const go = (n: StepNo) => setPage({ step: String(n) });
  const close = () => setPage({ variant: null, step: null, state: null });
  const props = { step, s, go, close };
  return <>
    {variant === 'A' && <VariantA {...props} />}
    {variant === 'B' && <VariantB {...props} table={table} />}
    {variant === 'C' && <VariantC {...props} />}
    {!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } }) && <Switcher current={variant} step={step} forced={forced}
      onVariant={v => setPage({ variant: v })} onStep={go} onState={st => setPage({ state: st })} />}
  </>;
}

function Switcher({ current, step, forced, onVariant, onStep, onState }: { current: VariantId; step: StepNo; forced: string | null; onVariant: (v: VariantId) => void; onStep: (n: StepNo) => void; onState: (s: string | null) => void }) {
  const index = VARIANTS.findIndex(v => v.id === current);
  const move = (d: number) => onVariant(VARIANTS[(index + d + VARIANTS.length) % VARIANTS.length]!.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="dialog"], [role="alertdialog"]')) return;
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const chip = (on: boolean) => cn('h-7 whitespace-nowrap rounded-pill px-2.5 text-xs', on ? 'bg-accent-primary-soft font-semibold text-text-info-label' : 'text-text-secondary hover:bg-surface-row-hover');
  return <div role="toolbar" aria-label="프로토타입 안 전환" className="fixed bottom-4 left-1/2 z-50 flex w-max -translate-x-1/2 items-center gap-1 rounded-pill border border-border-strong bg-surface-popover p-1 shadow-lg">
    <button type="button" aria-label="이전 안" className="grid size-7 place-items-center rounded-pill text-text-secondary hover:bg-surface-row-hover" onClick={() => move(-1)}><ChevronLeft className="size-4" aria-hidden /></button>
    <span className="min-w-44 px-1 text-center text-xs font-semibold text-text-primary">{current} · {VARIANTS[index]!.name}</span>
    <button type="button" aria-label="다음 안" className="grid size-7 place-items-center rounded-pill text-text-secondary hover:bg-surface-row-hover" onClick={() => move(1)}><ChevronRight className="size-4" aria-hidden /></button>
    <span aria-hidden className="mx-1 h-5 w-px bg-border-subtle" />
    {([1, 2, 3, 4, 5] as const).map(n => <button key={n} type="button" aria-pressed={step === n} aria-label={`${n}단계`} onClick={() => onStep(n)} className={chip(step === n)}>{n}</button>)}
    <span aria-hidden className="mx-1 h-5 w-px bg-border-subtle" />
    {STATES.map(st => <button key={st.label} type="button" aria-pressed={forced === st.id} onClick={() => onState(st.id)} className={chip(forced === st.id)}>{st.label}</button>)}
  </div>;
}
