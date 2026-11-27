import { useId, useState } from 'react';

import { useMeBridge } from '../../../lib/api/me';
import { useIdempotencyKey } from '../../../lib/api/useIdempotencyKey';
import { ADMIN_PERMISSIONS_COPY } from '../../../lib/copy/admin-permissions';
import { Button, DecisionImpactConfirmDialog, PanelSectionTitle, Textarea } from '@ap/ui';

import { useWorkspaceSettings } from '../settings/use-workspace-settings.js';
import { useRevokePermission } from './useRevokePermission.js';

export function PermissionGrantActionForm({
  kind,
  id,
  actorId,
  impactText,
  onGrantRevoked,
  onSuccess,
}: {
  kind: 'grants' | 'denies';
  id: string;
  actorId: string;
  impactText: string;
  onGrantRevoked: (id: string) => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useRevokePermission(onGrantRevoked);
  const me = useMeBridge();
  const workspaceSettings = useWorkspaceSettings();
  const submitLabel =
    kind === 'grants' ? ADMIN_PERMISSIONS_COPY.revokeGrant : ADMIN_PERMISSIONS_COPY.liftDeny;
  const selfDenyLiftBlocked =
    kind === 'denies' &&
    actorId === me.data?.actor.id &&
    workspaceSettings.data?.permission_self_approval === 'forbidden';
  // Why the action is disabled, named once under the button (#2574 variant b); the policy block first, as it outlasts any typing.
  const blockers: readonly [boolean, string][] = [
    [selfDenyLiftBlocked, ADMIN_PERMISSIONS_COPY.selfDenyLiftForbidden],
    [reason.trim().length === 0, ADMIN_PERMISSIONS_COPY.reasonRequired],
  ];
  const blockedReason = blockers.find(([blocking]) => blocking)?.[1];
  const canSubmit = blockedReason === undefined && !mutation.isPending;

  function submit() {
    if (!canSubmit) return;
    mutation.mutate(
      { kind, id, reason: reason.trim(), idempotencyKey },
      {
        onSuccess: () => {
          markConsumed();
          onSuccess();
        },
      },
    );
  }

  const submitButton = (
    <Button
      type="button"
      disabled={!canSubmit}
      disabledReason={blockedReason}
      loading={mutation.isPending}
      onClick={kind === 'denies' ? submit : undefined}
      data-testid="permission-grants-submit"
    >
      {submitLabel}
    </Button>
  );

  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-5">
      <PanelSectionTitle>{ADMIN_PERMISSIONS_COPY.actionTitle}</PanelSectionTitle>
      <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor={reasonId}>
        {ADMIN_PERMISSIONS_COPY.reasonLabel}
        <Textarea
          id={reasonId}
          value={reason}
          maxLength={2000}
          placeholder={ADMIN_PERMISSIONS_COPY.reasonPlaceholder}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {kind === 'grants' ? (
        <DecisionImpactConfirmDialog
          kind="irreversible"
          trigger={submitButton}
          impactText={impactText}
          onConfirm={submit}
          title={ADMIN_PERMISSIONS_COPY.revokeConfirmTitle}
          confirmLabel={ADMIN_PERMISSIONS_COPY.revokeConfirm}
          cancelLabel={ADMIN_PERMISSIONS_COPY.cancel}
        />
      ) : submitButton}
    </section>
  );
}
