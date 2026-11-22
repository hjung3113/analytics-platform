// Slice 1 #5: functional Request access button.
//
// Generates a stable `Idempotency-Key` per logical intent — the key is
// memoized against `(capability, managedSystemId, attempt)` so a
// double-click, an in-flight React Query retry, or a Cmd-R after a stalled
// response sends the SAME key. The key is rotated to a new UUIDv4 only when
// a previous submission succeeded (FO ADR-0015:71-90: one key = one intent).
// On success or known-409 conflict the gate's permission-check query and
// the open-requests list query are invalidated so the UI re-renders without
// a manual reload. Other 4xx render an inline error message.
//
// Per AGENTS.md:69 the frontend never enforces backend permissions — this
// component only reacts to server responses.

import { Loader2 } from 'lucide-react';
import {
  Button,
  Callout,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useImeEnterGuard,
  type PermissionBlockedPanelProps,
} from '@ap/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo, useRef, useState } from 'react';

import { mapUnknownError } from '../lib/api/errorMapper';
import { mintIdempotencyKey } from '../lib/api/idempotency';
import {
  type CreatePermissionRequestBody,
  type CreatePermissionRequestSuccess,
  createPermissionRequest,
  fetchPermissionRequestsMine,
  permissionRequestsMineAllKey,
  permissionRequestsMineKey,
} from '../lib/api/permission-requests';
import { permissionRequestProgress } from '../lib/api/permission-request-progress';
import { permissionScopeCandidatesKey } from '../lib/api/permission-scope-candidates';
import { ApiError } from '../lib/api/types';
import { FeatureTimestamp } from './FeatureTimestamp';
import { PermissionScopeTargetFields } from './PermissionScopeTargetFields';
import { permissionCardExitAction } from './permission-card-actions';
import { PERMISSION_REQUEST_FLOW_COPY, PERMISSION_REQUESTS_PAGE_COPY } from '../lib/copy/permission-requests';
import { getCapabilityDisplayLabel } from '../lib/copy/capabilities';
import { GLOSSARY } from '../lib/copy/glossary';
import {
  PERMISSION_SCOPE_COPY,
  type PermissionScopeTargetKind,
  formatPermissionScopeTarget,
} from '../lib/copy/permission-scope';
import { HostLink, useFollowHostHref, useHostPermissionLinks, useHostSeam, type HostSeam } from '../lib/host/host-seam';
import { HostHrefLink } from './HostHrefLink';
import { useManagedSystemNames } from '../lib/cross-system/useManagedSystemNames';
import { permissionCheckQueryKey } from '../lib/cross-system/usePermissionCheckBridge';
import { draftRecord, draftString, useFormDraftAcrossExpiry } from '../lib/session-draft/useFormDraftAcrossExpiry';
import { permissionRequestStatusLabel } from '../lib/copy/enum-labels';

/** A blocked Site or 공정 (ADR-0154 decision 6). A Site target lets the user pick the scope kind. */
export type RequestAccessScopeTarget =
  | { kind: 'site'; site: string }
  | { kind: 'site_room'; site: string; room: string };

export type RequestAccessButtonProps = RequestAccessButtonCommonProps &
  (
    | { capability: string; managedSystemId?: string; scopeTarget?: undefined }
    | { scopeTarget: RequestAccessScopeTarget; capability?: undefined; managedSystemId?: undefined }
  );

