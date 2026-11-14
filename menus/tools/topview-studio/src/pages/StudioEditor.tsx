import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Download } from 'lucide-react';
import { validateLayout, type LayoutDocument } from '@eqv/core';
import {
  DEFAULT_SNAP, addComponent, addHoldingSite, addPhysicalInterface, addTransferCapability, canRedo, canUndo, cancelDrag, createLayoutEdit, dragTo, endDrag,
  isDirty, markSaved, moveBy, redo, removalImpact, removeComponent, removeHoldingSite, removePhysicalInterface, removePort, removeTransferCapability, rotateBy,
  setLabel, setTransform, undo, type LayoutEditState,
} from '@eqv/editor';
import { PRIMITIVE_CATALOG, type ComponentDrag } from '@eqv/renderer';
import type { ActionResult } from '@ap/contracts';
import { useMenuAction, useMenuQuery, usePlatform, useUnsavedGuard, type QueryState } from '@ap/kernel';
import { PlatformPage, QueryView } from '@ap/components';
import { Button, Callout, EmptyState, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, TooltipProvider } from '@ap/ui';
import {
  LAYOUT_EDIT_PERMISSION, LAYOUT_PUBLISH_PERMISSION, layoutDraftEndpoint, layoutRevisionEndpoint, layoutRevisionsEndpoint, promoteTemplate, publishRevision, saveDraft,
  templateEndpoint, type LayoutJson, type LayoutRow, type RevisionRead, type TemplateRow,
} from '../endpoints';
import { dataOf, NO_REVISION, rowsOf, settled } from '../model/query';
import { draftStatus, publishBaseline, shortHash, STATUS_TONES, type StatusLabel } from '../model/status';
import { newComponentSize } from '../model/new-component-size';
import { fieldErrorLine } from '../model/text';
import { Canvas } from '../parts/Canvas';
import { Connections, type ConnectionActions } from '../parts/Connections';
import { DeleteDialog, DiscardDialog, PromoteDialog, PublishDialog } from '../parts/Dialogs';
import { FilesPane, type Mode } from '../parts/FilesPane';
import { Outline } from '../parts/OutlinePane';
import { Properties } from '../parts/Properties';
import { ROTATE_STEP, Toolbar } from '../parts/Toolbar';

const PANEL = 'flex h-full min-h-0 min-w-0 flex-col';
const CONTENT = 'm-0 min-h-0 flex-1 overflow-y-auto p-3';
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type Session = {
  edit: LayoutEditState | null;
  /** Draft version the edits are based on; null until the first save of a Layout without a draft. */
  version: string | null;
  /** The server draft (its version, or `none`) this session was last built from. */
  syncedKey: string | null;
  /** The open Layout has no server draft yet: it exists only as an import. */
  imported: boolean;
};
type Notice = { text: string };
type Confirm = { kind: 'reload' } | { kind: 'import'; seed: LayoutDocument };
type Dialog = 'publish' | 'promote' | 'delete' | null;

const failureText = (result: ActionResult<unknown>, subject: string): string => {
  switch (result.outcome) {
    case 'forbidden': return `권한이 없어 ${subject}하지 못했습니다.`;
    case 'invalid': return result.fieldErrors[0] ? fieldErrorLine(result.fieldErrors[0]) : `${subject}하지 못했습니다.`;
    case 'not_found': return `대상을 찾을 수 없어 ${subject}하지 못했습니다.`;
    default: return result.message ?? `${subject}하지 못했습니다.`;
  }
};
const aborted = (error: unknown) => typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

export interface StudioEditorProps {
  layoutId: string;
  layouts: readonly LayoutRow[];
  templatesQuery: QueryState<{ rows: TemplateRow[] }>;
  /** A validated import bound to `layoutId`, waiting to open as an unsaved edit of it. */
  importSeed: LayoutDocument | null;
  onSeedDone(seed: LayoutDocument): void;
  /** `dirty`: the edits here are unsaved, so an import of another Layout is confirmed in place first. */
  onImportFile(file: File, dirty: boolean): void;
  /** An import of another Layout waiting for the person to confirm discarding the unsaved edits here. */
  importAsk: LayoutDocument | null;
  /** The person kept the edits: the asked import is dropped. */
  onImportStay(): void;
  /** The edits here are discarded: open the asked import at its Layout. */
  onImportGo(layout: LayoutDocument): void;
  /** This editor opened for `layoutId`: an import bound to another Layout is void. */
  onImportDrop(layoutId: string): void;
  importError: string | null;
  /** The Layout list could not be refreshed while this editor stays open. */
  onRetryList: (() => void) | null;
}

