import { useEffect, useId, useState } from 'react';
import type { ActionResult } from '@ap/contracts';
import { useMenuAction, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { DetailDrawer, QueryView } from '@ap/components';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@ap/ui';
import type { ModelSpecData, SpecDraftData } from '../../endpoints';
import { modelSpecEndpoint, modelSpecRevisionsEndpoint, specDraftCreate, specDraftEndpoint, specDraftSave, specPublish, specReject, SPEC_SAVE_LIMITS } from '../../endpoints';
import { specRows, specText } from './specModel';
import { SpecField, useSpecFieldErrors, useSpecWords, type FieldRoute } from './SpecControls';
/** Draft wire errors land on the control that owns them: row and TSV paths on the TSV editor, the rest by name. */
const DRAFT_ROUTE: FieldRoute = path => {
  const head = path[0] ?? '';
  if (['text', 'input', 'format', 'modules', 'events', 'relations'].includes(head)) return { control: 'text', path };
  if (head === 'sourceDocRef') return { control: ['docLabel', 'docVersion', 'link'].includes(path[1] ?? '') ? `sourceDocRef.${path[1]}` : 'sourceDocRef.docLabel', path: path.slice(1) };
  if (head === 'reason') return { control: 'reason', path: [] };
  return null;
};
export function DraftDrawer({ modelId, modelLabel, revisionId, onClose, onDirtyChange }: { modelId: string; modelLabel: string; revisionId: string | null; onClose: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const w = useSpecWords(), mapFieldErrors = useSpecFieldErrors(), id = useId();
  const { setPage } = usePlatform();
  const draft = useMenuQuery(specDraftEndpoint, { revisionId: revisionId ?? '' }, !!revisionId);
  const create = useMenuAction(specDraftCreate), save = useMenuAction(specDraftSave), publish = useMenuAction(specPublish), reject = useMenuAction(specReject);
  const latest = useMenuFetch(modelSpecEndpoint), history = useMenuFetch(modelSpecRevisionsEndpoint), openDraft = useMenuFetch(specDraftEndpoint);
  // What recovery read, shown read-only until the user picks; nothing is written before that (#2073).
  const [recovery, setRecovery] = useState<{ kind: 'published'; revisionNo: number; text: string; rows: ReturnType<typeof specRows> } | { kind: 'draft'; revisionNo: number; text: string; draft: SpecDraftData; publishedNo: number | null } | null>(null);
  const [baseNo, setBaseNo] = useState<number | null>(null);
  const [text, setText] = useState('kind\tmodule\tevent\n'), [savedText, setSavedText] = useState('kind\tmodule\tevent\n');
  // The loaded draft as structured rows: metadata-only saves never funnel stored tabs/newlines through unquoted TSV (fix C1).
  const [rows, setRows] = useState<ReturnType<typeof specRows> | null>(null), [textDirty, setTextDirty] = useState(false);
  const [source, setSource] = useState({ docLabel: '', docVersion: '', link: '' });
  const [savedSource, setSavedSource] = useState(source);
  const [version, setVersion] = useState(''), [loaded, setLoaded] = useState<string | null>(null);
  const [problem, setProblem] = useState(''), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false), [recovering, setRecovering] = useState(false);
  const [confirm, setConfirm] = useState(false), [discard, setDiscard] = useState(false), [reason, setReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false), [fileFormat, setFileFormat] = useState<'paste' | 'tsv'>('paste');
  const data = draft.response?.outcome === 'ok' ? draft.response.data : null;
  useEffect(() => {
    if (!data || loaded === data.revision.id || conflict || data.revision.id !== revisionId) return;
    const body = specText(data), ref = { docLabel: data.revision.sourceDocRef.docLabel, docVersion: data.revision.sourceDocRef.docVersion, link: data.revision.sourceDocRef.link ?? '' };
    setText(body); setSavedText(body); setRows(specRows(data)); setTextDirty(false); setSource(ref); setSavedSource(ref); setVersion(String(data.revision.version)); setLoaded(data.revision.id);
  }, [data, loaded, conflict, revisionId]);
  const dirty = text !== savedText || JSON.stringify(source) !== JSON.stringify(savedSource);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const pending = create.pending || save.pending || publish.pending || reject.pending || recovering;
  const editable = !pending && !conflict;
  const deciding = recovery !== null;
  const close = () => { if (dirty) setDiscard(true); else onClose(); };
  function failure(result: ActionResult<unknown>): boolean {
    if (result.outcome === 'ok' && result.data) { setProblem(''); setFieldErrors({}); return false; }
    if (result.outcome === 'conflict') { setConflict(true); setConfirm(false); setRejectOpen(false); }
    const feedback = result.outcome === 'invalid' ? mapFieldErrors(result.fieldErrors, DRAFT_ROUTE) : { fields: {}, rest: [] as string[] };
    setFieldErrors(feedback.fields);
    setProblem(result.outcome === 'invalid' ? [Object.keys(feedback.fields).length ? w('입력 값을 확인해 주세요.', 'Check the highlighted fields.') : w('입력 값을 확인해 주세요.', 'Check your input.'), ...feedback.rest].join('\n')
      : result.outcome === 'forbidden' ? w('발행 권한이 없습니다. 입력은 유지됩니다.', 'Publication permission denied. Your input is preserved.')
      : result.outcome === 'conflict' ? w('다른 사람이 먼저 발행하거나 변경했습니다. 입력은 유지됩니다.', 'Another publication or change won the race. Your input is preserved.')
      : w('처리 결과를 확인하지 못했습니다. 최신 상태를 확인해 주세요.', 'The result could not be confirmed. Check the latest state.'));
    return true;
  }
  const doc = () => ({ docLabel: source.docLabel, docVersion: source.docVersion, ...(source.link ? { link: source.link } : {}) });
  async function createNew() {
    const result = await create.run({ modelId, sourceDocRef: doc() });
    if (!failure(result) && result.outcome === 'ok' && result.data) { setVersion(String(result.data.version)); setLoaded(null); setPage({ revision: result.data.revisionId }, { replace: true }); }
  }
  async function saveDraft() {
    if (!revisionId || !editable) return;
    // Structured snapshot when the text was not touched; the text path stays for pasted/loaded TSV.
    const body = !textDirty && rows && (rows.modules?.length || rows.events?.length || rows.relations?.length)
      ? { revisionId, mode: 'replace' as const, sourceDocRef: doc(), ...rows }
      : { revisionId, mode: 'replace' as const, sourceDocRef: doc(), text, format: fileFormat };
    if (!('text' in body) && new TextEncoder().encode(JSON.stringify(body)).length > SPEC_SAVE_LIMITS.bodyBytes) { setProblem(w('한 번에 512 KiB 이하로 제출해 주세요.', 'Submit at most 512 KiB per save.')); return; }
    if ('text' in body && new TextEncoder().encode(body.text).length > SPEC_SAVE_LIMITS.bodyBytes) { setProblem(w('한 번에 512 KiB 이하로 제출해 주세요.', 'Submit at most 512 KiB per save.')); return; }
    const result = await save.run(body, { expectedVersion: version });
    if (!failure(result) && result.outcome === 'ok' && result.data) { setLoaded(result.data.revisionId); setVersion(String(result.data.version)); setSavedText(text); setSavedSource(source); setTextDirty(false);
      // The snapshot follows the content that was just saved: a text save leaves no structured copy of it, so the next save sends the saved text, never the draft that was loaded first.
      if ('text' in body) setRows(null);
      setPage({ revision: result.data.revisionId }, { replace: true }); }
  }
  async function recover() {
    setRecovering(true);
    try {
      const fresh = await latest.fetch({ modelId }), revisions = await history.fetch({ modelId, page: 0, pageSize: 200 });
      if (fresh.outcome !== 'ok' || revisions.outcome !== 'ok' || !revisions.data) { setProblem(w('최신 상태를 확인하지 못했습니다. 입력은 유지됩니다.', 'Could not check the latest state. Your input is preserved.')); return; }
      const published = fresh.data && !('effective' in fresh.data && fresh.data.effective) ? fresh.data as ModelSpecData : null;
      const existing = revisions.data.rows.find(r => r.state === 'draft');
      if (existing) {
        const read = await openDraft.fetch({ revisionId: existing.id });
        if (read.outcome !== 'ok' || !read.data) { setProblem(w('열린 초안을 읽지 못했습니다. 입력은 유지됩니다.', 'Could not read the open draft. Your input is preserved.')); return; }
        setProblem(''); setRecovery({ kind: 'draft', revisionNo: read.data.revision.revisionNo, text: specText(read.data), draft: read.data, publishedNo: published?.revision.revisionNo ?? null });
        return;
      }
      if (!published) { setProblem(w('발행된 명세를 찾지 못했습니다. 입력은 유지됩니다.', 'No published specification was found. Your input is preserved.')); return; }
      setProblem(''); setRecovery({ kind: 'published', revisionNo: published.revision.revisionNo, text: specText(published), rows: specRows(published) });
    } finally { setRecovering(false); }
  }
  /** The user's pick after recovery: `replace` takes the shown content into the editor, `keep` leaves the typed text; either way the shown content becomes the saved state. */
  async function choose(pick: 'replace' | 'keep') {
    if (!recovery) return;
    setRecovering(true);
    try {
      if (recovery.kind === 'draft') {
        const d = recovery.draft, ref = { docLabel: d.revision.sourceDocRef.docLabel, docVersion: d.revision.sourceDocRef.docVersion, link: d.revision.sourceDocRef.link ?? '' };
        setLoaded(d.revision.id); setVersion(String(d.revision.version)); setSavedText(recovery.text); setSavedSource(ref); setBaseNo(recovery.publishedNo);
        if (pick === 'replace') { setText(recovery.text); setSource(ref); setRows(specRows(d)); setTextDirty(false); } else if (textDirty) setRows(null);
        setConflict(false); setRecovery(null); setPage({ revision: d.revision.id }, { replace: true });
        return;
      }
      const result = await create.run({ modelId, sourceDocRef: doc() });
      // A lost create race (someone opened a draft after the read): drop the stale snapshot so the next read shows the open draft; the typed text and the conflict gate stay.
      if (failure(result)) { setRecovery(null); return; }
      if (result.outcome === 'ok' && result.data) {
        // The new draft is empty on the server: its saved state stays empty, so either pick must be saved before 발행 (never publish an empty draft).
        setLoaded(result.data.revisionId); setVersion(String(result.data.version)); setSavedText(''); setBaseNo(recovery.revisionNo);
        // The chosen content keeps its structured snapshot (stored tabs/newlines never pass through the unquoted preview) until the text is edited.
        if (pick === 'replace') { setText(recovery.text); setRows(recovery.rows); setTextDirty(false); } else if (textDirty) setRows(null);
        setConflict(false); setRecovery(null); setPage({ revision: result.data.revisionId }, { replace: true });
      }
    } finally { setRecovering(false); }
  }
  const textError = fieldErrors['text'] ?? fieldErrors['input'] ?? fieldErrors['format'];
  const body = <div className="grid gap-4" aria-busy={pending || undefined}>
    {problem && <Callout tone="red" title={w('처리하지 못했습니다', 'Action did not complete')}><p role="alert" className="whitespace-pre-wrap text-sm">{problem}</p></Callout>}
    {conflict && !deciding && <Button variant="secondary" disabled={pending} aria-busy={recovering || undefined} onClick={() => { void recover().catch(() => setRecovering(false)); }}>{recovering ? w('확인하는 중…', 'Checking…') : w('최신 발행본 확인', 'Check the latest publication')}</Button>}
    {recovery && <div role="group" aria-label={recovery.kind === 'published' ? w(`현재 발행본 r${recovery.revisionNo}`, `Current publication r${recovery.revisionNo}`) : w(`열린 초안 r${recovery.revisionNo} (다른 사람이 저장)`, `Open draft r${recovery.revisionNo} (saved by someone else)`)} className="grid gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">{recovery.kind === 'published' ? w(`현재 발행본 r${recovery.revisionNo}`, `Current publication r${recovery.revisionNo}`) : w(`열린 초안 r${recovery.revisionNo} (다른 사람이 저장)`, `Open draft r${recovery.revisionNo} (saved by someone else)`)}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre text-xs">{recovery.text}</pre>
      <p className="text-sm">{w('저장된 내용 없음. 하나를 골라 이어서 편집하세요.', 'Nothing saved. Pick one to continue editing.')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => { void choose('replace').catch(() => setRecovering(false)); }}>{recovery.kind === 'published' ? w('발행본으로 바꾸기', 'Replace with the publication') : w('그 초안으로 바꾸기', 'Replace with that draft')}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => { void choose('keep').catch(() => setRecovering(false)); }}>{w('내 입력 유지', 'Keep my input')}</Button>
      </div>
    </div>}
    <SpecField id={`${id}-label`} label={w('원본 문서', 'Source document')} value={source.docLabel} onChange={docLabel => setSource({ ...source, docLabel })} disabled={!editable} error={fieldErrors['sourceDocRef.docLabel']} required />
    <SpecField id={`${id}-version`} label={w('문서 버전', 'Document version')} value={source.docVersion} onChange={docVersion => setSource({ ...source, docVersion })} disabled={!editable} error={fieldErrors['sourceDocRef.docVersion']} required />
    <SpecField id={`${id}-link`} label={w('원본 링크 (선택)', 'Source link (optional)')} value={source.link} onChange={link => setSource({ ...source, link })} disabled={!editable} error={fieldErrors['sourceDocRef.link']} />
    {revisionId && <>
      <SpecField id={`${id}-text`} label={w('명세 TSV', 'Specification TSV')} value={text} onChange={value => { setText(value); setTextDirty(true); setFileFormat('paste'); }} multiline disabled={!editable} error={textError}
        hint={w('kind: module / event / relation · 전체 내용 저장 시 새 초안으로 교체 · 초안 내용만 저장', 'kind: module / event / relation · saving full content replaces the draft · only draft content is saved')} />
      <label className="grid gap-1 text-sm">{w('TSV 형식 .txt 읽기', 'Read a TSV .txt file')}<Input type="file" accept=".txt,text/plain" disabled={!editable} onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > SPEC_SAVE_LIMITS.bodyBytes) { setProblem(w('파일은 512 KiB 이하여야 합니다.', 'The file must be at most 512 KiB.')); return; }
        void file.text().then(value => { setText(value); setTextDirty(true); setFileFormat('tsv'); }).catch(() => setProblem(w('파일을 읽지 못했습니다.', 'Could not read the file.')));
      }} /></label>
    </>}
  </div>;
  return <>
    <DetailDrawer title={w('명세 초안 편집', 'Edit spec draft')} onClose={close} footer={<div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" disabled={pending} onClick={close}>{w('취소', 'Cancel')}</Button>
      {revisionId ? <><Button variant="secondary" disabled={!editable || !version} onClick={() => setRejectOpen(true)}>{w('반려', 'Reject')}</Button><Button aria-busy={save.pending || undefined} disabled={!editable || !version} onClick={() => { void saveDraft().catch(() => undefined); }}>{save.pending ? w('저장 중…', 'Saving…') : w('저장', 'Save')}</Button><Button disabled={!editable || !version || dirty} onClick={() => setConfirm(true)}>{w('발행', 'Publish')}</Button></>
        : <Button disabled={pending || !source.docLabel.trim() || !source.docVersion.trim()} aria-busy={create.pending || undefined} onClick={() => { void createNew().catch(() => undefined); }}>{create.pending ? w('작성 중…', 'Creating…') : w('초안 작성', 'Create draft')}</Button>}
    </div>} tabs={[{ id: 'draft', label: w('내용', 'Content'), content: !revisionId ? body : <QueryView widgetName={w('명세 초안', 'Spec draft')} query={draft}>{value => value ? body : <div role="alert">{w('초안이 이미 발행되거나 반려됐습니다. 입력을 유지하고 최신 상태를 확인해 주세요.', 'The draft was already published or rejected. Keep your input and check the latest state.')}{body}</div>}</QueryView> }]} />
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent closeLabel={w('닫기', 'Close')}><DialogHeader><DialogTitle>{w('명세 발행 확인', 'Publish specification?')}</DialogTitle><DialogDescription>{w('제출한 내용은 해시로 봉인되며 발행 뒤에는 고칠 수 없습니다.', 'Submitted content is sealed with a hash and cannot be edited after publication.')}</DialogDescription></DialogHeader>
      <div className="grid gap-2 break-words text-sm"><p>{w('모델', 'Model')}: {modelLabel}</p><p>{w('초안 Revision', 'Draft revision')}: {data ? `r${data.revision.revisionNo}` : revisionId}</p><p>{w('원본 문서', 'Source document')}: {source.docLabel} · {source.docVersion}</p>{baseNo !== null && <p>{w('기준 발행본', 'Base publication')}: r{baseNo}</p>}</div>
      <p className="text-sm">{w('새 Revision이 건드린 열린 변경점은 재검토 필요로 표시됩니다.', 'Open changes touched by the new revision will be marked for revalidation.')}</p>
      <DialogFooter><Button variant="secondary" onClick={() => setConfirm(false)}>{w('취소', 'Cancel')}</Button><Button aria-busy={publish.pending || undefined} disabled={pending} onClick={() => { if (revisionId) void publish.run({ revisionId }, { expectedVersion: version }).then(r => { if (!failure(r)) onClose(); }).catch(() => undefined); }}>{publish.pending ? w('발행 중…', 'Publishing…') : w('확인하고 발행', 'Confirm publication')}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={discard} onOpenChange={setDiscard}><DialogContent closeLabel={w('닫기', 'Close')}><DialogHeader><DialogTitle>{w('저장하지 않은 입력을 버릴까요?', 'Discard unsaved input?')}</DialogTitle><DialogDescription>{w('입력은 서버에 저장되지 않았습니다.', 'Your input has not been saved to the server.')}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setDiscard(false)}>{w('계속 편집', 'Keep editing')}</Button><Button onClick={onClose}>{w('버리고 닫기', 'Discard and close')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={rejectOpen} onOpenChange={setRejectOpen}><DialogContent closeLabel={w('닫기', 'Close')}><DialogHeader><DialogTitle>{w('초안 반려', 'Reject draft')}</DialogTitle><DialogDescription>{w('반려된 초안은 고칠 수 없습니다.', 'A rejected draft cannot be edited.')}</DialogDescription></DialogHeader><SpecField id={`${id}-reason`} label={w('반려 사유', 'Rejection reason')} value={reason} onChange={setReason} multiline error={fieldErrors['reason']} /><DialogFooter><Button variant="secondary" onClick={() => setRejectOpen(false)}>{w('취소', 'Cancel')}</Button><Button aria-busy={reject.pending || undefined} disabled={pending || !reason.trim() || [...reason].length > 500} onClick={() => { if (revisionId) void reject.run({ revisionId, reason }, { expectedVersion: version }).then(r => { if (!failure(r)) onClose(); }).catch(() => undefined); }}>{reject.pending ? w('반려 중…', 'Rejecting…') : w('반려 확인', 'Confirm rejection')}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
