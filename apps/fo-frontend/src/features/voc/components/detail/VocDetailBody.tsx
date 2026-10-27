import { Button, DetailPanelSectionNav, DirtyConfirmation } from '@ap/ui';
import type { VocDetailEnvelope } from '@fops/shared';
import * as React from 'react';

import { CreateFindingModal } from '@/features/cross-system/create-finding/CreateFindingModal';
import { TaskRequestDraftCard } from '@/features/cross-system/request-task/TaskRequestDraftCard';
import type { MeResponse } from '@/lib/api/me';
import { SAME_MANAGED_SYSTEM_VOC_LABEL, VOC_FOLLOW_UP_COPY } from '@/lib/copy/voc';
import { ComposerSection } from './ComposerSection';
import { type ConversationPostSignal, ConversationTimeline } from './ConversationTimeline';
import { DescriptionSection } from './DescriptionSection';
import { VOC_DETAIL_SECTIONS } from './FullDetailView';
import { IdentityMetadataStrip, IdentitySection } from './IdentitySection';
import { LinkedEntityTrailSection, hasVisibleFollowUp } from './LinkedEntityTrailSection';
import { LinkedExecutionSection } from './LinkedExecutionSection';
import { NextActionFooter } from './NextActionFooter';
import { NoFollowUpSection } from './NoFollowUpSection';
import { PublicUpdateReviewModal } from './PublicUpdateReviewModal';
import { SimilarVocSection } from './SimilarVocSection';
import { TriageBlock } from './TriageBlock';
import type { DetailCloseGuard } from './useDetailCloseGuard';
import { useVocDetailPanelController } from './useVocDetailPanelController';

export interface VocDetailBodyProps {
  voc: VocDetailEnvelope;
  vocId: string;
  managedSystemId?: string;
  closeGuard: DetailCloseGuard;
  isReporterOnOwnVoc: boolean;
  canRenderAllowedTask: boolean;
  me: MeResponse | null;
}

