import { getMilestone } from '@/lib/api/milestones';
import { isPermissionDenied } from '@/lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { useHostTitle } from '@/lib/host/host-seam';
import { DirtyConfirmation, PermissionBlockedPanel } from '@ap/ui';
import type { MilestoneDetailDto } from '@fops/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { MilestoneDetailContent } from './MilestoneDetailContent';
import { MilestoneHeaderActions } from './MilestoneHeaderActions';

// #514 B2d — Milestone detail, as the parts a host places in its own frame
// (`ClosableDetailParts`): the standalone panel and the platform bridge both
// render these. Timeline section is deliberately omitted: Timeline is Slice C
// (TaskGantt). Needs a `HostSeamProvider` and the FeedbackOps providers.
export interface MilestoneDetailPanelProps {
  milestoneId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
  /** R3 — reports whether a title draft is unsaved, so the route can run the
      discard confirmation before a record switch, New milestone, or a URL
      param change replaces the panel. */
  onTitleDirtyChange?: (dirty: boolean) => void;
}

/** Which read state the parts show; the standalone panel picks its header from it. */
export type MilestoneDetailView =
  | { kind: 'loading' | 'denied' | 'error' }
  | { kind: 'ready'; milestone: MilestoneDetailDto };

export type MilestoneDetailParts = ClosableDetailParts & {
  kind: 'detail';
  view: MilestoneDetailView;
};

export function useMilestoneDetailParts({
  milestoneId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
  onTitleDirtyChange,
}: MilestoneDetailPanelProps): MilestoneDetailParts {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const milestoneQuery = useQuery({
    queryKey: ['milestone', milestoneId] as const,
    queryFn: ({ signal }) => getMilestone(milestoneId, signal),
    staleTime: 30 * 1000,
  });
  useHostTitle(
    milestoneQuery.isSuccess &&
      !milestoneQuery.isFetching &&
      milestoneQuery.data?.id === milestoneId
      ? formatRecordDocumentTitle({
          displayId: milestoneQuery.data.display_id,
          title: milestoneQuery.data.title,
        })
      : null,
  );
  const error = milestoneQuery.error;
  // React Query keeps the last success when a refetch fails, and exposes both
  // data and error. A settled read error is the detail permission contract:
  // hide retained identity, record actions, and body. Do not clear the cache.
  const milestone = error == null ? milestoneQuery.data : undefined;

  // B2e fixup — a dirty title edit confirms before the header close discards
  // it (ui-design-system: "Dirty forms warn before close"). Clean, loading,
  // and failed-read states keep closing immediately. R3 — the same dirty
  // state is also reported upward so the route can confirm record switches.
  const [titleDirty, setTitleDirty] = React.useState(false);
  const handleTitleDirtyChange = React.useCallback(
    (dirty: boolean) => {
      setTitleDirty(dirty);
      onTitleDirtyChange?.(dirty);
    },
    [onTitleDirtyChange],
  );
  const [discardTitleOpen, setDiscardTitleOpen] = React.useState(false);

  function requestClose(): void {
    if (titleDirty) {
      setDiscardTitleOpen(true);
      return;
    }
    onClose();
  }

  const discardConfirmation = (
    <DirtyConfirmation
      open={discardTitleOpen}
      onConfirm={() => {
        setDiscardTitleOpen(false);
        setTitleDirty(false);
        onClose();
      }}
      onCancel={() => setDiscardTitleOpen(false)}
    />
  );

  if (milestone === undefined) {
    return {
      kind: 'detail',
      requestClose,
      view: {
        kind: milestoneQuery.isLoading
          ? 'loading'
          : error !== null && isPermissionDenied(error)
            ? 'denied'
            : 'error',
      },
      title: 'Milestone',
      body: (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {milestoneQuery.isLoading ? (
              <div className="p-4 text-sm text-text-muted">Milestone을 불러오는 중…</div>
            ) : error !== null && isPermissionDenied(error) ? (
              <PermissionBlockedPanel
                state="denied"
                category="Milestone 상세"
                reason={PERMISSION_BLOCKED_REASONS.milestoneDetail}
                className="m-4"
              />
            ) : (
              <div className="p-4 text-sm text-accent-danger">
                Milestone 상세를 불러오지 못했습니다.
              </div>
            )}
          </div>
          {discardConfirmation}
        </>
      ),
    };
  }

  return {
    kind: 'detail',
    requestClose,
    view: { kind: 'ready', milestone },
    title: milestone.display_id,
    headerActions: <MilestoneHeaderActions milestoneId={milestone.id} />,
    body: (
      <>
        <MilestoneDetailContent
          // B2e fixup — editor state is per record: the keyed remount drops
          // editingTitle/titleDraft when the selected milestone changes, so a
          // cached destination can never inherit another record's draft.
          key={milestone.id}
          milestone={milestone}
          scrollRef={scrollRef}
          actorNamesById={actorNamesById}
          managedSystemNamesById={managedSystemNamesById}
          analyticsAreaNamesById={analyticsAreaNamesById}
          onTitleDirtyChange={handleTitleDirtyChange}
        />
        {discardConfirmation}
      </>
    ),
  };
}
