// MyVocListScreen — the reporter's own VOC list for the platform 내 VOC page (platform ADR-0071).
//
// Not VocList/InboxRoute: those fetch managed systems, areas and actors, check permissions per row and
// navigate with TanStack Router. This screen sends one query, `GET /vocs?view=my`, and shows the
// reporter-visible row only. The host owns the URL; this screen takes the query and reports changes.

import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { LIST_SEARCH_PLACEHOLDER } from '@/lib/copy/list-search';
import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import {
  VOC_AREA_FILTER_EMPTY_COPY,
  VOC_LIST_LOAD_ERROR_LABELS,
  VOC_SEARCH_EMPTY_LABEL,
} from '@/lib/copy/voc';
import { useCommittedSearchDraft } from '@/lib/useCommittedSearchDraft';
import {
  Button,
  EmptyState,
  type FilterCategory,
  ListFilterButton,
  ListSortButton,
  ListToolbar,
  SearchInput,
  type SortOption,
} from '@fops/ui';
import * as React from 'react';
import { useVocListPages } from '../../hooks/useVocListPages';
import { VocRow } from '../list/VocRow';
import { VocRowSkeleton } from '../list/VocRowSkeleton';
import {
  MY_VOC_DEFAULT_SORT,
  MY_VOC_QUERY_MAX,
  type MyVocQuery,
  type MyVocSort,
  REPORTER_FACING_STATUS_ALL,
} from './my-voc-query';

// The top level holds literals only: a module-level call would keep this module (and its import tree)
// in the platform's eager chunk, which imports the bridge barrel.
const STATUS_FILTER_KEY = 'filter.reporterStatus';

// Labels as the Inbox sort menu shows them (InboxRoute SORT_OPTIONS, minus severity).
const SORT_OPTIONS: SortOption[] = [
  { value: 'created_at:desc', label: '최신순' },
  { value: 'created_at:asc', label: '오래된순' },
  { value: 'reporter_facing_status:asc', label: '상태순' },
];

const SKELETON_KEYS = [
  'skeleton-0',
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
  'skeleton-6',
  'skeleton-7',
  'skeleton-8',
  'skeleton-9',
];

/** Where focus goes when the screen mounts: a toolbar control, or the list region itself. */
export type MyVocInitialFocus = 'q' | 'status' | 'sort' | 'list';

export interface MyVocListScreenProps {
  query: MyVocQuery;
  /** Set by a host that just removed a rejected URL value, so keyboard focus lands on the matching control and not on `<body>`. */
  initialFocus?: MyVocInitialFocus | undefined;
  onQueryChange: (patch: Partial<MyVocQuery>) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MyVocListScreen({
  query,
  onQueryChange,
  initialFocus,
  selectedId,
  onSelect,
}: MyVocListScreenProps): React.ReactElement {
  const { q, statuses, sort } = query;
  const statusCategories = React.useMemo<FilterCategory[]>(
    () => [
      {
        key: STATUS_FILTER_KEY,
        label: '상태',
        options: REPORTER_FACING_STATUS_ALL.map((value) => ({
          value,
          label: REPORTER_STATUS_LABELS[value],
        })),
      },
    ],
    [],
  );
  const list = useVocListPages({
    view: 'my',
    ...(q !== '' ? { q } : {}),
    filters: { [STATUS_FILTER_KEY]: statuses },
    sort,
  });
  const items = React.useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data],
  );
  // A failed next page keeps the loaded rows; it must not replace them with the error state.
  const error = list.isFetchNextPageError ? null : list.error;

  // The URL holds at most MY_VOC_QUERY_MAX characters; a longer draft is not written (the box returns to the URL's value).
  const writeSearch = React.useCallback(
    (draft: string): boolean | undefined => {
      if (draft.length > MY_VOC_QUERY_MAX) return false;
      onQueryChange({ q: draft });
      return undefined;
    },
    [onQueryChange],
  );
  const { draft, setDraft, commit } = useCommittedSearchDraft({ committed: q, write: writeSearch });

  const sectionRef = React.useRef<HTMLElement>(null);
  // Focus is claimed once, when the screen mounts.
  const claimedFocus = React.useRef(initialFocus);
  React.useEffect(() => {
    const section = sectionRef.current;
    const claimed = claimedFocus.current;
    if (section === null || claimed === undefined) return;
    const target =
      claimed === 'list'
        ? section
        : section.querySelector<HTMLElement>(
            `[data-my-voc-control="${claimed}"] input, [data-my-voc-control="${claimed}"] button`,
          );
    target?.focus();
  }, []);

  const loading = list.isLoading || list.isPlaceholderData;

  let body: React.ReactNode;
  if (loading && items.length === 0) {
    body = (
      <div aria-busy="true">
        {SKELETON_KEYS.map((key) => (
          <VocRowSkeleton key={key} />
        ))}
      </div>
    );
  } else if (error !== null && items.length === 0) {
    body = (
      <div role="alert">
        <EmptyState
          title={VOC_LIST_LOAD_ERROR_LABELS.title}
          body={VOC_LIST_LOAD_ERROR_LABELS.body}
          action={
            <Button
              type="button"
              onClick={() => {
                void list.refetch();
              }}
            >
              {VOC_LIST_LOAD_ERROR_LABELS.retry}
            </Button>
          }
        />
      </div>
    );
  } else if (items.length === 0) {
    body =
      q !== '' ? (
        <ListStateMessage variant="empty" title={VOC_SEARCH_EMPTY_LABEL} />
      ) : statuses.length > 0 ? (
        <ListStateMessage variant="filtered" title={VOC_AREA_FILTER_EMPTY_COPY.title} />
      ) : (
        <ListStateMessage variant="empty" title="내가 제출한 VOC가 없습니다" />
      );
  } else {
    body = (
      <div>
        {items.map((voc) => (
          <VocRow
            key={voc.id}
            voc={voc}
            reporterView
            showOwnerMissing={false}
            selected={selectedId === voc.id}
            onSelect={() => {
              onSelect(voc.id);
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label="VOC 목록"
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col"
    >
      <ListToolbar
        action={
          <div className="flex items-center gap-2">
            <div className="contents" data-my-voc-control="q">
              <SearchInput
                placeholder={LIST_SEARCH_PLACEHOLDER}
                value={draft}
                onValueChange={setDraft}
                onCommit={commit}
              />
            </div>
            <div className="contents" data-my-voc-control="status">
              <ListFilterButton
                categories={statusCategories}
                values={{ [STATUS_FILTER_KEY]: statuses }}
                onChange={(next) => {
                  onQueryChange({
                    statuses: REPORTER_FACING_STATUS_ALL.filter((status) =>
                      (next[STATUS_FILTER_KEY] ?? []).includes(status),
                    ),
                  });
                }}
              />
            </div>
            <div className="contents" data-my-voc-control="sort">
              <ListSortButton
                options={SORT_OPTIONS}
                value={sort}
                defaultValue={MY_VOC_DEFAULT_SORT}
                onChange={(next) => {
                  onQueryChange({ sort: next as MyVocSort });
                }}
              />
            </div>
          </div>
        }
      />
      {/* The list scrolls here, not in the platform main area: opening a row writes `focus` (a history push), and the Kernel scrolls the main area to the top on a push. */}
      <div data-testid="my-voc-list-scroll" className="min-h-0 flex-1 overflow-y-auto">
        {body}
        <ListLoadMore
          hasMore={list.hasNextPage}
          loadingMore={list.isFetchingNextPage}
          failed={list.isFetchNextPageError}
          onLoadMore={() => {
            void list.fetchNextPage();
          }}
        />
      </div>
    </section>
  );
}
