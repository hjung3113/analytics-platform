import { describe, expect, it } from 'vitest';
import { viewSwitchPage } from './views';

describe('HW Time View switches', () => {
  const source = new URLSearchParams('row=EQ-001.H1&scroll=0&page=2&focus=EQ-001&trend=EQ-001.H1&align=1&minmax=1&sort=total-desc&drillModule=PM1&module=PM2');
  it.each([
    ['overview', ['scroll', 'page', 'focus', 'sort']],
    ['steps', ['row', 'scroll', 'page', 'focus']],
    ['compare', ['page', 'focus']],
    ['table', ['row', 'scroll', 'trend', 'align', 'minmax', 'sort']],
  ] as const)('clears only keys not owned by %s in one patch', (view, cleared) => {
    const patch = viewSwitchPage(view, key => source.get(key));
    expect(patch).toEqual({ view, ...Object.fromEntries(cleared.map(key => [key, null])) });
    expect(patch).not.toHaveProperty('drillModule');
    expect(patch).not.toHaveProperty('module');
  });
  it('keeps table sorting only when the target accepts it', () => {
    expect(viewSwitchPage('table', () => 'total:desc')).not.toHaveProperty('sort');
    expect(viewSwitchPage('steps', () => 'total:desc')).toHaveProperty('sort', null);
    expect(viewSwitchPage('overview', () => 'total-asc')).toHaveProperty('sort', null);
  });
});
