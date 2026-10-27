import { describe, expect, it } from 'vitest';
import {
  coverageRoute,
  entityLinksRoute,
  evidenceRoute,
  integrationDashboardRoute,
  integrationOperatorTargets,
} from './integration-routes';
import { operatorHostLinks } from './operator-links';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const AREA = '55555555-5555-4555-8555-555555555555';
const ITEM = `r1_${'a'.repeat(23)}`;
const EVIDENCE = '99999999-9999-4999-8999-999999999999';

const query = (to: string) => Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1)));
const sorted = (keys: readonly string[]) => [...keys].sort();

describe('연동 tables', () => {
  it.each([
    ['dashboard selection', integrationDashboardRoute, 'fo-integration', `/integration?selected=${ITEM}`, { focus: ITEM }],
    ['dashboard every key', integrationDashboardRoute, 'fo-integration', `/integration?selected=${ITEM}&category=unassigned-voc&presentation=hidden&history=true&cursor=c&managedSystem=${SYSTEM}`,
      { focus: ITEM, category: 'unassigned-voc', presentation: 'hidden', history: 'true', cursor: 'c', managedSystem: SYSTEM }],
    ['evidence scoped', evidenceRoute, 'fo-evidence', `/integration/evidence?managedSystem=${SYSTEM}`, { managedSystem: SYSTEM }],
    ['evidence every key', evidenceRoute, 'fo-evidence', `/integration/evidence?selected=${EVIDENCE}&source=voc&q=a&cursor=c&managedSystem=${SYSTEM}`,
      { focus: EVIDENCE, source: 'voc', q: 'a', cursor: 'c', managedSystem: SYSTEM }],
    ['coverage', coverageRoute, 'fo-coverage', '/integration/coverage', {}],
    ['coverage areas', coverageRoute, 'fo-coverage', `/integration/coverage?view=areas&managedSystem=${SYSTEM}`, { view: 'areas', managedSystem: SYSTEM }],
    ['coverage every key', coverageRoute, 'fo-coverage', `/integration/coverage?view=areas&filter.analytics_area=${AREA}&cursor=c&managedSystem=${SYSTEM}`,
      { view: 'areas', area: AREA, cursor: 'c', managedSystem: SYSTEM }],
    ['links scoped', entityLinksRoute, 'fo-entity-links', `/integration/links?managedSystem=${SYSTEM}`, { managedSystem: SYSTEM }],
    ['links every key', entityLinksRoute, 'fo-entity-links', `/integration/links?status=stale&type=related_to&managedSystem=${SYSTEM}`,
      { status: 'stale', type: 'related_to', managedSystem: SYSTEM }],
  ])('maps the %s link to its menu and back to the same FO search', (_name, route, menuId, to, page) => {
    const target = route.target(to);
    expect(target).toEqual({ menuId, page });
    expect(route.toFoSearch(target!.page!)).toEqual(to.includes('?') ? query(to) : {});
  });

  it('reads managedSystem=all as an explicit clear on every table', () => {
    for (const route of [integrationDashboardRoute, evidenceRoute, coverageRoute, entityLinksRoute]) {
      expect(route.target(`${route.foPath}?managedSystem=all`)?.page).toEqual({ managedSystem: null });
    }
  });

  it.each([
    ['returnTo', '&returnTo=%2Fhome'],
    ['platformReturn', '&platformReturn=x'],
    ['an unknown key', '&unknown=1'],
    ['a duplicated key', `&managedSystem=${SYSTEM}`],
  ])('leaves a link with %s unlinked on every table', (_name, extra) => {
    for (const route of [integrationDashboardRoute, evidenceRoute, coverageRoute, entityLinksRoute]) {
      expect(route.target(`${route.foPath}?managedSystem=${SYSTEM}${extra}`)).toBeNull();
    }
  });

  it('leaves /admin/settings#coverage and a Findings path unlinked', () => {
    for (const route of [integrationDashboardRoute, evidenceRoute, coverageRoute, entityLinksRoute]) {
      expect(route.target('/admin/settings#coverage')).toBeNull();
      expect(route.target('/findings')).toBeNull();
    }
  });

  it('keeps every 연동 path to its own table', () => {
    const tables = [integrationDashboardRoute, evidenceRoute, coverageRoute, entityLinksRoute];
    for (const route of tables) {
      for (const other of tables.filter(table => table !== route)) expect(other.target(route.foPath)).toBeNull();
    }
    expect(integrationDashboardRoute.target('/integration/evidence')).toBeNull();
  });

  it('keeps keys another screen owns unlinked', () => {
    expect(evidenceRoute.target('/integration/evidence?view=areas')).toBeNull();
    expect(coverageRoute.target('/integration/coverage?source=voc')).toBeNull();
    expect(entityLinksRoute.target(`/integration/links?selected=${EVIDENCE}`)).toBeNull();
    expect(integrationDashboardRoute.target('/integration?view=areas')).toBeNull();
  });

  it('pins the page keys of each table', () => {
    expect(sorted(integrationDashboardRoute.pageKeys)).toEqual(['category', 'cursor', 'focus', 'history', 'managedSystem', 'presentation']);
    expect(sorted(evidenceRoute.pageKeys)).toEqual(['cursor', 'focus', 'managedSystem', 'q', 'source']);
    expect(sorted(coverageRoute.pageKeys)).toEqual(['area', 'cursor', 'managedSystem', 'view']);
    expect(sorted(entityLinksRoute.pageKeys)).toEqual(['managedSystem', 'status', 'type']);
  });

  it('exposes the four targets, all wired into operatorHostLinks', () => {
    expect(integrationOperatorTargets).toHaveLength(4);
    const { targetOf } = operatorHostLinks;
    expect(targetOf('/integration')?.menuId).toBe('fo-integration');
    expect(targetOf('/integration/evidence')?.menuId).toBe('fo-evidence');
    expect(targetOf('/integration/coverage')?.menuId).toBe('fo-coverage');
    expect(targetOf('/integration/links')?.menuId).toBe('fo-entity-links');
    expect(targetOf(`/integration?selected=${ITEM}`)).toEqual({ menuId: 'fo-integration', page: { focus: ITEM } });
    expect(targetOf(`/integration/evidence?selected=${EVIDENCE}`)).toEqual({ menuId: 'fo-evidence', page: { focus: EVIDENCE } });
    expect(targetOf('/integration/coverage?view=areas')).toEqual({ menuId: 'fo-coverage', page: { view: 'areas' } });
    expect(targetOf('/integration/coverage?returnTo=%2Fhome')).toBeNull();
    expect(targetOf('/admin/settings#coverage')).toBeNull();
  });
});
