import { useI18n, usePlatform, type ObjectLink } from '@ap/kernel';
import { HeaderOverflowItem } from './HeaderOverflowItem';

/** Shared body/header rows; not a public placement API. */
export function ObjectLinkItems({ links }: { links: readonly ObjectLink[] }) {
  const { navigate, registry } = usePlatform();
  const { t, tx } = useI18n();
  const counts = new Map<string, number>();
  for (const link of links) { const label = tx(link.label); counts.set(label, (counts.get(label) ?? 0) + 1); }
  return <>{links.map(link => {
    const label = tx(link.label);
    const space = (counts.get(label) ?? 0) > 1 ? registry.spaceOf(registry.menuById(link.menuId)) : null;
    return <HeaderOverflowItem key={link.menuId} allowed={link.allowed} reason={t('menuDenied')}
      label={<span className="flex min-w-0 flex-col items-start break-keep text-left"><span className="text-sm">{label}</span>{space && <span className="text-tiny text-text-secondary">{tx(space.label)}</span>}</span>}
      onSelect={() => { navigate(link.href); }} />;
  })}</>;
}
