import { registerDefaultHost } from '../lib/host/host-seam';

/**
 * For a test that renders `HostLink` without a router: the default host with plain anchors for links. Call it from
 * `beforeAll` (after the file's `vi.mock` calls, like `setup.ts`, which it overrides). `here` fixes `useHere()` for a
 * test without a router.
 */
async function registerHost(here?: string): Promise<void> {
  const { tanstackHost } = await import('@/test/host-adapters/lib/host/tanstack-host');
  registerDefaultHost({
    ...tanstackHost,
    ...(here !== undefined ? { useHere: () => here } : {}),
    Link: ({ to, children, ref, ...rest }) => (
      <a href={to} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
        {children}
      </a>
    ),
  });
}

export async function registerAnchorLinkHost(): Promise<void> {
  await registerHost();
}

export async function registerAnchorLinkHostAt(here: string): Promise<void> {
  await registerHost(here);
}
