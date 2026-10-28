// Test-local host adapter over retained Screen exports.
// VocRouteShell — per-view shell selection for /vocs. Moved out of the route
// file for #982: the router plugin only code-splits a route when its component
// is not an exported local, so the shell lives in the feature layer and the
// route file imports it. Shell selection follows ADR-0020 §taxonomy lock:
// inbox/my → ListShell, triage → WorkbenchShell. VOC creation lives only in the platform drawer (VocComposeScreen).

import { InboxScreen } from '@/features/voc/routes/InboxScreen';
import { VOC_DEFAULT_VIEW } from '@/features/voc/routes/voc-search';
import type { VocSearch } from '@/features/voc/routes/voc-search';
import { VocDetailPanel } from '@/test/host-adapters/features/voc/components/detail/VocDetailPanel';
import { TriageRoute } from '@/test/screen-host/features/voc/routes/TriageRoute';
import { WorkbenchShell } from '@ap/ui';
import { useSearch } from '@tanstack/react-router';

// Exported for testing — tests mount this component directly in a createRoute
// harness (test/mountVocs.tsx).
export function VocRouteShell() {
  // useSearch() (without route arg) reads from the nearest matched route context.
  // This works in both the file-route context and test harnesses that mount
  // this component as the route component.
  const search = useSearch({ strict: false }) as VocSearch;
  // Per-view shell selection. spec voc.md §2 + ADR-0020 §taxonomy lock.
  if (search.view === 'triage') {
    // V1 inline kicker: toolbar prop removed — VocTriageScreen absorbs route
    // identity as a left-edge kicker ("Console · Triage") in its own toolbar.
    // ShellHeader is intentionally absent for this route only (ADR-0020 §optional header).
    return (
      <WorkbenchShell>
        <TriageRoute />
      </WorkbenchShell>
    );
  }
  // inbox / my / default
  const view = search.view ?? VOC_DEFAULT_VIEW;
  return <InboxShell view={view} />;
}

// ── InboxShell ────────────────────────────────────────────────────────────────
//
// InboxScreen owns the ListShell composition (ADR-0020) and the list state;
// the standalone app supplies the detail it renders for the selected VOC.

function InboxShell({ view }: { view: 'inbox' | 'my' }) {
  return (
    <InboxScreen
      view={view}
      renderDetail={(vocId, { managedSystemId, onClose }) => (
        <VocDetailPanel
          vocId={vocId}
          {...(managedSystemId !== undefined ? { managedSystemId } : {})}
          onClose={onClose}
        />
      )}
    />
  );
}
