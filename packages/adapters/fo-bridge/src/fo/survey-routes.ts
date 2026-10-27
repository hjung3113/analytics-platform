import { operatorRoute, routeHere, routeSearch } from './operator-route';
import type { PlatformTarget, TargetOf } from './links';
import { surveyTarget } from './survey-links';
import { UUID_PATTERN } from './uuid';

/**
 * Surveys route table (#764 s, #595 4f): FeedbackOps' `/surveys…` → the platform Surveys-management menu and back. `selected` is the platform `focus`
 * (06 §13), and FO's `/surveys/<id>` detail href reads as `selected=<id>`; `managedSystem=all` is FO's "no scope", so it maps to an explicit clear.
 * `returnTo` and `platformReturn` are never mapped (the platform carries `returnTo` itself), so a link carrying either stays unlinked.
 * Not in `operatorHostLinks` (`operator-links.ts`) yet: 764p1 wires `surveyOperatorTargets`.
 */
export const surveysRoute = operatorRoute({
  foPath: '/surveys',
  foFixed: {},
  menuId: 'fo-surveys',
  keys: {
    selected: 'focus',
    managedSystem: 'managedSystem',
    'filter.analytics_area': 'area',
    status: 'status',
    follow_up: 'follow_up',
  },
  foAbsent: { managedSystem: 'all' },
  detailPath: { key: 'selected', pattern: UUID_PATTERN },
});

/** Module-level hooks: `FoBridge` memoizes its seam on their identities. */
export const useSurveysSearch = routeSearch(surveysRoute);
export const useSurveysHere = routeHere(surveysRoute);

const CHILD_PATH = /^\/surveys\/([^/]+)(\/results|\/follow-up)?$/;
const CHILD_MENU: Record<string, string> = { '': 'fo-survey-builder', '/results': 'fo-survey-results', '/follow-up': 'fo-survey-follow-up' };
/** The list scope the three child screens carry back (FO key → platform page key). */
const CHILD_KEYS: Readonly<Record<string, string>> = {
  managedSystem: 'managedSystem',
  'filter.analytics_area': 'area',
  status: 'status',
  follow_up: 'follow_up',
};

/**
 * The survey child screens: `/surveys/<id>?builder=true` → builder, `/surveys/<id>/results` → results, `/surveys/<id>/follow-up` → follow-up, each with the
 * survey id as the `surveyId` param and the list scope carried. Anything else (a non-UUID id, `returnTo`, `platformReturn`, an unknown or repeated key,
 * a `#`, `builder` on a child path or with a value other than `true`, a bare `/surveys/<id>`) is `null` and left to {@link surveysRoute}.
 */
export const surveyChildTarget: TargetOf = (to): PlatformTarget | null => {
  if (to.includes('#')) return null;
  const at = to.indexOf('?');
  const match = CHILD_PATH.exec(at === -1 ? to : to.slice(0, at));
  const surveyId = match?.[1];
  if (surveyId === undefined || !UUID_PATTERN.test(surveyId)) return null;
  const child = match?.[2] ?? '';
  const search = new URLSearchParams(at === -1 ? '' : to.slice(at + 1));
  const seen = [...search.keys()];
  if (new Set(seen).size !== seen.length) return null;
  const page: Record<string, string | null> = {};
  let builder = false;
  for (const [key, value] of search) {
    if (key === 'builder') {
      if (child !== '' || value !== 'true') return null;
      builder = true;
    } else if (Object.hasOwn(CHILD_KEYS, key)) {
      if (value !== '') page[CHILD_KEYS[key]!] = key === 'managedSystem' && value === 'all' ? null : value;
    } else return null;
  }
  if (child === '' && !builder) return null;
  return { menuId: CHILD_MENU[child]!, params: { surveyId }, page };
};

/** The Surveys targets in the order `operatorHostLinks` must try them (764p1 spreads this; not wired yet): the reporter `/surveys/participate` and `/respond` first, then the child screens, then the list. */
export const surveyOperatorTargets: TargetOf[] = [surveyTarget, surveyChildTarget, surveysRoute.target];
