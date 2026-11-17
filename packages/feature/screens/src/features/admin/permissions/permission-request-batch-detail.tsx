import { useQueries } from '@tanstack/react-query';
import { Button } from '@ap/ui';
import type { ReactNode } from 'react';
import type { AdminPermissionRequestRow } from '../../../lib/api/permission-reads';
import { fetchPermissionRequestAdminDetail, permissionRequestAdminDetailKey } from '../../../lib/api/permission-admin';
import type { ClosableDetailParts } from '../../../lib/host/detail-parts';
import { ADMIN_PERMISSIONS_COPY } from '../../../lib/copy/admin-permissions';
import { PERMISSION_GROUP_COPY } from '../../../lib/copy/permission-groups';
import { PermissionRequestDetail } from './permission-request-detail';
import { usePermissionReviewState } from './selected-permission-request-detail';

export function PermissionRequestBatchDetail({ rows, id, managedSystemNames, onClose, renderDetail }: { rows: AdminPermissionRequestRow[]; id: string; managedSystemNames: Record<string, string>; onClose: () => void; renderDetail?: (parts: ClosableDetailParts) => ReactNode }) {
  const reads = useQueries({ queries: rows.map(row => ({ queryKey: permissionRequestAdminDetailKey(row.id), queryFn: ({ signal }: { signal: AbortSignal }) => fetchPermissionRequestAdminDetail(row.id, signal), retry: false, staleTime: 0 })) });
  const failed = reads.some(read => read.isError);
  const items = reads.flatMap(read => read.data ? [read.data] : []);
  const { revisionKey, ...review } = usePermissionReviewState(items);
  if (failed || items.length !== rows.length || reads.some(read => !read.isFetchedAfterMount)) {
    const body = <div><p role={failed ? 'alert' : 'status'}>{failed ? ADMIN_PERMISSIONS_COPY.detailError : ADMIN_PERMISSIONS_COPY.detailLoading}</p>{failed ? <Button onClick={() => { for (const read of reads) void read.refetch(); }}>{ADMIN_PERMISSIONS_COPY.retry}</Button> : null}</div>;
    return renderDetail ? renderDetail({ title: PERMISSION_GROUP_COPY.requestTitle, body, requestClose: onClose }) : body;
  }
  const first = items.find(item => item.status === 'pending' || item.status === 'needs_more_info') ?? items[0];
  if (!first) return null;
  const decidable = items.filter(item => item.status === 'pending' || item.status === 'needs_more_info');
  const commonActions = [...new Set(decidable.flatMap(item => item.allowed_actions))].filter(action => action !== 'approve' || decidable.some(item => item.allowed_actions.includes('approve') && !item.effective_access.decision.allow));
  const request = { ...first, allowed_actions: commonActions };
  return <PermissionRequestDetail key={revisionKey} {...review} request={request} batch={{ id, items }} actorName={first.requester.display_name} managedSystemNames={managedSystemNames} managedSystemName={first.requested_managed_system_id ? managedSystemNames[first.requested_managed_system_id] : undefined} onClose={onClose} {...(renderDetail ? { renderDetail: parts => renderDetail({ ...parts, title: first.permission_group ? PERMISSION_GROUP_COPY.origin(first.permission_group.name) : PERMISSION_GROUP_COPY.count(items.length) }) } : {})} />;
}
