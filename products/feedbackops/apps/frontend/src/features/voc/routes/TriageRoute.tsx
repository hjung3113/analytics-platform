// TriageRoute — the standalone route's entry for the triage workbench. The screen itself (TriageScreen) reads and
// writes its URL through the host seam, which the standalone app serves with its default TanStack host.
import type * as React from 'react';
import { TriageScreen } from '../components/triage/TriageScreen';

export function TriageRoute(): React.ReactElement {
  return <TriageScreen />;
}

TriageRoute.displayName = 'TriageRoute';
