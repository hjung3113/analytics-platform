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

/** Opening a destination of another site must not carry the previous site's rooms across the boundary —
 *  the same site-boundary clear as setGlobal. The analysis Selection is never replaced by a link (§22). */
const SITE_BOUNDARY_CLEAR = (scopeId: string): Partial<GlobalContext> => ({
  scopeId, roomNames: null, condition: null, selection: null, lotIds: null, recipeIds: null, ppid: null,
});

export function auditDestination(linkTo: LinkTo, target: AuditTarget, currentScopeId: string | null): DestinationLink {
  if (target.type === 'equipment') {
    if (target.scopeId === null) return { ok: false };
    const options = {
      params: { equipmentId: target.id },
      page: { tab: 'audit' },
      returnTo: true,
      ...(target.scopeId !== currentScopeId ? { global: SITE_BOUNDARY_CLEAR(target.scopeId) } : {}),
    };
    return { ok: true, href: linkTo('equipment-detail', options) };
  }
  if (target.type === 'metric') {
    // The destination id must not overwrite the carried metric pair (06 §6.1): no metricId/metricVersion
    // in the query and no scopeId — a metric destination has no site.
    return { ok: true, href: linkTo('metric-detail', { params: { metricId: target.id }, page: { tab: 'history' }, returnTo: true }) };
  }
  return { ok: false };
}
