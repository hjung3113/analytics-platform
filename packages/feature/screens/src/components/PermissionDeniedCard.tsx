import { Button, PermissionBlockedPanel, type PermissionBlockedPanelProps } from '@ap/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ManagedSystemDto } from '../lib/api/registry-reads';
import { getCapabilityDisplayLabel } from '../lib/copy/capabilities';
import { PERMISSION_REQUEST_FLOW_COPY } from '../lib/copy/permission-requests';
import { managedSystemNamesQueryKey } from '../lib/cross-system/useManagedSystemNames';
import { useHostPermissionLinks, useHostSeam } from '../lib/host/host-seam';
import { HostHrefLink } from './HostHrefLink';
import { permissionCardExitAction } from './permission-card-actions';

export function PermissionDeniedCard({
  category, description, reason, capability, managedSystemId, layout = 'panel', announceBody = false, extraExitAction,
}: {
  category: string;
  description?: string;
  reason?: string;
  capability?: string;
  managedSystemId?: string;
  layout?: PermissionBlockedPanelProps['layout'];
  announceBody?: boolean;
  extraExitAction?: ReactNode;
}) {
  const { lang = 'ko' } = useHostSeam();
  const { permissionHomeHref } = useHostPermissionLinks();
  const catalog = useQueryClient().getQueryData<{ items: ManagedSystemDto[] }>(managedSystemNamesQueryKey);
  const system = catalog?.items.find((item) => item.id === managedSystemId)?.name;
  const missing = capability === undefined ? undefined : {
    permission: getCapabilityDisplayLabel(capability), ...(system ? { system } : {}),
  };
  const card = layout === 'card';
  const body = card ? description ?? reason : description;
  const home = card ? permissionCardExitAction(permissionHomeHref, lang) : null;
  return <PermissionBlockedPanel layout={layout} state="denied" lang={lang} category={category}
    {...(body ? { description: body } : {})} {...(reason ? { reason } : {})}
    {...(missing ? { missing } : {})}
    requestStatus="not-requestable"
    announceBody={announceBody}
    exitAction={card && extraExitAction ? <>{home}{extraExitAction}</> : home}
    requestAction={!card && permissionHomeHref ? <Button asChild size="sm" variant="link">
      <HostHrefLink href={permissionHomeHref}>{PERMISSION_REQUEST_FLOW_COPY[lang].home}</HostHrefLink>
    </Button> : null} />;
}
