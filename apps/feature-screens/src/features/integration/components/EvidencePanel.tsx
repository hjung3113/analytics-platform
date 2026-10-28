import { ListStateMessage } from '@/components/ListStateMessage';
import { ApiError } from '@/lib/api/types';
import { EVIDENCE_COPY as COPY } from '@/lib/copy/evidence';
import { formatDate } from '@/lib/format/datetime';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { HostLink, useHostSeam } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import type { EvidenceInventoryItem } from '@ap/feature-shared';
import { Button, PermissionBlockedPanel, Skeleton } from '@ap/ui';
import { EvidenceContent } from './EvidenceContent';

export type EvidencePanelProps = {
  item: EvidenceInventoryItem | undefined;
  loading: boolean;
  error: unknown;
  mismatch: boolean;
  onClose: () => void;
  onRetry: () => void;
};

/** The panel as parts a host places: the standalone frames them in its detail slot, the bridge in `FeatureDetailDrawer`. */
export function buildEvidencePanelParts(props: EvidencePanelProps): ClosableDetailParts {
  return { title: COPY.title, body: <EvidencePanelBody {...props} />, requestClose: props.onClose };
}

export function EvidencePanelFrame({ parts }: { parts: ClosableDetailParts }) {
  return (
    <section
      aria-label={COPY.panelLabel}
      className="flex h-full min-h-0 flex-col"
      data-testid="evidence-panel"
    >
      <header className="flex h-toolbar shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <h2 className="text-sm font-semibold">{parts.title}</h2>
        <Button
          variant="subtle"
          size="sm"
          onClick={parts.requestClose}
          aria-label={COPY.closePanel}
        >
          {COPY.close}
        </Button>
      </header>
      {parts.body}
    </section>
  );
}

export function EvidencePanel(props: EvidencePanelProps) {
  return <EvidencePanelFrame parts={buildEvidencePanelParts(props)} />;
}

function EvidencePanelBody({ item, loading, error, mismatch, onRetry }: EvidencePanelProps) {
  const { canLink } = useHostSeam();
  const parentHref = item ? searchHref('/findings', { selected: item.finding_id }) : '';
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading ? (
          <Skeleton className="h-32" role="status" aria-label={COPY.loading} />
        ) : error instanceof ApiError && (error.status === 403 || error.status === 401) ? (
          <PermissionBlockedPanel state="denied" category="Evidence" />
        ) : error ? (
          <ListStateMessage
            variant="error"
            title={error instanceof ApiError && error.status === 404 ? COPY.missing : COPY.error}
            {...(!(error instanceof ApiError && error.status === 404)
              ? { action: { label: COPY.retry, onClick: onRetry } }
              : {})}
          />
        ) : mismatch ? (
          <ListStateMessage variant="filtered" title={COPY.mismatch} />
        ) : item ? (
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-semibold">
              {item.finding.display_id} · {item.finding.title}
            </h3>
            <EvidenceContent item={item} />
            <p className="text-xs text-text-muted">{formatDate(item.created_at)}</p>
          </div>
        ) : null}
      </div>
      {item && !loading && !error && !mismatch && canLink(parentHref) && (
        <footer className="shrink-0 border-t border-border-subtle p-4">
          <Button asChild variant="primary" size="sm">
            <HostLink to={parentHref}>{COPY.parent}</HostLink>
          </Button>
        </footer>
      )}
    </>
  );
}
