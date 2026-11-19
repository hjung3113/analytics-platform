import { periodHours, readQueryRecovery, shift, wallClockEpochMs, type ApiResponse, type GlobalContext, type QueryRecovery } from '@ap/contracts';
import { errorGuidance } from '@ap/kernel';

const ONE_DAY_HOURS = 24;

type RecoveryContext = Partial<Pick<GlobalContext, 'scopeId' | 'selection' | 'from' | 'to'>> & {
  equipmentVerified: boolean;
  canSelect: boolean;
  canChangePeriod: boolean;
};
type ShorterPeriod = { from: string; to: string; hours: number; maxHours: number };
type Recovery =
  | { kind: 'conditions' }
  | { kind: 'retry' }
  | { kind: 'request'; target: NonNullable<QueryRecovery['deniedScope']> }
  | { kind: 'exclude'; affected: string[]; selection: string[]; shorter?: ShorterPeriod }
  | ({ kind: 'shorten' } & ShorterPeriod);

const conditions = { kind: 'conditions' } as const;

function shorterPeriod(context: RecoveryContext | undefined, maxHours: number | undefined): ShorterPeriod | undefined {
  if (!context?.canChangePeriod || maxHours === undefined) return undefined;
  const { from, to } = context;
  if (!from || !to || wallClockEpochMs(from) === null || wallClockEpochMs(to) === null) return undefined;
  const current = periodHours({ from, to });
  if (current === null || current <= maxHours) return undefined;
  const hours = Math.min(maxHours, ONE_DAY_HOURS);
  const start = shift(to, -hours);
  if (wallClockEpochMs(start) === null) return undefined;
  return { from: start, to, hours, maxHours };
}

export function resolveOutcomeRecovery({ outcome, recovery, message }: Pick<ApiResponse<unknown>, 'outcome' | 'recovery' | 'message'>, context?: RecoveryContext): Recovery {
  const reply = readQueryRecovery(recovery);
  if (outcome === 'forbidden') {
    const target = reply?.deniedScope;
    return target && target.site === context?.scopeId ? { kind: 'request', target } : conditions;
  }
  if (outcome !== 'error' && outcome !== 'timeout' && outcome !== 'too_large') return conditions;
  const shorter = shorterPeriod(context, reply?.maxHours);
  const affected = reply?.affectedEquipmentIds;
  const authorized = reply?.authorizedEquipmentIds;
  if (context?.equipmentVerified && context.canSelect && context.selection !== undefined && affected && authorized) {
    const submitted = context.selection === null ? null : new Set(context.selection);
    const authorizedIds = new Set(authorized);
    if (authorized.every(id => submitted === null || submitted.has(id)) && affected.every(id => authorizedIds.has(id))) {
      const exclusions = new Set(affected);
      const selection = authorized.filter(id => !exclusions.has(id));
      if (selection.length) return { kind: 'exclude', affected, selection, ...(shorter ? { shorter } : {}) };
    }
  }
  if (shorter) return { kind: 'shorten', ...shorter };
  if (affected || authorized || outcome === 'too_large' || reply?.retryable !== true || reply.maxHours !== undefined) return conditions;
  const guide = errorGuidance(message);
  if (guide.blocked || guide.label === 'sharedOutcomeCannotAggregate') return conditions;
  return { kind: 'retry' };
}
