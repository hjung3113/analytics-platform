import { useEffect } from 'react';
import { useHostPlatform } from '@ap/kernel/host';
import type { EndpointInvalidationSource } from './real/endpoint-invalidation';

/**
 * Child of `PlatformProvider` that turns the assembly's app-declared endpoint ids into targeted refreshes
 * (`refreshEpochs.bump`: cancel in-flight reads, invalidate the cached ones, keep the prior rows on screen while
 * they refetch). It is not `adapter.subscribe`, which is a session notification that invalidates every query.
 * Mounted above the routes, so a write that settles after its screen unmounted still refreshes the Home banner.
 */
export function EndpointInvalidationBridge({ source }: { source: EndpointInvalidationSource }): null {
  const { refreshEpochs } = useHostPlatform();
  useEffect(() => source.subscribe(endpointIds => refreshEpochs.bump(endpointIds)), [source, refreshEpochs]);
  return null;
}
