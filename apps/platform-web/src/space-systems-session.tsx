import { useLayoutEffect } from 'react';
import { usePlatform } from '@ap/kernel';
import { spaceSystems, type SpaceSystemsSource } from './space-systems';

/**
 * Starts the space → system load for the current session (#1289 node j): mounted once under `PlatformProvider`, it hands the store the session identity
 * (adapter, revision, user) so a changed session clears the old links at once and loads the new session's. Renders nothing.
 */
export function SpaceSystemsSession({ source }: { source: SpaceSystemsSource | null }) {
  const { adapter, revision, user } = usePlatform();
  const userId = user?.id ?? null;
  // Layout effect: a session change aborts the previous session's in-flight request during commit, before any response task can run, so "not aborted" means "current host session".
  useLayoutEffect(() => { spaceSystems.start([adapter, revision, userId], source); }, [adapter, revision, userId, source]);
  return null;
}
