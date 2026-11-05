// PublicVocListScreen — every VOC the actor may read, for the platform 소통 › VOC page (ADR-0110, prototype ② B).
//
// One query family, `GET /vocs/public`; the server decides which VOCs are in reach, so the screen never filters for
// permission. The host owns the URL: this screen takes the query and reports changes. Rows carry the public list
// fields only (display id, title, system, reporter-facing status, update time, own-VOC marker).

import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { LIST_SEARCH_PLACEHOLDER } from '@/lib/copy/list-search';
import { VOC_LIST_LOAD_ERROR_LABELS, VOC_SEARCH_EMPTY_LABEL } from '@/lib/copy/voc';
import { fetchManagedSystems } from '@/lib/api/registry-reads';
import { formatRelativeTime } from '@/lib/format/datetime';
import { useCommittedSearchDraft } from '@/lib/useCommittedSearchDraft';
import { ManagedSystemPill, ReporterStatusBadge } from '@ap/feature-ui';
import {
  Button, EmptyState, ListToolbar, SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  ToggleGroup, ToggleGroupItem, cn,
} from '@ap/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { fetchPublicVocPage } from './public-voc-api';
import { PUBLIC_VOC_QUERY_MAX, type PublicVocQuery } from './public-voc-query';

const ALL_SYSTEMS = '__all__';
const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];

/** Where focus goes when the screen mounts: a toolbar control, or the list region itself. */
export type PublicVocInitialFocus = 'q' | 'mine' | 'system' | 'list';

