import { useRef, useState } from 'react';
import { latestBinding, type EquipmentLayoutDocument } from '@eqv/core';
import { conflictHighlight, describeConflict, type DryRun, type PublishPlan } from '@eqv/editor';
import { useMenuAction, usePlatform } from '@ap/kernel';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Callout, FieldLabel,
  FieldList, FieldRow, Input, PanelSectionTitle, cn,
} from '@ap/ui';
import { WALL_CLOCK_PATTERN, publishMapping, publishRevision, type RevisionRow } from '../../endpoints';
import { percent, rangeShort, windowHex } from '../../model/onboarding';
import { Canvas, PANEL } from '../../parts/Canvas';
import { Toolbar } from '../../parts/Toolbar';
import type { EquipmentData } from './useEquipment';
import { NoBreakStamps } from './WallClock';

const CHANGE_WORD = { added: '추가', removed: '삭제', changed: '변경' } as const;
export const CONFLICTS_DO_NOT_BLOCK = 'Mapping Conflict는 게시를 막지 않습니다. 건수는 게시 검토의 diff에 보입니다.';

/**
 * ⑤ 검증 and ⑥ 게시 (ONBOARDING §6 D8–D11): the dry-run of the saved rules and the draft on the selected window, coverage, conflicts
 * and the diff on the left, the drawing on the right. A conflict row draws dashed rings (and the dashed observation line, never a path).
 */
export function ValidateTab({ data, layout, run, plan, error, effectiveFrom, onEffectiveFrom }: {
  data: EquipmentData; layout: EquipmentLayoutDocument; run: DryRun | null; plan: PublishPlan | null; error: string | null; effectiveFrom: string; onEffectiveFrom(value: string): void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const conflict = active !== null ? run?.conflicts[active] ?? null : null;
  const latest = data.bindings ? latestBinding(data.bindings.bindings) ?? null : null;
  const coverage = run?.coverage ?? null;
  const touched = effectiveFrom !== '';
  // The message under the input names the actual reason; the header line only says «effectiveFrom 확인 필요».
  const fromProblem = !touched ? null : !WALL_CLOCK_PATTERN.test(effectiveFrom) ? '형식이 올바르지 않습니다. YYYY-MM-DDTHH:mm:ss.sss로 입력하세요.'
    : latest !== null && effectiveFrom <= latest.effectiveFrom ? `마지막 binding(${latest.effectiveFrom})보다 늦어야 합니다.` : null;
  const fromInvalid = fromProblem !== null;
  const hint = fromProblem ?? (latest ? `마지막 binding(${latest.effectiveFrom})보다 늦은 시각을 입력하세요 · YYYY-MM-DDTHH:mm:ss.sss` : 'Site 시각 YYYY-MM-DDTHH:mm:ss.sss · 기본은 window 시작');
  return <div className="flex min-h-0 flex-1 overflow-hidden">
    <section aria-label="검증 결과" className="w-96 shrink-0 space-y-4 overflow-y-auto border-r border-border-subtle bg-surface-card p-4 text-xs">
      <div className="space-y-2">
        <PanelSectionTitle className="mb-0">Dry-run · 저장된 규칙과 Layout 초안</PanelSectionTitle>
        {error ? <Callout tone="red"><span role="alert">{error}</span></Callout> : run === null ? <p role="status" className="text-text-secondary">계산 중…</p>
          : coverage ? <p aria-label="커버리지">참조 {coverage.references.resolved}/{coverage.references.total} · 커버리지 {percent(coverage.references.ratio)} · alias {coverage.aliases.resolved}/{coverage.aliases.total} · 무시 {coverage.ignored.aliases.length} · assumed {percent(coverage.assumed.ratio)} · 미매핑 {coverage.unmapped.length}</p> : null}
        {run && run.issues.length > 0 && <Callout tone="red" title="규칙 문제 · 게시할 수 없습니다"><ul className="m-0 list-disc pl-4">{run.issues.map((issue) => <li key={JSON.stringify([issue.code, issue.path])}>{issue.code}: {issue.message}</li>)}</ul></Callout>}
        <p className="text-text-muted">Mapping 탭의 저장하지 않은 편집은 포함하지 않습니다.</p>
      </div>
      <div className="space-y-2">
        <PanelSectionTitle className="mb-0">Mapping Conflict · {run?.conflicts.length ?? '—'}</PanelSectionTitle>
        <p className="text-text-muted">{CONFLICTS_DO_NOT_BLOCK}</p>
        {run && run.conflicts.length === 0 && <p>충돌 없음</p>}
        {run && run.conflicts.length > 0 && <ul aria-label="Mapping Conflict 목록" className="m-0 list-none space-y-1 p-0">
          {run.conflicts.map((c, i) => <li key={`${c.kind}-${i}`} className={cn('rounded-md', active === i && 'bg-surface-row-selected')}>
            <Button size="toolbar" variant="navigation" aria-pressed={active === i} className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => setActive((v) => (v === i ? null : i))}>
              <span className="flex flex-col items-start"><span className="font-mono">{c.kind}</span><span className="text-text-secondary">{describeConflict(c)}</span></span>
            </Button></li>)}
        </ul>}
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor="effective-from" required>effectiveFrom</FieldLabel>
        <Input id="effective-from" inputSize="toolbar" autoComplete="off" spellCheck={false} value={effectiveFrom} placeholder="YYYY-MM-DDTHH:mm:ss.sss"
          aria-invalid={fromInvalid || undefined} aria-describedby="effective-from-hint" onChange={(event) => onEffectiveFrom(event.target.value)} />
        <p id="effective-from-hint" className={cn('text-xs', fromInvalid ? 'text-text-danger' : 'text-text-muted')}><NoBreakStamps text={hint} /></p>
      </div>
      {plan && <DiffSummary plan={plan} />}
    </section>
    <div className={cn(PANEL, 'flex-1')}>
      <Toolbar modeText={<>검증 · <span className="font-mono">{layout.id}</span></>} tools={null} count={layout.components.length} loading={false} />
      <Canvas layout={layout} selectedId={null} onSelect={() => undefined} {...(conflict ? { highlight: conflictHighlight(conflict) } : {})} />
      {conflict?.kind === 'transfer-without-capability' && <p className="shrink-0 border-t border-border-subtle px-3 py-1 text-xs text-text-secondary">점선은 관측 이송의 표시입니다. 경로·궤적·Transfer Capability가 아닙니다.</p>}
    </div>
  </div>;
}

