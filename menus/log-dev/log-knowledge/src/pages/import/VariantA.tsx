/** PROTOTYPE A (#1195): full-page stepper replacing the table area — progress bar on top, one step at a time, back/next footer. */
import { Check, X } from 'lucide-react';
import { Button, cn } from '@ap/ui';
import { STEPS, type StepNo } from './fixture';
import { JobFacts } from './shared';
import { StepBody, statusForStep, type StepState } from './Steps';

export function VariantA({ step, s, go, close }: { step: StepNo; s: StepState; go: (n: StepNo) => void; close: () => void }) {
  return <div className="grid min-w-0 gap-3">
    <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
      <div><h2 className="text-base font-semibold text-text-primary">모델 가져오기</h2><p className="t-caption text-text-muted">파일을 검사한 뒤 승인한 계획만 반영합니다. 카탈로그 목록으로 돌아가도 가져오기 작업은 남습니다.</p></div>
      <Button type="button" variant="ghost" size="sm" onClick={close}><X className="size-4" aria-hidden />닫기</Button>
    </div>
    <ol aria-label="가져오기 단계" className="grid grid-cols-5 gap-2">
      {STEPS.map(t => <li key={t.n} aria-current={t.n === step ? 'step' : undefined}>
        <button type="button" onClick={() => go(t.n)} className={cn('flex w-full items-center gap-2 border-t-2 px-1 pt-2 text-left text-sm', t.n === step ? 'border-accent-primary font-semibold text-text-primary' : t.n < step ? 'border-accent-success text-text-secondary' : 'border-border-subtle text-text-muted')}>
          <span className={cn('grid size-5 shrink-0 place-items-center rounded-pill text-xs', t.n < step ? 'bg-accent-success-soft text-text-success-label' : t.n === step ? 'bg-accent-primary-soft text-text-info-label' : 'bg-accent-neutral-soft')}>{t.n < step ? <Check className="size-3" aria-hidden /> : t.n}</span>{t.label}
        </button></li>)}
    </ol>
    <section aria-label="파일 정보" className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-3"><JobFacts status={statusForStep(step, s.scenario)} /></section>
    <section aria-label={STEPS[step - 1]!.label} className="rounded-lg border border-border-subtle bg-surface-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{step}. {STEPS[step - 1]!.label}</h3>
      <StepBody step={step} s={s} max={10} />
    </section>
    <footer className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-card px-4 py-2.5">
      <Button type="button" variant="secondary" disabled={step === 1} onClick={() => go((step - 1) as StepNo)}>이전</Button>
      <span className="t-caption text-text-muted">{step} / 5 단계</span>
      {step < 4 && <Button type="button" onClick={() => go((step + 1) as StepNo)}>{STEPS.find(t => t.n === step + 1)?.label}</Button>}
      {step === 4 && <Button type="button" onClick={() => go(5)}>적용 승인</Button>}
      {step === 5 && <Button type="button" onClick={close}>카탈로그로 돌아가기</Button>}
    </footer>
  </div>;
}
