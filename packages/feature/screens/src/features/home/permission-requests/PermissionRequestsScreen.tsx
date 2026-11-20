// PermissionRequestsScreen — the requester's 권한 요청 page for the platform bridge (platform ADR-0070 decision 8,
// platform ADR-0071): send a feature capability request, see your own requests with their status, withdraw an open one.
//
// Bridge-safe: no router, no `../../../lib/api` barrel, no `lib/auth`, no `sonner`. The toasts go through the host seam.
// Supplement, edit and expiration stay in the standalone app (`OwnerPermissionRequestDialog`).

import { ListStateMessage } from '../../../components/ListStateMessage';
import { PermissionGroupCatalog } from './PermissionGroupCatalog';
import { PERMISSION_GROUP_COPY } from '../../../lib/copy/permission-groups';
import { submitMoreInfoPermissionRequestBatch } from '../../../lib/api/permission-groups';
import {
  PermissionScopeTargetFields,
  scopeTargetMissing,
} from '../../../components/PermissionScopeTargetFields';
import { mapUnknownError } from '../../../lib/api/errorMapper';
import { mintIdempotencyKey } from '../../../lib/api/idempotency';
import { useMeBridge } from '../../../lib/api/me';
import {
  createPermissionRequest,
  createPermissionRequestBatch,
  fetchPermissionRequestOwnerDetail,
  fetchPermissionRequestsMine,
  permissionRequestOwnerDetailKey,
  permissionRequestsMineAllKey,
  permissionRequestsMineKey,
  withdrawPermissionRequest,
} from '../../../lib/api/permission-requests';
import { permissionScopeCandidatesKey } from '../../../lib/api/permission-scope-candidates';
import { fetchManagedSystems } from '../../../lib/api/registry-reads';
import { ApiError } from '../../../lib/api/types';
import { rejectedPermissionItem } from '../../../lib/api/permission-batch-error';
import { declaredSelectionItem, groupPermissionItems, permissionSelectionItem } from '../../../lib/copy/permission-selection';
import { useIdempotencyKey } from '../../../lib/api/useIdempotencyKey';
import { getCapabilityDisplayLabel } from '../../../lib/copy/capabilities';
import { permissionRequestStatusLabel } from '../../../lib/copy/enum-labels';
import { HOME_PERMISSION_COPY } from '../../../lib/copy/home';
import { PERMISSION_REQUESTS_PAGE_COPY as COPY } from '../../../lib/copy/permission-requests';
import {
  PERMISSION_SCOPE_COPY,
  type PermissionScopeTargetKind,
  requestedScopeTargetLabel,
} from '../../../lib/copy/permission-scope';
import { useDeclaredCapabilities } from '../../../lib/api/declared-capabilities';
import { formatDate } from '../../../lib/format/datetime';
import { managedSystemLabels } from '../../../lib/format/managed-system-label';
import { useHostPermissionRequestReturn, useHostSeam } from '../../../lib/host/host-seam';
import {
  CAPABILITIES,
  type Capability,
  type MinePermissionRequestRow,
  OPEN_PERMISSION_REQUEST_STATUSES,
  PERMISSION_BATCH_MAX_ITEMS,
  grantOpensScreensFor,
  ROLE_LEVEL_VALUES,
  type RoleLevel,
  isDeclaredCapabilityId,
} from '@ap/feature-shared';
import {
  Button,
  GroupedSelectionList,
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

// `workspace.admin` is never ordinarily requestable (supported-scope policy); `validation.catalog.report` is token-only
// (a human session can never use it, so it is not offered); the server decides the rest.
const REQUESTABLE_CAPABILITIES = CAPABILITIES.filter(
  (c) => c !== 'scope.read' && c !== 'workspace.admin' && c !== 'validation.catalog.report',
);
// `workspace.read` and the log knowledge catalog capabilities take no Managed System; `survey.export` takes one or the whole workspace; the others need one.
const NO_MANAGED_SYSTEM: ReadonlySet<string> = new Set<Capability>([
  'workspace.read',
  'knowledge.catalog.manage',
  'knowledge.catalog.import',
  'knowledge.item.publish',
  'knowledge.spec.publish',
  'improvement.manage',
  'lifecycle.project.manage',
  'lifecycle.round.manage',
  'lifecycle.gate.decide',
  'knowledge.draft.create',
  'explorer.source.read',
  'explorer.export',
  'explorer.investigate',
  'explorer.handoff',
  'dataset.manage',
  'dataset.baseline.approve',
  'dataset.suite.run',
  'knowledge.access.manage',
  'eqv.view',
  'eqv.layout.edit',
  'eqv.layout.publish',
  'eqv.rules.edit',
  'eqv.dictionary.global_edit',
  'eqv.mapping.publish',
  'eqv.window.import',
]);
const OPTIONAL_MANAGED_SYSTEM: ReadonlySet<string> = new Set<Capability>(['survey.export']);
const WORKSPACE_WIDE = '__workspace__';
const REASON_MAX = 2000;
const SKELETON_KEYS = ['skeleton-0', 'skeleton-1', 'skeleton-2'];
// The request target kind: a feature capability (today's form) or a Site·공정 `scope.read` target (ADR-0154).
type TargetKind = 'capability' | PermissionScopeTargetKind;
type PermissionRequestsProps = {
  permissionGroup?: string;
  groupLink?: (id: string) => string;
  initialCapability?: string;
  initialManagedSystemId?: string;
  returnTo?: string;
};

export function PermissionRequestsScreen(props: PermissionRequestsProps = {}): React.ReactElement {
  return (
    <div className="flex w-full flex-col gap-6" data-testid="permission-requests">
      <p className="text-sm text-text-muted">{COPY.notice}</p>
      <NewRequestForm key={JSON.stringify([props.initialCapability, props.initialManagedSystemId, props.returnTo])} {...props} />
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

function NewRequestForm({ permissionGroup, groupLink, initialCapability, initialManagedSystemId, returnTo }: PermissionRequestsProps): React.ReactElement {
  const { notifyError, notifySuccess } = useHostSeam();
  const roleLevel = useMeBridge().data?.actor.role_level;
  const isRoleLevel = (value: string | undefined): value is RoleLevel =>
    (ROLE_LEVEL_VALUES as readonly (string | undefined)[]).includes(value);
  const queryClient = useQueryClient();
  const managedSystems = useManagedSystemsQuery();
  const [targetKind, setTargetKind] = React.useState<TargetKind>('capability');
  const [scopeSite, setScopeSite] = React.useState('');
  const [scopeRoom, setScopeRoom] = React.useState('');
  const [scopeError, setScopeError] = React.useState<{ site: string | null; room: string | null }>({
    site: null,
    room: null,
  });
  const scopeSiteRef = React.useRef<HTMLButtonElement>(null);
  const scopeRoomRef = React.useRef<HTMLButtonElement>(null);
  const scopeKind: PermissionScopeTargetKind | null = targetKind === 'capability' ? null : targetKind;
  const isScope = scopeKind !== null;
  const [chosenCapabilities, setCapabilities] = React.useState<string[] | null>(null);
  const requiresScreenRole = (capability: string) =>
    isRoleLevel(roleLevel) && !grantOpensScreensFor(capability, roleLevel);
  const [origin, setOrigin] = React.useState<{ id: string; capabilities: string[] } | null>(null);
  const [selectionVersion, setSelectionVersion] = React.useState(0);
  const [batchError, setBatchError] = React.useState<{ capability: string; message: string } | null>(null);
  const [chosenManagedSystemId, setManagedSystemId] = React.useState<string | null>(null);
  const [requestReturnTo, setRequestReturnTo] = React.useState(returnTo);
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [capabilityError, setCapabilityError] = React.useState<string | null>(null);
  const [systemError, setSystemError] = React.useState<string | null>(null);
  const capabilityRef = React.useRef<HTMLDivElement>(null);
  const systemRef = React.useRef<HTMLButtonElement>(null);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);

  // ADR-0157: the bundle's declared capabilities the reader's Role Level may request, after the platform ones. A declared
  // capability is granted workspace-wide only, so it never asks for a Managed System.
  const declared = useDeclaredCapabilities();
  const requestableDeclared = declared.filter((item) => item.requestable);
  const requestable: string[] = [...REQUESTABLE_CAPABILITIES, ...requestableDeclared.map(item => item.id)];
  const capabilities = chosenCapabilities ?? (initialCapability && requestable.includes(initialCapability) ? [initialCapability] : []);
  const showFindingRoleNote = !isScope && capabilities.some(requiresScreenRole);
  const takesManagedSystem = (capability: string) => !NO_MANAGED_SYSTEM.has(capability) && !isDeclaredCapabilityId(capability);
  // Held exclusions must not erase the group's chosen target or hide its control.
  const systemCapabilities = (origin?.capabilities ?? capabilities).filter(takesManagedSystem);
  const showManagedSystem = !isScope && systemCapabilities.length > 0;
  const managedSystemOptional = systemCapabilities.every(capability => OPTIONAL_MANAGED_SYSTEM.has(capability));
  const overLimit = !isScope && capabilities.length > PERMISSION_BATCH_MAX_ITEMS;
  const activeSystems = (managedSystems.data?.items ?? []).filter((ms) => ms.archived_at === null);
  const systemLabels = managedSystemLabels(activeSystems);
  const initialSystem = managedSystems.isSuccess ? activeSystems.find(ms => ms.id === initialManagedSystemId) : undefined;
  const defaultManagedSystemId = showManagedSystem && managedSystemOptional ? WORKSPACE_WIDE : '';
  const managedSystemId = chosenManagedSystemId ?? initialSystem?.id ?? defaultManagedSystemId;
  const requiresSelectedSystem = !isScope && capabilities.some(capability => takesManagedSystem(capability) && !OPTIONAL_MANAGED_SYSTEM.has(capability));
  const systemMissing = requiresSelectedSystem && (managedSystemId === '' || managedSystemId === WORKSPACE_WIDE);
  const noSystemsAvailable =
    requiresSelectedSystem && activeSystems.length === 0;
  const trimmedReason = reason.trim();
  const requestDetails = { reason: trimmedReason, ...(requestReturnTo ? { return_route_intent: requestReturnTo } : {}) };
  const sentManagedSystemId =
    showManagedSystem && managedSystemId !== '' && managedSystemId !== WORKSPACE_WIDE
      ? managedSystemId
      : undefined;
  // A changed request body gets a new key; a retry of the same body reuses it.
  const { key, markConsumed } = useIdempotencyKey(JSON.stringify(isScope
    ? [targetKind, scopeSite, scopeRoom, requestDetails]
    : [capabilities, sentManagedSystemId, origin?.id, requestDetails]));

  const mutation = useMutation({
    retry: false,
    mutationFn: async (submittedCapabilities: string[]) => {
      const items = submittedCapabilities.map(capability => ({ requested_capability: capability,
        ...(takesManagedSystem(capability) && sentManagedSystemId !== undefined ? { requested_managed_system_id: sentManagedSystemId } : {}) }));
      if (!isScope && (items.length > 1 || origin)) return createPermissionRequestBatch({ items, ...requestDetails, ...(origin ? { permission_group_id: origin.id } : {}) }, { idempotencyKey: key });
      return createPermissionRequest(
        scopeKind !== null
          ? {
              requested_capability: 'scope.read',
              requested_scope_kind: scopeKind,
              requested_scope_site: scopeSite,
              ...(scopeKind === 'site_room' ? { requested_scope_room: scopeRoom } : {}),
              ...requestDetails,
            }
          : {
              ...items[0],
              requested_capability: submittedCapabilities[0] ?? '',
              ...requestDetails,
            },
        { idempotencyKey: key },
      );
    },
    onSuccess: async () => {
      markConsumed();
      notifySuccess(COPY.sent);
      setCapabilities([]);
      setOrigin(null);
      setBatchError(null);
      setManagedSystemId('');
      setRequestReturnTo(undefined);
      setScopeSite('');
      setScopeRoom('');
      setReason('');
      setReasonError(null);
      setCapabilityError(null);
      setSystemError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        queryClient.invalidateQueries({ queryKey: permissionScopeCandidatesKey }),
      ]);
    },
    onError: (error, submittedCapabilities) => {
      // A 401 already retired the bridge session; the host shows the expiry state, not a toast.
      if (error instanceof ApiError && error.status === 401) return;
      const message = mapUnknownError(error).message;
      const rejected = rejectedPermissionItem(error, submittedCapabilities);
      if (rejected !== undefined) {
        setBatchError({ capability: rejected, message });
        return;
      }
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
    if (overLimit) return;
    setBatchError(null);
    if (scopeKind !== null) {
      const scopeMissing = scopeTargetMissing({ kind: scopeKind, site: scopeSite, room: scopeRoom });
      setScopeError({
        site: scopeMissing === 'site' ? PERMISSION_SCOPE_COPY.siteMissing : null,
        room: scopeMissing === 'room' ? PERMISSION_SCOPE_COPY.roomMissing : null,
      });
      setReasonError(trimmedReason === '' ? COPY.reasonMissing : null);
      if (scopeMissing === 'site') scopeSiteRef.current?.focus();
      else if (scopeMissing === 'room') scopeRoomRef.current?.focus();
      else if (trimmedReason === '') reasonRef.current?.focus();
      else mutation.mutate(capabilities);
      return;
    }
    const missing = {
      capability: capabilities.length === 0,
      system: systemMissing || noSystemsAvailable,
      reason: trimmedReason === '',
    };
    setCapabilityError(missing.capability ? COPY.capabilityMissing : null);
    setSystemError(missing.system ? COPY.managedSystemMissing : null);
    setReasonError(missing.reason ? COPY.reasonMissing : null);
    if (missing.capability) capabilityRef.current?.focus();
    else if (missing.system) systemRef.current?.focus();
    else if (missing.reason) reasonRef.current?.focus();
    else mutation.mutate(capabilities);
  };

  const onCapabilityChange = (next: string[]) => {
    if (origin && next.some(capability => !origin.capabilities.includes(capability))) setOrigin(null);
    setCapabilities(next);
    setBatchError(null);
    setCapabilityError(null);
    setSystemError(null);
    const nextSystemCapabilities = next.filter(takesManagedSystem);
    if (nextSystemCapabilities.length > 0 && nextSystemCapabilities.every(capability => OPTIONAL_MANAGED_SYSTEM.has(capability)) && managedSystemId === '') setManagedSystemId(WORKSPACE_WIDE);
    else if (nextSystemCapabilities.some(capability => !OPTIONAL_MANAGED_SYSTEM.has(capability)) && managedSystemId === WORKSPACE_WIDE) setManagedSystemId('');
  };

  return (
    <section
      aria-labelledby="permission-request-new-title"
      className="flex max-w-2xl flex-col gap-4"
    >
      <h2 id="permission-request-new-title" className="text-base font-semibold text-text-primary">
        {COPY.newRequest}
      </h2>
      <PermissionGroupCatalog selected={origin?.id ?? null} selectionVersion={selectionVersion} requestable={requestable}
        {...(sentManagedSystemId ? { managedSystemId: sentManagedSystemId } : {})} {...(permissionGroup ? { linkId: permissionGroup } : {})} {...(groupLink ? { groupLink } : {})}
        disabled={mutation.isPending} onPick={(group, next) => { setTargetKind('capability'); onCapabilityChange(next); setOrigin({ id: group.id, capabilities: group.capabilities }); }} />
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
          <Label htmlFor="permission-request-target-kind">{COPY.targetKind}</Label>
          <Select
            value={targetKind}
            onValueChange={(next) => {
              setTargetKind(next as TargetKind);
              setSelectionVersion(version => version + 1);
              setOrigin(null);
              setBatchError(null);
              setScopeSite('');
              setScopeRoom('');
              setScopeError({ site: null, room: null });
            }}
            disabled={mutation.isPending}
          >
            <SelectTrigger id="permission-request-target-kind" aria-label={COPY.targetKind}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="capability">{PERMISSION_SCOPE_COPY.kindCapability}</SelectItem>
                <SelectItem value="site">{PERMISSION_SCOPE_COPY.kindSite}</SelectItem>
                <SelectItem value="site_room">{PERMISSION_SCOPE_COPY.kindSiteRoom}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {scopeKind !== null && (
          <PermissionScopeTargetFields
            idPrefix="permission-request-scope"
            mode="request"
            draft={{ kind: scopeKind, site: scopeSite, room: scopeRoom }}
            onChange={(next) => {
              setScopeSite(next.site);
              setScopeRoom(next.room);
              setScopeError({ site: null, room: null });
            }}
            disabled={mutation.isPending}
            siteError={scopeError.site}
            roomError={scopeError.room}
            siteRef={scopeSiteRef}
            roomRef={scopeRoomRef}
          />
        )}

        {!isScope && (
          <div className="flex flex-col gap-2">
            <Label id="permission-request-capability-label">{COPY.capability}</Label>
            <div
                ref={capabilityRef}
                id="permission-request-capability"
                tabIndex={-1}
                // Its own bounded scroll region, as in the token drawers: the reason, submit and «내 권한 요청» stay near, and
                // the list's sticky selection header sticks inside this box instead of under the page header.
                className="max-h-[min(28rem,55vh)] overflow-y-auto rounded-md border border-border-subtle px-3 outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-labelledby="permission-request-capability-label"
                aria-invalid={capabilityError !== null}
                aria-describedby={
                  capabilityError !== null ? 'permission-request-capability-error' : undefined
                }
            >
              <GroupedSelectionList mode="multiple" density="compact" selectionSummary="chips"
                aria-label={COPY.listLabel} searchPlaceholder={COPY.search}
                value={capabilities} onChange={next => { if (!mutation.isPending) { setSelectionVersion(version => version + 1); setOrigin(null); onCapabilityChange(next); } }}
                groups={groupPermissionItems([
                  ...REQUESTABLE_CAPABILITIES.map(capability => {
                    const item = permissionSelectionItem(capability);
                    return requiresScreenRole(capability)
                      ? { ...item, capability, description: `${item.description} ${COPY.findingRoleRequired}` }
                      : { ...item, capability };
                  }),
                  ...requestableDeclared.map(item => ({ ...declaredSelectionItem(item.id, declared), capability: item.id as `ext.${string}` })),
                ].map(item => ({ ...item,
                  ...(batchError?.capability === item.id ? { badge: { label: COPY.rejected, tone: 'danger' as const } } : {}),
                })))} />
            </div>
            {overLimit ? <p role="alert" className="text-xs text-text-danger">{COPY.batchLimit(PERMISSION_BATCH_MAX_ITEMS)}</p> : null}
            {batchError ? <p role="alert" className="text-xs text-text-danger">{getCapabilityDisplayLabel(batchError.capability, declared)}: {batchError.message}</p> : null}
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
        )}

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
                          {systemLabels.get(ms.id) ?? ms.name}
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
          {showFindingRoleNote ? (
            <p id="permission-request-finding-role-note" className="mb-2 text-sm text-text-secondary">
              {COPY.findingRoleRequired}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            aria-describedby={showFindingRoleNote ? 'permission-request-finding-role-note' : undefined}
            disabled={mutation.isPending || overLimit}
          >
            {COPY.submit}
          </Button>
        </div>
      </form>
    </section>
  );
}

function MyRequests(): React.ReactElement {
  const { notifyError, notifySuccess } = useHostSeam();
  const resolveReturn = useHostPermissionRequestReturn();
  const declared = useDeclaredCapabilities();
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
          {list.data.requests.map((row) => {
            const returnAction = row.status === 'approved' ? resolveReturn?.(row.return_route_intent) : null;
            return <li
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
                  {requestedScopeTargetLabel(row) ?? getCapabilityDisplayLabel(row.requested_capability, declared)}
                </span>
                <span className="text-xs text-text-secondary">
                  {permissionRequestStatusLabel[row.status]}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                {requestedScopeTargetLabel(row) !== null
                  ? getCapabilityDisplayLabel(row.requested_capability, declared)
                  : systemName(row.requested_managed_system_id)}{' '}
                · {formatDate(row.created_at)}
                {row.permission_group ? ` · ${PERMISSION_GROUP_COPY.origin(row.permission_group.name)}` : null}
              </p>
              <p className="line-clamp-2 text-sm text-text-primary">{row.reason}</p>
              {row.batch_id && row.status === 'needs_more_info' ? <BatchMoreInfo batchId={row.batch_id} rowId={row.id} /> : null}
              {row.status === 'needs_more_info' && <MoreInfoNote id={row.id} batch={Boolean(row.batch_id)} />}
              {returnAction ? (
                <div className="pt-1" data-row-actions="">
                  <Button type="button" variant="secondary" size="sm" onClick={returnAction}>
                    {HOME_PERMISSION_COPY.returnToScreen}
                  </Button>
                </div>
              ) : null}
              {OPEN_PERMISSION_REQUEST_STATUSES.has(row.status) &&
                (confirmingId === row.id ? (
                  // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape bubbles from the confirm buttons inside; the wrapper is not itself interactive
                  <div
                    className="flex flex-wrap items-center gap-2 pt-1"
                    data-row-actions=""
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
                  <div className="pt-1" data-row-actions="">
                    <Button
                      ref={(el) => {
                        if (el) withdrawRefs.current.set(row.id, el);
                        else withdrawRefs.current.delete(row.id);
                      }}
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`${HOME_PERMISSION_COPY.withdraw}: ${requestedScopeTargetLabel(row) ?? `${getCapabilityDisplayLabel(row.requested_capability, declared)} · ${systemName(row.requested_managed_system_id)}`}`}
                      onClick={() => {
                        setConfirmingId(row.id);
                        setFocusTarget({ kind: 'cancel' });
                      }}
                    >
                      {HOME_PERMISSION_COPY.withdraw}
                    </Button>
                  </div>
                ))}
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}

function BatchMoreInfo({ batchId, rowId }: { batchId: string; rowId: string }) {
  const [note, setNote] = React.useState('');
  const client = useQueryClient();
  const { notifySuccess } = useHostSeam();
  const membership = useQuery({ queryKey: [...permissionRequestsMineKey, { status: 'open' }], queryFn: ({ signal }) => fetchPermissionRequestsMine({ signal }), retry: false });
  const rows = (membership.data?.requests ?? []).filter(row => row.batch_id === batchId && row.status === 'needs_more_info');
  const ready = !membership.isFetching && !membership.isError && rows.some(row => row.id === rowId);
  const { key } = useIdempotencyKey(JSON.stringify({ batchId, rows: rows.map(row => [row.id, row.revision]), note }));
  const mutation = useMutation({ mutationFn: () => submitMoreInfoPermissionRequestBatch(batchId, { note: note.trim(), expected_revisions: Object.fromEntries(rows.map(row => [row.id, row.revision])) }, key), onSuccess: async () => { setNote(''); notifySuccess(PERMISSION_GROUP_COPY.answered); await client.invalidateQueries({ queryKey: permissionRequestsMineKey }); await client.invalidateQueries({ queryKey: ['permission-requests'] }); }, onError: async error => { if (error instanceof ApiError && error.code === 'conflict.stale_write') await client.invalidateQueries({ queryKey: permissionRequestsMineKey }); } });
  return <div className="flex flex-col gap-2"><Label htmlFor={`batch-answer-${rowId}`}>{PERMISSION_GROUP_COPY.answer}</Label><Textarea id={`batch-answer-${rowId}`} value={note} maxLength={REASON_MAX} disabled={mutation.isPending} onChange={event => setNote(event.target.value)} /><Button disabled={mutation.isPending || !note.trim() || !ready} onClick={() => { if (ready) mutation.mutate(); }}>{PERMISSION_GROUP_COPY.batchAnswer}</Button>{membership.isError ? <p role="alert">{HOME_PERMISSION_COPY.loadError}<Button onClick={() => void membership.refetch()}>{HOME_PERMISSION_COPY.retry}</Button></p> : null}{mutation.isError ? <p role="alert">{mapUnknownError(mutation.error).message}</p> : null}</div>;
}

// The latest admin question comes from the owner detail, fetched only for a row that asks for more information.
// While it loads or if it fails, the row shows the hint alone.
function MoreInfoNote({ id, batch }: { id: string; batch: boolean }): React.ReactElement {
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
      {!batch ? <p className="text-xs text-text-muted">{COPY.moreInfoHint}</p> : null}
    </>
  );
}
