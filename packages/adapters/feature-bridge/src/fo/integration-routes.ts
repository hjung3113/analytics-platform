import { operatorRoute, routeHere, routeSearch } from './operator-route';

/**
 * 연동 route tables (#762 s, #595 4d): FeedbackOps' `/integration…` → the four platform 연동 menus and back (대시보드·근거·커버리지·연결). `selected` is the
 * platform `focus` (06 §13) on the two screens that select; Coverage keeps FO's `view`. `managedSystem=all` is FO's "no scope", so it maps to an explicit clear.
 * `returnTo` and `platformReturn` are never mapped (the platform carries `returnTo` itself), so a link carrying either stays unlinked. In `operatorHostLinks`
 * (`operator-links.ts`) since 762p2, so the Home coverage card, the jump cards and the recovery source links reach the menus.
 */
const SCOPE_ALL = { managedSystem: 'all' } as const;

/** 연동 대시보드: `/integration`; the recovery queue's own URL (`useRecoveryQueue` reads these keys). `presentation` maps as is, the screen reads `visible` as absent. */
export const integrationDashboardRoute = operatorRoute({
  foPath: '/integration',
  foFixed: {},
  menuId: 'integration',
  keys: {
    selected: 'focus',
    category: 'category',
    presentation: 'presentation',
    history: 'history',
    cursor: 'cursor',
    managedSystem: 'managedSystem',
  },
  foAbsent: SCOPE_ALL,
});

/** 근거: `/integration/evidence` (`EvidenceRoute`). */
export const evidenceRoute = operatorRoute({
  foPath: '/integration/evidence',
  foFixed: {},
  menuId: 'evidence',
  keys: { selected: 'focus', source: 'source', q: 'q', cursor: 'cursor', managedSystem: 'managedSystem' },
  foAbsent: SCOPE_ALL,
});

/** 커버리지: `/integration/coverage` (`CoverageRoute`); `view` stays FO's. */
export const coverageRoute = operatorRoute({
  foPath: '/integration/coverage',
  foFixed: {},
  menuId: 'coverage',
  keys: { view: 'view', 'filter.analytics_area': 'area', cursor: 'cursor', managedSystem: 'managedSystem' },
  foAbsent: SCOPE_ALL,
});

/** 연결: `/integration/links` (`LinksRoute`); its inventory treats `all` as no scope. */
export const entityLinksRoute = operatorRoute({
  foPath: '/integration/links',
  foFixed: {},
  menuId: 'entity-links',
  keys: { status: 'status', type: 'type', managedSystem: 'managedSystem' },
  foAbsent: SCOPE_ALL,
});

/** Module-level hooks: `FeatureBridge` memoizes its seam on their identities. */
export const useIntegrationDashboardSearch = routeSearch(integrationDashboardRoute);
export const useIntegrationDashboardHere = routeHere(integrationDashboardRoute);
export const useEvidenceSearch = routeSearch(evidenceRoute);
export const useEvidenceHere = routeHere(evidenceRoute);
export const useCoverageSearch = routeSearch(coverageRoute);
export const useCoverageHere = routeHere(coverageRoute);
export const useEntityLinksSearch = routeSearch(entityLinksRoute);
export const useEntityLinksHere = routeHere(entityLinksRoute);

/** The four targets; each table has its own `foPath`, so none shadows another. */
export const integrationOperatorTargets = [
  integrationDashboardRoute.target,
  evidenceRoute.target,
  coverageRoute.target,
  entityLinksRoute.target,
];
