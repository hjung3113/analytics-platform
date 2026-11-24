import { getMilestone } from '../../../../lib/api/milestones';
import { isPermissionDenied } from '../../../../lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '../../../../lib/copy/permission-reasons';
import type { ClosableDetailParts } from '../../../../lib/host/detail-parts';
import { formatRecordDocumentTitle } from '../../../../lib/host/document-title-format';
import { useHostTitle } from '../../../../lib/host/host-seam';
import type { MilestoneDetailDto } from '@ap/feature-shared';
import { DirtyConfirmation, PermissionBlockedPanel } from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { MilestoneDetailContent } from './MilestoneDetailContent';
import { useMilestoneStatusEdit } from './useMilestoneStatusEdit';
import { useMilestoneTitleEdit } from './useMilestoneTitleEdit';
import { MilestoneHeaderActions } from './MilestoneHeaderActions';

// #514 B2d — Milestone detail, as the parts a host places in its own frame
// (`ClosableDetailParts`): the standalone panel and the platform bridge both
// render these. Timeline section is deliberately omitted: Timeline is Slice C
// (TaskGantt). Needs a `HostSeamProvider` and the feature providers.
export interface MilestoneDetailPanelProps {
  milestoneId: string;
  listDenied?: boolean;
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
  listDenied = false,
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
  const error = milestoneQuery.error;
  const denied = listDenied || isPermissionDenied(error);
  const loading = !denied && milestoneQuery.isLoading;
  // Query data can outlive a permission failure. Keep the editor state in this
  // slot, and use only a permitted record for rendering and writes.
  const milestone = !denied && error === null ? milestoneQuery.data : undefined;
  useHostTitle(
    milestone?.id === milestoneId && milestoneQuery.isSuccess && !milestoneQuery.isFetching
      ? formatRecordDocumentTitle({ displayId: milestone.display_id, title: milestone.title })
      : null,
  );
  const titleEdit = useMilestoneTitleEdit(milestoneId, milestone);
  const statusEdit = useMilestoneStatusEdit({ milestone, titleEdit });
  const { titleDirty, discardTitleEdit } = titleEdit;
  React.useLayoutEffect(() => {
    onTitleDirtyChange?.(titleDirty);
    return () => onTitleDirtyChange?.(false);
  }, [titleDirty, onTitleDirtyChange]);

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
        discardTitleEdit();
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
        kind: loading ? 'loading' : denied ? 'denied' : 'error',
      },
      title: 'Milestone',
      body: (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-text-muted">Milestone을 불러오는 중…</div>
            ) : denied ? (
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
    id: milestone.display_id,
    objectTitle: milestone.title,
    title: milestone.display_id,
    headerActions: <MilestoneHeaderActions milestoneId={milestone.id} />,
    body: (
      <>
        <MilestoneDetailContent
          key={milestone.id}
          milestone={milestone}
          scrollRef={scrollRef}
          actorNamesById={actorNamesById}
          managedSystemNamesById={managedSystemNamesById}
          analyticsAreaNamesById={analyticsAreaNamesById}
          titleEdit={titleEdit}
          statusEdit={statusEdit}
        />
        {discardConfirmation}
      </>
    ),
  };
}
