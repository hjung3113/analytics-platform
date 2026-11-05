import { useCallback, useState } from 'react';
import { AlertTriangle, Inbox, Loader2, LockKeyhole, ServerCrash } from 'lucide-react';
import { PlatformLink, useMenuFetch, useMenuQuery, usePlatform, usePlatformQuery, type PageProps } from '@ap/kernel';
import { PageKeyWarning, PlatformPage, QueryView, ReturnLink, StateMessage, usePageKeyRules } from '@ap/components';
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { modelProfileEndpoint, modelSpecEndpoint, modelSpecRevisionsEndpoint, softwareVersionsEndpoint, specChangesEndpoint, SPEC_PUBLISH_PERMISSION, type SoftwareRow, type SpecChangeRow } from '../../endpoints';
import { UUID } from './specModel';
import { Pager, SpecSelect, useSpecInstant, useSpecWords } from './SpecControls';
import { ChangeMark, ConnectedChanges, EventDrawer, SpecBody } from './SpecViews';
import { DraftDrawer } from './DraftDrawer';
import { ChangeDrawer } from './ChangeDrawer';
import { ChangeComparison } from './ChangeComparison';
const TABS = ['spec', 'changes', 'history'], DRAWERS = ['event', 'draft', 'add', 'retire', 'confirm'];
const RULES = [
  { key: 'software', label: { ko: 'SW 버전', en: 'Software' }, valid: (v: string) => UUID.test(v) },
  { key: 'tab', label: { ko: '탭', en: 'Tab' }, valid: (v: string) => TABS.includes(v) },
  { key: 'drawer', label: { ko: '서랍', en: 'Drawer' }, valid: (v: string) => DRAWERS.includes(v) },
  { key: 'revision', label: { ko: 'Revision', en: 'Revision' }, valid: (v: string) => UUID.test(v) },
  { key: 'review', label: { ko: '재검토 필터', en: 'Review filter' }, valid: (v: string) => v === 'needed' },
  { key: 'change', label: { ko: '대상', en: 'Target' }, valid: (v: string) => v.length > 0 && v.length <= 4096 && !/[\u0000-\u001f]/u.test(v) },
];
/** The screen collects pages before ordering by SW release_order; the server orders each read by creation time. */
function useChanges(modelId: string, softwareId: string | null, review: boolean, epoch: number, enabled: boolean) {
  const read = useMenuFetch(specChangesEndpoint);
  const run = async (signal: AbortSignal) => {
    const rows: SpecChangeRow[] = [];
    for (let page = 0; ; page++) {
      const response = await read.fetch({ modelId, ...(softwareId ? { softwareId } : {}), ...(review ? { needsRevalidation: true } : {}), status: 'all', page, pageSize: 200 }, signal);
      if (response.outcome !== 'ok' || !response.data) return response;
      rows.push(...response.data.rows);
      if (rows.length >= response.data.total || response.data.rows.length === 0) return { ...response, data: { rows, total: response.data.total } };
    }
  };
  return usePlatformQuery(run, [modelId, softwareId, review, epoch], enabled);
}
function ChangeList({ rows, software, canWrite, navigate }: { rows: SpecChangeRow[]; software: SoftwareRow[]; canWrite: boolean; navigate: (patch: Record<string, string | string[] | null>) => void }) {
  const w = useSpecWords(), instant = useSpecInstant();
  const order = (id: string) => software.find(s => s.id === id)?.releaseOrder ?? Infinity;
  const sorted = [...rows].sort((a, b) => order(a.softwareId) - order(b.softwareId) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return <section aria-label={w('SW 순서별 변경점', 'Changes by software order')} className="grid gap-3">
    {sorted.length === 0 && <p role="status" className="text-sm text-text-muted">{w('해당 변경점이 없습니다.', 'No matching changes.')}</p>}
    {sorted.map(c => <article key={c.id} className="grid gap-2 rounded-md border border-border-subtle bg-surface-card p-3">
      <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm"><span>{c.softwareLabel}{w('부터', ' onward')}{c.endsBeforeLabel && ` · ${c.endsBeforeLabel}${w(' 전까지 (미포함)', ' excluded')}`} [{c.softwareLabel}, {c.endsBeforeLabel ?? '∞'})</span><ChangeMark kind={c.changeKind} />{c.needsRevalidation && <StatusBadge tone="warning">{w('재검토 필요', 'Needs revalidation')}</StatusBadge>}{c.retiredAt && <StatusBadge tone="neutral">{w('닫힘', 'Retired')}</StatusBadge>}</div>
      <ChangeComparison row={c} /><p className="text-xs text-text-muted">{instant(c.createdAt)} · {c.createdBy}</p>
      {c.retiredByChangeId && (canWrite
        ? <Button size="sm" variant="link" onClick={() => navigate({ change: c.retiredByChangeId, drawer: 'retire' })}>{w('대체 기록', 'Replacement record')}: {c.retiredByChangeId}</Button>
        : <p className="text-sm">{w('대체 기록', 'Replacement record')}: {c.retiredByChangeId}</p>)}
      {canWrite && !c.retiredAt && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => navigate({ drawer: 'retire', change: c.id })}>{w('닫기·대체', 'Retire or replace')}</Button>{c.needsRevalidation && <Button size="sm" variant="secondary" onClick={() => navigate({ drawer: 'confirm', change: c.id })}>{w('재검토 확인', 'Confirm review')}</Button>}</div>}
    </article>)}
  </section>;
}
/** Owner-confirmed variant A: one hidden detail route, with the timeline in a tab. */
export default function SpecScreen({ params }: PageProps) {
  const w = useSpecWords(), instant = useSpecInstant(), { can, pageParam, setPage, linkTo } = usePlatform();
  const modelId = params.modelId ?? '', softwareId = pageParam('software'), tab = pageParam('tab') ?? 'spec', drawer = pageParam('drawer'), change = pageParam('change'), revision = pageParam('revision');
  const keys = usePageKeyRules(RULES), enabled = UUID.test(modelId) && !keys.invalid;
  const [epoch, setEpoch] = useState(0), [revisionPage, setRevisionPage] = useState(0);
  // Drawer-replacing navigation goes through the dirty guard (fix C5): the editor reports its dirtiness and the
  // requested patch only applies after an explicit discard.
  const [dirty, setDirty] = useState(false), [leavePatch, setLeavePatch] = useState<Record<string, string | string[] | null> | null>(null);
  const onDirtyChange = useCallback((value: boolean) => setDirty(value), []);
  const navigate = (patch: Record<string, string | string[] | null>) => { if (dirty) setLeavePatch(patch); else setPage(patch); };
  const discardAndLeave = () => { const patch = leavePatch; setLeavePatch(null); setDirty(false); if (patch) setPage(patch); };
  const profile = useMenuQuery(modelProfileEndpoint, { modelId }, enabled);
  const model = profile.response?.outcome === 'ok' ? profile.response.data?.model : null;
  const modelLabel = model ? `${model.name} · ${model.code} · ${model.vendor.name}` : modelId;
  const spec = useMenuQuery(modelSpecEndpoint, { modelId, ...(softwareId ? { softwareId } : {}) }, enabled);
  const swQuery = useMenuQuery(softwareVersionsEndpoint, { q: null, page: 0, pageSize: 200, sorting: [{ id: 'releaseOrder', desc: false }], filters: [{ id: 'modelId', op: 'in', value: [modelId] }] }, enabled);
  const swMore = useMenuFetch(softwareVersionsEndpoint);
  const swAll = usePlatformQuery(async signal => {
    const rows: SoftwareRow[] = [];
    for (let page = 0; ; page++) {
      const response = await swMore.fetch({ q: null, page, pageSize: 200, sorting: [{ id: 'releaseOrder', desc: false }], filters: [{ id: 'modelId', op: 'in', value: [modelId] }] }, signal);
      if (response.outcome !== 'ok' || !response.data) return response;
      rows.push(...response.data.rows);
      if (rows.length >= response.data.total || !response.data.rows.length) return { ...response, data: { rows, total: response.data.total } };
    }
  }, [modelId, epoch], enabled && (swQuery.response?.outcome === 'ok' && (swQuery.response.data?.total ?? 0) > 200));
  const swState = swQuery.response?.outcome === 'ok' && (swQuery.response.data?.total ?? 0) > 200 ? swAll : swQuery;
  const swData = swState.response?.outcome === 'ok' ? swState.response.data : null;
  const software = swData?.rows ?? [], canWrite = can(SPEC_PUBLISH_PERMISSION);
  const history = useMenuQuery(modelSpecRevisionsEndpoint, { modelId, page: revisionPage, pageSize: 50 }, enabled);
  const changes = useChanges(modelId, softwareId, pageParam('review') === 'needed', epoch, enabled);
  const eventChanges = useChanges(modelId, softwareId, false, epoch, enabled && drawer === 'event');
  // A direct change link must resolve even when the visible SW/filter excludes it.
  const allChanges = useChanges(modelId, null, false, epoch, enabled && !!change && ['retire', 'confirm'].includes(drawer ?? ''));
  const changeRow = allChanges.response?.outcome === 'ok' ? allChanges.response.data?.rows.find(c => c.id === change) : undefined;
  const current = spec.response?.outcome === 'ok' ? spec.response.data : null;
  // The Event table reloads when a projection response ARRIVES (accepted by the query), never when a write closes the
  // drawer: the query keeps the previous response until the refetch answers, so the close moment still holds old rows.
  const [projection, setProjection] = useState(spec.response), [freshness, setFreshness] = useState(0);
  if (spec.response !== projection) { setProjection(spec.response); setFreshness(value => value + 1); }
  const revisionData = history.response?.outcome === 'ok' ? history.response.data : null;
  const openDraft = () => navigate({ drawer: 'draft', change: null, revision: revisionData?.rows.find(r => r.state === 'draft')?.id ?? null });
  const close = () => { setPage({ drawer: null, change: null, revision: null }); setEpoch(v => v + 1); spec.refetch(); history.refetch(); };
  let content;
  if (!enabled) content = <StateMessage icon={<AlertTriangle aria-hidden />} title={w('모델 주소를 확인해 주세요.', 'Check the model URL.')} />;
  else if (!spec.response) content = <StateMessage icon={<Loader2 aria-hidden />} title={w('명세를 불러오는 중…', 'Loading specification…')} />;
  else if (spec.response.outcome === 'forbidden') content = <StateMessage icon={<LockKeyhole aria-hidden />} title={w('명세를 볼 권한이 없습니다', 'No permission to view the specification')} />;
  else if (!['ok', 'empty'].includes(spec.response.outcome)) content = <StateMessage icon={<ServerCrash aria-hidden />} title={w('명세를 불러오지 못했습니다', 'Could not load specification')} tone="danger" correlationId={spec.response.correlationId} action={<Button size="sm" variant="secondary" onClick={spec.refetch}>{w('다시 시도', 'Retry')}</Button>} />;
  else content = <Tabs value={tab} onValueChange={value => navigate({ tab: value, drawer: null, change: null })}>
    <TabsList aria-label={w('모델 명세 탭', 'Model specification tabs')}><TabsTrigger value="spec">{w('명세', 'Specification')}</TabsTrigger><TabsTrigger value="changes">{w('변경점', 'Changes')}</TabsTrigger><TabsTrigger value="history">{w('Revision 이력', 'Revision history')}</TabsTrigger></TabsList>
    <TabsContent value="spec">{current ? <SpecBody spec={current} modelId={modelId} freshness={freshness} onOpenEvent={id => navigate({ drawer: 'event', change: id })} /> : <StateMessage icon={<Inbox aria-hidden />} title={w('발행된 모델 명세가 없습니다', 'No published model specification')} body={w('초안을 작성하고 발행하면 모델의 기준 명세가 됩니다.', 'Create and publish a draft to establish the model specification.')} action={canWrite && <Button onClick={openDraft}>{w('첫 명세 작성', 'Create first specification')}</Button>} />}</TabsContent>
    <TabsContent value="changes"><div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><Checkbox checked={pageParam('review') === 'needed'} onCheckedChange={value => setPage({ review: value === true ? 'needed' : null })} />{w('재검토 필요만', 'Needs revalidation only')}</label>{canWrite && current && <Button size="sm" onClick={() => navigate({ drawer: 'add', change: null })}>{w('변경점 추가', 'Add change')}</Button>}</div><QueryView widgetName={w('변경점', 'Changes')} query={changes}>{data => <ChangeList rows={data.rows} software={software} canWrite={canWrite} navigate={navigate} />}</QueryView></div></TabsContent>
    <TabsContent value="history"><QueryView widgetName={w('Revision 이력', 'Revision history')} query={history}>{data => <div className="grid gap-3"><ul className="grid gap-2">{data.rows.map(r => <li key={r.id} className="grid min-h-8 gap-1 border-b border-border-subtle py-2 text-sm"><div className="flex items-center gap-2">r{r.revisionNo} · {w(r.state === 'published' ? '발행됨' : r.state === 'draft' ? '초안' : '반려됨', r.state)} · {r.eventCount} Event {canWrite && r.state === 'draft' && <Button size="sm" variant="secondary" onClick={() => navigate({ drawer: 'draft', revision: r.id })}>{w('초안 편집', 'Edit draft')}</Button>}</div><p>{r.publishedBy ?? '—'} · {r.publishedAt ? instant(r.publishedAt) : '—'}</p><p className="t-mono break-all">{r.contentSha256 ?? w('봉인 전', 'Not sealed')}</p></li>)}</ul><Pager page={revisionPage} size={50} total={data.total} onChange={setRevisionPage} /></div>}</QueryView></TabsContent>
  </Tabs>;
  return <PlatformPage title={w('모델 명세', 'Model specification')} crumbs={model ? [{ label: modelLabel, href: linkTo('log-knowledge-model', { params: { modelId } }) }] : []} secondaryActions={<ReturnLink />} primaryAction={enabled && canWrite && history.response?.outcome === 'ok' ? <Button onClick={openDraft}>{w('초안 편집', 'Edit draft')}</Button> : undefined}>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <PlatformLink href={linkTo('log-knowledge-model', { params: { modelId } })}>{w('모델 프로파일', 'Model profile')}</PlatformLink>
      {!canWrite && <p role="status" className="text-sm text-text-muted">{w('읽기 전용: 작성·발행·변경점 관리에는 knowledge.spec.publish 권한이 필요합니다.', 'Read only: knowledge.spec.publish is required to edit, publish or manage changes.')}</p>}
      <QueryView widgetName={w('SW 버전', 'Software versions')} query={swState}>{() => <SpecSelect label={w('SW 버전', 'Software version')} value={softwareId ?? 'model'} options={[{ value: 'model', label: w('모델 기준', 'Model basis') }, ...software.map(s => ({ value: s.id, label: `${s.releaseOrder}. ${s.versionLabel}` }))]} onChange={value => navigate({ software: value === 'model' ? null : value, drawer: null, change: null })} />}</QueryView>
      {current && <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">r{current.revision.revisionNo} · {current.revision.sourceDocRef.docLabel} · {current.revision.sourceDocRef.docVersion} · {current.revision.publishedAt ? instant(current.revision.publishedAt) : '—'} · {current.revision.publishedBy ?? '—'} {softwareId && <span>{'effective' in current && current.effective ? w('실효 명세', 'Effective specification') : w('모델 명세 그대로', 'Same as model specification')}</span>}{changes.response?.outcome === 'ok' && changes.response.data?.rows.some(c => c.needsRevalidation && !c.retiredAt) && <StatusBadge tone="warning">{w('재검토 필요', 'Needs revalidation')}</StatusBadge>}</p>}
      {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /> : content}
      {enabled && drawer === 'event' && current && <EventDrawer spec={current} identity={change ?? ''} onClose={close} connectedChanges={<QueryView widgetName={w('연결된 변경점', 'Connected changes')} query={eventChanges}>{data => <ConnectedChanges rows={data.rows} spec={current} identity={change ?? ''} onChange={id => navigate({ tab: 'changes', review: null, drawer: canWrite ? 'retire' : null, change: id })} />}</QueryView>} />}
      {enabled && drawer === 'draft' && canWrite && <DraftDrawer modelLabel={modelLabel} modelId={modelId} revisionId={revision} onClose={close} onDirtyChange={onDirtyChange} />}
      {enabled && drawer === 'add' && canWrite && current && <ChangeDrawer key="add" modelId={modelId} software={software} selectedSoftware={softwareId} mode="add" onClose={close} onDirtyChange={onDirtyChange} />}
      {enabled && (drawer === 'retire' || drawer === 'confirm') && canWrite && <QueryView widgetName={w('변경점 상세', 'Change detail')} query={allChanges}>{() => changeRow ? <ChangeDrawer key={`${drawer}:${change}`} modelId={modelId} software={software} selectedSoftware={softwareId} row={changeRow} mode={drawer} onClose={close} onDirtyChange={onDirtyChange} /> : <p role="status">{w('변경점을 찾을 수 없습니다.', 'Change not found.')}</p>}</QueryView>}
      {leavePatch && <Dialog open onOpenChange={value => { if (!value) setLeavePatch(null); }}><DialogContent closeLabel={w('닫기', 'Close')}>
        <DialogHeader><DialogTitle>{w('저장하지 않은 입력을 버릴까요?', 'Discard unsaved input?')}</DialogTitle><DialogDescription>{w('이동하면 편집 중인 내용이 사라집니다.', 'Navigating away discards your edits.')}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="secondary" onClick={() => setLeavePatch(null)}>{w('계속 편집', 'Keep editing')}</Button><Button onClick={discardAndLeave}>{w('버리고 이동', 'Discard and leave')}</Button></DialogFooter>
      </DialogContent></Dialog>}
    </div>
  </PlatformPage>;
}
