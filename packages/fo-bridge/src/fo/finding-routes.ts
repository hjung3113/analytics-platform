import { operatorRoute, routeHere, routeSearch } from './operator-route';
import { UUID_PATTERN } from './uuid';

/**
 * Findings route table (#762 s, #595 4d): FeedbackOps' `/findings…` → the platform Findings menu and back. `selected` is the platform `focus` (06 §13), and
 * FO's `/findings/<id>` detail href reads as `selected=<id>`; `managedSystem=all` is FO's "no scope", so it maps to an explicit clear. `returnTo` and
 * `platformReturn` are never mapped (the platform carries `returnTo` itself), so a link carrying either stays unlinked. Not in `operatorHostLinks`
 * (`operator-links.ts`) until 762p1 wires it, so nothing links to the menu yet.
 */
export const findingsRoute = operatorRoute({
  foPath: '/findings',
  foFixed: {},
  menuId: 'fo-findings',
  keys: {
    selected: 'focus',
    q: 'q',
    'filter.analytics_area': 'area',
    status: 'status',
    execution: 'execution',
    assignment: 'assignment',
    managedSystem: 'managedSystem',
  },
  foAbsent: { managedSystem: 'all' },
  detailPath: { key: 'selected', pattern: UUID_PATTERN },
});

/** Module-level hooks: `FoBridge` memoizes its seam on their identities. */
export const useFindingsSearch = routeSearch(findingsRoute);
export const useFindingsHere = routeHere(findingsRoute);
