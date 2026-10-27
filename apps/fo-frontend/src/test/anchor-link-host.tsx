import { registerDefaultHost } from '../lib/host/host-seam';

/**
 * For a test that renders `HostLink` without a router: the default host with plain anchors for links. Call it from
 * `beforeAll` (after the file's `vi.mock` calls, like `setup.ts`, which it overrides).
 */
export async function registerAnchorLinkHost(): Promise<void> {
  const { tanstackHost } = await import('../lib/host/tanstack-host');
  registerDefaultHost({
    ...tanstackHost,
    Link: ({ to, children, ref, ...rest }) => (
      <a href={to} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
        {children}
      </a>
    ),
  });
}