interface RequestAccessButtonCommonProps {
  returnRouteIntent: string;
  /** Opt in to the request and exit slots when rendering a blocked card. */
  layout?: PermissionBlockedPanelProps['layout'];
  /** Open the exact target in this dialog and lock any Site or room fields. */
  exactScopeTarget?: boolean;
  onRequestSubmitted?: () => void;
  /** Uses a caller-owned trigger while this component retains the request dialog and flow. */
  renderTrigger?: (open: () => void, panel?: Partial<PermissionBlockedPanelProps>) => ReactNode;
  /** The exact target's open-request state, when supplied by the permission check. */
  pending?: boolean;
  /**
   * Controlled mode (the platform's blocked-place request slot, ADR-0154 decision 6): the caller owns the open state and
   * its own trigger, so no trigger and no wrapper are drawn. Absent = the component owns `open`.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SCOPE_CAPABILITY = 'scope.read';

/** What one submit posted, captured when the POST starts. */
interface PermissionRequestSubmission {
  body: CreatePermissionRequestBody;
  idempotencyKey: string;
  scopeTargetLabel: string | null;
}

/** The user's own requests (내 활동 › 권한 요청); the duplicate message points there. */
const REQUEST_STATUS_ROUTE = '/permission-requests';

const RECOVERABLE_CONFLICT_CODES = new Set([
  'conflict.capability_already_granted',
  'conflict.permission_request_duplicate',
]);

export function RequestAccessButton(props: RequestAccessButtonProps) {
  const { permissionRequestHref } = useHostPermissionLinks();
  const { useAccessRequestState } = useHostSeam();
  if (permissionRequestHref && props.layout === 'card' && props.renderTrigger && props.capability &&
      props.open === undefined && !props.onRequestSubmitted && !props.exactScopeTarget) {
    return <RequestAccessLink key={JSON.stringify([props.capability, props.managedSystemId, props.returnRouteIntent])} {...props} capability={props.capability} renderTrigger={props.renderTrigger} useAccessRequestState={useAccessRequestState} />;
  }
  return <RequestAccessDialog {...props} />;
}

function useOpenRequest(capability: string, managedSystemId: string | undefined, { enabled, pending }: { enabled: boolean; pending?: boolean | undefined }) {
  const open = useQuery({
    queryKey: permissionRequestsMineKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ signal }),
    enabled: enabled && pending === undefined,
    retry: false,
  });
  const hasPending = pending ?? (open.isSuccess && permissionRequestProgress(open.data.requests, capability, managedSystemId) === 'pending');
  const statusKnown = pending !== undefined || (open.isSuccess && !open.isFetching);
  return { open, hasPending, statusKnown };
}

// Link-only hosts retain the original status text and actions through the URL seam.
const useLegacyRequestPresentation: NonNullable<HostSeam['useAccessRequestState']> = (state, { lang }) => {
  const copy = PERMISSION_REQUEST_FLOW_COPY[lang];
  const phase = state.pending ? 'pending' : state.read ?? 'request';
  const href = state.pending ? state.statusHref : state.requestHref;
  const available = href ? 'none' : 'not-requestable';
  const settledStatus = href && state.approvedPartial ? 'approved-partial' : available;
  const requestStatus = state.pending ? 'pending' : state.read ? 'none' : settledStatus;
  const requestLabel = state.approvedPartial ? copy.remaining : copy.request;
  return {
    phase,
    checking: phase === 'checking',
    href,
    requestStatus,
    label: state.pending ? copy.viewMine : requestLabel,
    readMessage: phase === 'checking' ? copy.checkingRequest : copy.requestCheckError,
    showRetry: phase === 'error',
    retryLabel: copy.retry,
    focusProps: {},
    busyProps: {},
    retryProps: { onClick: state.retry },
  };
};

