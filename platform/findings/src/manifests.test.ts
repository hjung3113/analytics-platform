// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evidenceRoute, findingsRoute } from '@ap/feature-bridge';
import { manifests } from './index';

const byId = (id: string) => manifests.find(entry => entry.id === id)!;

describe('Findings manifests', () => {
  it('declares Finding (primary) then 근거 at the planned paths, all in the findings group', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['findings', 'evidence']);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['findings']);
    expect(manifests.every(entry => entry.group === 'findings')).toBe(true);
    expect(byId('findings')).toMatchObject({ path: '/flow/findings', label: { ko: '전체 Finding', en: 'All Findings' } });
    expect(byId('evidence')).toMatchObject({ path: '/flow/evidence', label: { ko: '근거', en: 'Evidence' } });
  });

  it.each([
    ['findings', findingsRoute],
    ['evidence', evidenceRoute],
  ])('%s declares its route table page keys plus returnTo, and the space permission', (id, route) => {
    // `returnTo` is navigation state the screen space carries (#760), not a route-table filter key.
    const menu = byId(id);
    expect([...menu.pageKeys!].sort()).toEqual([...route.pageKeys, 'returnTo'].sort());
    expect(menu).toMatchObject({ permission: 'features:access', requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

});
