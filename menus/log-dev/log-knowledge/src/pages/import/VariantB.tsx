/** PROTOTYPE B (#1195): the catalog stays visible; a wide docked sheet on the right holds the steps as a vertical list with the active step expanded. */
import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { Button, cn } from '@ap/ui';
import { STEPS, type StepNo } from './fixture';
import { JobFacts } from './shared';
import { StepBody, statusForStep, type StepState } from './Steps';

export function VariantB({ step, s, go, close, table }: { step: StepNo; s: StepState; go: (n: StepNo) => void; close: () => void; table: ReactNode }) {
  return <div className="flex min-w-0 items-start gap-3">
    <div className="min-w-0 flex-1 opacity-70" aria-hidden={false}>{table}</div>
    <aside aria-label="모델 가져오기" className="sticky top-0 grid max-h-[calc(100vh-7rem)] w-[min(44rem,58%)] shrink-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-border-strong bg-surface-card shadow-lg">
      <header className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5"><h2 className="text-base font-semibold text-text-primary">모델 가져오기</h2>
        <Button type="button" variant="ghost" size="sm" aria-label="가져오기 닫기" onClick={close}><X className="size-4" aria-hidden /></Button></header>
      <div className="border-b border-border-subtle bg-surface-raised px-4 py-2.5"><JobFacts dense status={statusForStep(step, s.scenario)} /></div>
      <ol aria-label="가져오기 단계" className="min-h-0 overflow-y-auto">
        {STEPS.map(t => <li key={t.n} aria-current={t.n === step ? 'step' : undefined} className="border-b border-border-subtle last:border-b-0">
          <button type="button" onClick={() => go(t.n)} className={cn('flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm', t.n === step ? 'bg-accent-primary-soft font-semibold text-text-info-label' : t.n < step ? 'text-text-secondary hover:bg-surface-row-hover' : 'text-text-muted hover:bg-surface-row-hover')}>
            <span className={cn('grid size-5 place-items-center rounded-pill text-xs', t.n < step ? 'bg-accent-success-soft text-text-success-label' : 'bg-surface-card')}>{t.n < step ? <Check className="size-3" aria-hidden /> : t.n}</span>{t.label}
          </button>
          {t.n === step && <div className="px-4 pb-4 pt-3"><StepBody step={step} s={s} max={8} /></div>}
        </li>)}
      </ol>
      <footer className="flex items-center justify-between border-t border-border-subtle px-4 py-2.5">
        <Button type="button" variant="secondary" size="sm" disabled={step === 1} onClick={() => go((step - 1) as StepNo)}>이전</Button>
        {step < 4 && <Button type="button" size="sm" onClick={() => go((step + 1) as StepNo)}>다음</Button>}
        {step === 4 && <Button type="button" size="sm" onClick={() => go(5)}>적용 승인</Button>}
        {step === 5 && <Button type="button" size="sm" onClick={close}>닫기</Button>}
      </footer>
    </aside>
  </div>;
}
