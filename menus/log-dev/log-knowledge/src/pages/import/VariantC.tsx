/** PROTOTYPE C (#1195): an import job page — jobs list on the left (resumable), the open job with its file-facts header and one tab per step. */
import { Plus, X } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger, cn } from '@ap/ui';
import { JOBS, STEPS, type StepNo } from './fixture';
import { JobFacts, StatusPill } from './shared';
import { StepBody, statusForStep, type StepState } from './Steps';

export function VariantC({ step, s, go, close }: { step: StepNo; s: StepState; go: (n: StepNo) => void; close: () => void }) {
  const status = statusForStep(step, s.scenario);
  return <div className="grid min-w-0 grid-cols-[15rem_minmax(0,1fr)] items-start gap-3">
    <nav aria-label="가져오기 작업" className="grid content-start gap-1.5 rounded-lg border border-border-subtle bg-surface-card p-2">
      <div className="flex items-center justify-between px-1"><span className="t-caption font-semibold text-text-secondary">가져오기 작업</span><Button type="button" size="sm" variant="ghost" aria-label="새 가져오기" onClick={() => go(1)}><Plus className="size-4" aria-hidden /></Button></div>
      {JOBS.map(j => <button key={j.id} type="button" aria-current={j.id === 'imp-0412'} onClick={() => go(j.id === 'imp-0412' ? 3 : 5)}
        className={cn('grid gap-0.5 rounded-md border px-2.5 py-2 text-left', j.id === 'imp-0412' ? 'border-accent-primary bg-accent-primary-soft' : 'border-border-subtle hover:bg-surface-row-hover')}>
        <span className="t-mono truncate text-xs text-text-primary">{j.file}</span><span className="t-caption text-text-muted">{j.entity} · {j.rows}행 · {j.at.slice(5, 10)}</span>
        <span className="flex items-center justify-between gap-1"><span className="t-caption truncate text-text-muted">{j.note}</span></span><StatusPill status={j.status} />
      </button>)}
    </nav>
    <div className="grid min-w-0 gap-3">
      <header className="grid gap-2.5 rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-text-primary">가져오기 imp-0412 <span className="t-caption font-normal text-text-muted">· 모델 · 다른 화면에 다녀와도 이어서 진행</span></h2>
          <div className="flex gap-2"><Button type="button" variant="secondary" size="sm">작업 취소</Button><Button type="button" variant="ghost" size="sm" onClick={close}><X className="size-4" aria-hidden />목록으로</Button></div></div>
        <JobFacts status={status} />
      </header>
      <Tabs value={String(step)} onValueChange={v => go(Number(v) as StepNo)}>
        <TabsList aria-label="가져오기 단계">{STEPS.map(t => <TabsTrigger key={t.n} value={String(t.n)}>{t.n}. {t.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <section aria-label={STEPS[step - 1]!.label} className="rounded-lg border border-border-subtle bg-surface-card p-4"><StepBody step={step} s={s} max={14} onNext={() => go(2)} /></section>
    </div>
  </div>;
}
