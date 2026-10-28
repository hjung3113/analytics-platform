// FindingDetailPanel — the standalone frame for the Finding detail page.
// Composes the same `FindingDetailParts` the platform bridge draws in its own drawer.
// Mirrors VocDetailPanel structure per domain-module-boundaries §Frontend Boundary Rules.

import { useFindingDetailParts } from '@/features/findings/components/FindingDetail/FindingDetailParts';
import { useHostSeam } from '@/lib/host/host-seam';
import { DetailPanelHeader } from '@ap/ui';
import type * as React from 'react';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FindingDetailPanelProps {
  findingId: string;
  headerExtras?: React.ReactNode;
}

function FindingPanelLayout({
  id,
  headerExtras,
  children,
}: {
  id?: string;
  headerExtras: React.ReactNode | undefined;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="finding"
        {...(id !== undefined ? { id } : {})}
        {...(headerExtras !== undefined ? { extras: headerExtras } : {})}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function FindingDetailPanel({
  findingId,
  headerExtras,
}: FindingDetailPanelProps): React.ReactElement {
  const navigate = useHostSeam().useNavigate?.();
  const { view, body } = useFindingDetailParts({
    findingId,
    onClose: () => navigate?.('/findings'),
  });
  return (
    <FindingPanelLayout
      {...(view.kind === 'full' && view.finding.id === findingId
        ? { id: view.finding.display_id }
        : {})}
      headerExtras={headerExtras}
    >
      {body}
    </FindingPanelLayout>
  );
}
