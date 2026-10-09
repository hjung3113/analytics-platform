import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';

/** Home control for kernel and error views. A null sidebar uses the menu registered at `/`, or draws nothing. */
export function HomeLink() {
  const { linkTo, sidebarSpace, registry } = usePlatform();
  const { t } = useI18n();
  const menuId = sidebarSpace !== null ? sidebarSpace.homeMenuId : registry.matchRoute('/')?.menu.id;
  if (menuId === undefined) return null;
  return <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo(menuId)}>{t('home')}</PlatformLink></Button>;
}
