// The /findings list screen (FO ADR-0020 ListShell finding list), free of the router so the standalone route and the platform bridge mount one
// definition (platform ADR-0071; #762 l). The URL goes through the host seam; the detail slot is the host's: `renderDetail` returns it
// (standalone: the Finding detail panel, the empty state or nothing for a denied list; the bridge: `undefined`, the platform page draws the drawer).
// Nothing here reaches the Finding detail tree.

import { ListLoadMore } from '../../../components/ListLoadMore';
import { ListStateMessage } from '../../../components/ListStateMessage';
import { ScopedListDenialCard } from '../../../components/ScopedListDenialCard';
import { useFindingDetail } from '../hooks/useFindingDetail';
import { useFindingsPages, useFindingsTotal } from '../hooks/useFindingsList';
import {
  getSafeVocReturnTo,
  validateFindingsSearch,
} from './findings-search';
import { resolveActors } from '../../../lib/api/actors';
import { fetchEntityLinksBySource } from '../../../lib/api/entity-links';
import { ApiError } from '../../../lib/api/types';
import {
  FINDING_CONFIDENCE_LABELS,
  FINDING_SEVERITY_LABELS,
  FINDING_STATUS_LABELS,
} from '../../../lib/copy/enum-labels';
import { FINDING_RESPONSIBILITY_COPY as OWNER_COPY } from '../../../lib/copy/finding-responsibility';
import { GLOSSARY } from '../../../lib/copy/glossary';
import { LIST_SEARCH_EMPTY_LABEL, LIST_SEARCH_PLACEHOLDER } from '../../../lib/copy/list-search';
import { PERMISSION_BLOCKED_REASONS } from '../../../lib/copy/permission-reasons';
import { useWorkspaceActors } from '../../../lib/cross-system/useWorkspaceActors';
import {
  isListForbidden,
  listSystemId,
  useListDenial,
  useScopedEmptyListPermission,
} from '../../../lib/cross-system/useListDenial';
import { useIsArchivedSystem } from '../../../lib/cross-system/useIsArchivedSystem';
import { formatCount } from '../../../lib/format/count';
import { formatShortDate } from '../../../lib/format/datetime';
import { useHostSeam } from '../../../lib/host/host-seam';
import { useHostSearchWriter } from '../../../lib/host/useHostSearchWriter';
import { useAnalyticsAreaFilterLabel } from '../../../lib/useAnalyticsAreaFilterLabel';
import { useCommittedSearchDraft } from '../../../lib/useCommittedSearchDraft';
import type { FindingDto } from '@ap/feature-shared';
import { OutlineBadge } from '../../../ui/index';
import {
  ActiveFilterBar,
  type AvatarUser,
  Checkbox,
  ListShell,
  ObjectRow,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkeletonRows,
  UserAvatar,
} from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

type SearchWriter = ReturnType<
  typeof useHostSearchWriter<ReturnType<typeof validateFindingsSearch>>
>;
type WriteSearch = SearchWriter['write'];
export type FindingsScreenProps = {
  /** The hosted menu's capability for scoped list reads. */
  capability?: string;
  /**
   * The host's detail slot, called once per render. By default the result is handed to `ListShell`.
   * `returnTo` is the stored safe VOC URL, set only when the search carries one and the host does not carry the return itself, else `null`. It is a
   * codec string only the router can decode, so the standalone host draws the back link; the screen never renders it.
   */
  renderDetail: (
    findingId: string | null,
    options: { listDenied: boolean; returnTo: string | null; isInList?: boolean | undefined },
  ) => React.ReactNode;
  /** A host drawer that portals itself must mount inside the feature providers. */
  renderDetailInPlace?: boolean;
};

