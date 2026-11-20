import { Button } from '@ap/ui';
import { PERMISSION_REQUEST_FLOW_COPY } from '../lib/copy/permission-requests';
import { HostHrefLink } from './HostHrefLink';

export function permissionCardExitAction(href: string | null | undefined, lang: 'ko' | 'en') {
  return href ? (
    <Button asChild size="sm" variant="secondary">
      <HostHrefLink href={href} data-permission-home-link>{PERMISSION_REQUEST_FLOW_COPY[lang].goHome}</HostHrefLink>
    </Button>
  ) : null;
}