function RequestAccessLink({ capability, managedSystemId, pending, renderTrigger, useAccessRequestState }: RequestAccessButtonCommonProps & {
  capability: string;
  managedSystemId?: string;
  renderTrigger: NonNullable<RequestAccessButtonCommonProps['renderTrigger']>;
  useAccessRequestState: HostSeam['useAccessRequestState'];
}) {
  const { lang = 'ko' } = useHostSeam();
  const { permissionRequestHref, permissionHomeHref } = useHostPermissionLinks();
  const container = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const mine = useQuery({
    queryKey: permissionRequestsMineAllKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ status: 'all', signal }),
    enabled: pending !== true,
    retry: false,
  });
  const { open, hasPending, statusKnown } = useOpenRequest(capability, managedSystemId, { enabled: true, pending });
  const names = useManagedSystemNames({ enabled: managedSystemId !== undefined });
  const system = managedSystemId ? names.get(managedSystemId) : undefined;
  const progress = permissionRequestProgress(
    mine.isSuccess ? mine.data.requests : [], capability, managedSystemId, { pending: hasPending },
  );
  const waiting = (!statusKnown && open.isFetching) || (mine.isFetching && !mine.isSuccess);
  const failed = !statusKnown || mine.isError;
  const read = waiting ? 'checking' : failed ? 'error' : undefined;
  const statusHref = hasPending ? permissionRequestHref?.({}) ?? null : null;
  const requestHref = hasPending || read !== undefined ? undefined : permissionRequestHref?.({
    capability,
    ...(managedSystemId !== undefined ? { managedSystemId } : {}),
  }) ?? null;
  const retry = () => {
    if (!statusKnown) {
      if (open.isFetching) void qc.cancelQueries({ queryKey: permissionRequestsMineKey, exact: true });
      void open.refetch();
    }
    if (mine.isError || (mine.isFetching && !mine.isSuccess)) {
      if (mine.isFetching) void qc.cancelQueries({ queryKey: permissionRequestsMineAllKey, exact: true });
      void mine.refetch();
    }
  };
  const useRequestPresentation = useAccessRequestState ?? useLegacyRequestPresentation;
  const request = useRequestPresentation({
    pending: hasPending,
    statusHref,
    ...(requestHref !== undefined ? { requestHref } : {}),
    ...(read !== undefined ? { read, retry } : {}),
    approvedPartial: progress === 'approved-partial',
  }, { lang, kind: 'link', container });
  const { href } = request;
  const missing = { permission: getCapabilityDisplayLabel(capability), ...(system ? { system } : {}) };
  const follow = useFollowHostHref();
  const followLink = () => { if (href && !follow(href)) window.location.assign(href); };
  let action: ReactNode = null;
  if (request.checking && !useAccessRequestState) {
    action = <span role="status">{request.readMessage}</span>;
  } else if (request.checking) {
    action = <Button type="button" size="sm" variant="primary" {...request.focusProps} {...request.busyProps}>
      <Loader2 className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />{request.label}
    </Button>;
  } else if (request.phase === 'error') {
    action = <>
      <span role="alert">{request.readMessage}</span>
      {request.showRetry && <Button type="button" variant="secondary" size="sm" {...request.focusProps} {...request.retryProps}>{request.retryLabel}</Button>}
    </>;
  } else if (href) {
    action = <Button asChild size="sm" variant={hasPending ? 'secondary' : 'primary'}>
      <HostHrefLink href={href} {...request.focusProps}>{request.label}</HostHrefLink>
    </Button>;
  }
  return <div ref={container} className="contents">{renderTrigger(followLink, {
    lang,
    requestStatus: request.requestStatus,
    missing,
    ...(!useAccessRequestState && hasPending ? { description: PERMISSION_REQUEST_FLOW_COPY[lang].pendingExplanation } : {}),
    ...(useAccessRequestState && request.checking && request.readMessage !== undefined ? { description: request.readMessage, announceBody: true } : {}),
    requestAction: action,
    exitAction: permissionCardExitAction(permissionHomeHref, lang),
  })}</div>;
}