export function FindingsScreen({ capability = 'finding.read', renderDetail, renderDetailInPlace = false }: FindingsScreenProps): React.ReactElement {
  const { search, write } = useHostSearchWriter('/findings', validateFindingsSearch);
  const selectedId = search.selected ?? null;
  const managedSystemId = listSystemId(search.managedSystem);

  const selectFinding = React.useCallback(
    (id: string): void => {
      write((previous) => ({ ...previous, selected: id }));
    },
    [write],
  );

  // Stale/invalid `selected` (deleted, or filtered away): once the list has
  // settled (loaded, no refetch in flight), replace-drop it so Back is not trapped
  // in the invalid URL. While loading or refetching, or when the list failed, the
  // deep-linked selection is kept.
  const reconcileSelection = React.useCallback((): void => {
    write((previous) => ({ ...previous, selected: undefined }), { replace: true });
  }, [write]);

  const resetFilters = React.useCallback((): void => {
    write(
      ({
        q: _q,
        execution: _execution,
        assignment: _assignment,
        'filter.analytics_area': _area,
        status: _status,
        ...rest
      }) => rest,
    );
  }, [write]);

  return (
    <FindingsListShell
      q={search.q}
      capability={capability}
      managedSystemId={managedSystemId}
      analyticsAreaId={search['filter.analytics_area']}
      status={search.status}
      execution={search.execution}
      assignment={search.assignment}
      selectedId={selectedId}
      returnTo={search.returnTo}
      write={write}
      renderDetail={renderDetail}
      renderDetailInPlace={renderDetailInPlace}
      onSelect={selectFinding}
      onSelectionReconciled={reconcileSelection}
      onResetFilters={resetFilters}
    />
  );
}

