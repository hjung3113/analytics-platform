import { describe, expect, it } from 'vitest';
import { findingsRoute } from './finding-routes';
import { operatorHostLinks } from './operator-links';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const AREA = '55555555-5555-4555-8555-555555555555';
const FINDING = '99999999-9999-4999-8999-999999999999';

const query = (to: string) => Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1)));

describe('Findings table', () => {
  it.each([
    ['selection', `/findings?selected=${FINDING}`, { focus: FINDING }],
    ['execution gap', '/findings?execution=none', { execution: 'none' }],
    ['scoped', `/findings?managedSystem=${SYSTEM}`, { managedSystem: SYSTEM }],
    ['every key', `/findings?selected=${FINDING}&managedSystem=${SYSTEM}&execution=none&q=a&filter.analytics_area=${AREA}&status=active&assignment=unassigned`,
      { focus: FINDING, managedSystem: SYSTEM, execution: 'none', q: 'a', area: AREA, status: 'active', assignment: 'unassigned' }],
  ])('maps the %s link to fo-findings and back to the same FO search', (_name, to, page) => {
    const target = findingsRoute.target(to);
    expect(target).toEqual({ menuId: 'fo-findings', page });
    expect(findingsRoute.toFoSearch(target!.page!)).toEqual(query(to));
  });

  it('reads a bare /findings as the list with no page keys', () => {
    expect(findingsRoute.target('/findings')).toEqual({ menuId: 'fo-findings', page: {} });
  });

  it('reads /findings/<id> as the selection', () => {
    expect(findingsRoute.target(`/findings/${FINDING}`)).toEqual({ menuId: 'fo-findings', page: { focus: FINDING } });
    expect(findingsRoute.toFoSearch({ focus: FINDING })).toEqual({ selected: FINDING });
  });

  it('reads managedSystem=all as an explicit clear', () => {
    expect(findingsRoute.target('/findings?managedSystem=all')?.page).toEqual({ managedSystem: null });
  });

  it.each([
    ['returnTo', '/findings?returnTo=%2Fvocs'],
    ['platformReturn', '/findings?platformReturn=x'],
    ['an unknown key', '/findings?unknown=1'],
    ['a non-uuid id', '/findings/not-a-uuid'],
    ['an id plus selected', `/findings/${FINDING}?selected=${FINDING}`],
    ['a deeper path', `/findings/${FINDING}/x`],
    ['a hash', '/findings#x'],
    ['a duplicated key', `/findings?selected=${FINDING}&selected=${FINDING}`],
  ])('leaves a link with %s unlinked', (_name, to) => {
    expect(findingsRoute.target(to)).toBeNull();
  });

  it('pins the page keys', () => {
    expect([...findingsRoute.pageKeys].sort()).toEqual(['area', 'assignment', 'execution', 'focus', 'managedSystem', 'q', 'status']);
  });

  it('ignores returnTo and platformReturn when reading a page', () => {
    expect(findingsRoute.toFoSearch({ focus: FINDING, returnTo: '/x', platformReturn: 'y' })).toEqual({ selected: FINDING });
  });

  it('is wired into operatorHostLinks: the bare list, ?selected= and /findings/<id> link; returnTo stays unlinked', () => {
    expect(operatorHostLinks.targetOf('/findings')).toEqual({ menuId: 'fo-findings', page: {} });
    expect(operatorHostLinks.targetOf(`/findings?selected=${FINDING}`)).toEqual({ menuId: 'fo-findings', page: { focus: FINDING } });
    expect(operatorHostLinks.targetOf(`/findings/${FINDING}`)).toEqual({ menuId: 'fo-findings', page: { focus: FINDING } });
    expect(operatorHostLinks.targetOf('/findings?returnTo=/vocs')).toBeNull();
  });
});
