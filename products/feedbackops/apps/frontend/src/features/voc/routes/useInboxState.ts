// URL state, list query and write handlers of the inbox / 내 VOC list (C9 of Slice 3 #20). Reads the
// search from the host seam and writes the complete next FeedbackOps href through it, so the screen
// runs under the standalone router and inside the platform bridge alike (platform ADR-0071).

import { isPermissionDenied } from '@/lib/api/types';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import { useAnalyticsAreaFilterLabel } from '@/lib/useAnalyticsAreaFilterLabel';
import { useCommittedSearchDraft } from '@/lib/useCommittedSearchDraft';
import * as React from 'react';
import { type SearchTabTransition, useVocListPages } from '../hooks/useVocListPages';
import {
  DEFAULT_SORT,
  type InboxSort,
  type InboxTab,
  parseCommaList,
  serialiseCommaList,
} from './inbox-config';
import { type VocSearch, validateVocSearch } from './voc-search';

type SearchUpdate = (previous: VocSearch) => VocSearch;

export function useInboxState(view: 'inbox' | 'my') {
  // Writes fold on the latest pending search and any host navigation drops the fold (useHostSearchWriter).
  const { search, write: writeSearch } = useHostSearchWriter('/vocs', validateVocSearch);
  const write = React.useCallback(
    (update: SearchUpdate, replace = false): void => writeSearch(update, { replace }),
    [writeSearch],
  );

  // ── Derived URL state ─────────────────────────────────────────────────────

  const area = search['filter.analytics_area'];
  const areaLabel = useAnalyticsAreaFilterLabel(area, search.managedSystem);
  const removeArea = () => {
    write(({ 'filter.analytics_area': _area, ...rest }) => rest);
  };
  const hasAnalyticsAreaFilter = area !== undefined;
  // #821: the URL q is the source of truth for the fetch; the box keeps a
  // local draft so keystrokes do not navigate on every character.
  const urlQ = search.q ?? '';
  // #821 owner decision: a search covers the whole inbox. The inbox has no
  // "all" tab, so a tab-scoped search could never find an already-triaged VOC.
  // Starting a search drops the tab (remembered below); a tab picked during the
  // search narrows it to that tab.
  const searchingAllTabs = view === 'inbox' && urlQ !== '' && search.tab === undefined;
  const activeTab = searchingAllTabs
    ? ''
    : (search.tab ?? (hasAnalyticsAreaFilter ? '' : 'untriaged'));
  const apiTab = searchingAllTabs
    ? undefined
    : (search.tab ?? (hasAnalyticsAreaFilter ? undefined : 'untriaged'));
  const mySeveritySort = view === 'my' && search.sort?.startsWith('severity:') === true;
  const mySeverityTab = view === 'my' && (search.tab === 'high' || search.tab === 'high-no-link');
  const mySeverityFilter = view === 'my' && search['filter.severity'] !== undefined;
  const currentSort = mySeveritySort ? DEFAULT_SORT : (search.sort ?? DEFAULT_SORT);
  React.useEffect(() => {
    if (!mySeveritySort && !mySeverityTab && !mySeverityFilter) return;
    write((prev) => {
      const { sort, tab, 'filter.severity': severity, ...rest } = prev;
      return {
        ...rest,
        ...(!mySeveritySort && sort !== undefined ? { sort } : {}),
        ...(!mySeverityTab && tab !== undefined ? { tab } : {}),
        ...(!mySeverityFilter && severity !== undefined ? { 'filter.severity': severity } : {}),
      };
    }, true);
  }, [mySeveritySort, mySeverityTab, mySeverityFilter, write]);
  // The tab the current search started from, restored when the search is cleared.
  const [searchTabTransition, setSearchTabTransition] = React.useState<SearchTabTransition>();
  const tabBeforeSearchRef = React.useRef<InboxTab | undefined>(undefined);
  // #864: the hook calls this to write the URL q, from its debounced effect and
  // its immediate Enter/blur commit. Carries the #821 tab rules: starting a
  // search drops the remembered tab, clearing restores it. While a commit is
  // still pending, those rules see `base` — that draft, not the URL it has not
  // reached yet. `urlQ` is not a dep: the hook reads it as `committed`.
  const writeSearchDraft = React.useCallback(
    (draft: string, base: string) => {
      const urlTab = search.tab;
      const clearing = draft === '';
      const starting = base === '' && !clearing && view === 'inbox';
      if (starting) tabBeforeSearchRef.current = urlTab;
      const restoreTab = clearing ? tabBeforeSearchRef.current : undefined;
      if (clearing) tabBeforeSearchRef.current = undefined;
      if (starting || clearing) {
        setSearchTabTransition({
          fromQ: base,
          fromTab: apiTab,
          toQ: draft,
          toTab: starting
            ? undefined
            : (urlTab ?? restoreTab ?? (hasAnalyticsAreaFilter ? undefined : 'untriaged')),
        });
      }
      write((prev) => {
        const { q: _q, ...rest } = prev;
        // An empty box removes q and returns to the tab the search started
        // from, unless a tab was picked during the search. Anything else is
        // written verbatim (the backend owns trimming).
        if (clearing) {
          return rest.tab === undefined && restoreTab !== undefined
            ? { ...rest, tab: restoreTab }
            : rest;
        }
        if (starting) {
          const { tab: _tab, ...withoutTab } = rest;
          return { ...withoutTab, q: draft };
        }
        return { ...rest, q: draft };
      }, true);
      // Undefined, not false: a raw write can still change the URL, so the
      // draft waits for `committed` instead of settling as a no-op.
      return undefined;
    },
    [write, search.tab, view, apiTab, hasAnalyticsAreaFilter],
  );
  React.useEffect(() => {
    if (searchTabTransition?.toQ === urlQ && searchTabTransition.toTab === apiTab) {
      setSearchTabTransition(undefined);
    }
  }, [searchTabTransition, urlQ, apiTab]);
  const { draft, setDraft, commit } = useCommittedSearchDraft({
    committed: urlQ,
    write: writeSearchDraft,
  });

  // Parse comma-list filter strings into arrays for ListFilterButton.
  const severityParam = search['filter.severity'];
  const reporterStatusParam = search['filter.reporterStatus'];
  const ownerParam = search['filter.owner'];
  const currentFilters: Record<string, string[]> = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    const sev = parseCommaList(severityParam);
    if (view !== 'my' && sev.length > 0) out['filter.severity'] = sev;
    const status = parseCommaList(reporterStatusParam);
    if (status.length > 0) out['filter.reporterStatus'] = status;
    const owner = parseCommaList(ownerParam);
    if (owner.length > 0) out['filter.owner'] = owner;
    return out;
  }, [severityParam, reporterStatusParam, ownerParam, view]);

  const apiFilters = React.useMemo(
    () =>
      area !== undefined ? { ...currentFilters, 'filter.analytics_area': [area] } : currentFilters,
    [currentFilters, area],
  );

  // ── useVocListPages params ────────────────────────────────────────────────

  const vocList = useVocListPages({
    view,
    searchTabTransition,
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
    ...(view === 'inbox' && apiTab !== undefined ? { tab: apiTab } : {}),
    ...(urlQ !== '' ? { q: urlQ } : {}),
    filters: apiFilters,
    sort: currentSort,
  });
  const items = React.useMemo(
    () => vocList.data?.pages.flatMap((page) => page.items) ?? [],
    [vocList.data],
  );
  // A failed next page keeps the loaded rows; it must not reach the list's
  // error or permission-denied states.
  const listError = vocList.isFetchNextPageError ? null : vocList.error;
  // Captured outside JSX: property narrowing does not survive into the renderTrigger callback.
  const deniedMsScoped =
    isPermissionDenied(listError) &&
    typeof listError.envelope.requestable_permission?.managed_system_id === 'string';

  // ── Handlers ──────────────────────────────────────────────────────────────

  return {
    search,
    area,
    areaLabel,
    removeArea,
    activeTab,
    currentSort,
    currentFilters,
    draft,
    setDraft,
    commit,
    vocList,
    items,
    outOfScopeSummary: vocList.data?.pages[0]?.out_of_scope_summary,
    listError,
    deniedMsScoped,
    inboxPermissionBlocked: view === 'inbox' && isPermissionDenied(listError),
    isSearching: urlQ !== '',
    handleTabChange: (next: string): void => write((prev) => ({ ...prev, tab: next as InboxTab })),
    handleFiltersChange: (next: Record<string, string[]>): void =>
      write((prev) => {
        const {
          'filter.severity': _severity,
          'filter.reporterStatus': _reporterStatus,
          'filter.owner': _owner,
          ...rest
        } = prev;
        return {
          ...rest,
          'filter.severity': serialiseCommaList(next['filter.severity'] ?? []),
          'filter.reporterStatus': serialiseCommaList(next['filter.reporterStatus'] ?? []),
          'filter.owner': serialiseCommaList(next['filter.owner'] ?? []),
        };
      }),
    handleAreaChange: (next: string | undefined): void =>
      write(({ 'filter.analytics_area': _area, ...rest }) =>
        next === undefined ? rest : { ...rest, 'filter.analytics_area': next },
      ),
    handleSortChange: (next: string): void =>
      write((prev) => ({ ...prev, sort: next as InboxSort })),
    handleRowSelect: (id: string): void => write((prev) => ({ ...prev, selected: id })),
    handlePanelClose: (): void => write(({ selected: _selected, ...rest }) => rest),
    handleCreate: (): void => write((prev) => ({ ...prev, action: 'create' })),
  };
}