/** §6 Diff: alias added/removed/changed (target, certainty, rule), unchanged count, the Layout Revision line and the Binding lines. */
function DiffSummary({ plan }: { plan: PublishPlan }) {
  const count = (change: keyof typeof CHANGE_WORD) => plan.diff.entries.filter((e) => e.change === change).length;
  return <div className="space-y-2">
    <PanelSectionTitle className="mb-0">이전 게시와 비교</PanelSectionTitle>
    <FieldList>
      <FieldRow layout="property" label="alias">{(Object.keys(CHANGE_WORD) as (keyof typeof CHANGE_WORD)[]).map((c) => `${CHANGE_WORD[c]} ${count(c)}`).join(' · ')} · 변경 없음 {plan.diff.unchanged}</FieldRow>
      <FieldRow layout="property" label="Layout Revision">{plan.diff.layout}</FieldRow>
      <FieldRow layout="property" label="Binding">{plan.diff.binding.length ? plan.diff.binding.map((line) => <span key={line} className="block"><NoBreakStamps text={line} /></span>) : '—'}</FieldRow>
      <FieldRow layout="property" label="Mapping Conflict">{plan.diff.conflicts}</FieldRow>
    </FieldList>
    {plan.diff.entries.length > 0 && <table className="w-full text-left text-xs"><caption className="sr-only">alias 변경</caption>
      <thead><tr>{['alias', '변경', '이전 → 이후'].map((h) => <th key={h} className="t-table-header border-b border-border-subtle bg-surface-sunken p-2 text-text-secondary">{h}</th>)}</tr></thead>
      <tbody>{plan.diff.entries.map((e) => <tr key={e.alias}><td className="p-2 font-mono">{e.alias}</td><td className="p-2">{CHANGE_WORD[e.change]}</td><td className="p-2 break-all">{e.before ?? '—'} → {e.after ?? '—'}</td></tr>)}</tbody></table>}
  </div>;
}

/**
 * The publish review (Layouts `PublishDialog` pattern): the diff, then the writes. Without a published Revision of the draft it first
 * publishes one (`publishRevision`, idempotent), then `publishMapping` with the selected window's Inventory as the Baseline.
 */
