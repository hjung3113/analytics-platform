import { describe, expect, it } from 'vitest';
import { operatorHostLinks } from './operator-links';
import { clustersRoute, inboxRoute, triageRoute } from './voc-routes';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const AREA = '55555555-5555-4555-8555-555555555555';
const VOC = '66666666-6666-4666-8666-666666666666';

describe('inboxRoute', () => {
  it.each([
    ['unassigned queue', `/vocs?view=inbox&tab=unassigned&managedSystem=${SYSTEM}`, { tab: 'unassigned', managedSystem: SYSTEM }],
    ['high without link', '/vocs?view=inbox&tab=high-no-link', { tab: 'high-no-link' }],
    ['no task', '/vocs?view=inbox&tab=no-task', { tab: 'no-task' }],
    ['unset analytics area', '/vocs?view=inbox&filter.analytics_area=unset', { area: 'unset' }],
    ['every key', `/vocs?view=inbox&selected=${VOC}&q=pump&tab=untriaged&sort=created_at:asc&filter.severity=high&filter.reporterStatus=open&filter.owner=me&filter.analytics_area=${AREA}&managedSystem=${SYSTEM}`,
      { focus: VOC, q: 'pump', tab: 'untriaged', sort: 'created_at:asc', severity: 'high', reporterStatus: 'open', owner: 'me', area: AREA, managedSystem: SYSTEM }],
  ])('maps the %s link to inbox and back to the same FO search', (_name, to, page) => {
    const target = inboxRoute.target(to);
    expect(target).toEqual({ menuId: 'inbox', page });
    const back = inboxRoute.toFoSearch(target!.page!);
    expect(back).toEqual(Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1))));
  });

  it('declares exactly the page keys it maps, including focus and managedSystem', () => {
    expect([...inboxRoute.pageKeys].sort()).toEqual(['area', 'focus', 'managedSystem', 'owner', 'q', 'reporterStatus', 'severity', 'sort', 'tab']);
  });

  it('reads a platform page as the FO search, dropping keys outside the table', () => {
    expect(inboxRoute.toFoSearch({ focus: VOC, returnTo: '/x', tab: 'untriaged' })).toEqual({ view: 'inbox', selected: VOC, tab: 'untriaged' });
  });
});

describe('triageRoute', () => {
  it('maps selected to focus and the area filter to area, and back', () => {
    const to = `/vocs?view=triage&selected=${VOC}&tab=unassigned&managedSystem=${SYSTEM}&filter.analytics_area=unset`;
    const target = triageRoute.target(to);
    expect(target).toEqual({ menuId: 'triage', page: { focus: VOC, tab: 'unassigned', managedSystem: SYSTEM, area: 'unset' } });
    expect(triageRoute.toFoSearch(target!.page!)).toEqual(Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1))));
  });

  it('leaves the inbox-only keys unmapped', () => {
    expect(triageRoute.target('/vocs?view=triage&q=pump')).toBeNull();
    expect(triageRoute.target('/vocs?view=inbox&tab=unassigned')).toBeNull();
  });
});

describe('clustersRoute', () => {
  const CLUSTER = '77777777-7777-4777-8777-777777777777';

  it('maps selected to focus and the scope to managedSystem, and back', () => {
    const to = `/voc-clusters?selected=${CLUSTER}&managedSystem=${SYSTEM}`;
    const target = clustersRoute.target(to);
    expect(target).toEqual({ menuId: 'clusters', page: { focus: CLUSTER, managedSystem: SYSTEM } });
    expect(clustersRoute.toFoSearch(target!.page!)).toEqual(Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1))));
  });

  it('reads managedSystem=all as an explicit clear of the scope: the link stays and nothing is stored', () => {
    expect(clustersRoute.target(`/voc-clusters?managedSystem=all&selected=${CLUSTER}`)).toEqual({ menuId: 'clusters', page: { focus: CLUSTER, managedSystem: null } });
    expect(clustersRoute.target('/voc-clusters')).toEqual({ menuId: 'clusters', page: {} });
  });

  it('maps the VOC detail cluster href the FO code emits, /voc-clusters/<id>, to focus', () => {
    expect(operatorHostLinks.targetOf(`/voc-clusters/${CLUSTER}`)).toEqual({ menuId: 'clusters', page: { focus: CLUSTER } });
    expect(operatorHostLinks.targetOf('/voc-clusters/abc')).toBeNull();
    expect(operatorHostLinks.targetOf(`/voc-clusters/${CLUSTER}/members`)).toBeNull();
  });

  it('declares exactly focus and managedSystem and leaves other FO keys unmapped', () => {
    expect([...clustersRoute.pageKeys].sort()).toEqual(['focus', 'managedSystem']);
    expect(clustersRoute.target('/voc-clusters?tab=confirmed')).toBeNull();
  });

  it('is reached through operatorHostLinks, and a cluster member row href lands on inbox with focus', () => {
    expect(operatorHostLinks.targetOf(`/voc-clusters?selected=${CLUSTER}`)).toEqual({ menuId: 'clusters', page: { focus: CLUSTER } });
    expect(operatorHostLinks.targetOf(`/vocs?view=inbox&selected=${VOC}`)).toEqual({ menuId: 'inbox', page: { focus: VOC } });
  });
});

describe('operatorHostLinks', () => {
  const { targetOf } = operatorHostLinks;

  it('reaches the operator tables, the Task tables, the Findings table, 내 VOC and the survey menus, and nothing else', () => {
    expect(targetOf('/vocs?view=inbox&tab=unassigned')?.menuId).toBe('inbox');
    expect(targetOf('/vocs?view=triage')?.menuId).toBe('triage');
    expect(targetOf('/vocs?view=my')?.menuId).toBe('voc');
    expect(targetOf('/surveys/participate')?.menuId).toBe('surveys');
    expect(targetOf('/vocs?action=create')).toBeNull();
    expect(targetOf('/tasks?view=board')?.menuId).toBe('tasks');
    expect(targetOf('/tasks?view=requests')?.menuId).toBe('task-requests');
    expect(targetOf('/findings')?.menuId).toBe('findings');
    expect(targetOf('/findings?returnTo=/vocs')).toBeNull();
  });
});
