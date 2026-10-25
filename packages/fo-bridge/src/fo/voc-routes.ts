import { operatorRoute, routeHere, routeSearch } from './operator-route';
import { UUID_PATTERN } from './uuid';

/** 수신함: `/vocs?view=inbox`; FO `selected` is the platform `focus` (06 §13). */
export const inboxRoute = operatorRoute({
  foPath: '/vocs',
  foFixed: { view: 'inbox' },
  menuId: 'fo-inbox',
  keys: {
    selected: 'focus', q: 'q', tab: 'tab', sort: 'sort', 'filter.severity': 'severity', 'filter.reporterStatus': 'reporterStatus',
    'filter.owner': 'owner', 'filter.analytics_area': 'area', managedSystem: 'managedSystem',
  },
});

/** Triage: `/vocs?view=triage`; its inline workbench panel selects through `focus` as well (761 plan D7). */
export const triageRoute = operatorRoute({
  foPath: '/vocs',
  foFixed: { view: 'triage' },
  menuId: 'fo-triage',
  keys: { selected: 'focus', tab: 'tab', managedSystem: 'managedSystem', 'filter.analytics_area': 'area' },
});

/**
 * Clusters: `/voc-clusters`; `selected` is `focus` (06 §13). FeedbackOps' cluster schema treats `managedSystem=all` as no scope, and the platform scope writes a uuid
 * or nothing, so an `all` in an FO href maps to an explicit clear of `managedSystem` (the link is kept, nothing stored, a carried scope dropped). FO's VOC detail links a cluster
 * as `/voc-clusters/<id>`; that detail href reads as `selected=<id>`.
 */
export const clustersRoute = operatorRoute({
  foPath: '/voc-clusters',
  foFixed: {},
  menuId: 'fo-clusters',
  keys: { selected: 'focus', managedSystem: 'managedSystem' },
  foAbsent: { managedSystem: 'all' },
  detailPath: { key: 'selected', pattern: UUID_PATTERN },
});

/** Module-level hooks: `FoBridge` memoizes its seam on their identities (unrelated renders never rebuild it). */
export const useInboxSearch = routeSearch(inboxRoute);
export const useInboxHere = routeHere(inboxRoute);
export const useTriageSearch = routeSearch(triageRoute);
export const useTriageHere = routeHere(triageRoute);
export const useClustersSearch = routeSearch(clustersRoute);
export const useClustersHere = routeHere(clustersRoute);