/** The three-pane editor of one Layout: files and outline on the left, the drawing, the inspector on the right. */
export default function StudioEditor({ layoutId, layouts, templatesQuery, importSeed, onSeedDone, onImportFile, importAsk, onImportStay, onImportGo, onImportDrop, importError, onRetryList }: StudioEditorProps) {
  const { can, pageParam, setPage, toast } = usePlatform();
  const canEdit = can(LAYOUT_EDIT_PERMISSION);
  const canPublish = can(LAYOUT_PUBLISH_PERMISSION);
  const revisionKey = pageParam('revision');
  const templateKey = pageParam('template');
  const mode: Mode = templateKey !== null ? 'template' : revisionKey !== null ? 'revision' : 'draft';

  const draftQ = useMenuQuery(layoutDraftEndpoint, { layoutId });
  const revsQ = useMenuQuery(layoutRevisionsEndpoint, { layoutId });
  const revisions = rowsOf(revsQ);
  const latestRev = revisions?.[0]?.revision ?? null;
  const latestQ = useMenuQuery(layoutRevisionEndpoint, { layoutId, revision: latestRev ?? NO_REVISION }, latestRev !== null);
  const revisionQ = useMenuQuery(layoutRevisionEndpoint, { layoutId, revision: revisionKey ?? NO_REVISION }, mode === 'revision');
  const templateQ = useMenuQuery(templateEndpoint, { templateId: templateKey ?? 'none' }, mode === 'template');

  const [session, setSession] = useState<Session>({ edit: null, version: null, syncedKey: null, imported: false });
  const [selectedId, select] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflict, setConflict] = useState(false);
  const [dialogError, setDialogError] = useState<{ text: string | null; fields: readonly { path: readonly string[]; code: string }[] }>({ text: null, fields: [] });
  const [snap, setSnap] = useState(true);
  const [primitive, setPrimitive] = useState('pm');
  const [appliedSeed, setAppliedSeed] = useState<LayoutDocument | null>(null);
  /** A conflict reload in progress: `from` is the completion time of the read it replaces. The old document stays on screen, read-only. */
  const [reload, setReload] = useState<{ from: number | null } | null>(null);
  const save = useMenuAction(saveDraft);
  const publish = useMenuAction(publishRevision);
  const promote = useMenuAction(promoteTemplate);
  const busy = save.pending || publish.pending || promote.pending || reload !== null;

  const edit = session.edit;
  const dirty = (edit !== null && isDirty(edit)) || session.imported;

  // ---- the server draft becomes the session, unless edits would be lost or the answer is older than what was saved ----
  const draftResp = draftQ.response;
  const draftSettled = settled(draftQ);
  const draftData = dataOf(draftQ);
  const draftParsed = useMemo(() => (draftData ? validateLayout(draftData.document) : null), [draftData]);
  const draftKey = draftSettled ? (draftData ? draftData.version : 'none') : null;
  const reloadDone = reload !== null && draftQ.status === 'done' && draftQ.completedAt !== reload.from;
  const reloadFailed = reloadDone && !draftSettled;
  const staleDraft = session.version !== null && draftKey !== null && (draftKey === 'none' || Number(draftKey) < Number(session.version));
  if (draftKey !== null && session.syncedKey !== draftKey && !dirty && !staleDraft && draftQ.status === 'done') {
    setSession({ edit: draftParsed?.ok ? createLayoutEdit(draftParsed.layout) : null, version: draftData ? draftData.version : null, syncedKey: draftKey, imported: false });
  }
  // A reload replaces document and version together, only from a successful current read.
  if (reloadDone && draftSettled) {
    setReload(null);
    setConflict(false);
    setSession({ edit: draftParsed?.ok ? createLayoutEdit(draftParsed.layout) : null, version: draftData ? draftData.version : null, syncedKey: draftKey, imported: false });
  }
  // ---- an import opens as an unsaved edit at the version of the draft it replaces (version 0 when there is none) ----
  const applyImport = (seed: LayoutDocument) => {
    const base = draftParsed?.ok ? draftParsed.layout : seed;
    setSession({ edit: { ...createLayoutEdit(base), present: seed }, version: draftData ? draftData.version : null, syncedKey: draftKey, imported: draftData === null });
    select(null);
    setNotice(null);
    setConflict(false);
    setAppliedSeed(seed);
    if (mode !== 'draft') setPage({ revision: null, template: null });
  };
  if (importSeed !== null && reload === null && importSeed !== appliedSeed && draftKey !== null && draftQ.status === 'done' && confirm?.kind !== 'import') {
    if (dirty) setConfirm({ kind: 'import', seed: importSeed });
    else applyImport(importSeed);
  }
  useEffect(() => { if (appliedSeed !== null) onSeedDone(appliedSeed); }, [appliedSeed, onSeedDone]);
  useEffect(() => { onImportDrop(layoutId); }, [layoutId, onImportDrop]);
  // Confirming the asked import discards the edits first; the move starts once they no longer count as dirty, so the leave guard stays quiet.
  const [leaveFor, setLeaveFor] = useState<LayoutDocument | null>(null);
  const discardEdits = () => setSession(s => ({ ...s, edit: s.edit && !s.imported ? createLayoutEdit(s.edit.baseline) : null, syncedKey: s.imported ? null : s.syncedKey, imported: false }));
  useEffect(() => { if (leaveFor !== null && !dirty) { setLeaveFor(null); onImportGo(leaveFor); } }, [leaveFor, dirty, onImportGo]);

  useUnsavedGuard(dirty, {
    leaves: 'address',
    onDiscard: () => { setSession(s => ({ ...s, edit: s.edit && !s.imported ? createLayoutEdit(s.edit.baseline) : null, syncedKey: s.imported ? null : s.syncedKey, imported: false })); },
  });

  // ---- the document on screen ----
  const revisionData = dataOf(revisionQ);
  const templateData = dataOf(templateQ);
  const latestData = dataOf(latestQ);
  const parse = (doc: LayoutJson | undefined) => (doc ? validateLayout(doc) : null);
  const revisionParsed = useMemo(() => parse(revisionData?.document), [revisionData]);
  const templateParsed = useMemo(() => parse(templateData?.document), [templateData]);
  const latestParsed = useMemo(() => parse(latestData?.document), [latestData]);
  const layout: LayoutDocument | null = mode === 'draft' ? edit?.present ?? null
    : mode === 'revision' ? (revisionParsed?.ok ? revisionParsed.layout : null) : (templateParsed?.ok ? templateParsed.layout : null);
  const selected = layout?.components.find(c => c.id === selectedId);
  const presentValidity = useMemo(() => (edit && dirty ? validateLayout(edit.present) : null), [edit, dirty]);
  const invalidIssue = presentValidity && !presentValidity.ok ? presentValidity.issues[0] : null;

  const writable = canEdit && mode === 'draft' && edit !== null && !busy && dialog === null && confirm === null;
  const snapOptions = snap ? DEFAULT_SNAP : null;
  const impact = selected && layout ? removalImpact(layout, selected.id) : null;
  const update = (fn: (previous: LayoutEditState) => LayoutEditState) => { if (writable) setSession(s => (s.edit ? { ...s, edit: fn(s.edit) } : s)); };
  const settle = () => setSession(s => (s.edit ? { ...s, edit: cancelDrag(s.edit) } : s));
  // A drag in progress is settled when the view stops being editable.
  const [wasWritable, setWasWritable] = useState(writable);
  if (wasWritable !== writable) { setWasWritable(writable); if (!writable && edit !== null) settle(); }
  const onDrag = ({ componentId, phase, dx, dy }: ComponentDrag) => {
    if (!writable) return;
    if (phase === 'cancel') setSession(s => (s.edit ? { ...s, edit: cancelDrag(s.edit) } : s));
    else setSession(s => (s.edit ? { ...s, edit: phase === 'end' ? endDrag(dragTo(s.edit, componentId, dx, dy, snapOptions)) : dragTo(s.edit, componentId, dx, dy, snapOptions) } : s));
  };

  // ---- status, reasons ----
  const savedDraft = draftData?.document ?? null;
  const status: StatusLabel | null = mode === 'draft'
    ? (draftData === null && !session.imported ? null : draftStatus({ dirty, savedDraft, revisions, latest: latestData as RevisionRead | null }))
    : mode === 'template' ? '읽기 전용' : '게시됨';
  const blockedReason = canEdit && !canPublish ? 'Revision 게시·승격 권한이 없습니다.' : null;
  const draftReadReason = !draftSettled ? (draftQ.response === null ? '초안을 불러오는 중입니다.' : '초안을 불러오지 못했습니다.') : null;
  const publishReason = mode === 'revision' ? '이미 게시된 Revision입니다.' : blockedReason ?? draftReadReason ?? (dirty ? '저장 후 게시 가능' : session.version === null ? '저장한 초안이 없습니다.' : null);
  const revisionDoc = revisionParsed?.ok ? revisionParsed.layout : null;
  const promoteReason = mode === 'draft' ? 'EV Template 승격 대상: 게시된 Revision' : blockedReason
    ?? (revisionDoc === null ? 'Revision을 불러오는 중입니다.' : revisionDoc.kind !== 'equipment-layout' ? '승격 대상: 게시된 equipment-layout' : null);
  const saveReason = draftReadReason ?? (edit === null ? '저장한 초안이 없습니다.' : !dirty ? '저장할 변경이 없습니다.' : invalidIssue ? `Layout 확인 필요 · ${invalidIssue.path.join('.') || '(root)'}: ${invalidIssue.message}` : null);
  const undoReason = writable && edit && !canUndo(edit) ? '실행 취소할 변경이 없습니다.' : null;
  const redoReason = writable && edit && !canRedo(edit) ? '다시 실행할 변경이 없습니다.' : null;
  const selectionReason = writable && !selected ? '회전하려면 Component를 선택하세요.' : null;
  const readOnlyNote = mode === 'template' ? 'EV Template · 읽기 전용' : mode === 'revision' ? '게시된 Revision · 읽기 전용'
    : canEdit ? null : canPublish ? '편집 권한 없음 · 기존 초안 게시 가능' : '조회 전용 · 선택과 속성 확인 가능';

  // ---- writes ----
  const handleFailure = (result: ActionResult<unknown>, subject: string, inDialog: boolean) => {
    if (result.outcome === 'conflict') {
      setConflict(true);
      setNotice(null);
      if (!inDialog) return;
    }
    const text = result.outcome === 'conflict' ? '다른 사용자가 먼저 저장했습니다.' : failureText(result, subject);
    if (inDialog) setDialogError({ text, fields: result.fieldErrors });
    else setNotice({ text });
  };
  const onSave = async () => {
    if (!edit || !dirty || invalidIssue || reload !== null) return;
    const document = edit.present as unknown as LayoutJson;
    setNotice(null);
    try {
      const result = await save.run({ layoutId, document }, { expectedVersion: session.version ?? '0' });
      if (result.outcome === 'ok' && result.data) {
        const version = result.data.version;
        setConflict(false);
        setSession(s => (s.edit && s.edit.present === document ? { edit: markSaved(s.edit), version, syncedKey: version, imported: false } : { ...s, version, syncedKey: version }));
        toast('초안을 저장했습니다', 'info');
      } else handleFailure(result, '저장', false);
    } catch (error) { if (!aborted(error)) setNotice({ text: '저장하지 못했습니다.' }); }
  };
  const onPublish = async () => {
    if (reload !== null) return;
    setDialogError({ text: null, fields: [] });
    try {
      const result = await publish.run({ layoutId }, { expectedVersion: session.version ?? '0' });
      if (result.outcome === 'ok' && result.data) {
        setDialog(null);
        toast(result.data.created ? 'Revision을 게시했습니다' : '같은 내용의 Revision이 이미 있습니다. 새로 만들지 않았습니다', 'info');
      } else handleFailure(result, '게시', true);
    } catch (error) { if (!aborted(error)) setDialogError({ text: '게시하지 못했습니다.', fields: [] }); }
  };
  const onPromote = async ({ templateId, name }: { templateId: string; name: string }) => {
    if (!revisionKey) return;
    setDialogError({ text: null, fields: [] });
    try {
      const result = await promote.run({ layoutId, revision: revisionKey, templateId, name });
      if (result.outcome === 'ok' && result.data) { setDialog(null); toast(`EV Template ${result.data.templateId} 승격 완료 · 삭제 불가`, 'info'); }
      else setDialogError({ text: result.outcome === 'invalid' ? null : failureText(result, '승격'), fields: result.fieldErrors });
    } catch (error) { if (!aborted(error)) setDialogError({ text: '승격하지 못했습니다.', fields: [] }); }
  };
  const reloadServerDraft = () => {
    setConfirm(null);
    setReload({ from: draftQ.completedAt });
    draftQ.refetch();
  };
  const confirmDelete = () => {
    const id = selected?.id;
    setDialog(null);
    select(null);
    if (!id || !canEdit || mode !== 'draft' || busy) return;
    setSession(s => (s.edit && s.edit.present.components.some(c => c.id === id) ? { ...s, edit: removeComponent(cancelDrag(s.edit), id) } : s));
  };
  const onExport = () => {
    if (!edit) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(edit.present, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${edit.present.id}.layout.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ---- editing helpers ----
  const addSelectedPrimitive = () => {
    if (!writable || !edit) return;
    const entry = PRIMITIVE_CATALOG.find(c => c.name === primitive);
    const levelId = selected?.levelId ?? [...edit.present.levels].sort((a, b) => a.order - b.order)[0]?.id;
    if (!entry || !levelId) return;
    const { viewBox } = edit.present;
    const result = addComponent(edit, { asset: primitive, size: newComponentSize(edit.present, primitive), levelId, x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 }, snapOptions);
    setSession(s => ({ ...s, edit: result.state }));
    if (result.componentId) select(result.componentId);
  };
  const rotateSelected = (degrees: number) => { if (selected) update(s => rotateBy(s, selected.id, degrees, snapOptions)); };
  const connectionActions: ConnectionActions | null = writable ? {
    addPhysicalInterface: spec => update(s => addPhysicalInterface(s, spec).state),
    removePhysicalInterface: id => update(s => removePhysicalInterface(s, id)),
    removePort: (componentId, portId) => update(s => removePort(s, componentId, portId)),
    addHoldingSite: (componentId, kinds) => update(s => addHoldingSite(s, componentId, kinds).state),
    removeHoldingSite: (componentId, siteId) => update(s => removeHoldingSite(s, componentId, siteId)),
    addTransferCapability: spec => update(s => addTransferCapability(s, spec).state),
    removeTransferCapability: id => update(s => removeTransferCapability(s, id)),
  } : null;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!writable || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"]')) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 'z') update(event.shiftKey ? redo : undo);
    else if (selected && (event.key === '[' || event.key === ']') && !event.altKey && !event.ctrlKey && !event.metaKey) rotateSelected(event.key === '[' ? -ROTATE_STEP : ROTATE_STEP);
    else if (selected && event.key === 'Delete' && impact?.blockedBy === null) setDialog('delete');
    else if (selected && ARROWS[event.key] && event.altKey && !event.ctrlKey && !event.metaKey) {
      const step = (snap ? DEFAULT_SNAP.grid : 1) * (event.shiftKey ? 10 : 1);
      const [dx, dy] = ARROWS[event.key]!;
      update(s => moveBy(s, selected.id, dx * step, dy * step, snapOptions));
    } else return;
    event.preventDefault();
  };

  // ---- navigation (always a push: never replace for a user-initiated switch) ----
  const openDraft = () => setPage({ revision: null, template: null });
  const openRevision = (revision: string) => setPage({ layout: layoutId, revision, template: null });
  const openTemplate = (id: string) => setPage({ layout: layoutId, template: id, revision: null });
  const openLayout = (id: string) => setPage({ layout: id, revision: null, template: null });

  const titleId = mode === 'template' && templateKey ? templateKey : layoutId;
  const modeText = mode === 'draft' ? 'Layout · 초안' : mode === 'template' ? 'EV Template' : <>Layout · <span className="font-mono">{shortHash(revisionKey ?? '')}</span></>;
  const reasons = [
    readOnlyNote && { id: 'read-only-note', text: readOnlyNote },
    writable && { id: 'shortcuts', text: 'Alt+화살표 이동 · [ ] 회전 · Delete 삭제 · Ctrl/Cmd+Z' },
    mode !== 'template' && (canEdit || canPublish) && publishReason && { id: 'publish-reason', text: publishReason },
    mode !== 'template' && (canEdit || canPublish) && promoteReason && promoteReason !== publishReason && { id: 'promote-reason', text: promoteReason },
    mode === 'draft' && canEdit && saveReason && { id: 'save-reason', text: saveReason },
    undoReason && { id: 'undo-reason', text: undoReason, srOnly: true }, redoReason && { id: 'redo-reason', text: redoReason, srOnly: true }, selectionReason && { id: 'selection-reason', text: selectionReason, srOnly: true },
    writable && impact?.blockedBy && { id: 'delete-reason', text: impact.blockedBy === 'children' ? '자식 Component가 있어 삭제할 수 없습니다.' : '마지막 Component는 삭제할 수 없습니다.' },
  ].filter((r): r is { id: string; text: string; srOnly?: boolean } => !!r);

  const baseline = useMemo(() => {
    if (!draftParsed?.ok || revisions === null || revsQ.status !== 'done') return null;
    if (revisions.length > 0 && (latestQ.status !== 'done' || !latestData || !latestParsed?.ok)) return null;
    return publishBaseline({ draft: draftParsed.layout, revisions, latest: latestData && latestParsed?.ok ? { revision: latestData.revision, document: latestParsed.layout } : null });
  }, [draftParsed, revisions, latestData, latestParsed, revsQ.status, latestQ.status]);

  const baselineError = (revsQ.status === 'done' && !settled(revsQ))
    || (latestRev !== null && latestQ.status === 'done' && (!latestData || !latestParsed?.ok));
  const retryBaseline = () => {
    if (!settled(revsQ)) revsQ.refetch();
    else if (latestRev !== null) latestQ.refetch();
  };

  const actions = (canEdit || canPublish) && <div className="flex items-center gap-2">
    {mode === 'draft' && canEdit && <Button size="toolbar" variant="secondary" disabled={!!saveReason || busy} aria-describedby={saveReason ? 'save-reason' : undefined} onClick={() => void onSave()}>초안 저장</Button>}
    {mode !== 'template' && <>
      <Button size="toolbar" variant="primary" disabled={!!publishReason || busy || edit === null} aria-describedby={publishReason ? 'publish-reason' : undefined} onClick={() => { setDialogError({ text: null, fields: [] }); setDialog('publish'); }}>Revision 게시</Button>
      <Button size="toolbar" variant="secondary" disabled={!!promoteReason || busy} aria-describedby={promoteReason ? 'promote-reason' : undefined} onClick={() => { setDialogError({ text: null, fields: [] }); setDialog('promote'); }}>EV Template으로 승격</Button>
    </>}
  </div>;

  const sourceOk = mode === 'draft' ? draftData !== null || session.imported : mode === 'revision' ? revisionData !== null : templateData !== null;
  const unreadable = sourceOk && layout === null && (mode === 'draft' ? edit === null : true);
  const canvasBody = layout !== null
    ? <Canvas layout={layout} selectedId={selected ? selected.id : null} onSelect={select} {...(writable ? { onDrag } : {})} />
    : <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {mode === 'draft' && draftSettled && !sourceOk && edit === null
        ? <EmptyState title="저장된 초안이 없습니다" body={canEdit ? '파일 탭에서 Layout JSON을 가져와 초안으로 저장하세요.' : '이 Layout에는 저장된 초안이 없습니다.'} />
        : unreadable ? <Callout tone="red" title="이 문서를 그릴 수 없습니다">문서가 Layout 형식과 맞지 않습니다.</Callout>
          : mode === 'draft' ? <QueryView query={draftQ} compact>{() => null}</QueryView> : mode === 'revision' ? <QueryView query={revisionQ} compact>{() => null}</QueryView> : <QueryView query={templateQ} compact>{() => null}</QueryView>}
      {mode !== 'draft' && <div className="mt-3"><Button size="toolbar" variant="secondary" onClick={openDraft}>초안으로 돌아가기</Button></div>}
    </div>;

  return <TooltipProvider><PlatformPage layout="fill" bodyInset="none" crumbs={[{ label: '레이아웃' }]}
    title={<span className="flex min-w-0 items-center gap-2"><span className="truncate font-mono text-sm" title={titleId}>{titleId}</span>{status && <StatusBadge tone={STATUS_TONES[status]}>{status}</StatusBadge>}</span>}
    primaryAction={actions || undefined}>
    <div className="relative min-h-0 flex-1">
    <div className={`${PANEL} absolute inset-0 break-keep`} data-testid="layouts-editor" onKeyDown={onKeyDown}>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside aria-label="탐색" className="w-56 shrink-0 border-r border-border-subtle bg-surface-card">
          <Tabs defaultValue="files" className={PANEL}>
            <TabsList aria-label="탐색 패널" className="h-11 shrink-0"><TabsTrigger value="files">파일</TabsTrigger><TabsTrigger value="outline">구성</TabsTrigger></TabsList>
            <TabsContent value="files" className={CONTENT}>
              <FilesPane layouts={layouts} layoutId={layoutId} mode={mode} revisionKey={revisionKey} templateKey={templateKey} revisionsQuery={revsQ} templatesQuery={templatesQuery}
                canEdit={canEdit} canExport={edit !== null && mode === 'draft'} onLayout={openLayout} onDraft={openDraft} onRevision={openRevision} onTemplate={openTemplate} onFile={file => { if (reload === null) onImportFile(file, dirty); }} onExport={onExport} />
            </TabsContent>
            <TabsContent value="outline" className={CONTENT}>{layout ? <Outline layout={layout} selectedId={selected ? selected.id : null} select={select} /> : <EmptyState size="sm" title="Component가 없습니다" />}</TabsContent>
          </Tabs>
        </aside>
        <div className={`${PANEL} flex-1`}>
          {(notice || importError || conflict || reload !== null || onRetryList) && <div className="max-h-48 shrink-0 space-y-2 overflow-y-auto border-b border-border-subtle p-2">
            {notice && <Callout tone="red"><span role="alert">{notice.text}</span></Callout>}
            {importError && <Callout tone="red" title="가져오기 실패"><span role="alert" className="whitespace-pre-line">{importError}</span></Callout>}
            {onRetryList && <Callout tone="red" title="Layout 목록을 새로 읽지 못했습니다" action={<Button size="toolbar" variant="secondary" onClick={onRetryList}>다시 시도</Button>}>
              편집 중인 내용은 그대로 남아 있습니다.</Callout>}
            {reload !== null && (reloadFailed
              ? <Callout tone="red" title="서버 초안을 불러오지 못했습니다" action={<span className="flex gap-2"><Button size="toolbar" variant="secondary" onClick={reloadServerDraft}>다시 시도</Button><Button size="toolbar" variant="secondary" onClick={() => setReload(null)}>취소</Button></span>}>
                내 편집은 그대로 남아 있습니다. 다시 불러오기 전에는 편집할 수 없습니다.</Callout>
              : <p role="status" className="px-1 text-xs text-text-secondary">서버 초안을 불러오는 중입니다.</p>)}
            {conflict && reload === null && <Callout tone="amber" title="다른 사용자가 먼저 저장했습니다" action={<Button size="toolbar" variant="secondary" onClick={() => setConfirm({ kind: 'reload' })}><Download className="size-3.5" aria-hidden />서버 초안 다시 불러오기</Button>}>
              내 편집은 그대로 남아 있습니다. 다시 불러오면 저장하지 않은 편집이 사라집니다.</Callout>}
          </div>}
          <Toolbar modeText={modeText} count={layout?.components.length ?? null} loading={mode === 'draft' ? draftQ.response === null : mode === 'revision' ? revisionQ.response === null : templateQ.response === null} {...(mode !== 'draft' ? { onReturnToDraft: openDraft } : {})}
            tools={writable && edit ? {
              canUndo: canUndo(edit), canRedo: canRedo(edit), hasSelection: !!selected, snap, primitive, disabled: false, undoReason: !!undoReason, redoReason: !!redoReason, selectionReason: !!selectionReason,
              onUndo: () => update(undo), onRedo: () => update(redo), onRotate: rotateSelected, onSnap: setSnap, onPrimitive: setPrimitive, onAdd: addSelectedPrimitive,
            } : null} />
          {canvasBody}
        </div>
        <aside aria-label="선택 검사" className="relative w-64 shrink-0 border-l border-border-subtle bg-surface-card"><div className="absolute inset-0">
          <Tabs defaultValue="properties" className={PANEL}>
            <TabsList aria-label="검사 패널" className="h-11 shrink-0"><TabsTrigger value="properties">속성</TabsTrigger><TabsTrigger value="connections">연결</TabsTrigger></TabsList>
            <TabsContent value="properties" className={CONTENT}>
              <Properties selected={selected} writable={writable} canDelete={canEdit && mode === 'draft' && edit !== null} deleteBlocked={impact?.blockedBy !== null} readOnlyNote={readOnlyNote ?? ''}
                onLabel={label => selected && update(s => setLabel(s, selected.id, label))} onTransform={(key, value) => selected && update(s => setTransform(s, selected.id, { [key]: value }))} onDelete={() => setDialog('delete')} />
            </TabsContent>
            <TabsContent value="connections" className={CONTENT}>{layout ? <Connections layout={layout} selected={selected} actions={connectionActions} /> : null}</TabsContent>
          </Tabs>
        </div></aside>
      </div>
      <div aria-label="동작 안내" className="flex h-8 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-t border-border-subtle px-4 text-xs text-text-muted">
        {reasons.map(r => <span key={r.id} id={r.id} className={r.srOnly ? 'sr-only' : undefined}>{r.text}</span>)}
      </div>
    </div></div>
    {dialog === 'publish' && draftParsed?.ok && <PublishDialog layout={draftParsed.layout} baseline={baselineError ? null : baseline} baselineError={baselineError} onRetryBaseline={retryBaseline} submitting={publish.pending} error={dialogError.text} onPublish={() => void onPublish()} onCancel={() => setDialog(null)} />}
    {dialog === 'promote' && revisionKey && revisionDoc && <PromoteDialog layoutId={layoutId} revision={revisionKey} source={revisionDoc} submitting={promote.pending} fieldErrors={dialogError.fields} message={dialogError.text}
      onSubmit={input => void onPromote(input)} onCancel={() => setDialog(null)} />}
    {dialog === 'delete' && selected && impact && <DeleteDialog component={selected} impact={impact} onCancel={() => setDialog(null)}
      onConfirm={confirmDelete} />}
    {confirm?.kind === 'reload' && <DiscardDialog title="서버 초안을 다시 불러올까요?" body="저장하지 않은 편집이 사라지고 서버에 저장된 초안으로 바뀝니다." confirmLabel="다시 불러오기" onConfirm={reloadServerDraft} onCancel={() => setConfirm(null)} />}
    {importAsk !== null && leaveFor === null && <DiscardDialog title="다른 Layout 문서를 가져올까요?" body={`저장하지 않은 편집이 사라지고 ${importAsk.id} Layout이 가져온 문서로 열립니다. 저장하기 전에는 서버에 쓰지 않습니다.`} confirmLabel="가져오기"
      onConfirm={() => { setLeaveFor(importAsk); discardEdits(); }} onCancel={onImportStay} />}
    {confirm?.kind === 'import' && <DiscardDialog title="가져온 문서로 바꿀까요?" body="저장하지 않은 편집이 사라지고 가져온 문서가 저장하지 않은 편집으로 열립니다." confirmLabel="가져오기"
      onConfirm={() => { const { seed } = confirm; setConfirm(null); applyImport(seed); }}
      onCancel={() => { setAppliedSeed(confirm.seed); setConfirm(null); }} />}
  </PlatformPage></TooltipProvider>;
}
