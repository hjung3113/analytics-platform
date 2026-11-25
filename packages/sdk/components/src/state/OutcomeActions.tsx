import { Loader2, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApiResponse } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { queryRecoveryEvidence, useHostPlatformOptional } from '@ap/kernel/host';
import { Button } from '@ap/ui';
import { useContextEditorOpener } from '../filters/QueryBarStatus';
import { COMPONENTS_MESSAGES } from '../messages';
import { AccessRequestEntry, accessRequestBody, useScopeAccessRequest } from './AccessRequestEntry';
import { RecoverButton } from './RecoverButton';
import { resolveOutcomeRecovery } from './outcomeRecovery';

export function OutcomeRetryButton({ onRetry, busy = false, label, size = 'sm' }: { onRetry: () => void; busy?: boolean; label?: string; size?: 'sm' | 'toolbar' }) {
  const { t } = useI18n();
  return <Button type="button" size={size} variant={size === 'toolbar' ? 'ghost' : 'secondary'} data-outcome-retry aria-busy={busy} aria-disabled={busy || undefined}
    onClick={() => { if (!busy) onRetry(); }}>
    {busy ? <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> : <RotateCw aria-hidden className="size-3.5" />}
    {label ?? t('retry')}
  </Button>;
}

export function useOutcomeRecovery(response: ApiResponse<unknown>, onRetry: () => void, options: { busy?: boolean; current?: boolean; emptyAction?: ReactNode; groupReplies?: readonly ApiResponse<unknown>[]; retryLabel?: string; singleAction?: boolean; retrySize?: 'toolbar' } = {}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { t } = useI18n();
  const host = useHostPlatformOptional();
  const focusConditions = useContextEditorOpener();
  const accessRequest = useScopeAccessRequest();
  const capabilities = host?.route?.menu.context;
  const global = host?.global;
  const current = options.current !== false;
  const submitted = host && queryRecoveryEvidence(response, host);
  const shared = !options.groupReplies || (host && options.groupReplies.every(reply =>
    JSON.stringify(queryRecoveryEvidence(reply, host)) === JSON.stringify(submitted)));
  const context = submitted && shared ? {
    ...submitted,
    canSelect: capabilities?.selection === 'apply' && host?.scope.status === 'valid',
    canChangePeriod: capabilities?.time === 'apply',
  } : undefined;
  const resolved = current ? resolveOutcomeRecovery(response, context) : { kind: 'conditions' as const };
  const recovery = options.busy && resolved.kind !== 'retry' ? { kind: 'conditions' as const } : resolved;
  const conditions = focusConditions ? <Button type="button" size="sm" variant="secondary" onClick={() => focusConditions()}>{m('outcomeOpenConditions')}</Button> : null;
  let primary: ReactNode = null;
  let secondary: ReactNode = null;
  let evidence: string | undefined;
  const periodLabel = (hours: number) => m(hours === 24 ? 'outcomeShortenDay' : 'outcomeShortenHours', { hours });
  switch (recovery.kind) {
    case 'exclude': {
      primary = <RecoverButton primary label={m('outcomeExcludeEquipment', { count: recovery.affected.length })} onRecover={() => host?.setGlobal({ selection: recovery.selection })} />;
      evidence = m('outcomeAffectedEquipment', { ids: recovery.affected.join(', ') });
      const shorter = recovery.shorter;
      if (shorter) {
        secondary = <RecoverButton label={periodLabel(shorter.hours)} onRecover={() => host?.setGlobal({ from: shorter.from, to: shorter.to })} />;
      }
      break;
    }
    case 'shorten':
      primary = <RecoverButton primary label={periodLabel(recovery.hours)} onRecover={() => host?.setGlobal({ from: recovery.from, to: recovery.to })} />;
      evidence = m('outcomePeriodLimit', { hours: recovery.maxHours });
      break;
    case 'retry':
      secondary = <OutcomeRetryButton onRetry={onRetry} busy={options.busy} label={options.retryLabel} size={options.retrySize} />;
      break;
    case 'request': {
      const { target } = recovery;
      if (accessRequest?.supportsExactTarget) {
        evidence = m('outcomeDeniedTarget', { target: target.kind === 'site_room' ? `${target.site} / ${target.room}` : target.site });
        const full = false;
        primary = <AccessRequestEntry key={JSON.stringify(target)} slot={accessRequest} target={target} exactTarget emphasis="primary">
          {(state, entry) => <>{(state.pending || state.read) && <span className="text-xs break-keep">{accessRequestBody(t, state, full)}</span>}{entry}</>}
        </AccessRequestEntry>;
      }
      break;
    }
    case 'conditions':
      if (current && !options.busy && response.outcome === 'empty') {
        secondary = capabilities?.selection === 'apply' && host?.scope.status === 'valid' && global?.selection?.length === 0
          ? <RecoverButton label={m('outcomeResetFilter')} onRecover={() => host?.setGlobal({ selection: null })} />
          : options.emptyAction;
      }
      break;
  }
  const action = primary || secondary || conditions ? <>{primary}{secondary}{conditions}</> : null;
  return { action: options.singleAction ? primary ?? secondary ?? conditions : action, evidence };
}
