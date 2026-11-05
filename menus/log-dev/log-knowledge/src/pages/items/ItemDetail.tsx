import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { PlatformLink, useMenuQuery, usePlatform, type PageProps } from '@ap/kernel';
import { DetailDrawer, PageKeyWarning, PlatformPage, QueryView, ReturnLink, StateMessage, usePageKeyRules } from '@ap/components';
import { Button } from '@ap/ui';
import { ITEM_PUBLISH_PERMISSION, itemDetailEndpoint, type ItemDetail as ItemDetailData, type ItemDetailParams } from '../../endpoints';
import { SubjectChips } from './ItemSubjects';
import { ArchiveAction } from './ArchiveAction';
import { AssessDrawer } from './AssessDrawer';
import { ItemWriteDrawer } from './ItemWriteDrawer';
import { OwnerChip, StateBadges, TypeBadge } from './ItemBadges';
import { AssessmentTimeline, EvidenceList, ItemBodyBlocks, LinkList, RevisionList, Section, stamp } from './ItemDetailParts';
import { isRevisionParam, itemNoLabel, revisionOf, shortActor } from './itemModel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAWERS = ['revise', 'assess', 'derive'] as const;
type DrawerKind = (typeof DRAWERS)[number];
const RULES = [
  { key: 'rev', label: { ko: '리비전', en: 'Revision' }, valid: isRevisionParam },
  { key: 'drawer', label: { ko: '서랍', en: 'Drawer' }, valid: (raw: string) => (DRAWERS as readonly string[]).includes(raw) },
];

function NotFound({ revision }: { revision: number | null }) {
  const { linkTo } = usePlatform();
  return <StateMessage icon={<SearchX className="size-4" aria-hidden />} title="이 Item을 찾을 수 없습니다"
    body={revision === null ? '주소가 틀렸거나 볼 수 없는 Item입니다.' : `주소가 틀렸거나, Item에 r${revision} 리비전이 없습니다.`}
    action={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('log-knowledge-items')}>전체 기술 Item으로</PlatformLink></Button>} />;
}

function Header({ detail, viewing }: { detail: ItemDetailData; viewing: number }) {
  const { item, revision } = detail;
  return <header className="grid gap-2">
    <div className="flex flex-wrap items-center gap-1.5">
      <OwnerChip owner={item.owner} /><TypeBadge code={revision.typeCode} /><StateBadges item={item} />
    </div>
    <p className="text-xs text-text-muted">
      <span className="t-mono">{itemNoLabel(item.itemNo)}</span> · r{viewing} · 작성 <span title={item.createdBy}>{shortActor(item.createdBy)}</span> {stamp(item.createdAt)} · 갱신 {stamp(item.updatedAt)}
      {viewing !== item.latestRevisionNo && <> · r{viewing} 게시 {stamp(revision.publishedAt)}</>}
    </p>
  </header>;
}

function Body({ detail }: { detail: ItemDetailData }) {
  const { setPage } = usePlatform();
  const { item, revision } = detail;
  const viewing = revision.revisionNo;
  const old = viewing !== item.latestRevisionNo;
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 *:min-w-0">
    <Header detail={detail} viewing={viewing} />
    {item.publicationState === 'archived' && <div role="status" className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
      보관된 Item입니다 — 읽을 수 있고 이력은 그대로 남아 있습니다. 수정·판단 변경은 보관을 해제한 뒤에 할 수 있습니다.
    </div>}
    {old && <div role="status" className="flex flex-wrap items-center gap-3 rounded-md bg-accent-warn-soft px-3 py-2 text-sm text-text-warning-label">
      이전 리비전 r{viewing}을 보고 있습니다 —
      <Button type="button" variant="link" size="sm" onClick={() => setPage({ rev: null })}>최신 보기</Button>
    </div>}
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4">
      <ItemBodyBlocks revision={revision} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        <SubjectChips subjects={detail.subjects} />
        <Section title="근거" count={revision.evidence.length}><EvidenceList evidence={revision.evidence} /></Section>
        <Section title="연결 Item" count={detail.links.length}><LinkList links={detail.links} /></Section>
        <Section title="리비전" count={detail.revisions.length}>
          <RevisionList revisions={detail.revisions} latest={item.latestRevisionNo} viewing={viewing}
            onSelect={n => setPage({ rev: n === item.latestRevisionNo ? null : String(n) })} />
        </Section>
      </div>
    </div>
    <Section title="판단 변경 이력" count={detail.assessments.length}><AssessmentTimeline assessments={detail.assessments} /></Section>
  </div>;
}

