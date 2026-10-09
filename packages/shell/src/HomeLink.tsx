import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';

/** Home control for kernel and error views. The platform home (`/`) when that menu can be opened, else the sidebar space home when that menu can be opened, else nothing. */
export function HomeLink() {
  const { resolveLink, sidebarSpace, registry } = usePlatform();
  const { t } = useI18n();
  const platformHome = registry.matchRoute('/')?.menu;
  const opened = platformHome !== undefined ? resolveLink(platformHome.id) : null;
  const fallbackId = opened?.allowed ? undefined : sidebarSpace?.homeMenuId;
  const fallback = fallbackId !== undefined ? resolveLink(fallbackId) : null;
  const href = opened?.allowed ? opened.href : fallback?.allowed ? fallback.href : null;
  if (href === null) return null;
  return <Button asChild size="sm" variant="secondary"><PlatformLink href={href}>{t('home')}</PlatformLink></Button>;
}
