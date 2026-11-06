import { useId, useState } from 'react';
import type { ActionResult } from '@ap/contracts';
import { useMenuAction, usePlatform } from '@ap/kernel';
import { DetailDrawer } from '@ap/components';
import { Button, Callout, Input, RadioGroup, RadioGroupItem, Textarea } from '@ap/ui';
import { ITEM_LIMITS, ITEM_TYPE_CODES, ITEM_TYPE_LABEL, itemCreate, itemDerive, itemRevise, type ItemDetail, type ItemTypeCode, type ItemWriteResult } from '../../endpoints';
import { EvidenceEditor, Field, OwnerPicker, useCloseGuard, useDirtyReport } from './ItemFormParts';
import { useSpecWords } from '../spec/SpecControls';
import { SubjectPicker } from './ItemSubjects';
import { picksOf, subjectsPayload, toSubjectInputs, subjectErrorText, type SubjectPick } from './subjectModel';
import { itemNoLabel, ownerText } from './itemModel';
import {
  createInput, deriveForm, deriveInput, deriveNotice, emptyForm, mapItemErrors, ownerLine, reviseForm, reviseInput, validateForm,
  type FormErrors, type WriteForm, type WriteMode,
} from './itemWriteModel';

const CONTENT_FIELDS = ['typeCode', 'title', 'observation', 'expected', 'analysisOpinion', 'improvement', 'changeNote'] as const;
type Banner = { kind: 'conflict' } | { kind: 'failed'; text: string; retry?: () => void };
const failureText = (outcome: string) => (outcome === 'unknown' ? '저장됐는지 확인하지 못했습니다. 다시 시도하기 전에 목록을 확인해 주세요.' : outcome === 'forbidden' ? '이 작업을 할 권한이 없습니다.' : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');

export type ItemWriteTarget =
  | { mode: 'create'; ownerModelId: string }
  | { mode: 'revise'; detail: ItemDetail; viewedRevisionNo: number | null; onReload: () => void }
  | { mode: 'derive'; detail: ItemDetail };

type Guard = ReturnType<typeof useCloseGuard>;
function WriteFormBody({ target, onReload, guard }: { target: ItemWriteTarget; onReload: () => void; guard: Guard }) {
  const { setPage, navigate, linkTo, toast } = usePlatform();
  const create = useMenuAction(itemCreate), revise = useMenuAction(itemRevise), derive = useMenuAction(itemDerive);
  const uid = useId(), w = useSpecWords();
  const mode: WriteMode = target.mode;
  const [form, setForm] = useState<WriteForm>(() => (target.mode === 'create' ? emptyForm(target.ownerModelId) : target.mode === 'revise' ? reviseForm(target.detail) : deriveForm(target.detail)));
  // The version this form was built on: a re-read after a conflict must not let a retry overwrite what the user has not seen.
  const [baseVersion, setBaseVersion] = useState(() => (target.mode === 'create' ? '' : target.detail.item.version));
  const [picks, setPicks] = useState<SubjectPick[]>(() => target.mode === 'revise' ? picksOf(target.detail.subjects) : []);
  const [subjectOwner, setSubjectOwner] = useState(form.modelId);
  const ownerModelId = target.mode === 'revise' ? target.detail.item.owner.modelId : form.modelId;
  if (subjectOwner !== form.modelId) { setSubjectOwner(form.modelId); setPicks([]); }
  const [reloadRequested, setReloadRequested] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  if (reloadRequested && target.mode === 'revise' && target.detail.item.version !== baseVersion) { setBaseVersion(target.detail.item.version); setReloadRequested(false); setBanner(null); }
  useDirtyReport({ form, picks }, guard.markDirty);
  const busy = create.pending || revise.pending || derive.pending;
  const set = (patch: Partial<WriteForm>) => { setForm(f => ({ ...f, ...patch })); };
  const err = (key: string) => errors[key];
  const describedBy = (key: string) => (err(key) ? `${uid}-${key}-error` : undefined);

  const goToItem = (data: ItemWriteResult | null) => {
    if (data) navigate(linkTo('log-knowledge-item', { params: { itemId: data.id } }));
    else guard.force();
  };
  function settle<T>(res: ActionResult<T>, onOk: (data: T | null) => void) {
    if (res.outcome === 'ok') { setBanner(null); setErrors({}); onOk(res.data); return; }
    if (res.outcome === 'conflict') { setBanner({ kind: 'conflict' }); return; }
    const subjectErrors = res.outcome === 'invalid' ? res.fieldErrors.filter(e => e.path[0] === 'subjects') : [];
    const mapped = res.outcome === 'invalid' ? mapItemErrors(res.fieldErrors.filter(e => e.path[0] !== 'subjects'), CONTENT_FIELDS, form.evidence.length) : {};
    if (subjectErrors.length) mapped['subjects'] = subjectErrors.map(e => w(subjectErrorText(e.code).ko, subjectErrorText(e.code).en)).join(' ');
    setErrors(mapped);
    if (res.outcome === 'invalid' && Object.keys(mapped).length > 0) { setBanner(null); return; }
    setBanner({ kind: 'failed', text: failureText(res.outcome), ...(res.retry ? { retry: () => { const retry = res.retry; if (retry) void retry().then(next => settle(next as ActionResult<T>, onOk)).catch(() => undefined); } } : {}) });
  }
  const save = () => {
    const found = validateForm(form, mode);
    const subjectPayload = target.mode === 'revise' ? subjectsPayload(ownerModelId, target.detail.subjects, picks) : null;
    if (subjectPayload?.send && subjectPayload.blocked.length) found['subjects'] = w('대상 목록을 바꾸려면 사라진 대상을 먼저 빼 주세요.', 'Remove missing targets before changing the subject list.');
    setErrors(found);
    if (Object.keys(found).length > 0) { setBanner(null); return; }
    if (target.mode === 'create') {
      void create.run({ ...createInput(form), subjects: toSubjectInputs(ownerModelId, picks) }).then(res => settle(res, data => { toast('기술 Item을 등록했습니다', 'info'); goToItem(data); })).catch(() => undefined);
    } else if (target.mode === 'revise') {
      const { detail } = target;
      void revise.run({ ...reviseInput(detail.item.id, form), ...(subjectPayload?.send ? { subjects: subjectPayload.subjects } : {}) }, { expectedVersion: baseVersion })
        .then(res => settle(res, () => { toast('새 리비전을 저장했습니다', 'info'); setPage({ drawer: null, rev: null }); })).catch(() => undefined);
    } else {
      const { detail } = target;
      void derive.run(deriveInput(detail.item.id, detail.revision.revisionNo, form)).then(res => settle(res, data => { toast('관련 Item을 작성했습니다', 'info'); goToItem(data); })).catch(() => undefined);
    }
  };

  const latest = target.mode === 'revise' ? target.detail.item.latestRevisionNo : 0;
  return <form className="flex min-h-full flex-col gap-4" noValidate onSubmit={event => { event.preventDefault(); if (!busy && banner?.kind !== 'conflict') save(); }}>
    {banner?.kind === 'conflict' && <Callout tone="amber" title="다른 사람이 먼저 고쳤습니다"
      action={<Button type="button" size="sm" variant="secondary" onClick={() => { setReloadRequested(true); onReload(); }}>최신 불러오기</Button>}>
      작성 중인 입력은 유지됩니다. 최신 상태를 확인한 뒤 다시 저장하세요.
    </Callout>}
    {banner?.kind === 'failed' && <Callout tone="red" title="저장하지 못했습니다" action={banner.retry ? <Button type="button" size="sm" variant="secondary" onClick={banner.retry}>다시 시도</Button> : undefined}>{banner.text}</Callout>}
    {errors['form'] && <Callout tone="red" title="입력을 확인해 주세요"><span role="alert">{errors['form']}</span></Callout>}
    {target.mode === 'derive' && <Callout tone="blue" title="파생 작성">{deriveNotice(target.detail.item.itemNo, target.detail.revision.revisionNo)}</Callout>}
    {target.mode === 'revise' && target.viewedRevisionNo !== null && target.viewedRevisionNo !== latest && <Callout tone="amber" title="최신 리비전을 고칩니다">
      r{target.viewedRevisionNo}을 보고 있지만 수정은 항상 최신 리비전 r{latest}를 바탕으로 합니다.
    </Callout>}
    {target.mode === 'revise'
      ? <Field id={`${uid}-owner`} label="소유 대상" hint="등록 후에는 소유 대상을 바꿀 수 없습니다"><p id={`${uid}-owner`} className="text-sm">{ownerLine(target.detail.item.owner)}</p></Field>
      : <OwnerPicker uid={uid} form={form} onChange={set} error={err('owner')} />}
    <Field id={`${uid}-typeCode`} label="유형" required error={err('typeCode')}>
      <RadioGroup appearance="segmented" aria-label="유형" value={form.typeCode} onValueChange={next => set({ typeCode: next as ItemTypeCode })}>
        {ITEM_TYPE_CODES.map(code => <RadioGroupItem key={code} appearance="segmented" value={code}>{ITEM_TYPE_LABEL[code]}</RadioGroupItem>)}
      </RadioGroup>
    </Field>
    <Field id={`${uid}-title`} label="제목" required error={err('title')}>
      <Input id={`${uid}-title`} value={form.title} onChange={e => set({ title: e.target.value })} aria-invalid={err('title') !== undefined} aria-describedby={describedBy('title')} />
    </Field>
    <Field id={`${uid}-observation`} label="관찰 사실" error={err('observation')} hint="관찰 사실과 기대·기준 중 하나는 써야 합니다 (사실만, 해석은 분석 의견에)">
      <Textarea id={`${uid}-observation`} value={form.observation} onChange={e => set({ observation: e.target.value })} aria-invalid={err('observation') !== undefined} aria-describedby={describedBy('observation')} />
    </Field>
    <Field id={`${uid}-expected`} label="기대·기준" error={err('expected')}>
      <Textarea id={`${uid}-expected`} value={form.expected} onChange={e => set({ expected: e.target.value })} aria-invalid={err('expected') !== undefined} aria-describedby={describedBy('expected')} />
    </Field>
    <div data-kind="opinion" className="grid gap-1.5 rounded-md border border-dashed border-border-strong bg-surface-sunken p-3">
      <Field id={`${uid}-analysisOpinion`} label="분석 의견" badge="의견 · 사실 아님" error={err('analysisOpinion')}>
        <Textarea id={`${uid}-analysisOpinion`} value={form.analysisOpinion} onChange={e => set({ analysisOpinion: e.target.value })} aria-invalid={err('analysisOpinion') !== undefined} aria-describedby={describedBy('analysisOpinion')} />
      </Field>
    </div>
    <Field id={`${uid}-improvement`} label="개선 방향" error={err('improvement')}>
      <Textarea id={`${uid}-improvement`} value={form.improvement} onChange={e => set({ improvement: e.target.value })} aria-invalid={err('improvement') !== undefined} aria-describedby={describedBy('improvement')} />
    </Field>
    {target.mode === 'derive'
      ? <p className="rounded-md bg-surface-sunken p-3 text-sm text-text-secondary">근거는 파생 작성에서 추가할 수 없습니다. 작성한 뒤 새 리비전에서 추가합니다.</p>
      : <div className="grid gap-1.5"><h3 className="text-sm font-medium text-text-primary">근거 포인터</h3><EvidenceEditor uid={uid} rows={form.evidence} onChange={evidence => set({ evidence })} errors={errors} /></div>}
    {target.mode !== 'derive' && <><SubjectPicker subjects={target.mode === 'revise' ? target.detail.subjects : undefined} modelId={ownerModelId} picks={picks} onChange={setPicks} disabled={busy} />{errors['subjects'] && <p role="alert" className="text-sm text-text-danger-label">{errors['subjects']}</p>}</>}
    {target.mode === 'revise' && <Field id={`${uid}-changeNote`} label="변경 사유" required error={err('changeNote')} hint={`리비전 목록에 표시됩니다 (${ITEM_LIMITS.changeNote}자 이하)`}>
      <Input id={`${uid}-changeNote`} value={form.changeNote} onChange={e => set({ changeNote: e.target.value })} aria-invalid={err('changeNote') !== undefined} aria-describedby={describedBy('changeNote')} />
    </Field>}
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-detail px-5 py-3">
      <Button type="button" variant="secondary" onClick={guard.request}>취소</Button>
      <Button type="submit" disabled={busy || banner?.kind === 'conflict'}>{busy ? '저장 중…' : target.mode === 'revise' ? '새 리비전 저장' : target.mode === 'derive' ? '관련 Item 작성' : '등록'}</Button>
    </div>
  </form>;
}

/**
 * The create / revise / derive drawer (#1197 s3b, owner-confirmed variant A). Fact fields and the opinion field stay visibly apart;
 * revise edits the latest revision (owner read-only, 변경 사유 required), derive starts a new item from a viewed revision (no evidence).
 * A conflict keeps the form and its subjects; reload advances the version only after the new detail arrives.
 */
export function ItemWriteDrawer({ target, onClose }: { target: ItemWriteTarget; onClose: () => void }) {
  const guard = useCloseGuard(onClose);
  const title = target.mode === 'create' ? '새 기술 Item' : target.mode === 'revise' ? '기술 Item 수정' : '관련 Item으로 신규 작성';
  const subtitle = target.mode === 'create' ? '전체 기술 Item' : `${itemNoLabel(target.detail.item.itemNo)} · ${ownerText(target.detail.item.owner)}`;
  const key = target.mode === 'revise' ? `revise:${target.detail.item.id}` : target.mode === 'derive' ? `derive:${target.detail.item.id}:${target.detail.revision.revisionNo}` : 'create';
  return <>
    <DetailDrawer key={target.mode} title={title} subtitle={subtitle} onClose={guard.request} tabs={[{ id: 'form', label: '내용', content: <WriteFormBody key={key} target={target} guard={guard} onReload={() => { if (target.mode === 'revise') target.onReload(); }} /> }]} />
    {guard.dialog}
  </>;
}
