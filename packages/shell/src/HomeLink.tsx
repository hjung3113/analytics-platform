import { PlatformLink, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Button } from '@ap/ui';

/** Where home is: the platform home (`/`) when that menu can be opened, else the sidebar space home when that menu can be opened, else null. */
export function useHomeHref(): string | null {
  const { resolveLink, sidebarSpace, registry } = useHostPlatform();
  const platformHome = registry.matchRoute('/')?.menu;
  const opened = platformHome !== undefined ? resolveLink(platformHome.id) : null;
  const fallbackId = opened?.allowed ? undefined : sidebarSpace?.homeMenuId;
  const fallback = fallbackId !== undefined ? resolveLink(fallbackId) : null;
  return opened?.allowed ? opened.href : fallback?.allowed ? fallback.href : null;
}

/** Home control for kernel and error views: nothing where there is no home to open. */
export function HomeLink() {
  const { t } = useI18n();
  const href = useHomeHref();
  if (href === null) return null;
  return <Button asChild size="sm" variant="secondary"><PlatformLink href={href}>{t('home')}</PlatformLink></Button>;
}
