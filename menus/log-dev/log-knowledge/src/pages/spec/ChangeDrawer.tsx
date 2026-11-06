import { useEffect, useId, useState } from 'react';
import type { ActionResult } from '@ap/contracts';
import { useMenuAction, useMenuFetch } from '@ap/kernel';
import { DetailDrawer } from '@ap/components';
import { Button, Callout, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@ap/ui';
import { modelSpecEndpoint, specChangeAdd, specChangeConfirm, specChangeRetire, specChangesEndpoint, SPEC_CHANGE_LIMITS, type SoftwareRow, type SpecChangeAddInput, type SpecChangeKind, type SpecChangeRow, type SpecTargetKind } from '../../endpoints';
import { ChangeComparison } from './ChangeComparison';
import { targetOf } from './specModel';
import { SpecField, SpecSelect, useSpecFieldErrors, useSpecWords, type FieldRoute } from './SpecControls';
/** Change wire errors (a replacement repeats the same shape under `replacement`) land on the editor that owns them. */
const CHANGE_ROUTE: FieldRoute = raw => {
  const path = raw[0] === 'replacement' ? raw.slice(1) : raw, head = path[0] ?? '';
  if (head === 'target' || head === 'targetKind' || head === 'targetKey') return { control: 'target', path: path.slice(1) };
  if (head === 'change' && (path[1] === 'before' || path[1] === 'after')) return { control: path[1], path: path.slice(2) };
  if (head === 'before' || head === 'after' || head === 'note' || head === 'evidenceRef') return { control: head, path: path.slice(1) };
  return null;
};
const JSON_EXAMPLES = {
  module: { target: { module: 'Arm' }, before: { name: 'Arm', parentModule: 'Robot' }, after: { name: 'Arm', parentModule: null } },
  event: { target: { module: 'Arm', event: 'Move' }, before: { name: 'Move', triggerRule: 'on move', detailDocRef: '§1' }, after: { name: 'Move', triggerRule: 'after ready', detailDocRef: '§1' } },
  field: { target: { module: 'Arm', event: 'Move', field: 'pressure' }, before: { name: 'pressure', type: 'float', unit: 'Pa', description: 'Chamber pressure' }, after: { name: 'pressure', type: 'float', unit: 'mbar', description: 'Chamber pressure' } },
  relation: { target: { sourceModule: 'Arm', sourceEvent: 'Move', predicate: 'precedes', targetModule: 'Arm', targetEvent: 'Stop' }, before: { ruleRef: '§1' }, after: { ruleRef: '§2' } },
};
export function ChangeDrawer({ modelId, software, row, mode, selectedSoftware, onClose, onDirtyChange }: { modelId: string; software: SoftwareRow[]; row?: SpecChangeRow; mode: 'add' | 'retire' | 'confirm'; selectedSoftware: string | null; onClose: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const w = useSpecWords(), mapFieldErrors = useSpecFieldErrors(), uid = useId();
  const add = useMenuAction(specChangeAdd), retire = useMenuAction(specChangeRetire), confirm = useMenuAction(specChangeConfirm);
  const latest = useMenuFetch(modelSpecEndpoint), changes = useMenuFetch(specChangesEndpoint);
  const initial = { softwareId: row?.softwareId ?? selectedSoftware ?? software[0]?.id ?? '', end: row?.endsBeforeSoftwareId ?? 'none', targetKind: row?.targetKind ?? 'event' as SpecTargetKind, changeKind: row?.changeKind ?? 'behavior' as SpecChangeKind,
    target: JSON.stringify(row ? targetOf(row) : { module: '', event: '' }, null, 2), before: JSON.stringify(row?.change.before ?? {}, null, 2), after: JSON.stringify(row?.change.after ?? {}, null, 2), note: row?.note ?? '', evidenceRef: row?.evidenceRef ?? '' };
  const [input, setInput] = useState(initial), [replace, setReplace] = useState(false), [version, setVersion] = useState(String(row?.version ?? ''));
  const [problem, setProblem] = useState(''), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}), [conflict, setConflict] = useState(false), [recovering, setRecovering] = useState(false), [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(input) !== JSON.stringify(initial) || replace;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const pending = add.pending || retire.pending || confirm.pending || recovering;
  const disabled = pending || conflict || !!row?.retiredAt;
  const change = <K extends keyof typeof input>(key: K, value: (typeof input)[K]) => setInput({ ...input, [key]: value });
  function settle(result: ActionResult<unknown>) {
    if (result.outcome === 'ok' && result.data) { onClose(); return; }
    if (result.outcome === 'conflict') setConflict(true);
    const feedback = result.outcome === 'invalid' ? mapFieldErrors(result.fieldErrors, CHANGE_ROUTE) : { fields: {}, rest: [] as string[] };
    setFieldErrors(feedback.fields);
    setProblem(result.outcome === 'invalid' ? [Object.keys(feedback.fields).length ? w('입력 값을 확인해 주세요.', 'Check the highlighted fields.') : w('입력 값을 확인해 주세요.', 'Check your input.'), ...feedback.rest].join('\n')
      : result.outcome === 'conflict' ? w('발행이나 다른 변경이 먼저 완료됐습니다. 입력은 유지됩니다.', 'A publication or another change completed first. Your input is preserved.')
      : result.outcome === 'forbidden' ? w('명세 관리 권한을 관리자에게 요청하세요.', 'Ask an administrator for specification management permission.') : w('결과를 확인하지 못했습니다. 최신 상태를 확인해 주세요.', 'The result could not be confirmed. Check the latest state.'));
  }
  /** Client-side mirror of the server's envelope checks: per-field messages on the field that failed. */
  function payload(): SpecChangeAddInput | null {
    const errs: Record<string, string> = {};
    const parse = (key: string, text: string): Record<string, unknown> | null => {
      try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape'); return value as Record<string, unknown>; }
      catch { errs[key] = w('올바른 JSON 객체여야 합니다.', 'Must be a valid JSON object.'); return null; }
    };
    const target = parse('target', input.target);
    const needsBefore = ['removed', 'changed'].includes(input.changeKind), needsAfter = ['added', 'changed'].includes(input.changeKind);
    const before = needsBefore ? parse('before', input.before) : {}, after = needsAfter ? parse('after', input.after) : {};
    if (input.changeKind === 'behavior' && !input.note.trim()) errs['note'] = w('동작 메모에는 메모가 필요합니다.', 'A behavior note requires a note.');
    if ([...input.note].length > SPEC_CHANGE_LIMITS.note) errs['note'] = w('메모는 1000자 이하여야 합니다.', 'Limit the note to 1000 characters.');
    if ([...input.evidenceRef].length > SPEC_CHANGE_LIMITS.evidenceRef) errs['evidenceRef'] = w('근거는 500자 이하여야 합니다.', 'Limit the evidence reference to 500 characters.');
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); setProblem(w('입력 값을 확인해 주세요.', 'Check the highlighted fields.')); return null; }
    const body = input.changeKind === 'behavior' ? {} : input.changeKind === 'added' ? { after: after! } : input.changeKind === 'removed' ? { before: before! } : { before: before!, after: after! };
    if (new TextEncoder().encode(JSON.stringify(body)).length > SPEC_CHANGE_LIMITS.changeJsonBytes) { setFieldErrors({}); setProblem(w('변경 내용은 16 KiB 이하여야 합니다.', 'Change content must be at most 16 KiB.')); return null; }
    return { modelId, softwareId: input.softwareId, ...(input.end === 'none' ? {} : { endsBeforeSoftwareId: input.end }), targetKind: input.targetKind, target: target as SpecChangeAddInput['target'], changeKind: input.changeKind, change: body, note: input.note || null, evidenceRef: input.evidenceRef || null };
  }
  function submit() {
    if (disabled) return;
    const body = payload();
    if (!body) return;
    if (mode === 'add') void add.run(body).then(settle).catch(() => undefined);
    else if (row && mode === 'confirm') void confirm.run({ changeId: row.id }, { expectedVersion: version }).then(settle).catch(() => undefined);
    else if (row) void retire.run({ changeId: row.id, ...(replace ? { replacement: body } : {}) }, { expectedVersion: version }).then(settle).catch(() => undefined);
  }
  async function recover() {
    setRecovering(true);
    try {
      const basis = await latest.fetch({ modelId });
      if (basis.outcome !== 'ok' || !basis.data) { setProblem(w('최신 명세를 확인하지 못했습니다.', 'Could not check the latest specification.')); return; }
      if (row) {
        let page = 0, found: SpecChangeRow | undefined;
        do { const result = await changes.fetch({ modelId, status: 'all', page, pageSize: 200 });
          if (result.outcome !== 'ok' || !result.data) return;
          found = result.data.rows.find(c => c.id === row.id);
          if (found || (page + 1) * 200 >= result.data.total) break; page++;
        } while (page < 100);
        if (!found || found.retiredAt) { setProblem(w('이미 닫힌 변경점입니다. 입력을 복사해 새 변경점으로 작성해 주세요.', 'This change is retired. Copy your input to a new change.')); return; }
        setVersion(String(found.version));
      }
      setConflict(false); setProblem(w('최신 상태를 확인했습니다. 유지된 입력을 검토한 뒤 다시 확인해 주세요.', 'Latest state checked. Review the preserved input before confirming again.'));
    } finally { setRecovering(false); }
  }
  const example = (side: 'target' | 'before' | 'after') => `${w('예', 'Example')}: ${JSON.stringify(JSON_EXAMPLES[input.targetKind][side])}`;
  const close = () => { if (dirty) setDiscard(true); else onClose(); };
  return <>
    <DetailDrawer title={mode === 'add' ? w('변경점 추가', 'Add change') : mode === 'retire' ? w('변경점 닫기·대체', 'Retire or replace change') : w('변경점 재검토 확인', 'Confirm revalidation')} subtitle={row?.targetKey} onClose={close}
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={close}>{w('취소', 'Cancel')}</Button><Button aria-busy={pending || undefined} disabled={disabled || mode === 'add' && !input.softwareId} onClick={submit}>{pending ? w('처리 중…', 'Working…') : mode === 'add' ? w('추가', 'Add') : w('확인', 'Confirm')}</Button></div>}
      tabs={[{ id: 'change', label: w('내용', 'Content'), content: <div className="grid gap-4" aria-busy={pending || undefined}>
        {problem && <Callout tone="amber" title={w('확인 필요', 'Review required')}><p role="alert" className="whitespace-pre-wrap text-sm">{problem}</p></Callout>}
        {conflict && <Button disabled={pending} variant="secondary" onClick={() => { void recover().catch(() => setRecovering(false)); }}>{w('최신 확인 후 다시 검토', 'Check latest and review again')}</Button>}
        {row && <><p className="text-sm">{row.softwareLabel}{w('부터', ' onward')} · r{row.basedOnRevNo} · {row.needsRevalidation ? w('재검토 필요', 'Needs revalidation') : w('확인됨', 'Reviewed')}</p><ChangeComparison row={row} /></>}
        {mode === 'confirm' ? <p className="text-sm">{w('내용을 바꾸지 않고 재검토 필요 표시만 해제합니다.', 'Clear the revalidation flag without changing the content.')}</p> : <>
          {mode === 'retire' && <label className="flex items-center gap-2 text-sm"><Checkbox checked={replace} onCheckedChange={value => setReplace(value === true)} disabled={disabled} />{w('같은 대상의 새 변경점으로 대체', 'Replace with a new change for the same target')}</label>}
          {(mode === 'add' || replace) && <>
            <SpecSelect label={w('적용 시작 SW', 'From software')} value={input.softwareId} options={software.map(s => ({ value: s.id, label: s.versionLabel }))} onChange={value => change('softwareId', value)} disabled={disabled} />
            <SpecSelect label={w('적용 종료 전 SW (미포함)', 'Ends before software (exclusive)')} value={input.end} options={[{ value: 'none', label: w('끝 없음', 'No end') }, ...software.map(s => ({ value: s.id, label: s.versionLabel }))]} onChange={value => change('end', value)} disabled={disabled} />
            <SpecSelect label={w('대상 종류', 'Target kind')} value={input.targetKind} options={['module', 'event', 'field', 'relation'].map(value => ({ value, label: value }))} onChange={value => change('targetKind', value as SpecTargetKind)} disabled={disabled || mode === 'retire'} />
            <SpecField id={`${uid}-target`} label={w('대상 (JSON)', 'Target (JSON)')} value={input.target} onChange={value => change('target', value)} multiline disabled={disabled || mode === 'retire'} error={fieldErrors['target']} hint={example('target')} />
            <SpecSelect label={w('변경 종류', 'Change kind')} value={input.changeKind} options={[['added', w('추가', 'Added')], ['changed', w('변경', 'Changed')], ['removed', w('제거', 'Removed')], ['behavior', w('동작 메모', 'Behavior note')]].map(([value, label]) => ({ value: value!, label: label! }))} onChange={value => change('changeKind', value as SpecChangeKind)} disabled={disabled} />
            {['removed', 'changed'].includes(input.changeKind) && <SpecField id={`${uid}-before`} label={w('변경 전 (JSON)', 'Before (JSON)')} value={input.before} onChange={value => change('before', value)} multiline disabled={disabled} error={fieldErrors['before']} hint={example('before')} />}
            {['added', 'changed'].includes(input.changeKind) && <SpecField id={`${uid}-after`} label={w('변경 후 (JSON)', 'After (JSON)')} value={input.after} onChange={value => change('after', value)} multiline disabled={disabled} error={fieldErrors['after']} hint={example('after')} />}
            <SpecField id={`${uid}-note`} label={w('메모', 'Note')} value={input.note} onChange={value => change('note', value)} multiline disabled={disabled} error={fieldErrors['note']} />
            <SpecField id={`${uid}-evidence`} label={w('근거 참조', 'Evidence reference')} value={input.evidenceRef} onChange={value => change('evidenceRef', value)} disabled={disabled} error={fieldErrors['evidenceRef']} />
          </>}
        </>}
      </div> }]} />
    <Dialog open={discard} onOpenChange={setDiscard}><DialogContent closeLabel={w('닫기', 'Close')}><DialogHeader><DialogTitle>{w('저장하지 않은 입력을 버릴까요?', 'Discard unsaved input?')}</DialogTitle><DialogDescription>{w('변경점은 아직 저장되지 않았습니다.', 'This change has not been saved.')}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setDiscard(false)}>{w('계속 편집', 'Keep editing')}</Button><Button onClick={onClose}>{w('버리고 닫기', 'Discard and close')}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
