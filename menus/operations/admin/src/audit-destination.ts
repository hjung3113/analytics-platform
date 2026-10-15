/**
 * The screen's two-entry type → menu map (#50, 06 §22). Contracts never learn menu ids; the screen owns
 * the map, and this helper is its pure half: it calls the injected `linkTo` and returns `{ ok, href }`.
 * It never builds a URL by hand and never throws — an unknown type or a site-less equipment destination
 * answers `{ ok: false }` without calling `linkTo`.
 */
import type { AuditTarget, GlobalContext } from '@ap/contracts';

/** The kernel's linkTo signature, restated so the helper stays a pure function in tests. */
export type LinkTo = (menuId: string, options?: {
  params?: Record<string, string>;
  page?: Record<string, string>;
  global?: Partial<GlobalContext>;
  returnTo?: boolean;
}) => string;

export type DestinationLink = { ok: true; href: string } | { ok: false };

export function auditDestination(linkTo: LinkTo, target: AuditTarget): DestinationLink {
  if (target.type === 'equipment') {
    if (target.scopeId === null) return { ok: false };
    // The destination's site goes in as the requested scope; the kernel clears the previous site's rooms when it
    // differs (site boundary) and never replaces the analysis Selection with the equipment id (§22).
    return { ok: true, href: linkTo('equipment-detail', { params: { equipmentId: target.id }, page: { tab: 'audit' }, returnTo: true, global: { scopeId: target.scopeId } }) };
  }
  if (target.type === 'metric') {
    // The destination id must not overwrite the carried metric pair (06 §6.1): no metricId/metricVersion
    // in the query and no scopeId — a metric destination has no site.
    return { ok: true, href: linkTo('metric-detail', { params: { metricId: target.id }, page: { tab: 'history' }, returnTo: true }) };
  }
  return { ok: false };
}