export function PublishReview({ data, layout, plan, effectiveFrom, revisions, onClose }: {
  data: EquipmentData; layout: EquipmentLayoutDocument; plan: PublishPlan; effectiveFrom: string; revisions: readonly RevisionRow[] | null; onClose(): void;
}) {
  const { toast } = usePlatform();
  const cancel = useRef<HTMLButtonElement>(null);
  const revisionAction = useMenuAction(publishRevision);
  const mappingAction = useMenuAction(publishMapping);
  const [error, setError] = useState<string | null>(null);
  const busy = revisionAction.pending || mappingAction.pending;
  const count = (change: keyof typeof CHANGE_WORD) => plan.diff.entries.filter((e) => e.change === change).length;
  const onPublish = async () => {
    if (busy || !data.window || !data.inventory || !data.draft) return;
    setError(null);
    try {
      let revision = plan.layoutRevision;
      if (!(revisions ?? []).some((r) => r.revision === revision)) {
        const published = await revisionAction.run({ layoutId: layout.id }, { expectedVersion: data.draft.version });
        if (published.outcome !== 'ok' || !published.data) { setError(published.outcome === 'conflict' ? 'Layout 초안이 바뀌었습니다. 다시 확인한 뒤 게시하세요.' : 'Layout Revision을 게시하지 못했습니다.'); return; }
        revision = published.data.revision;
      }
      const result = await mappingAction.run({ equipmentId: data.equipment.equipmentId, layoutId: layout.id, layoutRevision: revision, windowHash: windowHex(data.window.hash), effectiveFrom },
        { expectedVersion: data.bindingsVersion });
      if (result.outcome === 'ok') { toast('Mapping을 게시했습니다', 'info'); onClose(); return; }
      const code = result.fieldErrors[0]?.code;
      setError(result.outcome === 'conflict' ? '다른 사용자가 먼저 게시했습니다. 다시 확인한 뒤 게시하세요.' : code === 'same-as-latest' ? '이전 게시와 같습니다'
        : result.outcome === 'forbidden' ? '권한이 없어 게시하지 못했습니다.' : 'Mapping을 게시하지 못했습니다.');
    } catch { setError('Mapping을 게시하지 못했습니다.'); }
  };
  return <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <AlertDialogContent className="break-keep" onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>Mapping을 게시할까요?</AlertDialogTitle>
        <AlertDialogDescription>저장된 규칙을 평탄화해 바꿀 수 없는 Mapping Version을 만들고 Binding을 엽니다. 서버가 다시 검증합니다.</AlertDialogDescription>
      </AlertDialogHeader>
      <FieldList>
        <FieldRow layout="property" label="설비" mono>{data.equipment.equipmentId}</FieldRow>
        <FieldRow layout="property" label="alias">{(Object.keys(CHANGE_WORD) as (keyof typeof CHANGE_WORD)[]).map((c) => `${CHANGE_WORD[c]} ${count(c)}`).join(' · ')} · 변경 없음 {plan.diff.unchanged}</FieldRow>
        <FieldRow layout="property" label="Baseline Sample Window">{data.window ? <NoBreakStamps text={`${rangeShort(data.window.from, data.window.to)} · ${data.window.dataGeneration}`} /> : '—'}</FieldRow>
        <FieldRow layout="property" label="Layout Revision">{plan.diff.layout}</FieldRow>
        <FieldRow layout="property" label="Binding">{plan.diff.binding.map((line) => <span key={line} className="block"><NoBreakStamps text={line} /></span>)}</FieldRow>
        <FieldRow layout="property" label="effectiveFrom"><NoBreakStamps text={effectiveFrom} /></FieldRow>
        <FieldRow layout="property" label="Mapping Conflict">{plan.diff.conflicts}</FieldRow>
      </FieldList>
      {plan.diff.entries.length > 0 ? <div className="max-h-48 overflow-y-auto"><ul aria-label="alias 변경" className="m-0 list-none space-y-1 p-0 text-xs">
        {plan.diff.entries.map((e) => <li key={e.alias}><span className="font-mono">{e.alias}</span> · {CHANGE_WORD[e.change]} · <span className="break-all">{e.before ?? '—'} → {e.after ?? '—'}</span></li>)}
      </ul></div> : <p className="text-xs text-text-secondary">변경 없음</p>}
      {error && <Callout tone="red" title="게시하지 못했습니다"><span role="alert">{error}</span></Callout>}
      <AlertDialogFooter>
        <Button ref={cancel} size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>취소</Button>
        <Button size="toolbar" disabled={busy} onClick={() => void onPublish()}>게시</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
