import { registerDefaultHost, type HostSeam } from '../../lib/host/host-seam';

/** Tags each value with the notation the screen asked for, so a test sees the Kernel notation choice (kernel.md §6.3), not a formatter. */
export const taggedTime: NonNullable<HostSeam['time']> = {
  list: (at, options) => (options?.timeZone ? `list@${options.timeZone}:${at}` : `list:${at}`),
  summary: (at) => `summary:${at}`,
  feed: (at) => ({ text: `feed:${at}`, title: `title:${at}` }),
};

/**
 * Makes the test default host (the setup's TanStack host) carry `taggedTime`, for routed screens that read the default seam.
 * Returns the restore; call it after the test.
 */
export async function registerTaggedTimeHost(): Promise<() => void> {
  const { tanstackHost } = await import('../host-adapters/lib/host/tanstack-host');
  registerDefaultHost({ ...tanstackHost, time: taggedTime });
  return () => registerDefaultHost(tanstackHost);
}
