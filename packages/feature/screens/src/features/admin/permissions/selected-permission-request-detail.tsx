import { Button } from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { fetchPermissionRequestAdminDetail } from '../../../lib/api/permission-admin';
import { permissionRequestAdminDetailKey } from '../../../lib/api/permission-requests';
import { ADMIN_PERMISSIONS_COPY } from '../../../lib/copy/admin-permissions';
import type { ClosableDetailParts } from '../../../lib/host/detail-parts';
import { PermissionRequestDetail } from './permission-request-detail';

type ReviewMember = { id: string; revision: number };
export function usePermissionReviewState(members: ReviewMember[]) {
  const revisionKey = members.map(item => `${item.id}:${item.revision}`).sort().join('|');
  const [staleReview, setStaleReview] = React.useState(false);
  const [draft, setDraft] = React.useState<{
    key: string; nonEmpty: boolean; reason: string;
  } | null>(null);
  const [discardedReason, setDiscardedReason] = React.useState<string | null>(null);
  const [ownDecision, setOwnDecision] = React.useState<Record<string, number> | null>(null);
  const onDraftChanged = React.useCallback((next: { revision: number; nonEmpty: boolean; reason: string }) => {
    setDraft({ ...next, key: revisionKey });
  }, [revisionKey]);
  if (draft && draft.key !== revisionKey) {
    // Member queries may settle separately. A member is this panel's own transition when it is unchanged since the
    // draft (still unrefreshed, or closed and never sent) or sits at the exact revision this panel's decision returned.
    const previousMembers = new Set(draft.key.split('|'));
    const ownRevision = ownDecision !== null && members.length === previousMembers.size && members.every(item =>
      previousMembers.has(`${item.id}:${item.revision}`) || ownDecision[item.id] === item.revision);
    if (draft.nonEmpty && !ownRevision) setDiscardedReason(draft.reason);
    setDraft(null);
  }
  return {
    revisionKey,
    ...(staleReview ? { staleNotice: true } : {}),
    ...(discardedReason !== null ? { discardedReason } : {}),
    onDraftChanged,
    onStaleConflict: () => {
      setStaleReview(true);
      if (draft?.nonEmpty) setDiscardedReason(draft.reason);
    },
    onDecisionSucceeded: (result: ReviewMember & { reviewRevisions?: Record<string, number> }) => setOwnDecision(result.reviewRevisions ?? { [result.id]: result.revision }),
    onActionPicked: () => { setStaleReview(false); setDiscardedReason(null); },
  };
}

export function SelectedPermissionRequestDetail({
  id,
  actorNames,
  managedSystemNames,
  onClose,
  renderDetail,
}: {
  id: string;
  actorNames: Record<string, string>;
  managedSystemNames: Record<string, string>;
  onClose: () => void;
  /** Absent = the standalone panel. Present = the host draws the parts in place (the screen stays mounted, so the draft survives). */
  renderDetail?: (parts: ClosableDetailParts) => React.ReactNode;
}) {
  const query = useQuery({
    queryKey: permissionRequestAdminDetailKey(id),
    queryFn: ({ signal }) => fetchPermissionRequestAdminDetail(id, signal),
    retry: false,
    staleTime: 0,
  });
  const detail = query.data;
  const { revisionKey, ...review } = usePermissionReviewState(detail ? [detail] : []);
  if (query.isError || !detail || !query.isFetchedAfterMount) {
    if (renderDetail) {
      return renderDetail({
        title: '권한 요청',
        body: (
          <div className="flex flex-col gap-3" data-testid="permission-request-detail-panel">
            <p role={query.isError ? 'alert' : 'status'}>
              {query.isError
                ? ADMIN_PERMISSIONS_COPY.detailError
                : ADMIN_PERMISSIONS_COPY.detailLoading}
            </p>
            {query.isError ? (
              <Button onClick={() => void query.refetch()}>{ADMIN_PERMISSIONS_COPY.retry}</Button>
            ) : null}
          </div>
        ),
        requestClose: onClose,
      });
    }
    return (
      <aside className="flex flex-col gap-3 p-5" data-testid="permission-request-detail-panel">
        <Button variant="ghost" aria-label="패널 닫기" onClick={onClose}>
          닫기
        </Button>
        <p role={query.isError ? 'alert' : 'status'}>
          {query.isError
            ? ADMIN_PERMISSIONS_COPY.detailError
            : ADMIN_PERMISSIONS_COPY.detailLoading}
        </p>
        {query.isError ? (
          <Button onClick={() => void query.refetch()}>{ADMIN_PERMISSIONS_COPY.retry}</Button>
        ) : null}
      </aside>
    );
  }
  return (
    <PermissionRequestDetail
      key={revisionKey}
      request={detail}
      actorName={detail.requester.display_name || actorNames[detail.requester_actor_id]}
      managedSystemNames={managedSystemNames}
      managedSystemName={
        detail.requested_managed_system_id
          ? managedSystemNames[detail.requested_managed_system_id]
          : undefined
      }
      {...review}
      onClose={onClose}
      {...(renderDetail ? { renderDetail } : {})}
    />
  );
}