function FindingsListShell({
  q,
  capability,
  analyticsAreaId,
  status,
  managedSystemId,
  execution,
  assignment,
  selectedId,
  returnTo,
  write,
  renderDetail,
  renderDetailInPlace,
  onSelect,
  onSelectionReconciled,
  onResetFilters,
}: {
  q: string | undefined;
  capability: string;
  analyticsAreaId: string | undefined;
  status: 'active' | undefined;
  managedSystemId: string | undefined;
  execution: 'none' | undefined;
  assignment: 'assigned' | 'unassigned' | undefined;
  selectedId: string | null;
  returnTo: string | undefined;
  write: WriteSearch;
  renderDetail: FindingsScreenProps['renderDetail'];
  renderDetailInPlace: boolean;
  onSelect: (id: string) => void;
  onSelectionReconciled: () => void;
  onResetFilters: () => void;
}): React.ReactElement {
  const { hostCarriesReturn } = useHostSeam();
  const writeSearch = React.useCallback(
    (draft: string) => {
      const next = draft.trim();
      if (next === (q ?? '')) return false;
      write((previous) => ({ ...previous, q: next === '' ? undefined : next }), { replace: true });
      return true;
    },
    [write, q],
  );
  const { draft, setDraft, commit } = useCommittedSearchDraft({
    committed: q ?? '',
    write: writeSearch,
  });
  const filterId = React.useId();
  const safeReturnTo = getSafeVocReturnTo(returnTo);
  const areaLabel = useAnalyticsAreaFilterLabel(analyticsAreaId, managedSystemId);
  const removeFilter = (key: 'filter.analytics_area' | 'status' | 'execution' | 'q') => {
    write((previous) => ({ ...previous, [key]: undefined }));
  };
  const activeFilters = [
    ...(q === undefined
      ? []
      : [
          {
            key: 'q',
            label: `${LIST_SEARCH_PLACEHOLDER}: ${q}`,
            onRemove: () => removeFilter('q'),
          },
        ]),
    ...(analyticsAreaId === undefined
      ? []
      : [{ key: 'area', label: areaLabel, onRemove: () => removeFilter('filter.analytics_area') }]),
    ...(status === undefined
      ? []
      : [
          {
            key: 'status',
            label: `상태: ${FINDING_STATUS_LABELS.active}`,
            onRemove: () => removeFilter('status'),
          },
        ]),
    ...(execution === undefined
      ? []
      : [{ key: 'execution', label: '실행 연결 없음', onRemove: () => removeFilter('execution') }]),
  ];
  const listQuery = useFindingsPages(
    managedSystemId,
    execution,
    assignment,
    analyticsAreaId,
    status,
    q,
  );
  const findings = React.useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );
  const scopedPermission = useScopedEmptyListPermission({
    capability,
    managedSystemId,
    empty: listQuery.isSuccess && findings.length === 0,
  });
  const total = listQuery.data?.pages[0]?.page?.total;
  const selectedQuery = useFindingDetail(selectedId);
  const selectedLinks = useQuery({
    queryKey: ['entity-links', 'finding', selectedId, 'requested_task'],
    queryFn: ({ signal }) => fetchEntityLinksBySource('finding', selectedId as string, { signal }),
    enabled:
      execution === 'none' &&
      selectedId !== null &&
      selectedQuery.isSuccess &&
      !findings.some((item) => item.id === selectedId),
  });
  const checkUnfiltered =
    (execution === 'none' ||
      assignment !== undefined ||
      analyticsAreaId !== undefined ||
      status !== undefined) &&
    listQuery.isSuccess &&
    findings.length === 0;
  const unfilteredQuery = useFindingsTotal(managedSystemId, checkUnfiltered);
  const listFailed = listQuery.isError && (!listQuery.isFetchNextPageError || isListForbidden(listQuery.error));
  const unfilteredError = checkUnfiltered && unfilteredQuery.isError ? unfilteredQuery.error : null;
  const stateError = listFailed ? listQuery.error : unfilteredError;
  const { denied: isReadDenied, cardProps, keptSystemId, isInList } = useListDenial({
    error: stateError,
    scopedPermission,
    managedSystemId,
    drawer: { selectedId },
  });
  const scopeVerified = !isReadDenied && (scopedPermission.state === 'allowed' || scopedPermission.state === 'unchecked');
  const stateIsPending = !isReadDenied && (
    listQuery.isPending || (checkUnfiltered && unfilteredQuery.isPending) || scopedPermission.state === 'checking'
  );
  const isFilteredEmpty =
    checkUnfiltered && unfilteredQuery.isSuccess && (unfilteredQuery.data?.page?.total ?? 0) > 0;
  const { refetch: refetchList } = listQuery;
  const { refetch: refetchUnfiltered } = unfilteredQuery;
  const retryList = React.useCallback((): void => {
    void (listFailed ? refetchList() : refetchUnfiltered());
  }, [listFailed, refetchList, refetchUnfiltered]);
  const { actors } = useWorkspaceActors();
  const actorsById = React.useMemo(() => {
    const map = new Map<string, AvatarUser>();
    for (const actor of actors ?? []) {
      map.set(actor.id, { display_name: actor.display_name });
    }
    return map;
  }, [actors]);
  // Team owners resolve by name for the visible page (same source as the
  // detail panel's owner field); `팀 · <short id>` stays the fallback while
  // unresolved.
  const teamIds = React.useMemo(
    () => [
      ...new Set(
        findings.map((finding) => finding.owner_team_id).filter((id): id is string => id !== null),
      ),
    ],
    [findings],
  );
  const teamsQuery = useQuery({
    queryKey: ['actors-resolve', [], teamIds],
    enabled: teamIds.length > 0,
    queryFn: ({ signal }) => resolveActors({ teamIds }, signal),
    retry: false,
  });
  const teamNamesById = React.useMemo(
    () => new Map((teamsQuery.data?.teams ?? []).map((team) => [team.id, team.name])),
    [teamsQuery.data],
  );

  React.useEffect(() => {
    if (!listQuery.isSuccess || listQuery.isFetching || !scopeVerified || selectedId === null) return;
    const item = selectedQuery.data;
    const filteredOut =
      item !== undefined &&
      ((managedSystemId !== undefined && item.primary_managed_system_id !== managedSystemId) ||
        (assignment === 'unassigned' &&
          (item.owner_actor_id !== null || item.owner_team_id !== null)) ||
        (assignment === 'assigned' &&
          item.owner_actor_id === null &&
          item.owner_team_id === null) ||
        (status !== undefined && item.status !== status) ||
        (analyticsAreaId !== undefined &&
          (analyticsAreaId === 'unset'
            ? item.analytics_area_id !== null
            : item.analytics_area_id !== analyticsAreaId)) ||
        (execution === 'none' &&
          (item.status !== 'active' ||
            selectedLinks.data?.items.some(
              (link) =>
                link.source_type === 'finding' &&
                // This read is source-scoped; restricted stubs omit endpoint IDs.
                (!('source_id' in link) || link.source_id === item.id) &&
                (link.target_type === 'task_request' || link.target_type === 'task') &&
                link.relation_type === 'requested_task' &&
                link.status === 'active',
            ))));
    if (
      (selectedQuery.error instanceof ApiError && selectedQuery.error.status === 404) ||
      filteredOut
    )
      onSelectionReconciled();
  }, [
    listQuery.isSuccess,
    listQuery.isFetching,
    scopeVerified,
    selectedId,
    selectedQuery.data,
    selectedQuery.error,
    selectedLinks.data,
    managedSystemId,
    analyticsAreaId,
    status,
    execution,
    assignment,
    onSelectionReconciled,
  ]);

  const detailPanel = renderDetail(selectedId, {
    listDenied: isReadDenied,
    returnTo: !hostCarriesReturn ? safeReturnTo : null,
    isInList,
  });

  const list = (
    <ListShell
      {...(!isReadDenied ? {
        toolbar: {
          actions: (
            <SearchInput
              placeholder={LIST_SEARCH_PLACEHOLDER}
              value={draft}
              onValueChange={setDraft}
              onCommit={commit}
            />
          ),
          title: 'Findings',
          subtitle: 'VOC 근거에서 실행 후보로 승격된 Finding을 검토합니다.',
        },
      } : {})}
      tabs={
        !isReadDenied ? (
          <div className="my-2 flex items-center gap-3">
            <Select
              value={assignment ?? 'all'}
              onValueChange={(value) => {
                write((previous) => ({
                  ...previous,
                  assignment: value === 'all' ? undefined : (value as 'assigned' | 'unassigned'),
                }));
              }}
            >
              <SelectTrigger density="compact" className="w-fit" aria-label={OWNER_COPY.filter}>
                <span className="mr-1 text-text-muted">{GLOSSARY.owner}:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{OWNER_COPY.all}</SelectItem>
                <SelectItem value="assigned">{OWNER_COPY.assigned}</SelectItem>
                <SelectItem value="unassigned">{OWNER_COPY.unassigned}</SelectItem>
              </SelectContent>
            </Select>
            {(
              [
                ['execution', 'none', '실행 연결 없음'],
                ['status', 'active', FINDING_STATUS_LABELS.active],
              ] as const
            ).map(([key, value, label]) => (
              <label
                key={key}
                htmlFor={`${filterId}-${key}`}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  id={`${filterId}-${key}`}
                  checked={(key === 'execution' ? execution : status) === value}
                  onCheckedChange={(checked) => {
                    write((previous) => ({
                      ...previous,
                      [key]: checked === true ? value : undefined,
                    }));
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        ) : undefined
      }
      list={
        <>
          <FindingsListBody
            findings={findings}
            total={total}
            searchFiltered={q !== undefined}
            isPending={stateIsPending}
            isError={stateError !== null || scopedPermission.state === 'error'}
            isSuccess={listQuery.isSuccess || listQuery.isFetchNextPageError}
            isReadDenied={isReadDenied}
            capability={capability}
            managedSystemId={keptSystemId}
            cardProps={cardProps}
            isFilteredEmpty={isFilteredEmpty}
            assignmentFiltered={assignment !== undefined}
            filterBar={
              !isReadDenied ? (
                <ActiveFilterBar
                  items={activeFilters}
                  onClearAll={onResetFilters}
                  className="mx-5 my-2"
                />
              ) : null
            }
            hasFilterBar={!isReadDenied && activeFilters.length > 0}
            filterDescription={
              analyticsAreaId !== undefined || status !== undefined
                ? [
                    ...activeFilters.map((filter) => filter.label),
                    ...(assignment === undefined
                      ? []
                      : [assignment === 'assigned' ? OWNER_COPY.assigned : OWNER_COPY.unassigned]),
                  ].join(', ')
                : undefined
            }
            selectedId={selectedId}
            actorsById={actorsById}
            teamNamesById={teamNamesById}
            onSelect={onSelect}
            onRetry={scopedPermission.state === 'error' ? scopedPermission.retry : retryList}
            onResetFilters={onResetFilters}
          />
          {!isReadDenied ? (
            <ListLoadMore
              hasMore={listQuery.hasNextPage}
              loadingMore={listQuery.isFetchingNextPage}
              failed={listQuery.isFetchNextPageError}
              onLoadMore={() => void listQuery.fetchNextPage()}
            />
          ) : null}
        </>
      }
      {...(!renderDetailInPlace && detailPanel !== undefined ? { detailPanel } : {})}
    />
  );
  return renderDetailInPlace ? <>{list}{detailPanel}</> : list;
}

function FindingsListBody({
  findings,
  total,
  isPending,
  isError,
  isSuccess,
  isReadDenied,
  capability,
  managedSystemId,
  cardProps,
  isFilteredEmpty,
  searchFiltered,
  assignmentFiltered,
  filterBar,
  hasFilterBar,
  filterDescription,
  selectedId,
  actorsById,
  teamNamesById,
  onSelect,
  onRetry,
  onResetFilters,
}: {
  findings: FindingDto[];
  total: number | undefined;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isReadDenied: boolean;
  capability: string;
  managedSystemId: string | undefined;
  cardProps: ReturnType<typeof useListDenial>['cardProps'];
  isFilteredEmpty: boolean;
  searchFiltered: boolean;
  assignmentFiltered: boolean;
  filterBar: React.ReactNode;
  hasFilterBar: boolean;
  filterDescription: string | undefined;
  selectedId: string | null;
  actorsById: Map<string, AvatarUser>;
  teamNamesById: Map<string, string>;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onResetFilters: () => void;
}): React.ReactElement {
  const archived = useIsArchivedSystem(isReadDenied && !cardProps.request && !cardProps.roleRequired ? managedSystemId : undefined);
  return (
    <section className="flex min-h-full flex-col">
      {!isReadDenied ? (
        <div className="border-b border-border-subtle px-5 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Finding 목록
            </h3>
            {isSuccess && !isPending && !isError && total !== undefined ? (
              <span className="text-xs text-text-muted">{formatCount(total)}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {filterBar}
      {isPending ? (
        <div className="space-y-2 p-4" data-testid="finding-list-skeleton">
          <SkeletonRows count={3} size="compact" />
        </div>
      ) : isReadDenied ? (
        <ScopedListDenialCard
          {...cardProps}
          category="Findings"
          roleHeading={{ category: GLOSSARY.allFindings, level: 2 }}
          reason={PERMISSION_BLOCKED_REASONS.findingsList}
          returnRouteIntent="/findings"
          capability={capability}
          managedSystemId={managedSystemId}
          archivedSystem={archived}
          recoverToMyVocs
        />
      ) : isError ? (
        <div data-testid="finding-list-error" className="p-4">
          <ListStateMessage
            variant="error"
            title="Finding 목록을 불러오지 못했습니다"
            body="잠시 후 다시 시도하세요."
            action={{ label: '다시 시도', onClick: onRetry }}
          />
        </div>
      ) : searchFiltered && findings.length === 0 ? (
        <ListStateMessage
          variant="filtered"
          title={LIST_SEARCH_EMPTY_LABEL}
          action={{ label: '필터 초기화', onClick: onResetFilters }}
        />
      ) : isFilteredEmpty ? (
        <div className="p-4" data-testid="finding-filtered-empty-state">
          <ListStateMessage
            variant="filtered"
            title="현재 조건에 맞는 Finding이 없습니다"
            body={
              filterDescription
                ? `${filterDescription} 조건으로 표시 중입니다.`
                : assignmentFiltered
                  ? OWNER_COPY.filteredEmpty
                  : '실행과 연결되지 않은 Finding만 표시 중입니다.'
            }
            {...(hasFilterBar ? {} : { action: { label: '필터 초기화', onClick: onResetFilters } })}
          />
        </div>
      ) : findings.length === 0 ? (
        <div className="p-4" data-testid="finding-empty-state">
          <ListStateMessage
            variant="empty"
            title="생성된 Finding이 없습니다."
            body="VOC 근거에서 실행 후보로 승격된 Finding이 여기에 표시됩니다."
          />
        </div>
      ) : (
        <div data-testid="finding-list">
          {findings.map((finding) => (
            <FindingRow
              key={finding.id}
              finding={finding}
              selected={selectedId === finding.id}
              owner={
                finding.owner_actor_id ? (actorsById.get(finding.owner_actor_id) ?? null) : null
              }
              teamName={
                finding.owner_team_id ? (teamNamesById.get(finding.owner_team_id) ?? null) : null
              }
              onClick={() => onSelect(finding.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FindingRow({
  finding,
  selected,
  owner,
  teamName,
  onClick,
}: {
  finding: FindingDto;
  selected: boolean;
  owner: AvatarUser | null;
  teamName: string | null;
  onClick: () => void;
}): React.ReactElement {
  return (
    <ObjectRow
      id={finding.display_id}
      title={finding.title}
      selected={selected}
      density="default"
      severity={finding.severity}
      onClick={onClick}
      badges={<FindingStatusBadge status={finding.status} />}
      meta={
        <>
          <span>{FINDING_SEVERITY_LABELS[finding.severity]}</span>
          {finding.confidence !== null ? (
            <>
              {dot()}
              <ConfidenceBadge displayId={finding.display_id} confidence={finding.confidence} />
            </>
          ) : null}
          {dot()}
          <span>근거 {finding.evidence_count}개</span>
          {dot()}
          <span>
            {GLOSSARY.owner}:{' '}
            {finding.owner_actor_id
              ? (owner?.display_name ?? GLOSSARY.unknownUser)
              : finding.owner_team_id
                ? (teamName ?? `${OWNER_COPY.team} · ${finding.owner_team_id.slice(0, 8)}`)
                : GLOSSARY.unassigned}
          </span>
          {dot()}
          <span>{formatShortDate(finding.created_at)}</span>
        </>
      }
      trailing={owner !== null ? <UserAvatar user={owner} size="sm" /> : null}
    />
  );
}

function FindingStatusBadge({
  status,
}: {
  status: FindingDto['status'];
}): React.ReactElement {
  return (
    <OutlineBadge data-testid={`finding-status-badge-${status}`}>
      {FINDING_STATUS_LABELS[status]}
    </OutlineBadge>
  );
}

function ConfidenceBadge({
  displayId,
  confidence,
}: {
  displayId: string;
  confidence: NonNullable<FindingDto['confidence']>;
}): React.ReactElement {
  return (
    <OutlineBadge data-testid={`finding-confidence-badge-${displayId}`}>
      신뢰도 · {FINDING_CONFIDENCE_LABELS[confidence]}
    </OutlineBadge>
  );
}

export function FindingEmptyDetail(): React.ReactElement {
  return (
    <div
      className="flex h-full items-center justify-center p-6 text-sm text-text-muted"
      data-testid="finding-detail-empty-state"
    >
      Finding을 선택하세요.
    </div>
  );
}

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}
