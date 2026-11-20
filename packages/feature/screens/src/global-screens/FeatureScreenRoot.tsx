import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactElement, type ReactNode, useCallback, useMemo } from 'react';

import { type HostSeam, HostSeamProvider } from '../lib/host/host-seam';
import { evictDeniedVocRead } from '../features/voc/hooks/evictDeniedVocRead';

export function FeatureScreenRoot({
  client,
  host,
  children,
}: {
  client: QueryClient;
  host: HostSeam;
  children: ReactNode;
}): ReactElement {
  const clearDeniedVocRead = useCallback((listKeyHash: string) => evictDeniedVocRead(client, listKeyHash), [client]);
  const hostWithDenial = useMemo(() => ({ ...host, clearDeniedVocRead }), [host, clearDeniedVocRead]);
  return (
    <QueryClientProvider client={client}>
      <HostSeamProvider value={hostWithDenial}>{children}</HostSeamProvider>
    </QueryClientProvider>
  );
}
