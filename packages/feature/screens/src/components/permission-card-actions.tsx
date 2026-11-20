import { Button } from '@ap/ui';
import { PERMISSION_REQUEST_FLOW_COPY } from '../lib/copy/permission-requests';

export function permissionCardExitAction(href: string | null | undefined, lang: 'ko' | 'en') {
  return href ? (
    <Button asChild size="sm" variant="secondary">
      <a href={href} data-permission-home-link>{PERMISSION_REQUEST_FLOW_COPY[lang].goHome}</a>
    </Button>
  ) : null;
}
