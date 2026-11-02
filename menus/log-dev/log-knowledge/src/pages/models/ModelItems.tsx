import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { encodeFilterParams, type PageResult } from '@ap/contracts';
import { PlatformLink, useMenuQuery, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { ITEM_PUBLISH_PERMISSION, itemsEndpoint, type CatalogPageParams, type ItemRow } from '../../endpoints';
import { StateBadge, TypeBadge } from '../items/ItemBadges';
import { PUBLISHED_ONLY, defaultFilterParams, instantText, itemNoLabel } from '../items/itemModel';
import { EmptyNote } from './ProfileParts';

const PREVIEW = 5;

/**
 * The 모델 공통 Item section body (#1197 s3b): the model's five most recently updated published items, owned by the model itself —
 * SW-owned items are not listed (ADR-0109: not inherited). `모두 보기 (N)` opens 전체 기술 Item filtered to this model.
 */
export function ModelItems({ modelId }: { modelId: string }) {
  const { linkTo, can } = usePlatform();
  const params = useMemo<CatalogPageParams>(() => ({
    q: null, page: 0, pageSize: PREVIEW, sorting: [{ id: 'updatedAt', desc: true }],
    filters: [{ id: 'ownerModelId', op: 'in', value: [modelId] }, { id: 'includeSoftware', op: 'in', value: ['false'] }, PUBLISHED_ONLY],
  }), [modelId]);
  const query = useMenuQuery(itemsEndpoint, params);
  const data = query.response?.outcome === 'ok' || query.response?.outcome === 'empty' ? (query.response.data as PageResult<ItemRow> | null) : null;
  if (!data) return <p className="text-sm text-text-muted">{query.response ? '모델 공통 Item을 불러오지 못했습니다.' : '불러오는 중…'}</p>;
  if (data.rows.length === 0) {
    const create = can(ITEM_PUBLISH_PERMISSION)
      ? <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('log-knowledge-items', { page: { filter: defaultFilterParams(), focus: 'new', owner: modelId } })}><Plus className="size-3.5" aria-hidden />새 기술 Item</PlatformLink></Button>
      : null;
    return <EmptyNote text="이 모델이 소유한 Item이 없습니다" action={create} />;
  }
  const all = linkTo('log-knowledge-items', { page: { filter: encodeFilterParams([{ id: 'ownerModelId', op: 'in', value: [modelId] }, PUBLISHED_ONLY]) } });
  return <div className="grid gap-2">
    <ul aria-label="모델 공통 Item" className="grid">{data.rows.map(row => <li key={row.id} className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle py-1.5 text-sm last:border-b-0">
      <PlatformLink className="t-mono shrink-0 text-accent-primary hover:underline" href={linkTo('log-knowledge-item', { params: { itemId: row.id }, returnTo: true })}>{itemNoLabel(row.itemNo)}</PlatformLink>
      <span className="min-w-0 flex-1 truncate" title={row.title}>{row.title}</span>
      <TypeBadge code={row.typeCode} />
      <span className="inline-flex items-center gap-1"><StateBadge axis="verification" value={row.verificationState} /><StateBadge axis="processing" value={row.processingState} /></span>
      <span className="tabular whitespace-nowrap text-xs text-text-muted">{instantText(row.updatedAt)}</span>
    </li>)}</ul>
    <div><Button asChild size="sm" variant="secondary"><PlatformLink href={all}>모두 보기 ({data.total})</PlatformLink></Button></div>
  </div>;
}