function RequestAccessDialog(props: RequestAccessButtonProps) {
  const ime = useImeEnterGuard();
  const qc = useQueryClient();
  const [ownOpen, setOwnOpen] = useState(false);
  // A recoverable conflict keeps the dialog open and says why: the message, and whether it is the duplicate (links to the status page).
  const [conflict, setConflict] = useState<{ message: string; duplicate: boolean } | null>(null);
  const controlled = props.open !== undefined;
  const card = !controlled && props.layout === 'card' && props.renderTrigger !== undefined;
  const cardHost = useRef<HTMLDivElement>(null);
  const open = controlled ? props.open === true : ownOpen;
  const setOpen = (next: boolean) => {
    setConflict(null);
    if (controlled) props.onOpenChange?.(next);
    else setOwnOpen(next);
  };
  const [reason, setReason] = useState('');
  const [expiration, setExpiration] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { canLink, lang = 'ko' } = useHostSeam();
  const { permissionHomeHref } = useHostPermissionLinks();
  const scopeTarget = props.scopeTarget;
  const capability = scopeTarget ? SCOPE_CAPABILITY : props.capability;
  const needsOpenRequest = card && scopeTarget === undefined && props.pending === undefined;
  const { open: openRequests, hasPending, statusKnown } = useOpenRequest(capability, props.managedSystemId, {
    enabled: needsOpenRequest,
    pending: props.pending,
  });
  const initialScopeKind: PermissionScopeTargetKind | '' =
    scopeTarget?.kind === 'site_room' ? 'site_room' : '';
  const initialScopeRoom = scopeTarget?.kind === 'site_room' ? scopeTarget.room : '';
  const [draftScopeKind, setScopeKind] = useState<PermissionScopeTargetKind | ''>(initialScopeKind);
  const [draftScopeRoom, setScopeRoom] = useState(initialScopeRoom);
  const exactTarget = props.exactScopeTarget ? scopeTarget : undefined;
  const scopeKind = exactTarget?.kind ?? draftScopeKind;
  const scopeRoom = exactTarget ? initialScopeRoom : draftScopeRoom;
  const scopeTargetLabel =
    scopeTarget && scopeKind !== ''
      ? formatPermissionScopeTarget(scopeKind, scopeTarget.site, scopeRoom)
      : null;
  const [submitted, setSubmitted] = useState<{
    id: string;
    status: CreatePermissionRequestSuccess['status'];
    createdAt: string;
    reason: string;
    expiration?: string;
    scopeTargetLabel: string | null;
  } | null>(null);
  // Bumping `attempt` rotates the memoized Idempotency-Key, which we do
  // only after a successful submit (a new logical intent). Concurrent
  // clicks / TanStack Query retries within one intent share the same key.
  const [attempt, setAttempt] = useState(0);

  // Scope summary shows the Managed System name; the raw UUID is only a
  // fallback while the name is unresolved (#1170). Fetched when the dialog
  // opens so a blocked panel mount costs no extra request.
  const managedSystemNames = useManagedSystemNames({ enabled: open && !scopeTarget });
  const managedSystemName = props.managedSystemId
    ? managedSystemNames.get(props.managedSystemId)
    : undefined;

  // Kept across a session expiry (#1887) while the form is open: the typed reason, the chosen expiration and scope choice, per requested permission.
  const { discard: discardDraft } = useFormDraftAcrossExpiry({
    key: scopeTarget
      ? `permission-request:scope:${scopeTarget.site}:${scopeTarget.kind === 'site_room' ? scopeTarget.room : ''}`
      : `permission-request:${capability}:${props.managedSystemId ?? '*'}`,
    active: open,
    read: () =>
      open && submitted === null && (reason !== '' || expiration !== '')
        ? { reason, expiration, scopeKind, scopeRoom }
        : null,
    parse: (value) => {
      const record = draftRecord(value);
      const restoredReason = record === null ? null : draftString(record, 'reason');
      if (record === null || restoredReason === null) return null;
      const kind = draftString(record, 'scopeKind');
      const restoredKind: PermissionScopeTargetKind | null = kind === 'site' || kind === 'site_room' ? kind : null;
      return {
        reason: restoredReason,
        expiration: draftString(record, 'expiration') ?? '',
        scopeKind: restoredKind,
        scopeRoom: draftString(record, 'scopeRoom') ?? '',
      };
    },
    restore: (draft) => {
      setReason(draft.reason);
      setExpiration(draft.expiration);
      if (scopeTarget && !exactTarget && draft.scopeKind !== null) {
        setScopeKind(draft.scopeKind);
        setScopeRoom(draft.scopeRoom);
      }
    },
  });
  const closeDialog = () => {
    discardDraft();
    setOpen(false);
  };

  // The dep list here is an *intent key*, not a value dependency: one
  // Idempotency-Key per logical intent (FO ADR-0015:71-90). Narrowing it to what the
  // callback reads would stop rotating the key when the intent changes, and
  // widening it would rotate mid-intent — either way server-side idempotency
  // reconciliation breaks. The suppression must stay a single line to register.
  const idempotencyKey = useMemo(
    () => mintIdempotencyKey(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the dep list is the intent key (FO ADR-0015:71-90), see above
    [capability, props.managedSystemId, scopeTarget?.site, scopeKind, scopeRoom, attempt],
  );

  // A Site·공정 request refreshes the candidate read (its coverage); a capability request refreshes its check.
  const invalidateCheck = () =>
    scopeTarget
      ? qc.invalidateQueries({ queryKey: permissionScopeCandidatesKey })
      : qc.invalidateQueries({
          queryKey: permissionCheckQueryKey({
            capability,
            ...(props.managedSystemId !== undefined
              ? { managedSystemId: props.managedSystemId }
              : {}),
          }),
        });

  // The submitted body and its labels travel as mutation variables: a field edited while the POST is in flight
  // must change neither the request nor the completion step that names it.
  const mutation = useMutation<CreatePermissionRequestSuccess, unknown, PermissionRequestSubmission>({
    // Disable React Query's silent retries on this mutation — server-side
    // idempotency reconciliation is the only retry path we honor, and the
    // user explicitly clicks again if they want a new attempt.
    retry: false,
    mutationFn: async ({ body, idempotencyKey: key }) => {
      return await createPermissionRequest(body, { idempotencyKey: key });
    },
    onSuccess: async (result, submission) => {
      discardDraft();
      setErrorMessage(null);
      setConflict(null);
      const showReceipt = () => {
        setSubmitted({
          id: result.id,
          status: result.status,
          createdAt: result.created_at,
          reason: submission.body.reason,
          ...(submission.body.requested_expiration
            ? { expiration: submission.body.requested_expiration }
            : {}),
          scopeTargetLabel: submission.scopeTargetLabel,
        });
      };
      if (!card) showReceipt();
      // Successful submit — rotate the key so a future click counts as a
      // new logical intent.
      setAttempt((n) => n + 1);
      await Promise.all([
        invalidateCheck(),
        qc.invalidateQueries({ queryKey: permissionRequestsMineKey }),
      ]);
      // The card's replacement action comes from the refreshed server state.
      if (card) showReceipt();
      props.onRequestSubmitted?.();
    },
    onError: async (err) => {
      if (err instanceof ApiError && RECOVERABLE_CONFLICT_CODES.has(err.envelope.code)) {
        // "The world has moved on": refetch so the gate re-renders with the truth, and tell the user
        // why nothing was created (the dialog stays open).
        setErrorMessage(null);
        const duplicate = err.envelope.code === 'conflict.permission_request_duplicate';
        setConflict({
          message: duplicate
            ? PERMISSION_REQUESTS_PAGE_COPY.duplicateInReview
            : mapUnknownError(err).message,
          duplicate,
        });
        await Promise.all([
          invalidateCheck(),
          qc.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        ]);
        return;
      }
      if (err instanceof ApiError) {
        setErrorMessage(mapUnknownError(err).message);
        return;
      }
      setErrorMessage(mapUnknownError(err).message);
    },
  });

  const dialog = (
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
        <DialogContent data-testid="permission-request-dialog" onCloseAutoFocus={event => {
          if (!card || !submitted) return;
          const current = cardHost.current?.querySelector('[data-request-status]');
          const target = current?.querySelector<HTMLElement>('[data-permission-status-link]')
            ?? current?.querySelector<HTMLElement>('[data-permission-home-link]')
            ?? current?.querySelector<HTMLElement>('h2, h3, h4');
          if (!target) return;
          event.preventDefault();
          if (target.tabIndex < 0) target.tabIndex = -1;
          target.focus();
        }}>
          {submitted ? (
            <>
              <DialogHeader>
                <DialogTitle>권한 요청 완료</DialogTitle>
                <DialogDescription>요청이 접수되어 관리자 검토를 기다립니다.</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-text-muted">요청 ID</dt>
                <dd className="font-mono text-text-primary" data-testid="permission-request-id">
                  {submitted.id}
                </dd>
                {submitted.scopeTargetLabel !== null ? (
                  <>
                    <dt className="text-text-muted">{PERMISSION_SCOPE_COPY.target}</dt>
                    <dd className="text-text-primary">{submitted.scopeTargetLabel}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-text-muted">권한</dt>
                    <dd className="text-text-primary">{getCapabilityDisplayLabel(capability)}</dd>
                    <dt className="text-text-muted">시스템</dt>
                    <dd
                      className={
                        props.managedSystemId && !managedSystemName
                          ? 'font-mono text-text-primary'
                          : 'text-text-primary'
                      }
                    >
                      {props.managedSystemId === undefined
                        ? '전체'
                        : (managedSystemName ?? props.managedSystemId)}
                    </dd>
                  </>
                )}
                <dt className="text-text-muted">사유</dt>
                <dd className="text-text-primary">{submitted.reason}</dd>
                <dt className="text-text-muted">상태</dt>
                <dd className="text-text-primary">
                  {permissionRequestStatusLabel[submitted.status]}
                </dd>
                <dt className="text-text-muted">요청일</dt>
                <dd className="text-text-primary"><FeatureTimestamp at={submitted.createdAt} notation="summary" /></dd>
                {submitted.expiration ? (
                  <>
                    <dt className="text-text-muted">만료일</dt>
                    <dd className="text-text-primary">{submitted.expiration}</dd>
                  </>
                ) : null}
              </dl>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    mutation.reset();
                    setSubmitted(null);
                    setReason('');
                    setExpiration('');
                    setScopeKind(initialScopeKind);
                    setScopeRoom(initialScopeRoom);
                  }}
                >
                  다른 권한 요청
                </Button>
                <Button type="button" onClick={closeDialog}>
                  확인
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>권한 요청</DialogTitle>
                {/* eslint-disable-next-line shadcn/no-restyle -- the multi-clause permission instruction wraps at natural phrase boundaries */}
                <DialogDescription className="text-pretty">
                  권한을 확인하고, 필요한 최소 범위의 사유를 입력하세요.
                </DialogDescription>
              </DialogHeader>
              <form
                onKeyDown={ime.onKeyDown}
                onCompositionStart={ime.onCompositionStart}
                onCompositionEnd={ime.onCompositionEnd}
                className="space-y-3"
                data-testid="permission-request-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (scopeTarget && scopeKind === '') {
                    setErrorMessage(PERMISSION_SCOPE_COPY.kindMissing);
                    return;
                  }
                  if (scopeTarget && scopeKind === 'site_room' && scopeRoom === '') {
                    setErrorMessage(PERMISSION_SCOPE_COPY.roomMissing);
                    return;
                  }
                  if (!reason.trim()) {
                    setErrorMessage('사유는 필수입니다.');
                    return;
                  }
                  setErrorMessage(null);
                  setConflict(null);
                  mutation.mutate({
                    body: {
                      requested_capability: capability,
                      ...(scopeTarget && scopeKind !== ''
                        ? {
                            requested_scope_kind: scopeKind,
                            requested_scope_site: scopeTarget.site,
                            ...(scopeKind === 'site_room' ? { requested_scope_room: scopeRoom } : {}),
                          }
                        : {}),
                      ...(props.managedSystemId !== undefined
                        ? { requested_managed_system_id: props.managedSystemId }
                        : {}),
                      reason: reason.trim(),
                      ...(expiration ? { requested_expiration: `${expiration}T23:59:59.000Z` } : {}),
                      return_route_intent: props.returnRouteIntent,
                    },
                    idempotencyKey,
                    scopeTargetLabel,
                  });
                }}
              >
                {scopeTarget ? (
                  <>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-md border border-border-subtle bg-surface-card p-3 text-sm">
                      <dt className="text-text-muted">{PERMISSION_SCOPE_COPY.target}</dt>
                      <dd className="text-text-primary">{exactTarget ? scopeTargetLabel : `Site ${scopeTarget.site}`}</dd>
                    </dl>
                    {!exactTarget && <div className="space-y-1">
                      <Label htmlFor="permission-request-scope-kind">
                        {PERMISSION_SCOPE_COPY.kind}
                      </Label>
                      <Select
                        value={scopeKind}
                        disabled={mutation.isPending}
                        onValueChange={(next) => {
                          setScopeKind(next as PermissionScopeTargetKind);
                          setErrorMessage(null);
                        }}
                      >
                        <SelectTrigger
                          id="permission-request-scope-kind"
                          aria-label={PERMISSION_SCOPE_COPY.kind}
                        >
                          <SelectValue placeholder={PERMISSION_SCOPE_COPY.kindPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="site">{PERMISSION_SCOPE_COPY.kindSite}</SelectItem>
                            <SelectItem value="site_room">
                              {PERMISSION_SCOPE_COPY.kindSiteRoom}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>}
                    {!exactTarget && scopeKind === 'site_room' ? (
                      <PermissionScopeTargetFields
                        idPrefix="permission-request-scope"
                        mode="request"
                        showSite={false}
                        disabled={mutation.isPending}
                        draft={{ kind: 'site_room', site: scopeTarget.site, room: scopeRoom }}
                        onChange={(next) => {
                          setScopeRoom(next.room);
                          setErrorMessage(null);
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-md border border-border-subtle bg-surface-card p-3 text-sm">
                    <dt className="text-text-muted">권한</dt>
                    <dd className="text-text-primary">
                      {getCapabilityDisplayLabel(capability)}
                    </dd>
                    <dt className="text-text-muted">시스템</dt>
                    <dd
                      className={
                        props.managedSystemId && !managedSystemName
                          ? 'font-mono text-text-primary'
                          : 'text-text-primary'
                      }
                    >
                      {props.managedSystemId === undefined
                        ? '전체'
                        : (managedSystemName ?? props.managedSystemId)}
                    </dd>
                  </dl>
                )}
                <div className="space-y-1">
                  <Label htmlFor="permission-request-reason">사유 · 필수</Label>
                  <Textarea
                    id="permission-request-reason"
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    data-testid="permission-request-reason"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="permission-request-expiration">만료일 · 선택</Label>
                  <DatePicker
                    id="permission-request-expiration"
                    aria-label="만료일 · 선택"
                    value={expiration}
                    onChange={(value) => setExpiration(value ?? '')}
                    data-testid="permission-request-expiration"
                  />
                </div>
                {conflict ? (
                  <div role="status" data-testid="permission-request-conflict">
                    <Callout
                      tone="cyan"
                      action={
                        conflict.duplicate && canLink(REQUEST_STATUS_ROUTE) ? (
                          <HostLink
                            className="whitespace-nowrap text-accent-primary underline underline-offset-2"
                            to={REQUEST_STATUS_ROUTE}
                            onClick={() => setOpen(false)}
                          >
                            {PERMISSION_REQUESTS_PAGE_COPY.duplicateStatusLink}
                          </HostLink>
                        ) : undefined
                      }
                    >
                      {conflict.message}
                    </Callout>
                  </div>
                ) : null}
                {errorMessage ? (
                  <p role="alert" className="text-sm text-accent-danger">
                    {errorMessage}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={closeDialog}>
                    {GLOSSARY.cancel}
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    요청 제출
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
  );

  // Controlled: the caller draws its own entry and owns where the dialog sits (outside any menu).
  if (controlled) return dialog;
  const openDialog = () => {
    if (card) setSubmitted(null);
    setOpen(true);
  };
  let panel: Partial<PermissionBlockedPanelProps> | undefined;
  if (card) {
    const copy = PERMISSION_REQUEST_FLOW_COPY[lang];
    let requestAction: ReactNode = null;
    if (hasPending) {
      if (canLink(REQUEST_STATUS_ROUTE)) {
        requestAction = <Button asChild size="sm" variant="secondary"><HostLink to={REQUEST_STATUS_ROUTE} data-permission-status-link>{copy.viewMine}</HostLink></Button>;
      }
    } else if (needsOpenRequest && !statusKnown && openRequests.isFetching) {
      requestAction = <span role="status">{copy.checkingRequest}</span>;
    } else if (needsOpenRequest && !statusKnown) {
      requestAction = <>
        <span role="alert">{copy.requestCheckError}</span>
        <Button type="button" size="sm" variant="secondary" onClick={() => void openRequests.refetch()}>{copy.retry}</Button>
      </>;
    } else {
      requestAction = <Button type="button" size="sm" variant="primary" onClick={openDialog}>{copy.request}</Button>;
    }
    panel = {
      lang,
      requestStatus: hasPending ? 'pending' : 'none',
      ...(hasPending ? { description: copy.pendingExplanation } : {}),
      missing: { permission: getCapabilityDisplayLabel(capability), ...(managedSystemName ? { system: managedSystemName } : {}) },
      requestAction,
      exitAction: permissionCardExitAction(permissionHomeHref, lang),
    };
  }
  return (
    <div ref={cardHost}>
      {props.renderTrigger !== undefined ? (
        props.renderTrigger(openDialog, panel)
      ) : (
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          권한 요청
        </Button>
      )}
      {dialog}
    </div>
  );
}
