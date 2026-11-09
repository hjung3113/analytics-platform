import { useState } from 'react';
import { PlatformLink, useMenuQuery, usePlatform } from '@ap/kernel';
import { Button, Callout, ObjectRow, StatusBadge } from '@ap/ui';
import { searchEndpoint, type KnowledgeSearchData, type KnowledgeSearchItem, type KnowledgeSearchParams, type SearchReason } from '../../endpoints';
import { OwnerChip, StateBadges, TypeBadge } from '../items/ItemBadges';
import { useSpecWords } from '../spec/SpecControls';

const REASON: Record<SearchReason, { ko: string; en: string }> = {
  observed_same_direction: { ko: '같은 방향 · 관찰', en: 'Same direction · observed' },
  expected_same_direction: { ko: '같은 방향 · 명세상 기대', en: 'Same direction · expected by specification' },
  exact_token: { ko: 'Event 키 일치', en: 'Exact Event key' }, concept_mapping: { ko: '개념 매핑으로 일치', en: 'Concept mapping match' },
  approved_alias: { ko: '승인된 별칭 일치', en: 'Approved alias match' }, text: { ko: '본문 일치', en: 'Text match' },
};
export function SearchRows({ items, lag }: { items: KnowledgeSearchItem[]; lag: boolean }) {
  const w = useSpecWords(), { linkTo } = usePlatform();
  return <>{items.map(item => {
    const href = linkTo('log-knowledge-item', { params: { itemId: item.itemId }, returnTo: true });
    const owner = { kind: item.owner.softwareId ? 'software' as const : 'model' as const, modelId: item.owner.modelId, modelName: item.owner.modelName, ...(item.owner.softwareId ? { softwareId: item.owner.softwareId, versionLabel: item.owner.softwareLabel ?? '' } : {}) };
    return <ObjectRow key={item.itemId} density="default" leadingCell="auto"
      title={<span className="inline-flex max-w-full items-center gap-2"><PlatformLink href={href} className="truncate hover:underline">{item.title}</PlatformLink><OwnerChip owner={owner} /></span>}
      badges={<><PlatformLink href={href} className="t-mono text-accent-primary hover:underline">KI-{item.itemNo}</PlatformLink><TypeBadge code={item.typeCode} /><StateBadges item={item} /></>}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">{(item.reasons.length > 0 || item.expectedOnly) && <span>{w('일치 이유', 'Match reasons')}</span>}
        {item.reasons.map(reason => <StatusBadge key={reason} tone={reason === 'expected_same_direction' ? 'warning' : 'neutral'}>{w(REASON[reason].ko, REASON[reason].en)}</StatusBadge>)}
        {item.expectedOnly && !item.reasons.includes('expected_same_direction') && <StatusBadge tone="warning">{w('명세상 기대', 'Expected by specification')}</StatusBadge>}
        {lag && <StatusBadge tone="warning">{w('색인 지연', 'Index lag')}</StatusBadge>}
        {item.relatedCount > 0 && <PlatformLink href={href} className="text-accent-primary hover:underline">{w(`관련 Item ${item.relatedCount}건`, `${item.relatedCount} related Items`)}</PlatformLink>}
      </div>
      <p className="break-words text-sm text-text-secondary">{item.excerpt}</p>
    </ObjectRow>;
  })}</>;
}

export function SearchFailure({ retry, fromFirstPage = false }: { retry: () => void; fromFirstPage?: boolean }) {
  const w = useSpecWords();
  return <div className="p-3"><Callout tone="red" title={w('검색하지 못했습니다', 'Search failed')}
    action={<Button type="button" size="sm" variant="secondary" onClick={retry}>{fromFirstPage ? w('처음부터 다시 검색', 'Restart search') : w('다시 시도', 'Retry')}</Button>}>
    {fromFirstPage ? w('검색 조건을 유지하고 첫 페이지부터 다시 검색합니다.', 'Restart from the first page with the same search conditions.') : w('잠시 뒤 다시 시도해 주세요.', 'Try again in a moment.')}
  </Callout></div>;
}

/** Each continuation uses the Kernel lifecycle, so a permission/session change also hides previously loaded pages. */
function Continuation({ params, cursor, restart }: { params: KnowledgeSearchParams; cursor: string; restart: () => void }) {
  const w = useSpecWords(), query = useMenuQuery(searchEndpoint, { ...params, cursor });
  const response = query.response;
  if (!response) return <p role="status" className="p-4 text-sm text-text-secondary">{w('검색 중…', 'Searching…')}</p>;
  if (!['ok', 'empty'].includes(response.outcome) || !response.data) return <SearchFailure retry={restart} fromFirstPage />;
  return <><SearchRows items={response.data.items} lag={response.data.indexLag.lagSeconds !== null} /><SearchMore key={cursor} params={params} data={response.data} restart={restart} /></>;
}
export function SearchMore({ params, data, restart }: { params: KnowledgeSearchParams; data: KnowledgeSearchData; restart: () => void }) {
  const w = useSpecWords(), [expanded, setExpanded] = useState(false);
  if (!data.hasMore || !data.nextCursor) return null;
  return expanded ? <Continuation params={params} cursor={data.nextCursor} restart={restart} /> : <div className="flex justify-center p-3"><Button type="button" size="toolbar" variant="secondary" onClick={() => setExpanded(true)}>{w('더 보기', 'Load more')}</Button></div>;
}
