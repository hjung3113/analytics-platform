// InboxScreen — list-first layout for /vocs?view=inbox and /vocs?view=my, shared by the standalone
// router and the platform bridge (platform ADR-0071). Owns the list body (toolbar, filters, search,
// banners, VocList) and composes it with the detail the host renders for the selected VOC, so this
// module never imports the detail tree. URL state: see useInboxState.

import { ListLoadMore } from '../../../components/ListLoadMore';
import { MyVocsRecoveryLink } from '../../../components/MyVocsRecoveryLink';
import { permissionCardExitAction } from '../../../components/permission-card-actions';
import { RequestAccessButton } from '../../admin/public';
import { GLOSSARY, createLabel } from '../../../lib/copy/glossary';
import { LIST_SEARCH_PLACEHOLDER } from '../../../lib/copy/list-search';
import { PERMISSION_BLOCKED_REASONS } from '../../../lib/copy/permission-reasons';
import { PERMISSION_REQUEST_FLOW_COPY } from '../../../lib/copy/permission-requests';
import { VOC_INBOX_LABEL } from '../../../lib/copy/voc-views';
import { HostLink, useHostPermissionLinks, useHostPrimaryActionTarget, useHostSeam } from '../../../lib/host/host-seam';
import { HostPrimaryAction } from '../../../lib/host/HostPrimaryAction';
import { SEVERITY_LABELS } from '../../../ui/index';
import {
  type SeverityEnum,
  ActiveFilterBar,
  Button,
  ListFilterButton,
  ListShell,
  ListSortButton,
  ListToolbar,
  PermissionBlockedPanel,
  SearchInput,
} from '@ap/ui';
import { Plus } from 'lucide-react';
import type * as React from 'react';
import { VocAreaFilterSelect } from '../components/VocAreaFilterSelect';
import { VocList } from '../components/list/VocList';
import { DEFAULT_SORT, FILTER_CATEGORIES, INBOX_TABS, SORT_OPTIONS } from './inbox-config';
import { useInboxState } from './useInboxState';

const CREATE_HREF = '/vocs?action=create';

export interface InboxScreenProps {
  view: 'inbox' | 'my';
  /** The host's detail for the selected VOC; `onClose` drops `selected` from the URL. */
  renderDetail: (
    vocId: string,
    options: { managedSystemId: string | undefined; onClose: () => void },
  ) => React.ReactNode;
}