/**
 * The drawer behind `drawer=<kind>`. Revise edits the latest revision: while an older `rev` is shown, the latest is read once more for the
 * form (and for the version the write is guarded by); the other two drawers use the shown detail (derive takes the viewed revision).
 */
function DrawerHost({ kind, detail, viewedRevisionNo, onReload }: { kind: DrawerKind; detail: ItemDetailData; viewedRevisionNo: number | null; onReload: () => void }) {
  const { setPage } = usePlatform();
  // The derive form is pinned to the revision it was opened on (#1365): a later response for another `rev` must not rebuild it or change its source.
  const [pinnedSource] = useState(detail);
  const shownIsLatest = detail.revision.revisionNo === detail.item.latestRevisionNo;
  const latestQuery = useMenuQuery(itemDetailEndpoint, { itemId: detail.item.id } satisfies ItemDetailParams, kind === 'revise' && !shownIsLatest);
  const fresh = latestQuery.response?.outcome === 'ok' ? latestQuery.response.data : null;
  // A failed re-read after a conflict keeps the form (and its draft) on the last good latest instead of unmounting it.
  // One source per render (the shown detail when it is the latest, else the re-read), so the two can never alternate in an update loop.
  const source = shownIsLatest ? detail : fresh;
  const [kept, setKept] = useState(source);
  const [retain, setRetain] = useState(false);
  if (source && source !== kept) setKept(source);
  const latest = shownIsLatest ? detail : fresh ?? (retain ? kept : null);
  const close = () => setPage({ drawer: null });
  if (kind === 'derive') return <ItemWriteDrawer target={{ mode: 'derive', detail: pinnedSource }} onClose={close} />;
  if (kind === 'assess') return detail.item.publicationState === 'archived' ? null : <AssessDrawer detail={detail} onReload={onReload} onClose={close} />;
  if (detail.item.publicationState === 'archived') return null;
  if (!latest) return <DetailDrawer title="기술 Item 수정" subtitle={itemNoLabel(detail.item.itemNo)} onClose={close}
    tabs={[{ id: 'form', label: '내용', content: latestQuery.response === null || latestQuery.response === undefined
      ? <p role="status" className="text-sm text-text-muted">최신 리비전을 불러오는 중…</p>
      : <div className="grid gap-3"><p role="alert" className="text-sm text-text-danger-label">최신 리비전을 불러오지 못했습니다. 수정은 항상 최신 리비전을 바탕으로 합니다.</p>
        <div className="flex gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => latestQuery.refetch()}>다시 시도</Button><Button type="button" size="sm" variant="ghost" onClick={close}>닫기</Button></div></div> }]} />;
  return <ItemWriteDrawer target={{ mode: 'revise', detail: latest, viewedRevisionNo, onReload: () => { setRetain(true); onReload(); latestQuery.refetch(); } }} onClose={close} />;
}

/**
 * 기술 Item 상세 (#1197 s2, owner-confirmed variant A), read-only: the four body blocks (opinion set apart from fact) on the left,
 * evidence, links and revisions on the right, the assessment history below. `rev` re-reads an older revision; `null` data is not-found.
 */
export default function ItemDetail({ params }: PageProps) {
  const { adapter, revision, user } = usePlatform();
  // These are the public inputs of the Kernel query generation. Remount every retained value and draft together.
  const [identity, setIdentity] = useState({ adapter, revision, userId: user?.id, epoch: 0 });
  const changed = identity.adapter !== adapter || identity.revision !== revision || identity.userId !== user?.id;
  const epoch = identity.epoch + Number(changed);
  if (changed) setIdentity({ adapter, revision, userId: user?.id, epoch });
  // Keyed by generation and Item, not by `rev`: the Kernel's kept previous result (#1365, ADR-0114) is for revision picks only; another Item
  // or another identity generation always starts fresh.
  return <ItemDetailScreen key={`${epoch}:${params.itemId}`} params={params} />;
}

function ItemDetailScreen({ params }: PageProps) {
  const { pageParam, setPage, can } = usePlatform();
  const keys = usePageKeyRules(RULES);
  const itemId = params.itemId ?? '';
  const revisionNo = revisionOf(pageParam('rev'));
  const known = UUID.test(itemId);
  // keepPrevious ON (#1365, ADR-0114): `rev` re-reads the same Item, so the shown revision stays (refreshing) until the picked one arrives; the banner and revision list follow when it does.
  const query = useMenuQuery(itemDetailEndpoint, { itemId, ...(revisionNo === null ? {} : { revisionNo }) } satisfies ItemDetailParams, known && !keys.invalid, { keepPrevious: true });
  const live = query.response?.outcome === 'ok' ? query.response.data : undefined;
  const [kept, setKept] = useState(live);
  const [retain, setRetain] = useState(false);
  if (live && live !== kept) setKept(live);
  // A failed conflict reload must keep the active editor and its draft, but never cross an Item/revision boundary.
  const keepEditor = retain && pageParam('drawer') === 'revise' && kept?.item.id === itemId && (revisionNo === null || kept.revision.revisionNo === revisionNo) && (!query.response || ['error', 'timeout', 'too_large'].includes(query.response.outcome));
  const detail = live ?? (keepEditor ? kept : undefined);
  // Only holders of the publish right see write controls; the server stays the authority.
  const canWrite = can(ITEM_PUBLISH_PERMISSION) && !!detail;
  // While another revision is loading the shown one is the previous pick (#1365): no write may start from it, an open form keeps the revision it was opened on.
  const previous = query.showingPrevious === true;
  const waitingReason = previous ? '선택한 리비전을 불러오는 중입니다. 불러온 뒤에 할 수 있습니다.' : undefined;
  const archived = detail?.item.publicationState === 'archived';
  const drawerParam = pageParam('drawer');
  const drawer = canWrite && drawerParam !== null && (DRAWERS as readonly string[]).includes(drawerParam) ? (drawerParam as DrawerKind) : null;
  const secondary = <>
    <ReturnLink />
    {canWrite && !archived && <Button type="button" variant="ghost" size="sm" className="w-full justify-start" disabled={previous} title={waitingReason} onClick={() => setPage({ drawer: 'assess' })}>판단 변경</Button>}
    {canWrite && <Button type="button" variant="ghost" size="sm" className="w-full justify-start" disabled={previous} title={waitingReason} onClick={() => setPage({ drawer: 'derive' })}>관련 Item으로 신규 작성</Button>}
    {canWrite && detail && <ArchiveAction item={detail.item} onChanged={query.refetch} disabledReason={waitingReason} />}
  </>;
  return <PlatformPage title={detail?.revision.title ?? '기술 Item'} crumbs={[{ label: <span className="t-mono">{detail ? itemNoLabel(detail.item.itemNo) : '…'}</span> }]}
    primaryAction={canWrite && !archived ? <Button type="button" disabled={previous} title={waitingReason} onClick={() => setPage({ drawer: 'revise' })}>수정</Button> : undefined}
    secondaryActions={secondary}>
    {!canWrite && detail && <p role="status" className="text-sm text-text-secondary">수정하려면 Item 작성 권한을 관리자에게 요청하세요.</p>}
    {drawer && detail && <DrawerHost key={drawer} kind={drawer} detail={detail} viewedRevisionNo={revisionNo} onReload={() => { setRetain(true); query.refetch(); }} />}
    {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} />
      : !known ? <NotFound revision={null} />
      : <QueryView widgetName="기술 Item 상세" query={query}>{data => data ? <Body detail={data} /> : <NotFound revision={revisionNo} />}</QueryView>}
  </PlatformPage>;
}
