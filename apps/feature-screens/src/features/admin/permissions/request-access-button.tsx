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

import {
  Button,
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
} from '@ap/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';

import { mapUnknownError } from '@/lib/api/errorMapper';
import {
  type CreatePermissionRequestBody,
  type CreatePermissionRequestSuccess,
  createPermissionRequest,
  permissionRequestsMineKey,
} from '@/lib/api/permission-requests';
import { permissionScopeCandidatesKey } from '@/lib/api/permission-scope-candidates';
import { ApiError } from '@/lib/api/types';
import { PermissionScopeTargetFields } from '@/components/PermissionScopeTargetFields';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { GLOSSARY } from '@/lib/copy/glossary';
import {
  PERMISSION_SCOPE_COPY,
  type PermissionScopeTargetKind,
  formatPermissionScopeTarget,
} from '@/lib/copy/permission-scope';
import { useManagedSystemNames } from '@/lib/cross-system/useManagedSystemNames';
import { permissionCheckQueryKey } from '@/lib/cross-system/usePermissionCheckBridge';
import { permissionRequestStatusLabel } from './permission-requests-search.js';

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
  onRequestSubmitted?: () => void;
  /** Uses a caller-owned trigger while this component retains the request dialog and flow. */
  renderTrigger?: (open: () => void) => ReactNode;
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

const RECOVERABLE_CONFLICT_CODES = new Set([
  'conflict.capability_already_granted',
  'conflict.permission_request_duplicate',
]);

export function RequestAccessButton(props: RequestAccessButtonProps) {
  const qc = useQueryClient();
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = props.open !== undefined;
  const open = controlled ? props.open === true : ownOpen;
  const setOpen = (next: boolean) => {
    if (controlled) props.onOpenChange?.(next);
    else setOwnOpen(next);
  };
  const [reason, setReason] = useState('');
  const [expiration, setExpiration] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scopeTarget = props.scopeTarget;
  const capability = scopeTarget ? SCOPE_CAPABILITY : props.capability;
  const initialScopeKind: PermissionScopeTargetKind | '' =
    scopeTarget?.kind === 'site_room' ? 'site_room' : '';
  const initialScopeRoom = scopeTarget?.kind === 'site_room' ? scopeTarget.room : '';
  const [scopeKind, setScopeKind] = useState<PermissionScopeTargetKind | ''>(initialScopeKind);
  const [scopeRoom, setScopeRoom] = useState(initialScopeRoom);
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

  // The dep list here is an *intent key*, not a value dependency: one
  // Idempotency-Key per logical intent (FO ADR-0015:71-90). Narrowing it to what the
  // callback reads would stop rotating the key when the intent changes, and
  // widening it would rotate mid-intent — either way server-side idempotency
  // reconciliation breaks. The suppression must stay a single line to register.
  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
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
      setErrorMessage(null);
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
      // Successful submit — rotate the key so a future click counts as a
      // new logical intent.
      setAttempt((n) => n + 1);
      await Promise.all([
        invalidateCheck(),
        qc.invalidateQueries({ queryKey: permissionRequestsMineKey }),
      ]);
      props.onRequestSubmitted?.();
    },
    onError: async (err) => {
      if (err instanceof ApiError && RECOVERABLE_CONFLICT_CODES.has(err.envelope.code)) {
        // Treat as "the world has moved on; recover by refetching." Don't
        // surface an error message; the gate will re-render with the truth.
        setErrorMessage(null);
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="permission-request-dialog">
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
                <dd className="text-text-primary">{submitted.createdAt}</dd>
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
                <Button type="button" onClick={() => setOpen(false)}>
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
                      <dd className="text-text-primary">Site {scopeTarget.site}</dd>
                    </dl>
                    <div className="space-y-1">
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
                    </div>
                    {scopeKind === 'site_room' ? (
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
                {errorMessage ? (
                  <p role="alert" className="text-sm text-accent-danger">
                    {errorMessage}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
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
  return (
    <div>
      {props.renderTrigger !== undefined ? (
        props.renderTrigger(() => setOpen(true))
      ) : (
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          권한 요청
        </Button>
      )}
      {dialog}
    </div>
  );
}
