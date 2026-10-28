import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';

export function FeatureScreenRoot({
  client,
  host,
  children,
}: {
  client: QueryClient;
  host: HostSeam;
  children: ReactNode;
}): ReactElement {
  return (
    <QueryClientProvider client={client}>
      <HostSeamProvider value={host}>{children}</HostSeamProvider>
    </QueryClientProvider>
  );
}