export function InboxScreen({ view, renderDetail }: InboxScreenProps): React.ReactElement {
  const { canLink, lang = 'ko' } = useHostSeam();
  const canCreate = canLink(CREATE_HREF);
  const primaryActionTarget = useHostPrimaryActionTarget();
  const { permissionHomeHref } = useHostPermissionLinks();
  const {
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
    outOfScopeSummary,
    listError,
    permissionError,
    inboxPermissionBlocked,
    isSearching,
    handleTabChange,
    handleFiltersChange,
    handleAreaChange,
    handleSortChange,
    handleRowSelect,
    handlePanelClose,
    handleCreate,
  } = useInboxState(view);

  const requestable = permissionError?.envelope.requestable_permission;
  const { requestSystemId, exactScopeTarget, requestCheckStatus, requestCheckRetry } = vocList;
  const readRequestUnavailable = requestable?.permission === 'voc.read' && requestSystemId === undefined;
  const requestCopy = PERMISSION_REQUEST_FLOW_COPY[lang];
  let requestCheckAction: React.ReactNode;
  switch (requestCheckStatus) {
    case 'pending':
      requestCheckAction = <span role="status">{requestCopy.checkingEligibility}</span>;
      break;
    case 'error':
      requestCheckAction = (
        <>
          <span role="alert">{requestCopy.eligibilityCheckError}</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => void requestCheckRetry()}>
            {requestCopy.retry}
          </Button>
        </>
      );
      break;
  }
  const needsSystemSelection =
    readRequestUnavailable && requestable.managed_system_id == null && requestCheckAction === undefined;

  const outOfScopeBanner = outOfScopeSummary ? (
    <PermissionBlockedPanel
      state="summary_visible"
      category="조회 권한 외 VOC"
      summary={
        <div>
          <p>{outOfScopeSummary.count}건의 VOC를 조회할 수 없습니다.</p>
          <p className="text-xs text-text-muted">
            심각도 분포:{' '}
            {Object.entries(outOfScopeSummary.severity_distribution)
              .map(([sev, n]) => `${SEVERITY_LABELS[sev as SeverityEnum] ?? sev}=${String(n)}`)
              .join(', ')}
          </p>
        </div>
      }
      className="mx-4 mt-3"
    />
  ) : null;

  const deniedCreateAction = inboxPermissionBlocked && canCreate ? (
    <HostPrimaryAction>
      <Button asChild variant="secondary" size="sm" spacing="compact">
        <HostLink to={CREATE_HREF}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {createLabel('VOC')}
        </HostLink>
      </Button>
    </HostPrimaryAction>
  ) : undefined;
  // A denied Inbox needs a local toolbar only when it has an action the host cannot render.
  const showToolbar = !inboxPermissionBlocked || (canCreate && primaryActionTarget === null);

  const list = (
    <>
      {!showToolbar && deniedCreateAction}
      {showToolbar && <ListToolbar
        {...(view === 'my' ? { title: GLOSSARY.myVocs } : {})}
        {...(view === 'inbox' && !inboxPermissionBlocked
          ? {
              tabs: INBOX_TABS,
              tabsMaxVisible: 3,
              activeTab,
              onTabChange: handleTabChange,
            }
          : {})}
        action={
          inboxPermissionBlocked ? deniedCreateAction : (
            // #886 UX-7: on a narrow toolbar the actions get their own row; the controls wrap within it rather than overflow.
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* #821: server-side text search on GET /vocs. The box is a local
                draft; useCommittedSearchDraft writes the URL q on debounce or
                Enter/blur (#864). */}
              <SearchInput
                placeholder={LIST_SEARCH_PLACEHOLDER}
                value={draft}
                onValueChange={setDraft}
                onCommit={commit}
              />
              <VocAreaFilterSelect
                value={area}
                managedSystemId={search.managedSystem}
                onChange={handleAreaChange}
              />
              <ListFilterButton
                categories={
                  view === 'my'
                    ? FILTER_CATEGORIES.filter((category) => category.key !== 'filter.severity')
                    : FILTER_CATEGORIES
                }
                values={currentFilters}
                onChange={handleFiltersChange}
              />
              <ListSortButton
                options={
                  view === 'my'
                    ? SORT_OPTIONS.filter((option) => !option.value.startsWith('severity:'))
                    : SORT_OPTIONS
                }
                value={currentSort}
                defaultValue={DEFAULT_SORT}
                onChange={handleSortChange}
              />
              {/* Prototype: primary Button (not a text link). #679 Korean-first label. */}
              {canCreate && (
                <HostPrimaryAction>
                  <Button asChild variant="primary" size="sm" spacing="compact">
                    <HostLink to={CREATE_HREF}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {createLabel('VOC')}
                    </HostLink>
                  </Button>
                </HostPrimaryAction>
              )}
            </div>
          )
        }
      />}
      {!inboxPermissionBlocked && (
        <ActiveFilterBar
          items={
            area === undefined ? [] : [{ key: 'area', label: areaLabel, onRemove: removeArea }]
          }
          onClearAll={removeArea}
          className="mx-4 my-2"
        />
      )}
      {permissionError !== null ? (
        <div className="m-4 space-y-3">
          {requestable && !readRequestUnavailable ? (
            <RequestAccessButton
              key={requestSystemId}
              layout="card"
              capability={requestable.permission}
              returnRouteIntent={`/vocs?view=${view}`}
              exactScopeTarget={exactScopeTarget}
              {...(requestSystemId !== undefined ? { managedSystemId: requestSystemId } : {})}
              renderTrigger={(_onRequestAccess, panel) => (
                <PermissionBlockedPanel
                  layout="card"
                  headingLevel={3}
                  announceBody
                  state="request_access"
                  category={VOC_INBOX_LABEL}
                  // #562 copy: a named Managed System means this selected scope is out of reach.
                  reason={
                    requestSystemId !== undefined
                      ? PERMISSION_BLOCKED_REASONS.vocInboxManagedSystem
                      : PERMISSION_BLOCKED_REASONS.vocInbox
                  }
                  {...panel}
                />
              )}
            />
          ) : (
            <PermissionBlockedPanel
              // packages/feature/screens/docs/specs/voc.md R-VOC-INBOX: no read scope and nothing requestable
              // -> blocked_not_requestable (#562).
              state="blocked_not_requestable"
              layout="card"
              headingLevel={3}
              announceBody
              lang={lang}
              category={VOC_INBOX_LABEL}
              description={PERMISSION_BLOCKED_REASONS.vocInbox}
              // #2619: a targetless VOC read denial names the next step inside the card.
              {...(needsSystemSelection ? { reason: PERMISSION_BLOCKED_REASONS.vocTriageMissingReadSelectSystem } : {})}
              {...(requestCheckAction === undefined
                ? { requestStatus: 'not-requestable' }
                : { requestAction: requestCheckAction })}
              exitAction={permissionCardExitAction(permissionHomeHref, lang)}
            />
          )}
          {view === 'inbox' && requestable === undefined ? (
            <MyVocsRecoveryLink />
          ) : null}
        </div>
      ) : (
        <>
          {outOfScopeBanner}
          <VocList
            items={items}
            // Placeholder data keeps the previous page while the next key loads.
            // `isLoading` is then false. VocList still mounts rows when items
            // exist; an empty previous page must stay on the skeleton branch
            // instead of the old query's empty state. A real error replaces
            // placeholder data, so that branch is unchanged.
            loading={vocList.isLoading || vocList.isPlaceholderData}
            error={listError ?? null}
            selectedId={search.selected ?? null}
            onSelect={handleRowSelect}
            view={view}
            {...(view === 'inbox' && activeTab === 'unassigned'
              ? { unassignedBadgeTone: 'neutral' as const }
              : {})}
            searching={isSearching}
            areaFiltered={view === 'inbox' && area !== undefined}
            areaLabel={areaLabel}
            onRetry={() => {
              void vocList.refetch();
            }}
            {...(canCreate ? { onCreate: handleCreate } : {})}
          />
          <ListLoadMore
            hasMore={vocList.hasNextPage}
            loadingMore={vocList.isFetchingNextPage}
            failed={vocList.isFetchNextPageError}
            onLoadMore={() => {
              void vocList.fetchNextPage();
            }}
          />
        </>
      )}
    </>
  );

  const detailPanel =
    search.selected !== undefined
      ? renderDetail(search.selected, {
          managedSystemId: search.managedSystem,
          onClose: handlePanelClose,
        })
      : undefined;

  return <ListShell list={list} {...(detailPanel !== undefined ? { detailPanel } : {})} />;
}
