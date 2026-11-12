import type { ScopeCheck } from './bundle/routing.js';
import type { ValueMap } from './bundle/targets.js';
import { MenuUpstreamError } from './forwarder.js';
import { mapValue } from './routing.js';

/** Own properties only; escaped JSON pointer segments are decoded in RFC 6901 order. */
export function pointerValue(row: unknown, pointer: string): unknown {
  let value = row;
  for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
export function rowInScope(row: unknown, check: ScopeCheck, site: string | null, rooms: readonly string[], map: ValueMap): boolean {
  const rawRoom = pointerValue(row, check.roomField);
  const room = typeof rawRoom === 'string' ? mapValue(rawRoom, map.room, true) : undefined;
  const rawSite = check.siteField === undefined ? undefined : pointerValue(row, check.siteField);
  const actualSite = check.siteField === undefined ? site : typeof rawSite === 'string' ? mapValue(rawSite, map.site, true) : undefined;
  return actualSite === site && room !== undefined && rooms.includes(room);
}
export function enforceRowScope(row: unknown, check: ScopeCheck | undefined, site: string | null, rooms: readonly string[], map: ValueMap): boolean {
  if (!check || check.mode === 'resolve-keys') return true;
  if (rowInScope(row, check, site, rooms, map)) return true;
  if (check.mode === 'verify-rows') throw new MenuUpstreamError('unavailable');
  return false;
}
