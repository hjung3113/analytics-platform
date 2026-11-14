import { useId } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { PlatformLink, useI18n, usePlatform, type ObjectLinkOptions } from '@ap/kernel';
import { RowAction } from '../drawer/RowAction';
import { ObjectLinkItems } from './ObjectLinkItems';

export type ObjectLinksProps = ObjectLinkOptions & { kind: string; id: string; compact?: boolean };

/** Body placements only (rows/drawers). PlatformPage owns the opt-in header groups (06 §22). */
export function ObjectLinks({ kind, id, compact = false, ...options }: ObjectLinksProps) {
  const { objectLinks } = usePlatform();
  const { t, tx } = useI18n();
  const reasonId = useId();
  const links = objectLinks({ kind, id }, options);
  if (!links.length) return null;
  const only = links.length === 1 ? links[0]! : null;
  if (only) return <span className="inline-grid gap-0.5 break-keep">
    <RowAction compact={compact} icon={ArrowUpRight} label={tx(only.label)} text={tx(only.label)} disabled={!only.allowed}
      aria-describedby={only.allowed ? undefined : reasonId} link={only.allowed ? <PlatformLink href={only.href} /> : undefined} />
    {!only.allowed && <span id={reasonId} className="text-tiny text-text-secondary">{t('menuDenied')}</span>}
  </span>;
  return <RowAction compact={compact} icon={ArrowUpRight} label={t('objectLinksAccessible', { id })} text={t('objectLinksShort')}
    menu={<ObjectLinkItems links={links} />} />;
}
