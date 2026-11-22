import { ListLoadMore } from '../../../components/ListLoadMore';
import { ListStateMessage } from '../../../components/ListStateMessage';
import { GLOSSARY } from '../../../lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '../../../lib/copy/permission-reasons';
import { TASK_REQUEST_COPY, TASK_REQUEST_LINK_MISSING_MESSAGE } from '../../../lib/copy/task-requests';
import { RESPONSIBILITY_COPY } from '../../../lib/copy/tasks';
import { formatRecordDocumentTitle } from '../../../lib/host/document-title-format';
import { useHostTitle } from '../../../lib/host/host-seam';
import type { HostSearch } from '../../../lib/host/search';
import { useHostSearchWriter } from '../../../lib/host/useHostSearchWriter';
import { shortId } from '../../../lib/identity';
import type { TaskRequestDto } from '@ap/feature-shared';
import {
  Button,
  ListShell,
  ListToolbar,
  PermissionBlockedPanel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  useListMotion,
} from '@ap/ui';
import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LinkTargetMissingNotice } from '../components/LinkTargetMissingNotice';
import { useEligibleResponsibilityActors } from '../components/ResponsibilityEditor';
import { useCloseFocusReturn } from '../hooks/useCloseFocusReturn';
import {
  type TaskRequestPanelParts,
  buildTaskRequestPanelParts,
} from './task-requests/TaskRequestPanelParts';
import { type NameMaps, TaskRequestRow } from './task-requests/TaskRequestRow';
import { applyTaskRequestVocSource, taskRequestReadStateKey, useTaskRequestReadStates } from './task-requests/taskRequestReadState';
import { type TaskRequestTab, useTaskRequestsQueue } from './task-requests/useTaskRequestsQueue';

import { validateTasksSearch } from './task-search';

/**
 * The `/tasks` search of this screen as feature strings: the four keys it reads, with `view` fixed. `managedSystem` is
 * passed as the host gave it (the router and the bridge both validate it before mounting, platform ADR-0071 decision 9),
 * as the route props always were.
 */
function validateTaskRequestsSearch(raw: HostSearch) {
  const { param, reviewer, reviewerTeam } = validateTasksSearch(raw);
  return {
    view: 'requests' as const,
    managedSystem: raw.managedSystem,
    param,
    reviewer,
    reviewerTeam,
  };
}

export interface TaskRequestsScreenProps {
  /** `false`: the queue never selects its first row; the selection is the URL `param` only (the host owns the detail). */
  autoSelect: boolean;
  /** The host's frame for the selected request's panel parts; rendered in place, so a host that wants a drawer registers it there. */
  renderDetail: (parts: TaskRequestPanelParts, list: {
    isInList: boolean | undefined;
    focusRef: RefObject<HTMLDivElement | null>;
    retryDetail: (() => void) | null;
  }) => ReactNode;
  /** The host's drawer header already shows the request title; the panel body omits its own (#1168 C-1). */
  titleInHeader?: boolean;
  /** The platform owns missing-link recovery and keeps the selected ID until the user clears it. */
  renderMissingDetail?: (id: string, close: () => void) => ReactNode;
  renderDetailError?: (retry: () => void) => ReactNode;
  /** Accessible name for the queue focus destination, also enabling filter-driven drawer closure. */
  queueLabel?: string;
  detailOnly?: boolean;
}

