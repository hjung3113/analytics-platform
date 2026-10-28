import { CoverageScreen } from '@/features/integration/routes/CoverageScreen';
// Test-local host adapter over retained Screen exports.
import { type HostLinkProps, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import { InternalLink } from '@/test/host-adapters/lib/router/InternalLink';
import * as React from 'react';

// Standalone Coverage keeps its `InternalLink` anchors (exact hrefs incl. the `#coverage` hash and the
// `overdue=true` of the area-report links); the default host's TanStack `Link` would drop the hash and quote
// `'true'`. Search and navigate stay the default host's: every Coverage value is a string.
function CoverageAnchorLink({ to, ...rest }: HostLinkProps): React.ReactElement {
  return <InternalLink href={to} {...rest} />;
}

export function CoverageRoute(): React.ReactElement {
  const base = useHostSeam();
  const seam = React.useMemo(() => ({ ...base, Link: CoverageAnchorLink }), [base]);
  return (
    <HostSeamProvider value={seam}>
      <CoverageScreen />
    </HostSeamProvider>
  );
}
