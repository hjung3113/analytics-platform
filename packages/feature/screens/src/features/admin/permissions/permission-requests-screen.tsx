import { FeatureTimestamp } from '../../../components/FeatureTimestamp';
import { PERMISSION_REVIEW_TEXT as COPY } from '../../../lib/copy/admin-permissions';
import { permissionRequestStatusText } from '../../../lib/copy/enum-labels';
import { ListStateMessage } from '../../../components/ListStateMessage';
import { OutlineBadge } from '../../../ui/index';
import { ListShell, ListTabs, type ListToolbarTab, ObjectRow } from '@ap/ui';
import type { ReactNode } from 'react';

import type { AdminPermissionRequestRow } from '../../../lib/api/permission-reads';
import { UNDECLARED_CAPABILITY_LABEL } from '../../../lib/copy/capabilities';
import { requestedScopeTargetLabel } from '../../../lib/copy/permission-scope';
import { formatDateOnly } from '../../../lib/format/datetime';
import type { ClosableDetailParts } from '../../../lib/host/detail-parts';
import { useHostSeam } from '../../../lib/host/host-seam';
import { ReviewCapabilityName } from './declared-capability-name';
import { PermissionRequestBatchDetail } from './permission-request-batch-detail';
import { PERMISSION_GROUP_COPY } from '../../../lib/copy/permission-groups';

import {
  permissionRequestTabs,
} from './permission-requests-search.js';
import { SelectedPermissionRequestDetail } from './selected-permission-request-detail';
import { usePermissionRequestsConsole } from './use-permission-requests-console.js';

const PERMISSION_REQUESTS_PANEL_ID = 'permission-requests-list-panel';

export type PermissionRequestsScreenProps = {
  /** `false` = no first-visible selection (on load or on a tab change); selection comes from the URL only. Default `true`. */
  autoSelect?: boolean;
  /** Absent = the detail fills `ListShell.detailPanel` (standalone). Present = the screen hands its parts here and renders the result in place. */
  renderDetail?: (parts: ClosableDetailParts) => ReactNode;
};

export function PermissionRequestsScreen({
  autoSelect = true,
  renderDetail,
}: PermissionRequestsScreenProps = {}) {
  const { hostOwnsTitle, lang = 'ko' } = useHostSeam();
  const {
    allRequests,
    visibleRequests,
    activeTab,
    selected,
    actorNames,
    managedSystemNames,
    approvalSystemNames,
    systemNamesRead,
    isPending,
    isError,
    handleTabChange,
    handleSelect,
    handleClose,
  } = usePermissionRequestsConsole({ autoSelect });
  // #706 — counts are unknown until the requests read succeeds (covers
  // pending, error, and refetch-after-error without data); unknown must never
  // render as 0 (ListTabs renders badgeCount only when set).
  const countsKnown = !isPending && !isError;
  const tabs: ListToolbarTab[] = permissionRequestTabs.map((tab) => ({
    value: tab.value,
    label: tab.label[lang],
    id: `permission-request-tab-${tab.value}`,
    controlsId: PERMISSION_REQUESTS_PANEL_ID,
    ...(countsKnown
      ? {
          badgeCount:
            tab.value === 'all'
              ? allRequests.length
              : allRequests.filter((request) => request.status === tab.value).length,
        }
      : {}),
  }));

  const detail = selected?.batch_id ? <PermissionRequestBatchDetail key={selected.batch_id} id={selected.batch_id} rows={(selected as AdminPermissionRequestRow & { batchItems: AdminPermissionRequestRow[] }).batchItems} managedSystemNames={managedSystemNames} approvalSystemNames={approvalSystemNames} systemNamesRead={systemNamesRead} onClose={handleClose} {...(renderDetail ? { renderDetail } : {})} /> : selected ? (
    <SelectedPermissionRequestDetail
      key={selected.id}
      id={selected.id}
      actorNames={actorNames}
      managedSystemNames={managedSystemNames}
      approvalSystemNames={approvalSystemNames}
      systemNamesRead={systemNamesRead}
      onClose={handleClose}
      {...(renderDetail ? { renderDetail } : {})}
    />
  ) : undefined;

  const shell = (
    <ListShell
      {...(hostOwnsTitle
        ? {}
        : {
            toolbar: {
              title: COPY.title[lang],
              subtitle: COPY.subtitle[lang],
            },
          })}
      tabs={
        <ListTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(next) => handleTabChange(next as typeof activeTab)}
          ariaLabel={COPY.statuses[lang]}
        />
      }
      list={
        <section
          id={PERMISSION_REQUESTS_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`permission-request-tab-${activeTab}`}
          data-testid="permission-requests-list"
        >
          {isPending ? (
            <p className="p-6 text-sm text-text-muted">{COPY.loading[lang]}</p>
          ) : null}
          {isError ? (
            <p className="p-6 text-sm text-accent-danger">{COPY.error[lang]}</p>
          ) : null}
          {!isPending && !isError && visibleRequests.length === 0 ? (
            <ListStateMessage variant="empty" title={COPY.empty[lang]} />
          ) : null}
          {visibleRequests.map((request) => (
            <PermissionRequestRow
              key={request.id}
              request={request}
              actorName={actorNames[request.requester_actor_id]}
              managedSystemName={
                request.requested_managed_system_id
                  ? managedSystemNames[request.requested_managed_system_id]
                  : undefined
              }
              selected={selected?.id === request.id}
              onSelect={() => handleSelect(request.id)}
            />
          ))}
        </section>
      }
      {...(renderDetail ? {} : { detailPanel: detail })}
    />
  );

  return renderDetail ? (
    <>
      {shell}
      {detail}
    </>
  ) : (
    shell
  );
}

