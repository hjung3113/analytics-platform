// PermissionRequestsScreen — the requester's 권한 요청 page for the platform bridge (platform ADR-0070 decision 8,
// ADR-0071): send a FeedbackOps capability request, see your own requests with their status, withdraw an open one.
//
// Bridge-safe: no router, no `@/lib/api` barrel, no `lib/auth`, no `sonner`. The toasts go through the host seam.
// Supplement, edit and expiration stay in the standalone app (`OwnerPermissionRequestDialog`).

import { ListStateMessage } from '@/components/ListStateMessage';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import {
  createPermissionRequest,
  fetchPermissionRequestsMine,
  permissionRequestsMineKey,
  withdrawPermissionRequest,
} from '@/lib/api/permission-requests';
import { fetchManagedSystems } from '@/lib/api/registry-reads';
import { ApiError } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { permissionRequestStatusLabel } from '@/lib/copy/enum-labels';
import { PERMISSION_REQUESTS_PAGE_COPY as COPY, HOME_PERMISSION_COPY } from '@/lib/copy/home';
import { formatDate } from '@/lib/format/datetime';
import { useHostSeam } from '@/lib/host/host-seam';
import { CAPABILITIES, type Capability, type MinePermissionRequestRow } from '@fops/shared';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

// `workspace.admin` is never ordinarily requestable (supported-scope policy); the server decides the rest.
const REQUESTABLE_CAPABILITIES = CAPABILITIES.filter((c) => c !== 'workspace.admin');
// `workspace.read` takes no Managed System; `survey.export` takes one or the whole workspace; the others need one.
const NO_MANAGED_SYSTEM: ReadonlySet<string> = new Set<Capability>(['workspace.read']);
const OPTIONAL_MANAGED_SYSTEM: ReadonlySet<string> = new Set<Capability>(['survey.export']);
const WORKSPACE_WIDE = '__workspace__';
const REASON_MAX = 2000;
const OPEN_STATUSES: ReadonlySet<string> = new Set(['pending', 'needs_more_info']);
const LIST_KEY = [...permissionRequestsMineKey, { status: 'all' }] as const;
const SKELETON_KEYS = ['skeleton-0', 'skeleton-1', 'skeleton-2'];

export function PermissionRequestsScreen(): React.ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" data-testid="permission-requests">
      <p className="text-sm text-text-muted">{COPY.notice}</p>
      <NewRequestForm />
      <MyRequests />
    </div>
  );
}

