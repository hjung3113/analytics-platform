import { FeatureTimestamp } from '../../../components/FeatureTimestamp';
import { RECOVERY_COPY as COPY } from '../../../lib/copy/recovery';

/** Server computation and last successful refresh are real instants: the host's Kernel `summary` notation in the viewer's zone (kernel.md §6.3, #2587). */
export function RecoveryFreshness({
  computedAt,
  failed,
  updatedAt,
  pageComputedAt,
}: {
  computedAt: string | undefined;
  failed: boolean;
  updatedAt?: number;
  pageComputedAt?: string | undefined;
}) {
  if (!computedAt || (!failed && computedAt === pageComputedAt)) return null;
  return (
    <p className="my-3 text-xs text-text-muted" data-testid="recovery-freshness">
      {COPY.computed} · <FeatureTimestamp at={computedAt} notation="summary" />
      {updatedAt !== undefined && updatedAt > 0 && (
        <>
          {' '}
          · {COPY.successful} ·{' '}
          <FeatureTimestamp at={new Date(updatedAt).toISOString()} notation="summary" />
        </>
      )}
      {failed && (
        <>
          {' '}
          · <output>{COPY.stale}</output>
        </>
      )}
    </p>
  );
}
