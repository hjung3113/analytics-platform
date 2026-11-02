import { SearchX } from 'lucide-react';
import { PlatformLink, useMenuQuery, usePlatform, type PageProps } from '@ap/kernel';
import { PageKeyWarning, PlatformPage, QueryView, ReturnLink, StateMessage, usePageKeyRules } from '@ap/components';
import { Button } from '@ap/ui';
import { itemDetailEndpoint, type ItemDetail as ItemDetailData, type ItemDetailParams } from '../../endpoints';
import { OwnerChip, StateBadges, TypeBadge } from './ItemBadges';
import { AssessmentTimeline, EvidenceList, ItemBodyBlocks, LinkList, RevisionList, Section, stamp } from './ItemDetailParts';
import { isRevisionParam, itemNoLabel, revisionOf, shortActor } from './itemModel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULES = [{ key: 'rev', label: { ko: '리비전', en: 'Revision' }, valid: isRevisionParam }];

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
    {old && <div role="status" className="flex flex-wrap items-center gap-3 rounded-md bg-accent-warn-soft px-3 py-2 text-sm text-text-warning-label">
      이전 리비전 r{viewing}을 보고 있습니다 —
      <Button type="button" variant="link" size="sm" onClick={() => setPage({ rev: null })}>최신 보기</Button>
    </div>}
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4">
      <ItemBodyBlocks revision={revision} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
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
 * 기술 Item 상세 (#1197 s2, owner-confirmed variant A), read-only: the four body blocks (opinion set apart from fact) on the left,
 * evidence, links and revisions on the right, the assessment history below. `rev` re-reads an older revision; `null` data is not-found.
 */
export default function ItemDetail({ params }: PageProps) {
  const { pageParam } = usePlatform();
  const keys = usePageKeyRules(RULES);
  const itemId = params.itemId ?? '';
  const revisionNo = revisionOf(pageParam('rev'));
  const known = UUID.test(itemId);
  const query = useMenuQuery(itemDetailEndpoint, { itemId, ...(revisionNo === null ? {} : { revisionNo }) } satisfies ItemDetailParams, known && !keys.invalid);
  const detail = query.response?.outcome === 'ok' ? query.response.data : undefined;
  return <PlatformPage title={detail?.revision.title ?? '기술 Item'} crumbs={[{ label: <span className="t-mono">{detail ? itemNoLabel(detail.item.itemNo) : '…'}</span> }]}
    secondaryActions={<ReturnLink />}>
    {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} />
      : !known ? <NotFound revision={null} />
      : <QueryView widgetName="기술 Item 상세" query={query}>{data => data ? <Body detail={data} /> : <NotFound revision={revisionNo} />}</QueryView>}
  </PlatformPage>;
}
