import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';

/** Home control for kernel and error views. The platform home (`/`) when that menu can be opened, else the sidebar space home, else nothing. */
export function HomeLink() {
  const { linkTo, resolveLink, sidebarSpace, registry } = usePlatform();
  const { t } = useI18n();
  const platformHome = registry.matchRoute('/')?.menu;
  const opened = platformHome !== undefined ? resolveLink(platformHome.id) : null;
  const menuId = opened?.allowed ? platformHome?.id : sidebarSpace?.homeMenuId;
  if (menuId === undefined) return null;
  return <Button asChild size="sm" variant="secondary"><PlatformLink href={opened?.allowed ? opened.href : linkTo(menuId)}>{t('home')}</PlatformLink></Button>;
}
