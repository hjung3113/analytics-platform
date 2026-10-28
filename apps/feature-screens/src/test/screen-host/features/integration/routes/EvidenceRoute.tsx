import { EvidencePanelFrame } from '@/features/integration/components/EvidencePanel';
import { EvidenceScreen } from '@/features/integration/routes/EvidenceScreen';
// Test-local host adapter over retained Screen exports.
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { useDetailPanelSlot } from '@ap/feature-ui';

// The inventory, its URL writes and the panel parts live in `EvidenceScreen` (router-free, shared with the platform
// bridge); this route composes it under the default host and frames the parts in the standalone detail slot, as
// `ListShell.detailPanel` did.

/** Registers the one standalone slot entry while a panel shows; renders nothing in place. */
function StandaloneEvidencePanel({ parts }: { parts: ClosableDetailParts }): null {
  useDetailPanelSlot(<EvidencePanelFrame parts={parts} />);
  return null;
}

function renderStandalone(parts: ClosableDetailParts) {
  return <StandaloneEvidencePanel parts={parts} />;
}

export function EvidenceRoute() {
  return <EvidenceScreen renderDetail={renderStandalone} />;
}
