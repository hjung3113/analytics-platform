import { describe, expect, it } from 'vitest';
import { adminOperatorTargets, analyticsAreasRoute, managedSystemsRoute, permissionGrantsRoute, permissionRequestsRoute, settingsRoute } from './admin-routes';
import { operatorHostLinks } from './operator-links';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const ROW = '99999999-9999-4999-8999-999999999999';

const query = (to: string) => Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1)));

describe('Admin tables', () => {
  it.each([
    ['managed systems', managedSystemsRoute, '/admin/managed-systems', 'fo-managed-systems', {}],
    ['analytics areas, bare', analyticsAreasRoute, '/admin/analytics-areas', 'fo-analytics-areas', {}],
    ['analytics areas, every key', analyticsAreasRoute, `/admin/analytics-areas?managedSystem=${SYSTEM}&includeArchived=true&selected=${ROW}`, 'fo-analytics-areas',
      { system: SYSTEM, includeArchived: 'true', focus: ROW }],
    ['permission requests', permissionRequestsRoute, `/admin/permissions/requests?tab=approved&selected=${ROW}`, 'fo-permission-requests', { tab: 'approved', focus: ROW }],
    ['permission requests, bare', permissionRequestsRoute, '/admin/permissions/requests', 'fo-permission-requests', {}],
    ['permission grants', permissionGrantsRoute, `/admin/permissions/grants?tab=denies&selected=${ROW}`, 'fo-permission-grants', { tab: 'denies', focus: ROW }],
    ['settings', settingsRoute, '/admin/settings', 'fo-settings', {}],
  ])('maps the %s link to its menu and back to the same FO search', (_name, route, to, menuId, page) => {
    const target = route.target(to);
    expect(target).toEqual({ menuId, page });
    expect(route.toFoSearch(target!.page!)).toEqual(to.includes('?') ? query(to) : {});
  });

  it('maps the analytics-areas filter to the page key system, not the carried managedSystem', () => {
    expect(analyticsAreasRoute.target(`/admin/analytics-areas?managedSystem=${SYSTEM}`)?.page).toEqual({ system: SYSTEM });
    expect(analyticsAreasRoute.toFoSearch({ system: SYSTEM, managedSystem: 'x' })).toEqual({ managedSystem: SYSTEM });
    expect([...analyticsAreasRoute.pageKeys].sort()).toEqual(['focus', 'includeArchived', 'system']);
  });

  it('maps settings#coverage to the section page key and back', () => {
    const target = settingsRoute.target('/admin/settings#coverage');
    expect(target).toEqual({ menuId: 'fo-settings', page: { section: 'coverage' } });
    expect(settingsRoute.toFoHash(target!.page!)).toBe('#coverage');
    expect(settingsRoute.toFoSearch(target!.page!)).toEqual({});
    expect([...settingsRoute.pageKeys]).toEqual(['section']);
  });

  it.each([
    ['settings#other', settingsRoute, '/admin/settings#other'],
    ['managed systems#coverage', managedSystemsRoute, '/admin/managed-systems#coverage'],
    ['requests#coverage', permissionRequestsRoute, '/admin/permissions/requests#coverage'],
    ['returnTo', permissionGrantsRoute, '/admin/permissions/grants?returnTo=%2Fhome'],
    ['platformReturn', analyticsAreasRoute, '/admin/analytics-areas?platformReturn=x'],
    ['an unknown key', permissionRequestsRoute, '/admin/permissions/requests?unknown=1'],
    ['a key of another table', permissionGrantsRoute, `/admin/permissions/grants?includeArchived=true`],
    ['a duplicated key', permissionRequestsRoute, '/admin/permissions/requests?tab=all&tab=all'],
    ['a detail path', analyticsAreasRoute, `/admin/analytics-areas/${ROW}`],
    ['managedSystem on managed systems', managedSystemsRoute, `/admin/managed-systems?managedSystem=${SYSTEM}`],
  ])('leaves a link with %s unlinked', (_name, route, to) => {
    expect(route.target(to)).toBeNull();
  });

  it('exports the five targets, all wired into operatorHostLinks after the survey targets (764p2); an unmapped /admin path stays unlinked', () => {
    expect(adminOperatorTargets).toHaveLength(5);
    for (const to of [
      '/admin/managed-systems', `/admin/analytics-areas?managedSystem=${SYSTEM}&includeArchived=true`, `/admin/permissions/requests?tab=approved&selected=${ROW}`,
      `/admin/permissions/grants?tab=denies&selected=${ROW}`, '/admin/settings', '/admin/settings#coverage',
    ]) expect(operatorHostLinks.canLink(to)).toBe(true);
    expect(operatorHostLinks.targetOf('/admin/settings#coverage')).toEqual({ menuId: 'fo-settings', page: { section: 'coverage' } });
    expect(operatorHostLinks.canLink('/admin/foo')).toBe(false);
    expect(operatorHostLinks.canLink('/admin/settings#other')).toBe(false);
    expect(operatorHostLinks.targetOf('/surveys')?.menuId).toBe('fo-surveys');
  });
});