/** The VOC detail below its header: section nav, sections, footer and the dialogs. A host places it in its own frame. */
export function VocDetailBody({
  voc,
  vocId,
  managedSystemId,
  closeGuard,
  isReporterOnOwnVoc,
  canRenderAllowedTask,
  me,
}: VocDetailBodyProps): React.ReactElement {
  const { setComposerDirty, dirtyConfirmOpen, confirmClose, cancelClose } = closeGuard;
  const {
    createFindingOpen,
    setCreateFindingOpen,
    requestTaskOpen,
    setRequestTaskOpen,
    reviewOpen,
    setReviewOpen,
    scrollRef,
    actorNamesById,
    analyticsAreasById,
    canTriage,
    noFollowUpScope,
    linkedTask,
    requestTaskIsPending,
    pendingReviewCount,
    canCreateFinding,
    canRequestTask,
    showsSimilarVocSection,
    isReporterArm,
    closeRequestTaskDraft,
    handleRequestTaskSubmit,
    handleSimilarVocSelect,
    canSelectSimilarVoc,
    canOpenTrailNode,
    handleOpenTriage,
    handleOpenTask,
    handleOpenFinding,
    handleOpenCluster,
    handleOpenRequest,
  } = useVocDetailPanelController({
    voc,
    vocId,
    canRenderAllowedTask,
    me,
    ...(managedSystemId !== undefined ? { managedSystemId } : {}),
  });

  // One sequence across all successful posts: the latest post selects its timeline tab.
  const [postSignal, setPostSignal] = React.useState<ConversationPostSignal>({
    tab: 'public',
    seq: 0,
  });

  const detailSections = isReporterArm
    ? VOC_DETAIL_SECTIONS.filter((section) => section.id !== 'triage')
    : showsSimilarVocSection
      ? [
          ...VOC_DETAIL_SECTIONS.slice(0, 4),
          { id: 'similar', label: SAME_MANAGED_SYSTEM_VOC_LABEL, overflow: true },
          ...VOC_DETAIL_SECTIONS.slice(4),
        ]
      : VOC_DETAIL_SECTIONS;

  return (
    <>
      {/* Section nav — sticky anchor tabs (prototype: screen-voc.jsx:191) */}
      <DetailPanelSectionNav sections={detailSections} scrollRef={scrollRef} />

      <div ref={scrollRef} className="flex flex-col flex-1 min-h-0 overflow-y-auto pt-7 px-6 pb-16">
        <div data-anchor="overview">
          <IdentitySection
            voc={voc}
            reporterDisplayName={actorNamesById.get(voc.reporter_id) ?? me?.actor.display_name}
          />
        </div>
        {!isReporterArm && (
          <div data-anchor="triage">
            <TriageBlock
              voc={voc}
              ownerDisplayName={
                voc.owner_user_id != null ? (actorNamesById.get(voc.owner_user_id) ?? null) : null
              }
              analyticsAreaName={
                voc.analytics_area_id != null
                  ? (analyticsAreasById.get(voc.analytics_area_id) ?? null)
                  : null
              }
              canTriage={canTriage}
              onOpenTriage={handleOpenTriage}
            />
          </div>
        )}
        <div data-anchor="description">
          <DescriptionSection voc={voc} isReporterOnOwnVoc={isReporterOnOwnVoc} />
          {/* Managed System and source context remain visible below the body. */}
          <IdentityMetadataStrip voc={voc} />
        </div>
        {!isReporterArm && (
          <NoFollowUpSection
            key={noFollowUpScope}
            vocId={vocId}
            state={voc.follow_up}
            canTriage={canTriage}
            actorNames={actorNamesById}
          />
        )}
        <div data-anchor="trail">
          <LinkedExecutionSection
            voc={voc}
            isReporterContext={!canRenderAllowedTask}
            linkedTask={linkedTask}
          />
          <LinkedEntityTrailSection
            links={voc.links ?? []}
            trails={voc.linked_execution.trails}
            onOpenCluster={handleOpenCluster}
            onOpenRequest={handleOpenRequest}
            isReporterContext={!canRenderAllowedTask}
            onOpenTask={handleOpenTask}
            onOpenFinding={handleOpenFinding}
            canOpen={canOpenTrailNode}
          />
          {requestTaskOpen && (
            <TaskRequestDraftCard
              sourceKind="VOC"
              sourceDisplayId={voc.display_id}
              evidenceSummaryDefault={`VOC ${voc.display_id}: ${voc.title}`}
              isSubmitting={requestTaskIsPending}
              source={{ type: 'voc', id: vocId }}
              onClose={closeRequestTaskDraft}
              onSubmit={handleRequestTaskSubmit}
            />
          )}
        </div>
        {showsSimilarVocSection && (
          <div data-anchor="similar">
            <SimilarVocSection
              similar={voc.similar}
              similarCount={voc.similar_count}
              onSelect={handleSimilarVocSelect}
              canSelect={canSelectSimilarVoc}
            />
          </div>
        )}
        <div data-anchor="conversation">
          <ConversationTimeline
            voc={voc}
            canTriage={canTriage}
            actorNamesById={actorNamesById}
            meActor={me?.actor ?? null}
            postSignal={postSignal}
          />
        </div>
        <div data-anchor="compose">
          <ComposerSection
            voc={voc}
            me={me}
            canTriage={canTriage}
            onDirtyChange={setComposerDirty}
            onConversationPosted={(tab) =>
              setPostSignal((previous) => ({ tab, seq: previous.seq + 1 }))
            }
          />
          {canCreateFinding && pendingReviewCount > 0 && (
            <div className="mt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewOpen(true)}
                data-testid="public-update-review-button"
              >
                리뷰{' '}
                <span className="ml-1 rounded-full bg-surface-row-hover px-1.5 py-0.5 text-xs">
                  {pendingReviewCount}
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <NextActionFooter
        voc={voc}
        {...(canCreateFinding
          ? {
              primaryAction: {
                label: hasVisibleFollowUp(voc, !canRenderAllowedTask)
                  ? VOC_FOLLOW_UP_COPY.showExecution
                  : VOC_FOLLOW_UP_COPY.createFinding,
                onClick: () => {
                  if (hasVisibleFollowUp(voc, !canRenderAllowedTask)) {
                    scrollRef.current?.querySelector('[data-anchor="trail"]')?.scrollIntoView();
                  } else setCreateFindingOpen(true);
                },
              },
            }
          : {})}
        {...(canRequestTask
          ? {
              secondaryAction: {
                label: VOC_FOLLOW_UP_COPY.requestTask,
                onClick: () => setRequestTaskOpen(true),
                testId: 'voc-request-task-button',
              },
            }
          : {})}
      />

      <DirtyConfirmation open={dirtyConfirmOpen} onConfirm={confirmClose} onCancel={cancelClose} />
      <CreateFindingModal
        vocId={vocId}
        managedSystemId={voc.primary_managed_system_id}
        sourceAnalyticsAreaId={voc.analytics_area_id ?? null}
        defaultTitle={voc.title}
        defaultSeverity={voc.severity ?? 'medium'}
        open={createFindingOpen}
        onClose={() => setCreateFindingOpen(false)}
      />
      <PublicUpdateReviewModal voc={voc} open={reviewOpen} onOpenChange={setReviewOpen} />
    </>
  );
}
