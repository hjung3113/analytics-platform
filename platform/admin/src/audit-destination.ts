/**
 * The screen's two-entry type → menu map (#50, 06 §22). Contracts never learn menu ids; the screen owns
 * the map, and this helper is its pure half: it calls the injected `resolveLink` and returns `{ ok, href }`.
 * It never builds a URL by hand and never throws — an unknown type, a site-less equipment destination,
 * a destination this assembly does not register (`none`, #1903) or one the user may not open answers `{ ok: false }`.
 */
import type { AuditTarget } from '@ap/contracts';
import type { MenuPlatform } from '@ap/kernel';

/** The kernel's resolveLink, injected so the helper stays a pure function in tests. */
export type ResolveLink = MenuPlatform['resolveLink'];

export type DestinationLink = { ok: true; href: string } | { ok: false };

const answer = (link: ReturnType<ResolveLink>): DestinationLink => (link.kind === 'link' && link.allowed ? { ok: true, href: link.href } : { ok: false });

export function auditDestination(resolveLink: ResolveLink, target: AuditTarget): DestinationLink {
  if (target.type === 'equipment') {
    if (target.scopeId === null) return { ok: false };
    // The destination's site goes in as the requested scope; the kernel clears the previous site's rooms when it
    // differs (site boundary) and never replaces the analysis Selection with the equipment id (§22).
    return answer(resolveLink('equipment-detail', { params: { equipmentId: target.id }, page: { tab: 'audit' }, returnTo: true, global: { scopeId: target.scopeId } }));
  }
  if (target.type === 'metric') {
    // The destination id must not overwrite the carried metric pair (06 §6.1): no metricId/metricVersion
    // in the query and no scopeId — a metric destination has no site.
    return answer(resolveLink('metric-detail', { params: { metricId: target.id }, page: { tab: 'history' }, returnTo: true }));
  }
  return { ok: false };
}
