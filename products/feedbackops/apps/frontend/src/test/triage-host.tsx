import type { HostNavigate } from '../lib/host/host-seam';
import { registerDefaultHost } from '../lib/host/host-seam';

/**
 * For a triage test that stands in for the router: the default host reading its search from `getSearch()` (string
 * values; `undefined` entries drop out like a missing key), writing every move to `navigate` as the FeedbackOps
 * `href` + `{ replace }`, and drawing links as plain anchors (`canLink` as given, else all). Call it from `beforeAll` (after the file's `vi.mock`
 * calls, like `setup.ts`, which it overrides).
 */
export async function registerTriageTestHost(
  getSearch: () => Readonly<Record<string, unknown>>,
  navigate: HostNavigate,
  options: { canLink?: (to: string) => boolean } = {},
): Promise<void> {
  const { tanstackHost } = await import('../lib/host/tanstack-host');
  registerDefaultHost({
    ...tanstackHost,
    ...(options.canLink !== undefined ? { canLink: options.canLink } : {}),
    Link: ({ to, children, ref, ...rest }) => (
      <a href={to} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
        {children}
      </a>
    ),
    useSearch: () =>
      Object.fromEntries(
        Object.entries(getSearch())
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ),
    useNavigate: () => navigate,
  });
}
