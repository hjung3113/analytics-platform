import type { HostLinkProps } from '@ap/feature-screens/global-screens/core';

/** The default seam links nothing (backlog: 알림 목적지 연결); `Link` is the unreachable fallback, and a screen passes `canLink`/`Link` for the targets it can reach. */
export function UnlinkedLink({ to: _to, children, ...rest }: HostLinkProps) {
  return <span {...rest}>{children}</span>;
}