function useManagedSystemsQuery() {
  // Archived ones stay in the list so an old request still shows its system's name; only active ones are offered.
  return useQuery({
    queryKey: ['permission-requests-page', 'managed-systems'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 60_000,
  });
}

function NewRequestForm(): React.ReactElement {
  const { notifyError, notifySuccess } = useHostSeam();
  const queryClient = useQueryClient();
  const managedSystems = useManagedSystemsQuery();
  const [capability, setCapability] = React.useState('');
  const [managedSystemId, setManagedSystemId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);

  const showManagedSystem = capability !== '' && !NO_MANAGED_SYSTEM.has(capability);
  const managedSystemOptional = OPTIONAL_MANAGED_SYSTEM.has(capability);
  const activeSystems = (managedSystems.data?.items ?? []).filter((ms) => ms.archived_at === null);
  const systemMissing = showManagedSystem && !managedSystemOptional && managedSystemId === '';
  const noSystemsAvailable =
    showManagedSystem && !managedSystemOptional && activeSystems.length === 0;
  const trimmedReason = reason.trim();
  const sentManagedSystemId =
    showManagedSystem && managedSystemId !== '' && managedSystemId !== WORKSPACE_WIDE
      ? managedSystemId
      : undefined;
  // A changed request body gets a new key; a retry of the same body reuses it.
  const { key, markConsumed } = useIdempotencyKey(
    `${capability}|${sentManagedSystemId ?? ''}|${trimmedReason}`,
  );

  const mutation = useMutation({
    retry: false,
    mutationFn: () =>
      createPermissionRequest(
        {
          requested_capability: capability,
          ...(sentManagedSystemId !== undefined
            ? { requested_managed_system_id: sentManagedSystemId }
            : {}),
          reason: trimmedReason,
        },
        { idempotencyKey: key },
      ),
    onSuccess: async () => {
      markConsumed();
      notifySuccess(COPY.sent);
      setCapability('');
      setManagedSystemId('');
      setReason('');
      setReasonError(null);
      await queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey });
    },
    onError: (error) => {
      // A 401 already retired the bridge session; the host shows the expiry state, not a toast.
      if (error instanceof ApiError && error.status === 401) return;
      const message = mapUnknownError(error).message;
      if (error instanceof ApiError && error.code === 'validation.sensitive_reason_required') {
        setReasonError(message);
        return;
      }
      notifyError(message);
    },
  });

  const canSubmit =
    capability !== '' &&
    trimmedReason !== '' &&
    reason.length <= REASON_MAX &&
    !systemMissing &&
    !noSystemsAvailable &&
    !mutation.isPending;

  const onCapabilityChange = (next: string) => {
    setCapability(next);
    setManagedSystemId(OPTIONAL_MANAGED_SYSTEM.has(next) ? WORKSPACE_WIDE : '');
  };

  return (
    <section aria-labelledby="permission-request-new-title" className="flex flex-col gap-4">
      <h2 id="permission-request-new-title" className="text-base font-semibold text-text-primary">
        {COPY.newRequest}
      </h2>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          setReasonError(null);
          mutation.mutate();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="permission-request-capability">{COPY.capability}</Label>
          <Select
            value={capability}
            onValueChange={onCapabilityChange}
            disabled={mutation.isPending}
          >
            <SelectTrigger id="permission-request-capability" aria-label={COPY.capability}>
              <SelectValue placeholder={COPY.capabilityPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {REQUESTABLE_CAPABILITIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {getCapabilityDisplayLabel(c)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {showManagedSystem && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="permission-request-managed-system">{COPY.managedSystem}</Label>
            {managedSystems.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : managedSystems.isError ? (
              <p className="text-sm text-text-danger">
                {mapUnknownError(managedSystems.error).message}
              </p>
            ) : (
              <>
                {activeSystems.length === 0 && (
                  <p className="text-sm text-text-muted">{COPY.noManagedSystems}</p>
                )}
                <Select
                  value={managedSystemId}
                  onValueChange={setManagedSystemId}
                  disabled={mutation.isPending}
                >
                  <SelectTrigger
                    id="permission-request-managed-system"
                    aria-label={COPY.managedSystem}
                  >
                    <SelectValue placeholder={COPY.managedSystemPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {managedSystemOptional && (
                        <SelectItem value={WORKSPACE_WIDE}>{COPY.workspaceWide}</SelectItem>
                      )}
                      {activeSystems.map((ms) => (
                        <SelectItem key={ms.id} value={ms.id}>
                          {ms.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="permission-request-reason">{COPY.reasonRequired}</Label>
          <Textarea
            id="permission-request-reason"
            maxLength={REASON_MAX}
            value={reason}
            disabled={mutation.isPending}
            aria-invalid={reasonError !== null}
            aria-describedby={reasonError !== null ? 'permission-request-reason-error' : undefined}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
          />
          {reasonError !== null && (
            <p id="permission-request-reason-error" className="text-xs text-text-danger">
              {reasonError}
            </p>
          )}
        </div>

        <div>
          <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
            {COPY.submit}
          </Button>
        </div>
      </form>
    </section>
  );
}

function MyRequests(): React.ReactElement {
  const { notifyError, notifySuccess } = useHostSeam();
  const queryClient = useQueryClient();
  const managedSystems = useManagedSystemsQuery();
  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ status: 'all', signal }),
    retry: false,
  });
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);

  const refetch = () => queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey });
  const withdraw = useMutation({
    retry: false,
    mutationFn: (row: MinePermissionRequestRow) =>
      withdrawPermissionRequest(row.id, { expected_revision: row.revision }, mintIdempotencyKey()),
    onSuccess: async () => {
      setConfirmingId(null);
      notifySuccess(HOME_PERMISSION_COPY.withdrawn);
      await refetch();
    },
    onError: async (error) => {
      setConfirmingId(null);
      // A 401 already retired the bridge session; the host shows the expiry state, not a toast.
      if (error instanceof ApiError && error.status === 401) return;
      notifyError(
        error instanceof ApiError && error.code === 'conflict.stale_write'
          ? COPY.staleWrite
          : mapUnknownError(error).message,
      );
      await refetch();
    },
  });

  const systemName = (id: string | null): string => {
    if (id === null) return COPY.scopeAll;
    return managedSystems.data?.items.find((ms) => ms.id === id)?.name ?? COPY.unknownManagedSystem;
  };

  return (
    <section aria-labelledby="permission-request-mine-title" className="flex flex-col gap-3">
      <h2 id="permission-request-mine-title" className="text-base font-semibold text-text-primary">
        {HOME_PERMISSION_COPY.title}
      </h2>
      {list.isPending ? (
        <output className="flex flex-col gap-2" aria-label={HOME_PERMISSION_COPY.loading}>
          {SKELETON_KEYS.map((k) => (
            <Skeleton key={k} className="h-16 w-full" />
          ))}
        </output>
      ) : list.isError ? (
        <ListStateMessage
          variant="error"
          title={HOME_PERMISSION_COPY.loadError}
          action={{ label: HOME_PERMISSION_COPY.retry, onClick: () => void list.refetch() }}
        />
      ) : list.data.requests.length === 0 ? (
        <ListStateMessage variant="empty" title={COPY.empty} />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-md border border-border-subtle">
          {list.data.requests.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {getCapabilityDisplayLabel(row.requested_capability)}
                </span>
                <span className="text-xs text-text-secondary">
                  {permissionRequestStatusLabel[row.status]}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                {systemName(row.requested_managed_system_id)} · {formatDate(row.created_at)}
              </p>
              <p className="line-clamp-2 text-sm text-text-primary">{row.reason}</p>
              {row.status === 'needs_more_info' && (
                <p className="text-xs text-text-muted">{COPY.moreInfoHint}</p>
              )}
              {OPEN_STATUSES.has(row.status) &&
                (confirmingId === row.id ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-sm text-text-primary">
                      {HOME_PERMISSION_COPY.withdrawConfirm}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={withdraw.isPending}
                      onClick={() => withdraw.mutate(row)}
                    >
                      {COPY.confirmWithdraw}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={withdraw.isPending}
                      onClick={() => setConfirmingId(null)}
                    >
                      {HOME_PERMISSION_COPY.cancel}
                    </Button>
                  </div>
                ) : (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmingId(row.id)}
                    >
                      {HOME_PERMISSION_COPY.withdraw}
                    </Button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
