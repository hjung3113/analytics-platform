// PermissionRequestsScreen — the requester's 권한 요청 page for the platform bridge (platform ADR-0070 decision 8,
// ADR-0071): send a feature capability request, see your own requests with their status, withdraw an open one.
//
// Bridge-safe: no router, no `@/lib/api` barrel, no `lib/auth`, no `sonner`. The toasts go through the host seam.
// Supplement, edit and expiration stay in the standalone app (`OwnerPermissionRequestDialog`).

import { ListStateMessage } from '@/components/ListStateMessage';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import {
  createPermissionRequest,
  fetchPermissionRequestOwnerDetail,
  fetchPermissionRequestsMine,
  permissionRequestOwnerDetailKey,
  permissionRequestsMineAllKey,
  permissionRequestsMineKey,
  withdrawPermissionRequest,
} from '@/lib/api/permission-requests';
import { fetchManagedSystems } from '@/lib/api/registry-reads';
import { ApiError } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { permissionRequestStatusLabel } from '@/lib/copy/enum-labels';
import { HOME_PERMISSION_COPY } from '@/lib/copy/home';
import { PERMISSION_REQUESTS_PAGE_COPY as COPY } from '@/lib/copy/permission-requests';
import { formatDate } from '@/lib/format/datetime';
import { useHostSeam } from '@/lib/host/host-seam';
import {
  CAPABILITIES,
  type Capability,
  type MinePermissionRequestRow,
  OPEN_PERMISSION_REQUEST_STATUSES,
} from '@ap/feature-shared';
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
} from '@ap/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

// `workspace.admin` is never ordinarily requestable (supported-scope policy); the server decides the rest.
const REQUESTABLE_CAPABILITIES = CAPABILITIES.filter((c) => c !== 'workspace.admin');
// `workspace.read` and the log knowledge catalog capabilities take no Managed System; `survey.export` takes one or the whole workspace; the others need one.
const NO_MANAGED_SYSTEM: ReadonlySet<string> = new Set<Capability>([
  'workspace.read',
  'knowledge.catalog.manage',
  'knowledge.catalog.import',
]);
const OPTIONAL_MANAGED_SYSTEM: ReadonlySet<string> = new Set<Capability>(['survey.export']);
const WORKSPACE_WIDE = '__workspace__';
const REASON_MAX = 2000;
const SKELETON_KEYS = ['skeleton-0', 'skeleton-1', 'skeleton-2'];

