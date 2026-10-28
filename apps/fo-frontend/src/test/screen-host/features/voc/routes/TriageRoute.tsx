import { TriageScreen } from '@/features/voc/components/triage/TriageScreen';
// Test-local host adapter over retained Screen exports.
// TriageRoute — the standalone route's entry for the triage workbench. The screen itself (TriageScreen) reads and
// writes its URL through the host seam, which the standalone app serves with its default TanStack host.
import type * as React from 'react';

export function TriageRoute(): React.ReactElement {
  return <TriageScreen />;
}

TriageRoute.displayName = 'TriageRoute';
