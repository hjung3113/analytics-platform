import {
  isTokenOnlyCapability,
  CAPABILITIES,
  type PermissionGrantAdminItem,
  type PermissionGrantOptions,
} from '@ap/feature-shared';
import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@ap/ui';
import { GroupedSelectionList } from '@ap/ui';
import { groupPermissionItems, permissionSelectionItem } from '@/lib/copy/permission-selection';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { mapUnknownError } from '@/lib/api/errorMapper';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { useMeBridge } from '@/lib/api/me';
import { fetchPermissionGrantOptions, permissionGrantOptionsKey } from '@/lib/api/permission-admin';
import { ApiError } from '@/lib/api/types';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { SCOPE_SELECTOR_COPY } from '@/lib/copy/managed-system-scope';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { HostLink, useHostSeam } from '@/lib/host/host-seam';
import { shortId } from '@/lib/identity';

import { useDirectPermissionGrant } from './useDirectPermissionGrant.js';

type DirectGrantCandidate = PermissionGrantOptions['candidates'][number];

export type DirectGrantDraft = {
  actorId: string;
  capability: 'voc.read';
  managedSystemId: string | null;
  reason: string;
  expirationDate: string;
};

export type DirectGrantReadFollowUp = {
  actorId: string;
  managedSystemId: string | null;
  reason: string;
  expirationDate: string;
};

const DIRECT_GRANT_COPY = ADMIN_PERMISSIONS_COPY.directGrant;

function candidateKey(candidate: DirectGrantCandidate): string {
  return `${candidate.capability}|${candidate.managed_system_id ?? 'workspace'}`;
}

function actorOptionLabel(actor: {
  display_name: string;
  email: string;
  actor_type: string;
}): string {
  return actor.actor_type === 'system'
    ? `${actor.display_name} · ${DIRECT_GRANT_COPY.systemActorTag}`
    : `${actor.display_name} · ${actor.email}`;
}
function candidateLabel(
  candidate: DirectGrantCandidate,
  managedSystemNames: Record<string, string>,
): string {
  const scope = candidate.managed_system_id
    ? (managedSystemNames[candidate.managed_system_id] ??
      `시스템 · ${shortId(candidate.managed_system_id)}`)
    : SCOPE_SELECTOR_COPY.workspaceAll;
  return `${getCapabilityDisplayLabel(candidate.capability)} · ${scope}`;
}

function toFutureExpiration(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const expiresAt = `${value}T23:59:59.000Z`;
  const timestamp = Date.parse(expiresAt);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value ||
    timestamp <= Date.now()
  ) {
    return undefined;
  }
  return expiresAt;
}

function minimumExpirationDate(): string {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  return Date.parse(`${today}T23:59:59.000Z`) > now
    ? today
    : new Date(now + 86_400_000).toISOString().slice(0, 10);
}

function conflictDestination(
  error: unknown,
): { href: string; label: string; closesDialog: boolean } | null {
  if (!(error instanceof ApiError) || !error.detail) return null;
  if (
    error.code === 'conflict.permission_request_duplicate' &&
    typeof error.detail.review_route === 'string'
  ) {
    return {
      href: error.detail.review_route,
      label: DIRECT_GRANT_COPY.reviewLink,
      closesDialog: false,
    };
  }
  if (
    error.code === 'conflict.capability_already_denied' &&
    typeof error.detail.lift_route === 'string'
  ) {
    return {
      href: error.detail.lift_route,
      label: DIRECT_GRANT_COPY.denyLink,
      closesDialog: true,
    };
  }
  return null;
}