export function PermissionRequestsScreen(): React.ReactElement {
  return (
    <div className="flex w-full flex-col gap-6" data-testid="permission-requests">
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
    // One page at the server's cap (500); the default (100) would hide systems past it. More than 500 is backlogged.
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, limit: 500, signal }),
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
  const [capabilityError, setCapabilityError] = React.useState<string | null>(null);
  const [systemError, setSystemError] = React.useState<string | null>(null);
  const capabilityRef = React.useRef<HTMLButtonElement>(null);
  const systemRef = React.useRef<HTMLButtonElement>(null);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);

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
      setCapabilityError(null);
      setSystemError(null);
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

  // A sent request resets the form; focus returns to its first control (the disabled one could not take it earlier).
  const sent = mutation.isSuccess;
  React.useEffect(() => {
    if (sent) capabilityRef.current?.focus();
  }, [sent]);

  const submit = () => {
    const missing = {
      capability: capability === '',
      system: systemMissing || noSystemsAvailable,
      reason: trimmedReason === '',
    };
    setCapabilityError(missing.capability ? COPY.capabilityMissing : null);
    setSystemError(missing.system ? COPY.managedSystemMissing : null);
    setReasonError(missing.reason ? COPY.reasonMissing : null);
    if (missing.capability) capabilityRef.current?.focus();
    else if (missing.system) systemRef.current?.focus();
    else if (missing.reason) reasonRef.current?.focus();
    else mutation.mutate();
  };

  const onCapabilityChange = (next: string) => {
    setCapability(next);
    setCapabilityError(null);
    setSystemError(null);
    setManagedSystemId(OPTIONAL_MANAGED_SYSTEM.has(next) ? WORKSPACE_WIDE : '');
  };

  return (
    <section
      aria-labelledby="permission-request-new-title"
      className="flex max-w-2xl flex-col gap-4"
    >
      <h2 id="permission-request-new-title" className="text-base font-semibold text-text-primary">
        {COPY.newRequest}
      </h2>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (mutation.isPending) return;
          submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="permission-request-capability">{COPY.capability}</Label>
          <Select
            value={capability}
            onValueChange={onCapabilityChange}
            disabled={mutation.isPending}
          >
            <SelectTrigger
              ref={capabilityRef}
              id="permission-request-capability"
              aria-label={COPY.capability}
              aria-invalid={capabilityError !== null}
              aria-describedby={
                capabilityError !== null ? 'permission-request-capability-error' : undefined
              }
            >
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
          {capabilityError !== null && (
            <p
              id="permission-request-capability-error"
              role="alert"
              className="text-xs text-text-danger"
            >
              {capabilityError}
            </p>
          )}
        </div>

        {showManagedSystem && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="permission-request-managed-system">
              {managedSystemOptional ? COPY.managedSystem : COPY.managedSystemRequired}
            </Label>
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
                  onValueChange={(next) => {
                    setManagedSystemId(next);
                    setSystemError(null);
                  }}
                  disabled={mutation.isPending}
                >
                  <SelectTrigger
                    ref={systemRef}
                    id="permission-request-managed-system"
                    aria-label={COPY.managedSystem}
                    aria-invalid={systemError !== null}
                    aria-describedby={
                      systemError !== null ? 'permission-request-managed-system-error' : undefined
                    }
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
                {systemError !== null && (
                  <p
                    id="permission-request-managed-system-error"
                    role="alert"
                    className="text-xs text-text-danger"
                  >
                    {systemError}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="permission-request-reason">{COPY.reasonRequired}</Label>
          <Textarea
            ref={reasonRef}
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
            <p
              id="permission-request-reason-error"
              role="alert"
              className="text-xs text-text-danger"
            >
              {reasonError}
            </p>
          )}
        </div>

        <div>
          <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
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
    queryKey: permissionRequestsMineAllKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ status: 'all', signal }),
    retry: false,
  });
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  // Where focus goes after the next commit: the confirm's 취소, a row's 요청 철회 (else the heading), or the row.
  const [focusTarget, setFocusTarget] = React.useState<
    { kind: 'cancel' } | { kind: 'withdraw' | 'row'; id: string } | null
  >(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const rowRefs = React.useRef(new Map<string, HTMLLIElement>());
  const withdrawRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (focusTarget === null) return;
    setFocusTarget(null);
    if (focusTarget.kind === 'cancel') cancelRef.current?.focus();
    else {
      const map = focusTarget.kind === 'row' ? rowRefs.current : withdrawRefs.current;
      (map.get(focusTarget.id) ?? headingRef.current)?.focus();
    }
  }, [focusTarget]);

  const closeConfirm = (id: string) => {
    setConfirmingId(null);
    setFocusTarget({ kind: 'withdraw', id });
  };

  const refetch = () => queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey });
  const withdraw = useMutation({
    retry: false,
    mutationFn: (row: MinePermissionRequestRow) =>
      withdrawPermissionRequest(row.id, { expected_revision: row.revision }, mintIdempotencyKey()),
    onSuccess: async (_data, row) => {
      notifySuccess(HOME_PERMISSION_COPY.withdrawn);
      await refetch();
      setConfirmingId(null);
      setFocusTarget({ kind: 'row', id: row.id });
    },
    onError: async (error, row) => {
      // A 401 already retired the bridge session; the host shows the expiry state, not a toast.
      if (error instanceof ApiError && error.status === 401) {
        setConfirmingId(null);
        return;
      }
      notifyError(
        error instanceof ApiError && error.code === 'conflict.stale_write'
          ? COPY.staleWrite
          : mapUnknownError(error).message,
      );
      await refetch();
      closeConfirm(row.id);
    },
  });

  const systemName = (id: string | null): string => {
    if (id === null) return COPY.scopeAll;
    return managedSystems.data?.items.find((ms) => ms.id === id)?.name ?? COPY.unknownManagedSystem;
  };

  return (
    <section aria-labelledby="permission-request-mine-title" className="flex flex-col gap-3">
      <h2
        ref={headingRef}
        tabIndex={-1}
        id="permission-request-mine-title"
        className="text-base font-semibold text-text-primary"
      >
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
            <li
              key={row.id}
              ref={(el) => {
                if (el) rowRefs.current.set(row.id, el);
                else rowRefs.current.delete(row.id);
              }}
              tabIndex={-1}
              className="flex flex-col gap-1 px-3 py-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
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
              {row.status === 'needs_more_info' && <MoreInfoNote id={row.id} />}
              {OPEN_PERMISSION_REQUEST_STATUSES.has(row.status) &&
                (confirmingId === row.id ? (
                  // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape bubbles from the confirm buttons inside; the wrapper is not itself interactive
                  <div
                    className="flex flex-wrap items-center gap-2 pt-1"
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape' || withdraw.isPending) return;
                      event.stopPropagation();
                      closeConfirm(row.id);
                    }}
                  >
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
                      ref={cancelRef}
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={withdraw.isPending}
                      onClick={() => closeConfirm(row.id)}
                    >
                      {HOME_PERMISSION_COPY.cancel}
                    </Button>
                  </div>
                ) : (
                  <div className="pt-1">
                    <Button
                      ref={(el) => {
                        if (el) withdrawRefs.current.set(row.id, el);
                        else withdrawRefs.current.delete(row.id);
                      }}
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`${HOME_PERMISSION_COPY.withdraw}: ${getCapabilityDisplayLabel(row.requested_capability)} · ${systemName(row.requested_managed_system_id)}`}
                      onClick={() => {
                        setConfirmingId(row.id);
                        setFocusTarget({ kind: 'cancel' });
                      }}
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

// The latest admin question comes from the owner detail, fetched only for a row that asks for more information.
// While it loads or if it fails, the row shows the hint alone.
function MoreInfoNote({ id }: { id: string }): React.ReactElement {
  const detail = useQuery({
    queryKey: permissionRequestOwnerDetailKey(id),
    queryFn: ({ signal }) => fetchPermissionRequestOwnerDetail(id, signal),
    retry: false,
  });
  const question = detail.data?.latest_admin_question?.note;
  return (
    <>
      {question !== undefined && (
        <p className="text-sm text-text-primary">
          {COPY.adminQuestion}: {question}
        </p>
      )}
      <p className="text-xs text-text-muted">{COPY.moreInfoHint}</p>
    </>
  );
}
