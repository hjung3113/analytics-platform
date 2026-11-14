import { hasRequestScope, type ScopeGrant } from '../menu-dispatch/index.js';
import type { ItemRow } from './repositories/item-read.js';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Response-only projection. Unknown Site fails closed; arbitrary saved page keys may also contain equipment IDs. */
export function maskItem(row: ItemRow, grants: readonly ScopeGrant[]): Omit<ItemRow, 'origin'> & { origin: (NonNullable<ItemRow['origin']> & { restricted?: true }) | null; restricted?: true; effectCompareRestricted?: true } {
  const visible = hasRequestScope(object(row.origin?.context), grants);
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
  try {
    const params = new URL(link, 'https://platform.invalid').searchParams;
    return params.getAll('scopeId').length === 1 && hasRequestScope({ scopeId: params.get('scopeId'), roomNames: params.getAll('roomNames') }, grants);
  }
  catch { return false; }
}

/** Historical snapshots must prove their own Site, rather than inherit an item's possibly changed origin. */
export function maskChanges(changes: unknown, grants: readonly ScopeGrant[]): unknown {
  const project = (value: unknown, inheritedVisible = false, snapshot = false): unknown => {
    if (Array.isArray(value)) return value.map(entry => project(entry, inheritedVisible));
    if (value === null || typeof value !== 'object') return value;
    const source = object(value);
    const origin = object(source.origin);
    const visible = 'origin' in source ? hasRequestScope(object(origin.context), grants) : inheritedVisible;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      if (key === 'origin' && !visible) {
        result[key] = entry ? { menuId: origin.menuId, context: {}, restricted: true } : null;
      } else if (key === 'targets' && !visible) {
        result[key] = Array.isArray(entry) ? entry.map(target => ({ kind: object(target).kind, externalKey: '', displayName: '' })) : [];
      } else if (key === 'effectCompareLink' || key === 'compareLink') {
        result[key] = visible && typeof entry === 'string' && visibleLink(entry, grants) ? entry : null;
      } else {
        // Each before/after is independent; nested effect objects inherit only that snapshot's Site.
        const boundary = key === 'before' || key === 'after';
        result[key] = project(entry, boundary ? false : visible, boundary);
      }
    }
    if (!visible && (snapshot || 'origin' in source || 'targets' in source)) result.restricted = true;
    return result;
  };
  return project(changes);
}
