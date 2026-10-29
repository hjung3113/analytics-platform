import { usePlatform } from '@ap/kernel';
import { operatorRoute, routeHere, routeSearch, type OperatorRoute } from './operator-route';
import type { CarryTarget, PlatformTarget, TargetOf } from './links';
import { surveyTarget } from './survey-links';
import { UUID_PATTERN } from './uuid';

/**
 * Surveys route table (#764 s, #595 4f): FeedbackOps' `/surveys…` → the platform Surveys-management menu and back. `selected` is the platform `focus`
 * (06 §13), and FO's `/surveys/<id>` detail href reads as `selected=<id>`; `managedSystem=all` is FO's "no scope", so it maps to an explicit clear.
 * `returnTo` and `platformReturn` are never mapped (the platform carries `returnTo` itself), so a link carrying either stays unlinked.
 * `operatorHostLinks` (`operator-links.ts`) composes `surveyOperatorTargets` (the reporter targets first).
 */
export const surveysRoute = operatorRoute({
  foPath: '/surveys',
  foFixed: {},
  menuId: 'survey-management',
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

/** Module-level hooks: `FeatureBridge` memoizes its seam on their identities. */
export const useSurveysSearch = routeSearch(surveysRoute);
export const useSurveysHere = routeHere(surveysRoute);

const CHILD_PATH = /^\/surveys\/([^/]+)(\/results|\/follow-up)?$/;
const CHILD_MENU: Record<string, string> = { '': 'survey-builder', '/results': 'survey-results', '/follow-up': 'survey-follow-up' };
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

/** The Surveys targets in the order `operatorHostLinks` must try them (it spreads this): the reporter `/surveys/participate` and `/respond` first, then the child screens, then the list. */
export const surveyOperatorTargets: TargetOf[] = [surveyTarget, surveyChildTarget, surveysRoute.target];

const SURVEY_MENUS: ReadonlySet<string> = new Set(['survey-management', ...Object.values(CHILD_MENU)]);
const CHILD_MENUS: ReadonlySet<string> = new Set(Object.values(CHILD_MENU));
/** The list-context page keys and the value shapes FeedbackOps' Surveys schemas accept for them (`status` and `follow_up` are single-valued, `area` a UUID or `unset`). */
const CARRIED_VALUE: Readonly<Record<string, (value: string) => boolean>> = {
  area: value => value === 'unset' || UUID_PATTERN.test(value),
  status: value => value === 'open',
  follow_up: value => value === 'needed',
};

/**
 * The context the Survey screens' own links leave out (FeedbackOps' hrefs are bare: `/surveys/<id>?builder=true`, `/surveys/<id>/results`, `/surveys`). A link drawn on one Survey
 * menu toward a different one gets the current page's `area`/`status`/`follow_up` when the target does not name that key, and a link from a child back to the list gets
 * `focus` = this Survey. A key the target names (a clear, `null`, included) wins; `returnTo`/`platformReturn` are never carried (`managedSystem` and `returnTo` ride on the space).
 * The current values already passed the screen's own search schema (`FeatureScreenPage` rejects the page before mounting), and the shapes are checked again here.
 */
export const surveyCarry: CarryTarget = (target, here) => {
  if (here.menuId === undefined || here.menuId === target.menuId || !SURVEY_MENUS.has(here.menuId) || !SURVEY_MENUS.has(target.menuId)) return target;
  const page: Record<string, string | null> = { ...target.page };
  for (const [key, accepts] of Object.entries(CARRIED_VALUE)) {
    const value = here.pageParam(key);
    if (!Object.hasOwn(page, key) && value !== null && accepts(value)) page[key] = value;
  }
  const surveyId = here.params.surveyId;
  if (target.menuId === 'survey-management' && CHILD_MENUS.has(here.menuId) && surveyId !== undefined && UUID_PATTERN.test(surveyId) && !Object.hasOwn(page, 'focus')) page.focus = surveyId;
  return { ...target, page };
};

type ChildSpec = { menuId: string; suffix: string; builder: boolean; focus: boolean };
const CHILD_SPECS: Readonly<Record<'builder' | 'results' | 'followUp', ChildSpec>> = {
  builder: { menuId: 'survey-builder', suffix: '', builder: true, focus: false },
  results: { menuId: 'survey-results', suffix: '/results', builder: false, focus: false },
  followUp: { menuId: 'survey-follow-up', suffix: '/follow-up', builder: false, focus: true },
};
const PAGE_TO_FO = Object.fromEntries(Object.entries(CHILD_KEYS).map(([foKey, pageKey]) => [pageKey, foKey])) as Readonly<Record<string, string>>;

/**
 * The route table of one hidden survey child screen (`/surveys/:surveyId[/results|/follow-up]`, `?builder=true` for the builder). The survey id is a path param, so it is
 * not a page key; the list scope rides on the page keys and reads back as the FO search. The follow-up screen also owns `focus` (the selected response, a UUID) — the screen keeps it in
 * its own state in FO, so it is a page key only and never an FO search key. `foPath` is descriptive (`:surveyId` stands for the path param).
 */
function surveyChildRoute({ menuId, suffix, builder, focus }: ChildSpec): OperatorRoute {
  const pageKeys = [...Object.values(CHILD_KEYS), ...(focus ? ['focus'] : [])];
  return {
    foPath: `/surveys/:surveyId${suffix}`,
    pageKeys,
    target: to => {
      const target = surveyChildTarget(to);
      return target !== null && target.menuId === menuId ? target : null;
    },
    toFoSearch(page) {
      const search: Record<string, string> = builder ? { builder: 'true' } : {};
      for (const [foKey, pageKey] of Object.entries(CHILD_KEYS)) {
        const value = page[pageKey];
        if (value !== undefined && value !== null && value !== '') search[foKey] = value;
      }
      return search;
    },
    toFoHash: () => '',
    preset(foSearch) {
      const page: Record<string, string> = {};
      for (const [foKey, value] of Object.entries(foSearch)) if (Object.hasOwn(CHILD_KEYS, foKey)) page[CHILD_KEYS[foKey]!] = value;
      return page;
    },
    rejectedKey(pageParam, accepts) {
      for (const pageKey of pageKeys) {
        const value = pageParam(pageKey);
        if (value === null) continue;
        if (!(pageKey === 'focus' ? UUID_PATTERN.test(value) : accepts(PAGE_TO_FO[pageKey]!, value))) return { key: pageKey, value };
      }
      return null;
    },
  };
}

export const surveyBuilderRoute = surveyChildRoute(CHILD_SPECS.builder);
export const surveyResultsRoute = surveyChildRoute(CHILD_SPECS.results);
export const surveyFollowUpRoute = surveyChildRoute(CHILD_SPECS.followUp);

/** The current child page as the FeedbackOps path+query: the survey id comes from the matched route's `:surveyId`. */
function childHere(route: OperatorRoute, suffix: string) {
  const useRouteSearch = routeSearch(route);
  return function useChildHere(): string {
    const search = useRouteSearch();
    const { route: match } = usePlatform();
    const query = new URLSearchParams(search);
    const text = query.toString();
    const path = `/surveys/${match?.params.surveyId ?? ''}${suffix}`;
    return text === '' ? path : `${path}?${text}`;
  };
}

/** Module-level hooks: `FeatureBridge` memoizes its seam on their identities. */
export const useSurveyBuilderSearch = routeSearch(surveyBuilderRoute);
export const useSurveyBuilderHere = childHere(surveyBuilderRoute, CHILD_SPECS.builder.suffix);
export const useSurveyResultsSearch = routeSearch(surveyResultsRoute);
export const useSurveyResultsHere = childHere(surveyResultsRoute, CHILD_SPECS.results.suffix);
export const useSurveyFollowUpSearch = routeSearch(surveyFollowUpRoute);
export const useSurveyFollowUpHere = childHere(surveyFollowUpRoute, CHILD_SPECS.followUp.suffix);
