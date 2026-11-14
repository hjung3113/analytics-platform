import type { ScopeGrant } from '../menu-dispatch/index.js';
import type { ItemRow } from './repositories/item-read.js';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const visibleSite = (site: unknown, grants: readonly ScopeGrant[]): boolean => typeof site === 'string' && grants.some(grant => grant.site === site && grant.rooms.length > 0);

/** Response-only projection. Unknown Site fails closed; arbitrary saved page keys may also contain equipment IDs. */
export function maskItem(row: ItemRow, grants: readonly ScopeGrant[]): Omit<ItemRow, 'origin'> & { origin: (NonNullable<ItemRow['origin']> & { restricted?: true }) | null; restricted?: true; effectCompareRestricted?: true } {
  const visible = visibleSite(object(row.origin?.context).scopeId, grants);
  return {
    ...row,
    ...(!visible ? {
      restricted: true as const,
      targets: row.targets.map(target => ({ kind: target.kind, externalKey: '', displayName: '' })),
      origin: row.origin ? { menuId: row.origin.menuId, context: {}, restricted: true as const } : null,
    } : {}),
    ...(row.effectCompareLink && (!visible || !visibleLink(row.effectCompareLink, grants)) ? { effectCompareRestricted: true as const } : {}),
    effectCompareLink: visible && visibleLink(row.effectCompareLink, grants) ? row.effectCompareLink : null,
  };
}

function visibleLink(link: string | null, grants: readonly ScopeGrant[]): boolean {
  if (!link) return false;
  try { return visibleSite(new URL(link, 'https://platform.invalid').searchParams.get('scopeId'), grants); }
  catch { return false; }
}

/** Historical snapshots must prove their own Site, rather than inherit an item's possibly changed origin. */
export function maskChanges(changes: unknown, grants: readonly ScopeGrant[]): unknown {
  const result = { ...object(changes) };
  for (const key of ['before', 'after']) {
    if (!(key in result)) continue;
    const snapshot = object(result[key]);
    const origin = object(snapshot.origin);
    const visible = visibleSite(object(origin.context).scopeId, grants);
    result[key] = {
      ...snapshot,
      ...(!visible ? {
        restricted: true,
        ...('targets' in snapshot ? { targets: Array.isArray(snapshot.targets) ? snapshot.targets.map(target => ({ kind: object(target).kind, externalKey: '', displayName: '' })) : [] } : {}),
        ...('origin' in snapshot ? { origin: snapshot.origin ? { menuId: origin.menuId, context: {}, restricted: true } : null } : {}),
      } : {}),
      ...('effectCompareLink' in snapshot ? { effectCompareLink: visible && typeof snapshot.effectCompareLink === 'string' && visibleLink(snapshot.effectCompareLink, grants) ? snapshot.effectCompareLink : null } : {}),
    };
  }
  return result;
}
