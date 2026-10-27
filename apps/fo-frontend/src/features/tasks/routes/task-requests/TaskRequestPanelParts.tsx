import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { TASK_REQUEST_REVIEW_DECISION_LABEL } from '@/lib/copy/task-requests';
import type { WorkspaceActor } from '@/lib/cross-system/useWorkspaceActors';
import { formatShortDateTime } from '@/lib/format/datetime';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { useHostSeam } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import type { TaskRequestDto } from '@fops/shared';
import {
  DetailPanelFullscreenContext,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
} from '@fops/ui';
import * as React from 'react';

import { TaskRequestDecisionDialog } from './TaskRequestDecisionDialog';
import { TaskRequestDecisionSection } from './TaskRequestDecisionSection';
import { TaskRequestOutcomeSection } from './TaskRequestOutcomeSection';
import { TaskRequestPropertiesSection } from './TaskRequestPropertiesSection';
import { type NameMaps, TaskRequestBadge } from './TaskRequestRow';
import { TaskRequestSourceSection } from './TaskRequestSourceSection';
import { useTaskRequestDecision } from './useTaskRequestDecision';
import { useTaskRequestPanelController } from './useTaskRequestPanelController';

// ADR-0057 A2 amendment: keep panel navigation in Korean and preserve domain nouns.
export function buildTaskRequestSections(showDecisionSummary: boolean): PanelSection[] {
  return [
    { id: 'overview', label: '요약' },
    showDecisionSummary
      ? { id: 'outcome', label: '결정 요약' }
      : { id: 'decision', label: TASK_REQUEST_REVIEW_DECISION_LABEL },
    { id: 'source', label: '출처' },
    { id: 'properties', label: '속성' },
    { id: 'audit', label: '이력' },
  ];
}

export interface TaskRequestPanelProps {
  item: TaskRequestDto;
  names: NameMaps;
  eligibleActors?: readonly WorkspaceActor[];
  currentActorId: string | null;
  currentRole: string | null;
  onClose: () => void;
  onDecisionComplete?: (item: TaskRequestDto) => void;
  onReopenRequest?: (id: string) => void;
  getCompletedFocusTarget?: (result: TaskRequestDto) => HTMLElement | null;
  onDecisionCloseComplete?: () => void;
  decisionRecovery?: React.ReactNode;
}

/** The Task Request panel as parts a host places in its own chrome (#763 q2); `displayId` is the header's id. */
export type TaskRequestPanelParts = ClosableDetailParts & { displayId: string };

/** The copy-link action; the copy URL is the host's address of the request, so a host without one shows no actions. */
function TaskRequestHeaderActions({ requestId }: { requestId: string }): React.ReactElement | null {
  const { absoluteHref, notifyError, notifySuccess } = useHostSeam();
  const copyUrl =
    absoluteHref?.(searchHref('/tasks', { view: 'requests', param: requestId })) ?? null;
  if (copyUrl === null) return null;
  return (
    <DetailPanelHeaderActions
      entityKind="task"
      entityId={requestId}
      copyUrl={copyUrl}
      notify={{ success: notifySuccess, error: notifyError }}
    />
  );
}

