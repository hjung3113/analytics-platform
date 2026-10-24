import type * as React from 'react';

import { FullDetailView } from './FullDetailView';
import { SummaryPermissionView } from './SummaryPermissionView';
import { useVocDetailParts } from './useVocDetailParts';

// ── Props ────────────────────────────────────────────────────────────────────

export interface VocDetailPanelProps {
  vocId: string;
  /** Current Managed System URL scope; an out-of-scope cached selection closes. */
  managedSystemId?: string;
  /** Called when user closes the panel via X button or 404 selection clear. */
  onClose: () => void;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/** The standalone frame around the VOC detail parts (`useVocDetailParts`); the platform bridge frames the same parts itself. */
export function VocDetailPanel({
  vocId,
  managedSystemId,
  onClose,
  // `null` while the scope-exit effect clears `selected`: rendering the old
  // record for that tick is the bug this panel is closing over.
}: VocDetailPanelProps): React.ReactElement | null {
  const parts = useVocDetailParts({
    vocId,
    onClose,
    ...(managedSystemId !== undefined ? { managedSystemId } : {}),
  });
  const { view } = parts;

  switch (view.kind) {
    case 'loading':
      return (
        <div className="flex flex-col h-full overflow-y-auto">
          <div className="h-toolbar shrink-0 border-b border-border-subtle flex items-center px-4">
            {parts.title}
          </div>
          {parts.body}
        </div>
      );
    case 'hidden':
      return null;
    case 'error':
    case 'not-found':
      return <>{parts.body}</>;
    case 'summary':
      return <SummaryPermissionView data={view.data} vocId={vocId} onClose={onClose} />;
    case 'full':
      return (
        <FullDetailView key={view.voc.id} voc={view.voc} vocId={vocId} onClose={parts.requestClose}>
          {parts.body}
        </FullDetailView>
      );
  }
}
