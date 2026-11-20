import type { AnchorHTMLAttributes } from 'react';
import { useFollowHostHref } from '../lib/host/host-seam';

/**
 * A link to an href the host seam handed out (permission request, Home). A plain left click stays inside the host when it can
 * (`useFollowHostHref`); a modified click, or a host that cannot, keeps the browser's own link behaviour (#2638).
 */
export function HostHrefLink({ href, onClick, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const follow = useFollowHostHref();
  return <a href={href} {...rest} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (follow(href)) event.preventDefault();
  }}>{children}</a>;
}