/** Everything under the header: section nav, content and the decision dialog. Its hooks run where the host renders `body`. */
export function TaskRequestPanelBody({
  item,
  names,
  eligibleActors = [],
  currentActorId,
  currentRole,
  onDecisionComplete,
  onReopenRequest,
  getCompletedFocusTarget,
  onDecisionCloseComplete,
  decisionRecovery,
}: TaskRequestPanelProps) {
  const fullscreen = React.useContext(DetailPanelFullscreenContext);
  const decisionHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const requester = names.actorsById[item.requester_actor_id];
  const reviewer = item.reviewer_actor_id ? names.actorsById[item.reviewer_actor_id] : undefined;

  const decision = useTaskRequestDecision({
    item,
    currentActorId,
    currentRole,
    onReopen: onReopenRequest,
  });
  const deliveredDecisionResultRef = React.useRef<TaskRequestDto | null>(null);
  React.useEffect(() => {
    const result = decision.result;
    if (result === null || result === deliveredDecisionResultRef.current) return;
    deliveredDecisionResultRef.current = result;
    if (fullscreen?.expanded) fullscreen.toggle();
    onDecisionComplete?.(result);
  }, [decision.result, onDecisionComplete, fullscreen]);

  const { sourceFindingQuery, conversion, link, resultingTask, taskForOutcome } =
    useTaskRequestPanelController({ item, currentRole });
  const showDecisionSummary = item.status === 'converted' || item.status === 'rejected';
  // Known-team candidates for the conversion form's team picker: the Managed
  // System defaults plus every team the queue context already names (ADR-0067).
  const conversionTeamCandidates = [
    ...new Set(
      [
        names.managedSystemsById[item.primary_managed_system_id]?.defaultReviewerTeamId,
        names.managedSystemsById[item.primary_managed_system_id]?.defaultOwnerTeamId,
        ...Object.keys(names.teamsById ?? {}),
      ].filter((id): id is string => id !== undefined),
    ),
  ];
  const sections = buildTaskRequestSections(showDecisionSummary);

  // Task Request has no impact field; omit the prototype's status-derived row (#585).
  return (
    <>
      <DetailPanelSectionNav sections={sections} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-anchor="overview">
          <PanelTitleBlock
            title={item.requested_outcome}
            badges={
              <>
                <TaskRequestBadge status={item.status} />
                <span className="text-xs text-text-muted">
                  · {GLOSSARY.requestedBy}{' '}
                  <strong className="text-text-secondary">
                    {requester?.display_name ?? GLOSSARY.unknownUser}
                  </strong>
                </span>
                <span className="text-xs text-text-muted">
                  · {formatShortDateTime(item.created_at)}
                </span>
              </>
            }
          />
        </div>

        {showDecisionSummary ? (
          <TaskRequestOutcomeSection
            headingRef={decisionHeadingRef}
            item={item}
            reviewerName={reviewer?.display_name}
            taskForOutcome={taskForOutcome}
          />
        ) : (
          <TaskRequestDecisionSection
            headingRef={decisionHeadingRef}
            names={names}
            resultingTask={resultingTask}
            decision={decision}
            conversion={conversion}
            link={link}
            teamCandidates={conversionTeamCandidates}
            eligibleActors={eligibleActors}
          />
        )}

        <TaskRequestSourceSection item={item} sourceFinding={sourceFindingQuery.data} />

        <TaskRequestPropertiesSection
          item={item}
          names={names}
          reviewer={reviewer}
          {...(conversion.canAssign === undefined ? {} : { canAssign: conversion.canAssign })}
        />

        <section data-anchor="audit" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>이력</PanelSectionTitle>
          <div className="flex flex-col gap-2 border-l border-border-subtle pl-3">
            <div className="text-xs text-text-muted">
              <strong className="text-text-secondary">
                {requester?.display_name ?? GLOSSARY.unknownUser}
              </strong>
              {' · 요청 작성 · '}
              {formatShortDateTime(item.created_at)}
            </div>
            {item.decided_at && (
              <div className="text-xs text-text-muted">
                <strong className="text-text-secondary">
                  {reviewer?.display_name ?? GLOSSARY.unknownUser}
                </strong>
                {' · '}
                {TASK_REQUEST_STATUS_LABELS[item.status]}
                {' · '}
                {formatShortDateTime(item.decided_at)}
              </div>
            )}
          </div>
        </section>
      </div>
      <TaskRequestDecisionDialog
        key={item.id}
        dialog={decision.dialog}
        completedResult={decision.result}
        getCompletedFocusTarget={
          getCompletedFocusTarget ??
          ((result) =>
            result.id === item.id &&
            result.status === item.status &&
            (result.status === 'approved' ||
              result.status === 'rejected' ||
              result.status === 'needs_more_evidence')
              ? decisionHeadingRef.current
              : null)
        }
        {...(onDecisionCloseComplete ? { onCompletedClose: onDecisionCloseComplete } : {})}
        recovery={decisionRecovery}
        request={item}
        isSelfApproval={decision.isSelfApproval}
        isSubmitting={decision.isSubmitting}
        onChange={decision.changeValue}
        onClose={decision.close}
        onSubmit={decision.submitDecision}
      />
    </>
  );
}

export function buildTaskRequestPanelParts(props: TaskRequestPanelProps): TaskRequestPanelParts {
  const { item } = props;
  return {
    displayId: item.display_id,
    title:
      formatRecordDocumentTitle({ displayId: item.display_id, title: item.requested_outcome }) ??
      item.display_id,
    headerActions: <TaskRequestHeaderActions requestId={item.id} />,
    body: <TaskRequestPanelBody key={item.id} {...props} />,
    requestClose: props.onClose,
  };
}

/** The standalone frame: today's `<aside>` with its header around the parts. */
export function TaskRequestPanelFrame({ parts }: { parts: TaskRequestPanelParts }) {
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="task_request"
        id={parts.displayId}
        onClose={parts.requestClose}
        extras={parts.headerActions}
      />
      {parts.body}
    </aside>
  );
}
