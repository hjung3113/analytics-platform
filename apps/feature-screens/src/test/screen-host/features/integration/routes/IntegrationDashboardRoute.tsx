import {
  RecoveryPanelFrame,
  type RecoveryPanelParts,
  type RenderRecoveryAccess,
} from '@/features/integration/recovery/RecoveryPanel';
import { IntegrationDashboardScreen } from '@/features/integration/routes/IntegrationDashboardScreen';
// Test-local host adapter over retained Screen exports.
import { type HostNavigate, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import { useDetailPanelSlot } from '@ap/feature-ui';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';

// /integration. The dashboard and its recovery queue live in `IntegrationDashboardScreen` (router-free, shared with
// the platform bridge); this route writes through a route-local navigate and frames the selected item's parts in the
// standalone detail slot. `history=true` stays a boolean in the router: the route schema's `recoverySearchFields.history`
// preprocess coerces the string (pinned with the production codec in `IntegrationDashboardRoute.codec.test.tsx`).

/** Writes through TanStack's `useNavigate`, search values as strings. */
function useDashboardRouteNavigate(): HostNavigate {
  const navigate = useNavigate();
  return (to, options) => {
    const location = new URL(to, 'http://feedbackops.local');
    void navigate({
      to: location.pathname,
      search: Object.fromEntries(location.searchParams),
      ...(options?.replace === true ? { replace: true } : {}),
    } as never);
  };
}

/** The standalone registrant: frames the parts in the shell's detail slot and renders nothing in place. */
function StandaloneRecoveryPanel({ parts }: { parts: RecoveryPanelParts }): null {
  useDetailPanelSlot(<RecoveryPanelFrame key={parts.itemKey} parts={parts} />);
  return null;
}

function renderStandalone(parts: RecoveryPanelParts): React.ReactNode {
  return <StandaloneRecoveryPanel parts={parts} />;
}

export function IntegrationDashboardRoute({
  renderRequestAccess,
}: { renderRequestAccess?: RenderRecoveryAccess } = {}): React.ReactElement {
  const base = useHostSeam();
  const seam = React.useMemo(() => ({ ...base, useNavigate: useDashboardRouteNavigate }), [base]);
  return (
    <HostSeamProvider value={seam}>
      <IntegrationDashboardScreen
        renderDetail={renderStandalone}
        {...(renderRequestAccess ? { renderRequestAccess } : {})}
      />
    </HostSeamProvider>
  );
}
