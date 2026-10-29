import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { TASK_REQUEST_LINK_MISSING_MESSAGE } from '@/lib/copy/task-requests';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { useHostTitle } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import { shortId } from '@/lib/identity';
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
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { LinkTargetMissingNotice } from '../components/LinkTargetMissingNotice';
import { useEligibleResponsibilityActors } from '../components/ResponsibilityEditor';
import { useCloseFocusReturn } from '../hooks/useCloseFocusReturn';
import {
  type TaskRequestPanelParts,
  buildTaskRequestPanelParts,
} from './task-requests/TaskRequestPanelParts';
import { type NameMaps, TaskRequestRow } from './task-requests/TaskRequestRow';
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
  renderDetail: (parts: TaskRequestPanelParts) => ReactNode;
}

export function TaskRequestsScreen({ autoSelect, renderDetail }: TaskRequestsScreenProps) {
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
      param: undefined,
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
  const retainedPanel =
    !queue.permissionDeniedError &&
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
        setHandoff(null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [queue.permissionDeniedError, handoff]);
  const panelItem = retainedPanel?.item ?? queue.selected;
  const completeDecision = (result: TaskRequestDto) => {
    if (
      document.activeElement?.closest('[role="dialog"]') &&
      queue.selected?.id === result.id &&
      ['approved', 'rejected', 'needs_more_evidence'].includes(result.status)
    ) {
      setHandoff({
        item: queue.selected,
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
    if (!retainedPanel || retainedPanel.result !== result || queue.hasError || queue.isLoading)
      return null;
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
    !queue.isLoading &&
    !queue.hasError &&
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
  // A reviewer filter changes which branch a zero-page takes: the row exists in
  // the scope-wide tab count but is not the viewer's — never call it empty.
  const isReviewFilteredEmpty = reviewerFilterActive && queue.shown.length === 0 && queue.hasItems;
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

  const detail =
    queue.hasError && !retainedPanel
      ? null
      : queue.linkMissing
        ? null
        : panelItem
          ? renderDetail(
              buildTaskRequestPanelParts({
                item: panelItem,
                names: retainedPanel?.names ?? queue.names,
                eligibleActors,
                currentActorId: queue.currentActorId,
                currentRole: queue.currentRole,
                onClose: () => {
                  if (queue.selectedId !== null) returnFocus(queue.selectedId);
                  queue.setSelectedId(null);
                },
                onDecisionComplete: completeDecision,
                onReopenRequest: queue.reopenRequest,
                getCompletedFocusTarget: completedFocusTarget,
                onDecisionCloseComplete: () => setHandoff(null),
                decisionRecovery:
                  retainedPanel && (queue.hasError || queue.loadMoreError) ? (
                    <div role="alert">
                      <p>Task Request 목록을 불러오지 못했습니다</p>
                      <Button
                        type="button"
                        onClick={queue.loadMoreError ? queue.loadMore : queue.refetch}
                      >
                        다시 시도
                      </Button>
                    </div>
                  ) : retainedPanel && queue.selectedId === null ? (
                    <output>Task Request을 불러오는 중…</output>
                  ) : null,
              }),
            )
          : null;

  return (
    <>
      <ListShell
        list={
          <>
            <ListToolbar
              tabs={queue.tabs}
              activeTab={queue.activeTab}
              onTabChange={(next) => {
                setHandoff(null);
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
            <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
              {queue.isLoading ? (
                <div className="p-4 text-sm text-text-muted">Task Request을 불러오는 중…</div>
              ) : queue.permissionDeniedError ? (
                <PermissionBlockedPanel
                  state="denied"
                  category="Task Request queue"
                  reason={PERMISSION_BLOCKED_REASONS.taskRequestQueue}
                  className="m-4"
                />
              ) : queue.hasError ? (
                <ListStateMessage
                  variant="error"
                  title="Task Request 목록을 불러오지 못했습니다"
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
                        setHandoff(null);
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
                        title="현재 조건에 맞는 Task Request가 없습니다"
                        body={`검토자 필터가 설정되어 있습니다. 선택한 상태: ${activeTabLabel}`}
                        action={{
                          label: '필터 초기화',
                          onClick: () => changeReviewer(undefined, undefined),
                        }}
                      />
                    ) : isPendingEmpty ? (
                      <ListStateMessage
                        variant="filtered"
                        title="검토 대기 중인 Task Request가 없습니다"
                        body="다른 상태의 Task Request가 있습니다."
                      />
                    ) : isStatusFilteredEmpty ? (
                      <ListStateMessage
                        variant="filtered"
                        title="현재 조건에 맞는 Task Request가 없습니다"
                        body={`선택한 상태: ${activeTabLabel}`}
                        action={{
                          label: '필터 초기화',
                          onClick: () => queue.setActiveTab('pending_review'),
                        }}
                      />
                    ) : (
                      <ListStateMessage
                        variant="empty"
                        title="Task Request가 없습니다."
                        body="검토 요청이 접수되면 이 목록에 표시됩니다."
                      />
                    ))}
                </div>
              )}
            </div>
          </>
        }
        detailPanel={
          queue.hasError && !retainedPanel ? undefined : queue.linkMissing ? (
            <LinkTargetMissingNotice message={TASK_REQUEST_LINK_MISSING_MESSAGE} />
          ) : undefined
        }
      />
      {detail}
    </>
  );
}
