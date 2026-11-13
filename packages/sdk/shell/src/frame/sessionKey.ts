import { useHostPlatform } from '@ap/kernel/host';
import type { PlatformAdapter } from '@ap/contracts';

const adapterIds = new WeakMap<PlatformAdapter, number>();
let nextAdapterId = 0;

/**
 * The session generation as the shell sees it (#2075): adapter identity, server revision and user id, the same three inputs as the
 * Kernel's query generation. The revision alone is not enough: an adapter swap restarts its count at 0, even for the same user with
 * fewer permissions or a smaller Scope grant. Shell state that may hold a session's data (a screen instance, the toast announcements)
 * is keyed or reset by it.
 */
export function useSessionKey(): string {
  const { adapter, revision, user } = useHostPlatform();
  let id = adapterIds.get(adapter);
  if (id === undefined) {
    id = ++nextAdapterId;
    adapterIds.set(adapter, id);
  }
  return `${id}:${revision}:${user.id}`;
}
