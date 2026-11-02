import { useId, useState } from 'react';
import type { ActionResult } from '@ap/contracts';
import { useMenuAction, usePlatform } from '@ap/kernel';
import { DetailDrawer } from '@ap/components';
import { Button, Callout, RadioGroup, RadioGroupItem, Textarea } from '@ap/ui';
import { ASSESSMENT_DIMENSIONS, ITEM_LIMITS, PROCESSING_STATES, VERIFICATION_STATES, itemAssess, type AssessmentDimension, type ItemDetail } from '../../endpoints';
import { StateBadge } from './ItemBadges';
import { Field, useCloseGuard, useDirtyReport, useSyncedVersion } from './ItemFormParts';
import { AXIS_LABEL, itemNoLabel, ownerText, stateLabel } from './itemModel';
import { itemErrorText, mapItemErrors, type FormErrors } from './itemWriteModel';

const STATES: Record<AssessmentDimension, readonly string[]> = { verification: VERIFICATION_STATES, processing: PROCESSING_STATES };
const KNOWN = ['dimension', 'newState', 'rationale'] as const;

function AssessForm({ detail, onReload, guard }: { detail: ItemDetail; onReload: () => void; guard: ReturnType<typeof useCloseGuard> }) {
  const { setPage, toast } = usePlatform();
  const assess = useMenuAction(itemAssess);
  const uid = useId();
  const { item } = detail;
  const [baseVersion] = useState(item.version);
  const [dimension, setDimension] = useState<AssessmentDimension>('verification');
  const [newState, setNewState] = useState('');
  const [rationale, setRationale] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useDirtyReport({ dimension, newState, rationale }, guard.markDirty);
  const current = (axis: AssessmentDimension) => (axis === 'verification' ? item.verificationState : item.processingState);

  function settle(res: ActionResult<unknown>) {
    if (res.outcome === 'ok') { setErrors({}); setConflict(false); setFailed(null); toast('판단 상태를 바꿨습니다', 'info'); setPage({ drawer: null }); return; }
    if (res.outcome === 'conflict') { setConflict(true); return; }
    const mapped = res.outcome === 'invalid' ? mapItemErrors(res.fieldErrors, KNOWN, 0) : {};
    setErrors(mapped);
    if (res.outcome === 'invalid' && Object.keys(mapped).length > 0) { setFailed(null); return; }
    setFailed(res.outcome === 'unknown' ? '저장됐는지 확인하지 못했습니다. 판단 변경 이력을 확인해 주세요.' : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  const save = () => {
    const found: FormErrors = {};
    if (newState === '') found['newState'] = '새 상태를 골라 주세요';
    if (rationale.trim() === '') found['rationale'] = itemErrorText('required');
    else if ([...rationale].length > ITEM_LIMITS.rationale) found['rationale'] = itemErrorText('too_long');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void assess.run({ id: item.id, dimension, newState, rationale }, { expectedVersion: baseVersion }).then(settle).catch(() => undefined);
  };

  return <form className="flex min-h-full flex-col gap-4" noValidate onSubmit={event => { event.preventDefault(); if (!assess.pending) save(); }}>
    {conflict && <Callout tone="amber" title="다른 사람이 먼저 고쳤습니다"
      action={<Button type="button" size="sm" variant="secondary" onClick={() => { setConflict(false); setErrors({}); onReload(); }}>새로 불러오기</Button>}>
      새로 불러온 현재 상태에서 다시 고릅니다.
    </Callout>}
    {failed && <Callout tone="red" title="저장하지 못했습니다">{failed}</Callout>}
    {errors['form'] && <Callout tone="red" title="저장하지 못했습니다"><span role="alert">{errors['form']}</span></Callout>}
    <section aria-label="현재 판단 상태" className="grid gap-1.5 rounded-md border border-border-subtle bg-surface-card p-3">
      <h3 className="text-xs font-semibold text-text-secondary">현재 판단 상태</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {ASSESSMENT_DIMENSIONS.map(axis => <StateBadge key={axis} axis={axis} value={current(axis)} />)}
      </div>
    </section>
    <Field id={`${uid}-dimension`} label="판단 축" required error={errors['dimension']}>
      <RadioGroup appearance="segmented" aria-label="판단 축" value={dimension} onValueChange={next => { setDimension(next as AssessmentDimension); setNewState(''); setErrors({}); }}>
        {ASSESSMENT_DIMENSIONS.map(axis => <RadioGroupItem key={axis} appearance="segmented" value={axis}>{AXIS_LABEL[axis]}</RadioGroupItem>)}
      </RadioGroup>
    </Field>
    <Field id={`${uid}-newState`} label="새 상태" required error={errors['newState']}>
      <RadioGroup aria-label="새 상태" value={newState} onValueChange={setNewState} aria-invalid={errors['newState'] !== undefined} aria-describedby={errors['newState'] ? `${uid}-newState-error` : undefined}>
        {STATES[dimension].map(state => {
          const isCurrent = state === current(dimension), id = `${uid}-state-${state}`;
          return <div key={state} className="flex items-center gap-2 text-sm">
            <RadioGroupItem id={id} value={state} disabled={isCurrent} />
            <label htmlFor={id} className={isCurrent ? 'text-text-muted' : 'text-text-primary'}>{stateLabel(dimension, state)}{isCurrent && <span className="ml-1.5 text-xs text-text-muted">현재</span>}</label>
          </div>;
        })}
      </RadioGroup>
    </Field>
    <Field id={`${uid}-rationale`} label="사유" required error={errors['rationale']} hint={`판단 변경 이력에 남습니다 (${ITEM_LIMITS.rationale}자 이하)`}>
      <Textarea id={`${uid}-rationale`} value={rationale} onChange={e => setRationale(e.target.value)} aria-invalid={errors['rationale'] !== undefined} aria-describedby={errors['rationale'] ? `${uid}-rationale-error` : undefined} />
    </Field>
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-detail px-5 py-3">
      <Button type="button" variant="secondary" onClick={guard.request}>취소</Button>
      <Button type="submit" disabled={assess.pending}>{assess.pending ? '저장 중…' : '판단 변경'}</Button>
    </div>
  </form>;
}

/** 판단 변경 (#1197 s3b): one axis, its new state (the current one disabled), a required rationale; the item's version guards the write. */
export function AssessDrawer({ detail, onReload, onClose }: { detail: ItemDetail; onReload: () => void; onClose: () => void }) {
  const { synced, sync } = useSyncedVersion(detail.item.version);
  const guard = useCloseGuard(onClose);
  return <>
    <DetailDrawer title="판단 변경" subtitle={`${itemNoLabel(detail.item.itemNo)} · ${ownerText(detail.item.owner)}`} onClose={guard.request}
      tabs={[{ id: 'form', label: '내용', content: <AssessForm key={synced} detail={detail} guard={guard} onReload={() => { sync(); onReload(); }} /> }]} />
    {guard.dialog}
  </>;
}