export function PermissionDirectGrantForm({
  open,
  draft,
  selectionContext,
  managedSystemNames,
  activeGrants,
  cacheReturnedGrant,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  draft?: DirectGrantDraft;
  selectionContext: string;
  managedSystemNames: Record<string, string>;
  activeGrants: PermissionGrantAdminItem[];
  cacheReturnedGrant: (item: PermissionGrantAdminItem) => void;
  onOpenChange: (open: boolean) => void;
  onCreated: (
    item: PermissionGrantAdminItem,
    submittedContext: string,
    followUp: DirectGrantReadFollowUp | null,
  ) => void;
}) {
  const actors = useWorkspaceActors({ retry: false });
  const [actorId, setActorId] = React.useState('');
  const [recipientKind, setRecipientKind] = React.useState<'person' | 'system'>('person');
  const [busy, setBusy] = React.useState(false);
  const [seenOpen, setSeenOpen] = React.useState(open);
  const [seenDraft, setSeenDraft] = React.useState(draft);
  if (open !== seenOpen || draft !== seenDraft) {
    setSeenOpen(open);
    setSeenDraft(draft);
    if (!open) {
      setActorId('');
      setRecipientKind('person');
    } else if (draft) setActorId(draft.actorId);
  }
  // #1806: restore a draft recipient's kind from the workspace actor list
  // once the list names its type; a system Actor draft must not reopen as a
  // person. Until then the form claims neither person nor system.
  React.useEffect(() => {
    if (!open || !draft || actorId !== draft.actorId) return;
    const actor = (actors.actors ?? []).find((item) => item.id === draft.actorId);
    if (!actor) return;
    setRecipientKind(actor.actor_type === 'system' ? 'system' : 'person');
  }, [open, draft, actorId, actors.actors]);
  const actorSelectId = React.useId();
  const recipientKindSelectId = React.useId();
  const grantOptionsQuery = useQuery({
    queryKey: permissionGrantOptionsKey(actorId),
    queryFn: ({ signal }) => fetchPermissionGrantOptions(actorId, signal),
    enabled: open && actorId !== '',
    retry: false,
    staleTime: 0,
  });
  const grantOptions =
    open &&
    actorId !== '' &&
    !grantOptionsQuery.isPending &&
    grantOptionsQuery.data?.recipient.id === actorId
      ? grantOptionsQuery.data
      : undefined;
  const optionsUnconfirmed = grantOptionsQuery.isFetching || grantOptionsQuery.isError;
  const recipientActors = (actors.actors ?? []).filter((actor) =>
    recipientKind === 'system'
      ? actor.actor_type === 'system'
      : actor.actor_type !== 'system',
  );
  // Look the recipient up across the whole workspace actor list: a restored
  // draft recipient stays typed and labeled even while its kind filter has
  // not caught up yet.
  const selectedActor = (actors.actors ?? []).find((actor) => actor.id === actorId);

  const prefilledDraft = draft?.actorId === actorId ? draft : undefined;

  React.useEffect(() => {
    if (open) return;
    setBusy(false);
  }, [open]);

  function handleActorChange(nextActorId: string) {
    if (busy || nextActorId === actorId) return;
    setActorId(nextActorId);
  }
  function handleRecipientKindChange(kind: string) {
    if (busy) return;
    const nextKind = kind === 'system' ? 'system' : 'person';
    if (nextKind === recipientKind) return;
    setRecipientKind(nextKind);
    const stillSelectable = (actors.actors ?? []).some(
      (actor) =>
        actor.id === actorId &&
        (nextKind === 'system'
          ? actor.actor_type === 'system'
          : actor.actor_type !== 'system'),
    );
    if (!stillSelectable) setActorId('');
  }

  function retryActors() {
    void actors.refetch();
  }

  function retryGrantOptions() {
    void grantOptionsQuery.refetch();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          className="flex max-h-screen flex-col break-keep"
          closeLabel={DIRECT_GRANT_COPY.cancel}
          data-testid="permission-direct-grant-dialog"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>{DIRECT_GRANT_COPY.title}</DialogTitle>
            <DialogDescription>{DIRECT_GRANT_COPY.description}</DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-col gap-4">
            <label
              className="flex flex-col gap-2 text-sm text-text-secondary"
              htmlFor={recipientKindSelectId}
            >
              {DIRECT_GRANT_COPY.recipientKindLabel}
              <Select
                value={recipientKind}
                onValueChange={handleRecipientKindChange}
                disabled={busy}
              >
                <SelectTrigger
                  id={recipientKindSelectId}
                  aria-label={DIRECT_GRANT_COPY.recipientKindLabel}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="person">
                      {DIRECT_GRANT_COPY.recipientKindPerson}
                    </SelectItem>
                    <SelectItem value="system">
                      {DIRECT_GRANT_COPY.recipientKindSystem}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label
              className="flex flex-col gap-2 text-sm text-text-secondary"
              htmlFor={actorSelectId}
            >
              {DIRECT_GRANT_COPY.actorLabel}
              <Select value={actorId} onValueChange={handleActorChange} disabled={busy}>
                <SelectTrigger id={actorSelectId} aria-label={DIRECT_GRANT_COPY.actorLabel}>
                  <SelectValue placeholder={DIRECT_GRANT_COPY.actorPlaceholder}>
                    {selectedActor ? actorOptionLabel(selectedActor) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {recipientActors.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        {actorOptionLabel(actor)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            {recipientKind === 'system' &&
            !actors.isPending &&
            !actors.isError &&
            recipientActors.length > 0 ? (
              <p
                className="text-xs text-text-muted"
                data-testid="direct-grant-system-actor-note"
              >
                {DIRECT_GRANT_COPY.systemActorNote}
              </p>
            ) : null}
            {actors.isPending ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.actorLoading}</p>
            ) : null}
            {actors.isError ? (
              <div className="flex items-center gap-2 text-xs text-accent-danger">
                <p>{DIRECT_GRANT_COPY.actorError}</p>
                <Button type="button" size="sm" variant="ghost" onClick={retryActors}>
                  {DIRECT_GRANT_COPY.retry}
                </Button>
              </div>
            ) : null}
            {!actors.isPending && !actors.isError && recipientActors.length === 0 ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.actorEmpty}</p>
            ) : null}
            {actorId !== '' && grantOptionsQuery.isPending ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.optionLoading}</p>
            ) : null}
            {actorId !== '' && grantOptionsQuery.isError ? (
              <div className="flex items-center gap-2 text-xs text-accent-danger">
                <p>{DIRECT_GRANT_COPY.optionError}</p>
                <Button type="button" size="sm" variant="ghost" onClick={retryGrantOptions}>
                  {DIRECT_GRANT_COPY.retry}
                </Button>
              </div>
            ) : null}
            {grantOptions && grantOptions.candidates.length === 0 ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.optionEmpty}</p>
            ) : null}
          </div>
          {grantOptions && grantOptions.candidates.length > 0 ? (
            <DirectGrantFields
              key={grantOptions.recipient.id}
              options={grantOptions}
              managedSystemNames={managedSystemNames}
              activeGrants={activeGrants}
              recipientActorType={selectedActor?.actor_type}
              selectionContext={selectionContext}
              optionsUnconfirmed={optionsUnconfirmed}
              cacheReturnedGrant={cacheReturnedGrant}
              onClose={() => onOpenChange(false)}
              onCreated={onCreated}
              onPendingChange={setBusy}
              {...(prefilledDraft
                ? {
                    initialCandidateKey: `voc.read|${prefilledDraft.managedSystemId ?? 'workspace'}`,
                    initialReason: prefilledDraft.reason,
                    initialExpirationDate: prefilledDraft.expirationDate,
                  }
                : {})}
            />
          ) : (
            <DialogFooter className="shrink-0">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                {DIRECT_GRANT_COPY.cancel}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DirectGrantFields({
  options,
  managedSystemNames,
  recipientActorType,
  activeGrants,
  selectionContext,
  optionsUnconfirmed,
  cacheReturnedGrant,
  onClose,
  onCreated,
  onPendingChange,
  initialCandidateKey = '',
  initialReason = '',
  initialExpirationDate = '',
}: {
  options: PermissionGrantOptions;
  managedSystemNames: Record<string, string>;
  /** Known from the workspace actor list; `undefined` while unconfirmed. */
  recipientActorType: 'internal_member' | 'system' | undefined;
  activeGrants: PermissionGrantAdminItem[];
  selectionContext: string;
  optionsUnconfirmed: boolean;
  cacheReturnedGrant: (item: PermissionGrantAdminItem) => void;
  onClose: () => void;
  onCreated: (
    item: PermissionGrantAdminItem,
    submittedContext: string,
    followUp: DirectGrantReadFollowUp | null,
  ) => void;
  onPendingChange: (pending: boolean) => void;
  initialCandidateKey?: string;
  initialReason?: string;
  initialExpirationDate?: string;
}) {
  const me = useMeBridge();
  const { canLink } = useHostSeam();
  const actorId = me.data?.actor.id ?? null;
  const [selectedCandidateKey, setSelectedCandidateKey] = React.useState(initialCandidateKey);
  const [reason, setReason] = React.useState(initialReason);
  const [expirationDate, setExpirationDate] = React.useState(initialExpirationDate);
  const [expirationDraftValid, setExpirationDraftValid] = React.useState(true);
  const [governanceConfirmed, setGovernanceConfirmed] = React.useState(false);
  const [policyCitation, setPolicyCitation] = React.useState('');
  const [peerReviewerAbsence, setPeerReviewerAbsence] = React.useState('');
  const mounted = React.useRef(false);
  const submitting = React.useRef(false);
  const intent = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const reasonId = React.useId();
  const expirationId = React.useId();
  const governanceId = React.useId();
  const policyCitationId = React.useId();
  const peerReviewerAbsenceId = React.useId();
  const mutation = useDirectPermissionGrant(cacheReturnedGrant);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selectedCandidate = options.candidates.find(
    (candidate) => candidateKey(candidate) === selectedCandidateKey,
  );
  // Held = an active (non-expired) grant the screen already loaded for this recipient.
  const heldEntries = options.candidates.flatMap((candidate) => {
    const grant = activeGrants.find(
      (item) =>
        item.actor_id === options.recipient.id &&
        (item.expires_at === null || Date.parse(item.expires_at) > Date.now()) &&
        `${item.capability}|${item.managed_system_id ?? 'workspace'}` === candidateKey(candidate),
    );
    return grant ? [{ grant, candidate }] : [];
  });
  const isSelfGrant = actorId !== null && options.recipient.id === actorId;
  const selfGrantForbidden = isSelfGrant && options.self_policy === 'forbidden';
  const selfPolicyUnconfirmed =
    isSelfGrant && options.self_policy === 'allowed' && !options.self_approval_required;
  const selfEnvelopeRequired = isSelfGrant && options.self_policy === 'allowed';
  const selfEnvelopeReady =
    !selfEnvelopeRequired ||
    (policyCitation.trim().length > 0 && peerReviewerAbsence.trim().length > 0);
  const governanceRequired = selectedCandidate?.governance_required ?? false;
  const expiration = expirationDate === '' ? undefined : toFutureExpiration(expirationDate);
  const expirationInvalid =
    !expirationDraftValid || (expirationDate !== '' && expiration === undefined);
  const expirationReady = expirationDate === '' || expiration !== undefined;
  const preflight = selectedCandidate?.preflight;
  const preflightBlocked = preflight !== undefined && preflight.state !== 'available';
  const readPrerequisite = selectedCandidate?.prerequisites?.find(
    (item) => item.capability === 'voc.read',
  );
  const readDenyLift = options.candidates.find(
    (candidate) =>
      readPrerequisite?.state === 'denied' &&
      candidate.capability === 'voc.read' &&
      candidate.managed_system_id === readPrerequisite.managed_system_id &&
      candidate.preflight.state === 'deny_lift',
  );
  const readDenyLiftRoute =
    readDenyLift?.preflight.state === 'deny_lift'
      ? readDenyLift.preflight.lift_route
      : '/admin/permissions/grants?tab=denies';
  const sessionReady = actorId !== null;
  const reasonReady = reason.trim().length > 0 && reason.trim().length <= 2000;
  const canSubmit =
    sessionReady &&
    reasonReady &&
    expirationReady &&
    selectedCandidate !== undefined &&
    !preflightBlocked &&
    !selfGrantForbidden &&
    !selfPolicyUnconfirmed &&
    selfEnvelopeReady &&
    (!governanceRequired || governanceConfirmed) &&
    !expirationInvalid &&
    !optionsUnconfirmed &&
    !mutation.isPending;
  const submitErrorDestination = conflictDestination(mutation.error);
  const mappedError = mutation.isError ? mapUnknownError(mutation.error).message : null;

  function clearErrorAndUpdate(update: () => void) {
    mutation.reset();
    update();
  }

  function submit() {
    if (!canSubmit || submitting.current || !selectedCandidate) return;
    const body = {
      actor_id: options.recipient.id,
      capability: selectedCandidate.capability,
      ...(selectedCandidate.managed_system_id !== null
        ? { managed_system_id: selectedCandidate.managed_system_id }
        : {}),
      ...(expiration !== undefined ? { expires_at: expiration } : {}),
      reason: reason.trim(),
      ...(selfEnvelopeRequired
        ? {
            self_approval: {
              policy_citation: policyCitation.trim(),
              peer_reviewer_absence: peerReviewerAbsence.trim(),
            },
          }
        : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (intent.current?.fingerprint !== fingerprint) {
      intent.current = { fingerprint, key: mintIdempotencyKey() };
    }
    const idempotencyKey = intent.current.key;
    const submittedContext = selectionContext;
    const readPrerequisite = selectedCandidate.prerequisites?.find(
      (item) => item.capability === 'voc.read',
    );
    const followUp: DirectGrantReadFollowUp | null =
      readPrerequisite?.state === 'missing'
        ? {
            actorId: options.recipient.id,
            managedSystemId: readPrerequisite.managed_system_id,
            reason: reason.trim(),
            expirationDate,
          }
        : null;
    submitting.current = true;
    onPendingChange(true);
    void mutation
      .mutateAsync({ body, idempotencyKey })
      .then((item) => {
        intent.current = null;
        if (mounted.current) onCreated(item, submittedContext, followUp);
      })
      .catch(() => {
        // The draft and its idempotency key remain available for an explicit retry.
      })
      .finally(() => {
        submitting.current = false;
        onPendingChange(false);
      });
  }

  return (
    <>
      <section className="flex min-h-0 flex-col gap-4 overflow-y-auto" data-testid="direct-grant-fields">
        <p className="-mt-2 text-xs text-text-muted" data-testid="direct-grant-recipient">
          {recipientActorType === undefined
            ? // Recipient type not yet confirmed by the workspace actor list:
              // claim neither person nor system.
              options.recipient.display_name
            : recipientActorType === 'system'
              ? `${options.recipient.display_name} · ${DIRECT_GRANT_COPY.systemActorTag}`
              : `${options.recipient.display_name} · ${roleLevelLabel(options.recipient.role_level)}`}
        </p>
        {options.recipient.role_level === 'admin' ? (
          <p className="text-sm text-text-secondary" data-testid="direct-grant-admin-note">
            {DIRECT_GRANT_COPY.adminRoleNote}
          </p>
        ) : null}
        <GroupedSelectionList mode="single" aria-label={DIRECT_GRANT_COPY.optionLabel} searchPlaceholder="권한 이름·설명 검색"
          groups={groupPermissionItems(CAPABILITIES.flatMap(capability => {
            const item = permissionSelectionItem(capability);
            const candidates = options.candidates.filter(candidate => candidate.capability === capability);
            if (candidates.length === 0) return [{ ...item, capability, disabledReason: '이 대상에 부여할 수 없음' }];
            return candidates.map(candidate => ({ ...item, capability, id: candidateKey(candidate), label: candidateLabel(candidate, managedSystemNames),
              ...(heldEntries.some(entry => entry.candidate === candidate) ? { disabledReason: DIRECT_GRANT_COPY.alreadyGranted } : mutation.isPending ? { disabledReason: '부여 중…' } : {}) }));
          }))}
          value={selectedCandidateKey || null} onChange={value => clearErrorAndUpdate(() => {
            setSelectedCandidateKey(value);
            setGovernanceConfirmed(false);
            setPolicyCitation('');
            setPeerReviewerAbsence('');
          })} />
        {selectedCandidate && isTokenOnlyCapability(selectedCandidate.capability) ? (
          <p className="text-xs text-text-secondary" data-testid="direct-grant-token-only-hint">
            {DIRECT_GRANT_COPY.tokenOnlyHint}
          </p>
        ) : null}
        {heldEntries.length > 0 ? (
          <div
            className="flex flex-col gap-1 text-sm text-text-secondary"
            data-testid="direct-grant-held"
          >
            <p>{DIRECT_GRANT_COPY.alreadyGrantedNote}</p>
            {heldEntries.map(({ grant, candidate }) => {
              const to = `/admin/permissions/grants?selected=${grant.id}`;
              return canLink(to) ? (
                <HostLink
                  key={grant.id}
                  className="w-fit text-accent-primary underline underline-offset-2"
                  to={to}
                  onClick={onClose}
                >
                  {candidateLabel(candidate, managedSystemNames)} ·{' '}
                  {DIRECT_GRANT_COPY.alreadyGrantedLink}
                </HostLink>
              ) : null;
            })}
          </div>
        ) : null}
        {selectedCandidate?.preflight.state === 'request_review' ? (
          <div className="flex flex-col gap-1 text-sm text-text-secondary">
            <p>{DIRECT_GRANT_COPY.preflightReview}</p>
            {canLink(selectedCandidate.preflight.review_route) ? (
              <HostLink
                className="w-fit text-accent-primary underline underline-offset-2"
                to={selectedCandidate.preflight.review_route}
              >
                {DIRECT_GRANT_COPY.reviewLink}
              </HostLink>
            ) : null}
          </div>
        ) : null}
        {selectedCandidate?.preflight.state === 'deny_lift' ? (
          <div className="flex flex-col gap-1 text-sm text-text-secondary">
            <p>{DIRECT_GRANT_COPY.preflightDeny}</p>
            {canLink(selectedCandidate.preflight.lift_route) ? (
              <HostLink
                className="w-fit text-accent-primary underline underline-offset-2"
                to={selectedCandidate.preflight.lift_route}
                onClick={onClose}
              >
                {DIRECT_GRANT_COPY.denyLink}
              </HostLink>
            ) : null}
          </div>
        ) : null}
        {readPrerequisite?.state === 'missing' ? (
          <p className="text-sm text-text-secondary">{DIRECT_GRANT_COPY.missingReadPrerequisite}</p>
        ) : null}
        {readPrerequisite?.state === 'denied' ? (
          <div className="flex flex-col gap-1 text-sm text-text-secondary">
            <p>{DIRECT_GRANT_COPY.deniedReadPrerequisite}</p>
            {canLink(readDenyLiftRoute) ? (
              <HostLink
                className="w-fit text-accent-primary underline underline-offset-2"
                to={readDenyLiftRoute}
                onClick={onClose}
              >
                {DIRECT_GRANT_COPY.denyLink}
              </HostLink>
            ) : null}
          </div>
        ) : null}
        <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor={reasonId}>
          {DIRECT_GRANT_COPY.reasonLabel}
          <Textarea
            id={reasonId}
            maxLength={2000}
            value={reason}
            onChange={(event) => clearErrorAndUpdate(() => setReason(event.target.value))}
            placeholder={DIRECT_GRANT_COPY.reasonPlaceholder}
            disabled={mutation.isPending}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor={expirationId}>
          {DIRECT_GRANT_COPY.expirationLabel}
          <DatePicker
            id={expirationId}
            aria-label={DIRECT_GRANT_COPY.expirationLabel}
            value={expirationDate}
            onChange={(value) => clearErrorAndUpdate(() => setExpirationDate(value ?? ''))}
            onValidityChange={setExpirationDraftValid}
            min={minimumExpirationDate()}
            showValidation={expirationInvalid}
            aria-invalid={expirationInvalid}
            disabled={mutation.isPending}
          />
          <span className="text-xs text-text-muted">{DIRECT_GRANT_COPY.expirationHelp}</span>
          <span className="text-xs text-text-muted">{DIRECT_GRANT_COPY.reissueHelp}</span>
        </label>
        {governanceRequired ? (
          <section className="flex flex-col gap-3 rounded-md border border-border-selected bg-surface-field p-3">
            <p className="text-xs leading-5 text-text-secondary">
              {DIRECT_GRANT_COPY.governanceDescription}
            </p>
            <div className="flex items-start gap-2 text-sm text-text-secondary">
              <Checkbox
                id={governanceId}
                checked={governanceConfirmed}
                onCheckedChange={(checked) =>
                  clearErrorAndUpdate(() => setGovernanceConfirmed(checked === true))
                }
                disabled={mutation.isPending}
              />
              <label htmlFor={governanceId} className="cursor-pointer">
                {DIRECT_GRANT_COPY.governanceConfirm}
              </label>
            </div>
          </section>
        ) : null}
        {selfGrantForbidden ? (
          <p className="text-sm text-accent-danger">{DIRECT_GRANT_COPY.selfForbidden}</p>
        ) : null}
        {selfPolicyUnconfirmed ? (
          <p className="text-sm text-accent-danger">{DIRECT_GRANT_COPY.selfPolicyUnavailable}</p>
        ) : null}
        {selfEnvelopeRequired ? (
          <section className="flex flex-col gap-3 rounded-md border border-border-selected bg-surface-field p-3">
            <p className="text-xs font-semibold text-text-primary">
              {DIRECT_GRANT_COPY.selfEnvelopeTitle}
            </p>
            <label
              className="flex flex-col gap-2 text-sm text-text-secondary"
              htmlFor={policyCitationId}
            >
              {DIRECT_GRANT_COPY.policyCitationLabel}
              <Input
                id={policyCitationId}
                value={policyCitation}
                onChange={(event) =>
                  clearErrorAndUpdate(() => setPolicyCitation(event.target.value))
                }
                disabled={mutation.isPending || selfGrantForbidden}
              />
            </label>
            <label
              className="flex flex-col gap-2 text-sm text-text-secondary"
              htmlFor={peerReviewerAbsenceId}
            >
              {DIRECT_GRANT_COPY.peerReviewerAbsenceLabel}
              <Textarea
                id={peerReviewerAbsenceId}
                value={peerReviewerAbsence}
                onChange={(event) =>
                  clearErrorAndUpdate(() => setPeerReviewerAbsence(event.target.value))
                }
                disabled={mutation.isPending || selfGrantForbidden}
                rows={2}
              />
            </label>
          </section>
        ) : null}
        {actorId === null ? (
          <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.sessionLoading}</p>
        ) : null}
        {mappedError ? (
          <div role="alert" className="flex flex-col gap-1 text-sm text-accent-danger">
            <p>{mappedError}</p>
            {submitErrorDestination && canLink(submitErrorDestination.href) ? (
              <HostLink
                className="w-fit text-accent-primary underline underline-offset-2"
                to={submitErrorDestination.href}
                {...(submitErrorDestination.closesDialog ? { onClick: onClose } : {})}
              >
                {submitErrorDestination.label}
              </HostLink>
            ) : null}
          </div>
        ) : null}
      </section>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="secondary" onClick={onClose}>
          {DIRECT_GRANT_COPY.cancel}
        </Button>
        <Button
          type="button"
          onClick={submit}
          loading={mutation.isPending}
          disabled={!canSubmit}
          data-testid="direct-grant-submit"
        >
          {DIRECT_GRANT_COPY.submit}
        </Button>
      </DialogFooter>
    </>
  );
}

function roleLevelLabel(roleLevel: PermissionGrantOptions['recipient']['role_level']): string {
  switch (roleLevel) {
    case 'admin':
      return 'Admin';
    case 'developer':
      return 'Developer';
    case 'user':
      return 'User';
  }
}
