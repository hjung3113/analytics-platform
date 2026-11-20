import { Button, PermissionBlockedPanel, type PermissionBlockedPanelProps } from '@ap/ui';
import { getCapabilityDisplayLabel } from '../lib/copy/capabilities';
import { PERMISSION_REQUEST_FLOW_COPY } from '../lib/copy/permission-requests';
import { useManagedSystemNames } from '../lib/cross-system/useManagedSystemNames';
import { useHostPermissionLinks, useHostSeam } from '../lib/host/host-seam';
import { HostHrefLink } from './HostHrefLink';
import { permissionCardExitAction } from './permission-card-actions';

export function PermissionDeniedCard({ category, description, reason, capability, managedSystemId, layout = 'panel' }: {
  category: string;
  description?: string;
  reason?: string;
  capability?: string;
  managedSystemId?: string;
  layout?: PermissionBlockedPanelProps['layout'];
}) {
  const { lang = 'ko' } = useHostSeam();
  const { permissionHomeHref } = useHostPermissionLinks();
  const names = useManagedSystemNames({ enabled: capability !== undefined && managedSystemId !== undefined });
  const system = managedSystemId === undefined ? undefined : names.get(managedSystemId);
  const missing = capability === undefined ? undefined : {
    permission: getCapabilityDisplayLabel(capability), ...(system ? { system } : {}),
  };
  const card = layout === 'card';
  const body = card ? description ?? reason : description;
  return <PermissionBlockedPanel layout={layout} state="denied" lang={lang} category={category}
    {...(body ? { description: body } : {})} {...(reason ? { reason } : {})}
    {...(missing ? { missing } : {})}
    requestStatus="not-requestable"
    exitAction={card ? permissionCardExitAction(permissionHomeHref, lang) : null}
    requestAction={!card && permissionHomeHref ? <Button asChild size="sm" variant="link">
      <HostHrefLink href={permissionHomeHref}>{PERMISSION_REQUEST_FLOW_COPY[lang].home}</HostHrefLink>
    </Button> : null} />;
}
