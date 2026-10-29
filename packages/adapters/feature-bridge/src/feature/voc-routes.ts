import { operatorRoute, routeHere, routeSearch } from './operator-route';
import { UUID_PATTERN } from './uuid';

/** 수신함: `/vocs?view=inbox`; screen `selected` is the platform `focus` (06 §13). */
export const inboxRoute = operatorRoute({
  screenPath: '/vocs',
  screenFixed: { view: 'inbox' },
  menuId: 'inbox',
  keys: {
    selected: 'focus', q: 'q', tab: 'tab', sort: 'sort', 'filter.severity': 'severity', 'filter.reporterStatus': 'reporterStatus',
    'filter.owner': 'owner', 'filter.analytics_area': 'area', managedSystem: 'managedSystem',
  },
});

/** Triage: `/vocs?view=triage`; its inline workbench panel selects through `focus` as well (761 plan D7). */
export const triageRoute = operatorRoute({
  screenPath: '/vocs',
  screenFixed: { view: 'triage' },
  menuId: 'triage',
  keys: { selected: 'focus', tab: 'tab', managedSystem: 'managedSystem', 'filter.analytics_area': 'area' },
});

/**
 * Clusters: `/voc-clusters`; `selected` is `focus` (06 §13). the feature screens' cluster schema treats `managedSystem=all` as no scope, and the platform scope writes a uuid
 * or nothing, so an `all` in a screen href maps to an explicit clear of `managedSystem` (the link is kept, nothing stored, a carried scope dropped). screen's VOC detail links a cluster
 * as `/voc-clusters/<id>`; that detail href reads as `selected=<id>`.
 */
export const clustersRoute = operatorRoute({
  screenPath: '/voc-clusters',
  screenFixed: {},
  menuId: 'clusters',
  keys: { selected: 'focus', managedSystem: 'managedSystem' },
  screenAbsent: { managedSystem: 'all' },
  detailPath: { key: 'selected', pattern: UUID_PATTERN },
});

/** Module-level hooks: `FeatureBridge` memoizes its seam on their identities (unrelated renders never rebuild it). */
export const useInboxSearch = routeSearch(inboxRoute);
export const useInboxHere = routeHere(inboxRoute);
export const useTriageSearch = routeSearch(triageRoute);
export const useTriageHere = routeHere(triageRoute);
export const useClustersSearch = routeSearch(clustersRoute);
export const useClustersHere = routeHere(clustersRoute);