function PermissionRequestRow({
  request,
  actorName,
  managedSystemName,
  selected,
  onSelect,
}: {
  request: AdminPermissionRequestRow;
  actorName?: string | undefined;
  managedSystemName?: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const { lang = 'ko' } = useHostSeam();
  const scopeTarget = requestedScopeTargetLabel(request);
  const requestLabel = request.batch_id
    ? (request.permission_group ? PERMISSION_GROUP_COPY.origin(request.permission_group.name) : PERMISSION_GROUP_COPY.count((request as AdminPermissionRequestRow & { batchItems: AdminPermissionRequestRow[] }).batchItems.length))
    : <ReviewCapabilityName id={request.requested_capability} />;
  return (
    <ObjectRow
      id={COPY.request[lang]}
      title={<>{actorName || COPY.unknownName[lang]} · {requestLabel}</>}
      selected={selected}
      onClick={onSelect}
      badges={
        <>
          <OutlineBadge>{permissionRequestStatusText[request.status][lang]}</OutlineBadge>
          {/* ADR-0157 decision 7: a request for a capability the bundle no longer declares stays listed for rejection. */}
          {request.in_declarations === false ? <OutlineBadge>{UNDECLARED_CAPABILITY_LABEL}</OutlineBadge> : null}
        </>
      }
      meta={
        <>
          {request.batch_id ? <><span>{PERMISSION_GROUP_COPY.count((request as AdminPermissionRequestRow & { batchItems: AdminPermissionRequestRow[] }).batchItems.length)}</span><span>·</span></> : null}
          {request.batch_id && (request.status === 'approved' || request.status === 'rejected') ? <><span>{PERMISSION_GROUP_COPY.outcome((request as AdminPermissionRequestRow & { batchItems: AdminPermissionRequestRow[] }).batchItems.filter(item => item.status === 'approved').length, (request as AdminPermissionRequestRow & { batchItems: AdminPermissionRequestRow[] }).batchItems.filter(item => item.status === 'rejected').length)}</span><span>·</span></> : null}
          <span>
            {scopeTarget ??
              (request.requested_managed_system_id ? (managedSystemName ?? COPY.system[lang]) : COPY.all[lang])}
          </span>
          <span>·</span>
          <FeatureTimestamp at={request.created_at} notation="list" className="tabular-nums break-keep" />
          {request.requested_expiration ? (
            <>
              <span>·</span>
              {/* #590 adds a compact row hint; the prototype shows the full date in detail. */}
              <span>{COPY.expires[lang]} {formatDateOnly(request.requested_expiration.slice(0, 10))}</span>
            </>
          ) : null}
        </>
      }
    />
  );
}