export function TaskRequestsScreen({ autoSelect, renderDetail, titleInHeader, renderMissingDetail, renderDetailError, queueLabel, detailOnly }: TaskRequestsScreenProps) {
  const listMotion = useListMotion();
  // Writes fold on the latest pending search and any host navigation drops the fold (useHostSearchWriter).
  const { search, write } = useHostSearchWriter('/tasks', validateTaskRequestsSearch);
  const { param: selectedParam, managedSystem } = search;
  const activeReviewer = search.reviewer;
  const activeTeam = search.reviewerTeam;
  const changeReviewer = (actor: string | undefined, team: string | undefined) => {
    write((previous) => ({
      view: 'requests',
      managedSystem: previous.managedSystem,
      param: queueLabel && !detailOnly ? previous.param : undefined,
      reviewer: actor ? actor : undefined,
      reviewerTeam: team ? team : undefined,
    }));
  };
  const [handoff, setHandoff] = useState<{
    item: TaskRequestDto;
    names: NameMaps;
    context: string;
    result: TaskRequestDto;
    originParam: string | null;
    expectedId: string | null;
  } | null>(null);
  const clearHandoff = useCallback(() => {
    setHandoff(null);
  }, []);
  const listRef = useRef<HTMLDivElement>(null);
  const replaceSelection = useCallback(
    (id: string | null, replace: boolean) => {
      if (replace)
        setHandoff((current) =>
          current ? { ...current, originParam: selectedParam ?? null, expectedId: id } : null,
        );
      write((previous) => ({ ...previous, param: id ?? undefined }), { replace });
    },
    [write, selectedParam],
  );
  const queue = useTaskRequestsQueue({
    selectedParam,
    managedSystem,
    reviewer: activeReviewer,
    reviewerTeam: activeTeam,
    onSelectionChange: replaceSelection,
    autoSelect,
    keepMissingSelection: renderMissingDetail !== undefined,
    ...(detailOnly ? { detailOnly } : {}),
  });
  // The reviewer filter is fully controlled by the committed search state
  // (route props on history navigation), so Back/Forward always re-sync it.
  const eligibleActors = useEligibleResponsibilityActors(true);
  const scopedSystem =
    managedSystem !== undefined && managedSystem !== 'all'
      ? queue.names.managedSystemsById[managedSystem]
      : undefined;
  const teamCandidateIds = [
    ...new Set(
      [
        activeTeam,
        scopedSystem?.defaultReviewerTeamId,
        scopedSystem?.defaultOwnerTeamId,
        ...Object.keys(queue.names.teamsById ?? {}),
      ].filter((id): id is string => id !== undefined),
    ),
  ];
  const reviewerFilterActive = activeReviewer !== undefined || activeTeam !== undefined;
  // Reviewer filtering needs `finding.manage` (Admin or scoped Developer);
  // the control stays hidden when the queue itself is permission-blocked.
  const showReviewerFilter = !queue.permissionDeniedError && queue.currentRole !== 'user';
  const applyFilterValue = (value: string) => {
    if (value === 'all') changeReviewer(undefined, undefined);
    else if (value === 'me') changeReviewer('me', undefined);
    else if (value.startsWith('actor:')) changeReviewer(value.slice('actor:'.length), undefined);
    else if (value.startsWith('team:')) changeReviewer(undefined, value.slice('team:'.length));
  };
  const filterValue = activeTeam
    ? `team:${activeTeam}`
    : activeReviewer === 'me'
      ? 'me'
      : activeReviewer
        ? `actor:${activeReviewer}`
        : 'all';
  const context = JSON.stringify([
    queue.activeTab,
    managedSystem ?? null,
    activeReviewer,
    activeTeam,
  ]);
  const readStates = useTaskRequestReadStates();
  const handoffRead = handoff ? readStates?.[taskRequestReadStateKey(handoff.item.id)] : undefined;
  if (handoff && handoffRead?.denied) setHandoff(null);
  const retainedPanel =
    !queue.permissionDeniedError &&
    !queue.detachedReadDenied &&
    !handoffRead?.denied &&
    handoff?.context === context &&
    ((selectedParam ?? null) === handoff.originParam ||
      (selectedParam ?? null) === handoff.expectedId)
      ? handoff
      : null;
  useEffect(() => {
    if (!queue.permissionDeniedError || !handoff) return;
    const frame = requestAnimationFrame(() => {
      const heading = listRef.current?.querySelector<HTMLElement>('[data-state="denied"] h4');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
        clearHandoff();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [queue.permissionDeniedError, handoff, clearHandoff]);
  const listedItem = queue.shown.find(row => row.id === queue.selectedId);
  const selectedInQueue = listedItem !== undefined;
  const [openedInQueue, setOpenedInQueue] = useState<{
    id: string;
    managedSystem: string | undefined;
    item: TaskRequestDto | null;
  } | null>(null);
  const previousItem = openedInQueue?.id === queue.selectedId && openedInQueue.managedSystem === managedSystem
    ? openedInQueue : null;
  let opened = previousItem;
  if (!queueLabel || detailOnly || queue.permissionDeniedError) opened = null;
  else if (queue.detachedReadDenied) {
    // Keep evidence of queue membership so settled exclusion can close the
    // drawer after recovery. The denied record can no longer be a fallback.
    if (previousItem?.item) opened = { ...previousItem, item: null };
  } else if (listedItem) {
    const item = queue.selected ?? listedItem;
    if (item !== previousItem?.item) opened = { id: item.id, managedSystem, item };
  }
  if (opened !== openedInQueue) setOpenedInQueue(opened);
  const reviewerId = activeReviewer === 'me' ? queue.currentActorId : activeReviewer;
  // A row absent from a partial queue can still be on a later page. Its detail
  // can establish exclusion once the read confirms its status or assignment.
  const settledDetail = queue.settledSelectedDetail;
  const excludedByFilter = settledDetail !== undefined && (
    (queue.activeTab !== 'all' && settledDetail.status !== queue.activeTab) ||
    (reviewerId != null && settledDetail.assigned_reviewer_actor_id !== reviewerId) ||
    (activeTeam !== undefined && settledDetail.assigned_reviewer_team_id !== activeTeam)
  );
  // The last authorized row keeps the drawer mounted through unknown membership
  // and through the render that delivers settled exclusion to the drawer.
  const handoffItem = useMemo(
    () => retainedPanel && applyTaskRequestVocSource(retainedPanel.item, handoffRead),
    [retainedPanel, handoffRead],
  );
  const panelItem = handoffItem ?? queue.selected ?? opened?.item ?? null;
  const recentlyApproved = panelItem !== null && queue.recentlyApprovedRequestId === panelItem.id;
  // Auto-close a drawer opened from this queue after a settled exclusion. A
  // just-approved request stays selected for conversion after leaving its tab.
  const canJudgeMembership = selectedInQueue || !queue.hasMore || excludedByFilter;
  const isInList = !retainedPanel && !recentlyApproved && queue.queueSettled && opened !== null && canJudgeMembership
    ? selectedInQueue
    : undefined;
  const completeDecision = (result: TaskRequestDto) => {
    if (
      queue.selected?.id === result.id &&
      ['approved', 'rejected', 'needs_more_evidence'].includes(result.status) &&
      (result.status === 'approved' || document.activeElement?.closest('[role="dialog"]'))
    ) {
      setHandoff({
        item: result.status === 'approved' ? result : queue.selected,
        names: queue.names,
        context,
        result,
        originParam: selectedParam ?? null,
        expectedId: queue.selectedId,
      });
    }
    queue.onDecisionComplete(result);
  };
  const completedFocusTarget = (result: TaskRequestDto) => {
    if (!retainedPanel || retainedPanel.result !== result) return null;
    if (result.status === 'approved') {
      return document.querySelector<HTMLElement>('[data-testid="task-request-convert-action"]');
    }
    if (queue.hasError || queue.isLoading) return null;
    if (queue.selectedId !== null) {
      return (
        listRef.current?.querySelector<HTMLElement>(`[data-request-id="${queue.selectedId}"]`) ??
        null
      );
    }
    if (!queue.queueSettled || queue.hasMore) return null;
    const heading = listRef.current?.querySelector<HTMLElement>(
      '[data-testid="list-state-message"] p',
    );
    if (heading) {
      heading.tabIndex = -1;
      heading.setAttribute('role', 'heading');
      heading.setAttribute('aria-level', '3');
    }
    return heading ?? null;
  };
  const { rowRef, returnFocus, cancel } = useCloseFocusReturn(context);
  const [settlement, setSettlement] = useState({ context, settled: queue.queueSettled });
  const settledOnce = queue.queueSettled || (settlement.context === context && settlement.settled);
  // First fresh data replaces the cached boundary; later fetches keep its motion and scroll.
  if (settlement.context !== context || settlement.settled !== settledOnce) {
    setSettlement({ context, settled: settledOnce });
  }
  const phase = !settledOnce ? 'cached' : queue.shown.length === 0 ? 'empty' : 'rows';
  const selectedDocumentTitle =
    (detailOnly || (!queue.isLoading && !queue.hasError)) &&
    queue.selected !== null &&
    queue.selectedId === queue.selected.id
      ? formatRecordDocumentTitle({
          displayId: queue.selected.display_id,
          title: queue.selected.requested_outcome,
        })
      : null;
  useHostTitle(selectedDocumentTitle);

  // #1032: a new selection (row click or URL param) cancels a pending focus return.
  useEffect(() => {
    if (queue.selectedId !== null) cancel();
  }, [queue.selectedId, cancel]);

  const activeTabLabel =
    queue.tabs.find((tab) => tab.value === queue.activeTab)?.label ?? queue.activeTab;
  // Offer clearing reviewer filters when requests exist outside the filtered list.
  const isReviewFilteredEmpty =
    reviewerFilterActive && queue.hasItems && queue.shown.length === 0;
  const isPendingEmpty =
    !reviewerFilterActive &&
    queue.shown.length === 0 &&
    queue.hasItems &&
    queue.activeTab === 'pending_review';
  const isStatusFilteredEmpty =
    !reviewerFilterActive &&
    queue.shown.length === 0 &&
    queue.hasItems &&
    queue.activeTab !== 'pending_review' &&
    queue.activeTab !== 'all';

  // Approval is complete independently of queue reads; its cached detail still owns conversion.
  const detail = queue.linkMissing
    ? selectedParam && renderMissingDetail
      ? renderMissingDetail(selectedParam, () => queue.setSelectedId(null))
      : null
    : !detailOnly &&
        queue.hasError &&
        !retainedPanel &&
        isInList !== false &&
        (queue.permissionDeniedError !== null || !recentlyApproved)
      ? null
      : panelItem
          ? renderDetail(
              buildTaskRequestPanelParts({
                item: panelItem,
                names: retainedPanel?.names ?? queue.names,
                eligibleActors,
                currentActorId: queue.currentActorId,
                currentRole: queue.currentRole,
                // #2530: decisions only for a row of the shown list. The post-decision handoff keeps its own item.
                outsideList:
                  !recentlyApproved &&
                  retainedPanel === null &&
                  (!selectedInQueue || (detailOnly === true && queue.hasError)),
                ...(titleInHeader ? { titleInHeader } : {}),
                recentlyApproved,
                hasNextRequest: queue.hasNextRequest,
                onNextRequest: () => {
                  void queue.goToNextRequest();
                },
                onClose: () => {
                  if (queue.selectedId !== null && isInList !== false && !detailOnly) returnFocus(queue.selectedId);
                  queue.setSelectedId(null);
                },
                onDecisionComplete: completeDecision,
                onReopenRequest: queue.reopenRequest,
                getCompletedFocusTarget: completedFocusTarget,
                onDecisionCloseComplete: clearHandoff,
                decisionRecovery:
                  retainedPanel && (queue.hasError || queue.loadMoreError) ? (
                    <div role="alert">
                      <p>Task 요청 목록을 불러오지 못했습니다</p>
                      <Button
                        type="button"
                        onClick={queue.loadMoreError ? queue.loadMore : queue.refetch}
                      >
                        다시 시도
                      </Button>
                    </div>
                  ) : retainedPanel && queue.selectedId === null ? (
                    <output>Task 요청을 불러오는 중…</output>
                  ) : null,
              }),
              {
                isInList,
                focusRef: listRef,
                retryDetail: !selectedInQueue && panelItem.id === queue.selectedId
                  ? queue.retrySelectedDetail
                  : null,
              },
            )
          : null;

  if (detailOnly) {
    if (queue.linkMissing) return detail;
    if (!detail && queue.retrySelectedDetail && renderDetailError) return renderDetailError(queue.retrySelectedDetail);
    return detail ?? <p className="p-4 text-sm text-text-muted">Task 요청을 불러오는 중…</p>;
  }

  return (
    <>
      <ListShell
        list={
          <>
            <ListToolbar
              tabs={queue.tabs}
              activeTab={queue.activeTab}
              onTabChange={(next) => {
                clearHandoff();
                queue.setActiveTab(next as TaskRequestTab);
              }}
              action={
                showReviewerFilter ? (
                  <Select value={filterValue} onValueChange={applyFilterValue}>
                    <SelectTrigger density="compact" aria-label="검토자 필터" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{RESPONSIBILITY_COPY.allReviewers}</SelectItem>
                      <SelectItem value="me">{RESPONSIBILITY_COPY.mine}</SelectItem>
                      <SelectGroup>
                        <SelectLabel>{RESPONSIBILITY_COPY.modes.actor}</SelectLabel>
                        {eligibleActors.map((actor) => (
                          <SelectItem key={actor.id} value={`actor:${actor.id}`}>
                            {actor.display_name}
                          </SelectItem>
                        ))}
                        {activeReviewer !== undefined &&
                          activeReviewer !== 'me' &&
                          !eligibleActors.some((actor) => actor.id === activeReviewer) && (
                            <SelectItem value={`actor:${activeReviewer}`} disabled>
                              {(activeReviewer &&
                                queue.names.actorsById[activeReviewer]?.display_name) ??
                                GLOSSARY.unknownUser}{' '}
                              · {RESPONSIBILITY_COPY.ineligible}
                            </SelectItem>
                          )}
                      </SelectGroup>
                      {teamCandidateIds.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>{RESPONSIBILITY_COPY.modes.team}</SelectLabel>
                          {teamCandidateIds.map((id) => (
                            <SelectItem key={id} value={`team:${id}`}>
                              {RESPONSIBILITY_COPY.teamMark} ·{' '}
                              {queue.names.teamsById?.[id]?.name ?? `팀 ${shortId(id)}`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                ) : undefined
              }
            />
            <div ref={listRef} role={queueLabel ? 'group' : undefined} aria-label={queueLabel}
              tabIndex={queueLabel ? -1 : undefined} className="flex min-h-0 flex-1 flex-col focus:outline-2 focus:outline-focus-ring focus:-outline-offset-2">
              {queue.isLoading ? (
                <div className="p-4 text-sm text-text-muted">Task 요청을 불러오는 중…</div>
              ) : queue.permissionDeniedError ? (
                <PermissionBlockedPanel
                  layout="card"
                  announceBody
                  state="denied"
                  category="Task Request queue"
                  reason={PERMISSION_BLOCKED_REASONS.taskRequestQueue}
                />
              ) : queue.hasError ? (
                <ListStateMessage
                  variant="error"
                  title="Task 요청 목록을 불러오지 못했습니다"
                  body="잠시 후 다시 시도하세요."
                  action={{ label: '다시 시도', onClick: queue.refetch }}
                />
              ) : (
                <div
                  key={JSON.stringify([context, phase])}
                  ref={listMotion}
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  {queue.shown.map((item) => (
                    <TaskRequestRow
                      key={item.id}
                      item={item}
                      selected={queue.selected?.id === item.id}
                      names={retainedPanel?.names ?? queue.names}
                      onSelect={(id) => {
                        clearHandoff();
                        queue.setSelectedId(id);
                      }}
                      rowRef={(element) => {
                        rowRef(item.id)(element);
                        if (element) element.dataset.requestId = item.id;
                      }}
                    />
                  ))}
                  <ListLoadMore
                    hasMore={queue.hasMore}
                    loadingMore={queue.loadingMore}
                    failed={queue.loadMoreError}
                    onLoadMore={queue.loadMore}
                  />
                  {queue.shown.length === 0 &&
                    !queue.hasMore &&
                    (!retainedPanel || queue.queueSettled) &&
                    (isReviewFilteredEmpty ? (
                      <ListStateMessage
                        variant="filtered"
                        title="현재 조건에 맞는 Task 요청이 없습니다"
                        body={`검토자 필터가 설정되어 있습니다. 선택한 상태: ${activeTabLabel}`}
                        action={{
                          label: '필터 초기화',
                          onClick: () => changeReviewer(undefined, undefined),
                        }}
                      />
                    ) : isPendingEmpty ? (
                      <ListStateMessage
                        variant="filtered"
                        title={TASK_REQUEST_COPY.pendingQueueEmpty}
                        body="다른 상태의 Task 요청이 있습니다."
                      />
                    ) : isStatusFilteredEmpty ? (
                      <ListStateMessage
                        variant="filtered"
                        title="현재 조건에 맞는 Task 요청이 없습니다"
                        body={`선택한 상태: ${activeTabLabel}`}
                        action={{
                          label: '필터 초기화',
                          onClick: () => queue.setActiveTab('pending_review'),
                        }}
                      />
                    ) : (
                      <ListStateMessage
                        variant="empty"
                        title="Task 요청이 없습니다."
                        body="검토 요청이 접수되면 이 목록에 표시됩니다."
                      />
                    ))}
                </div>
              )}
            </div>
          </>
        }
        detailPanel={
          queue.hasError && !retainedPanel ? undefined : queue.linkMissing && !renderMissingDetail ? (
            <LinkTargetMissingNotice message={TASK_REQUEST_LINK_MISSING_MESSAGE} />
          ) : undefined
        }
      />
      {detail}
    </>
  );
}