export interface PublicVocListScreenProps {
  query: PublicVocQuery;
  initialFocus?: PublicVocInitialFocus | undefined;
  onInitialFocusClaimed?: (() => void) | undefined;
  onQueryChange: (patch: Partial<PublicVocQuery>) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PublicVocListScreen({
  query, onQueryChange, initialFocus, onInitialFocusClaimed, selectedId, onSelect,
}: PublicVocListScreenProps): React.ReactElement {
  const { q, mine, systemId } = query;
  // The cursor never enters the URL or the key; any key change restarts at page one.
  const list = useInfiniteQuery({
    queryKey: ['vocs', 'public', 'pages', { q, mine, systemId }] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => fetchPublicVocPage({ q, mine, systemId }, { signal, cursor: pageParam }),
    getNextPageParam: (last) => (last.page.has_more ? last.page.cursor : undefined),
    staleTime: 30_000,
    retry: 1,
  });
  const systems = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
  });
  const items = React.useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const error = list.isFetchNextPageError ? null : list.error;

  const writeSearch = React.useCallback((draft: string): boolean | undefined => {
    if (draft.length > PUBLIC_VOC_QUERY_MAX) return false;
    onQueryChange({ q: draft });
    return undefined;
  }, [onQueryChange]);
  const { draft, setDraft, commit } = useCommittedSearchDraft({ committed: q, write: writeSearch });

  const sectionRef = React.useRef<HTMLElement>(null);
  const claimedFocus = React.useRef(initialFocus);
  React.useEffect(() => {
    const section = sectionRef.current;
    const claimed = claimedFocus.current;
    if (section === null || claimed === undefined) return;
    const target = claimed === 'list' ? section
      : section.querySelector<HTMLElement>(`[data-public-voc-control="${claimed}"] input, [data-public-voc-control="${claimed}"] button`);
    claimedFocus.current = undefined;
    target?.focus();
    onInitialFocusClaimed?.();
  }, [onInitialFocusClaimed]);

  const systemItems = systems.data?.items ?? [];
  const knownSystem = systemId === null || systemItems.some((system) => system.id === systemId);
  const filtered = q !== '' || mine || systemId !== null;
  // A query that is still pending (including paused offline) is never an empty result.
  const loading = list.isPending && list.fetchStatus !== 'paused';
  const offline = list.isPending && list.fetchStatus === 'paused';

  let body: React.ReactNode;
  if (loading && items.length === 0) {
    body = <div aria-busy="true">{SKELETON_KEYS.map((key) => <div key={key} className="h-16 border-b border-border-subtle" />)}</div>;
  } else if ((error !== null || offline) && items.length === 0) {
    body = (
      <div role="alert">
        <EmptyState title={VOC_LIST_LOAD_ERROR_LABELS.title} body={offline ? '연결을 확인한 뒤 다시 시도해 주세요.' : VOC_LIST_LOAD_ERROR_LABELS.body}
          action={<Button type="button" onClick={() => { void list.refetch(); }}>{VOC_LIST_LOAD_ERROR_LABELS.retry}</Button>} />
      </div>
    );
  } else if (items.length === 0) {
    body = q !== '' ? <ListStateMessage variant="empty" title={VOC_SEARCH_EMPTY_LABEL} />
      : filtered ? <ListStateMessage variant="filtered" title="조건에 맞는 VOC가 없습니다" />
      : <ListStateMessage variant="empty" title="볼 수 있는 VOC가 없습니다" />;
  } else {
    body = (
      <ul>
        {items.map((voc) => (
          <li key={voc.id}>
            <button type="button" aria-current={selectedId === voc.id ? 'true' : undefined} onClick={() => { onSelect(voc.id); }}
              className={cn('flex w-full flex-col gap-1 border-b border-border-subtle px-4 py-3 text-left hover:bg-surface-card',
                selectedId === voc.id && 'bg-surface-row-selected')}>
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-text-muted whitespace-nowrap shrink-0">{voc.display_id}</span>
                <span className="truncate text-sm font-medium text-text-primary">{voc.title}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <ManagedSystemPill name={voc.managed_system.name} />
                <ReporterStatusBadge status={voc.reporter_facing_status} />
                {voc.mine && <span className="rounded-full bg-surface-card-elevated px-2 py-0.5 text-text-secondary">내가 등록</span>}
                <span>{formatRelativeTime(voc.updated_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section ref={sectionRef} aria-label="VOC 목록" tabIndex={-1} className="flex h-full min-h-0 flex-col">
      {/* At 36rem of toolbar content width, the filter pair leaves room for search beside it. */}
      <ListToolbar
        className="@container [&>[data-list-toolbar-actions]]:w-full [&>[data-list-toolbar-actions]]:py-0"
        action={
          <div className="flex w-full flex-wrap items-center gap-x-2">
            <div className="flex min-h-toolbar shrink-0 items-center gap-2" data-public-voc-filters>
              <div className="contents" data-public-voc-control="mine">
                <ToggleGroup type="single" appearance="filter" size="sm" aria-label="범위" value={mine ? 'mine' : 'all'}
                  onValueChange={(value) => { if (value !== '') onQueryChange({ mine: value === 'mine' }); }}>
                  <ToggleGroupItem value="all" appearance="selected-filter">전체</ToggleGroupItem>
                  <ToggleGroupItem value="mine" appearance="selected-filter">내가 등록한</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="contents" data-public-voc-control="system">
                <Select value={systemId ?? ALL_SYSTEMS} onValueChange={(value) => { onQueryChange({ systemId: value === ALL_SYSTEMS ? null : value }); }}>
                  <SelectTrigger className="w-28 shrink-0" aria-label="시스템" disabled={systems.isError} aria-busy={systems.isPending || undefined}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SYSTEMS}>모든 시스템</SelectItem>
                    {!knownSystem && systemId !== null && <SelectItem value={systemId}>선택한 시스템</SelectItem>}
                    {systemItems.map((system) => <SelectItem key={system.id} value={system.id}>{system.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex min-h-toolbar w-full min-w-0 items-center @xl:w-auto @xl:flex-1" data-public-voc-control="q">
              <SearchInput className="w-full" placeholder={LIST_SEARCH_PLACEHOLDER} value={draft} onValueChange={setDraft} onCommit={commit} />
            </div>
            {systems.isError && (
              <span role="alert" className="flex min-h-toolbar w-full flex-wrap items-center gap-1 text-xs text-text-danger">
                시스템 목록을 불러오지 못했습니다
                <Button type="button" size="sm" variant="secondary" onClick={() => { void systems.refetch(); }}>다시 시도</Button>
              </span>
            )}
          </div>
        }
      />
      <div data-testid="public-voc-list-scroll" className="min-h-0 flex-1 overflow-y-auto">
        {body}
        <ListLoadMore hasMore={list.hasNextPage} loadingMore={list.isFetchingNextPage} failed={list.isFetchNextPageError}
          onLoadMore={() => { void list.fetchNextPage(); }} />
      </div>
    </section>
  );
}
