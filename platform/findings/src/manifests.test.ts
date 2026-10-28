// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findingsRoute } from '@ap/feature-bridge';
import { manifests } from './index';

const menu = manifests[0]!;

describe('Findings manifests', () => {
  it('declares the one primary menu at the planned path', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['fo-findings']);
    expect(menu).toMatchObject({ primary: true, path: '/feedbackops/findings', label: { ko: '전체 Finding', en: 'All Findings' } });
  });

  it('declares its route table page keys plus returnTo, and the space permission', () => {
    // `returnTo` is navigation state the FO space carries (#760), not a route-table filter key.
    expect([...menu.pageKeys!].sort()).toEqual([...findingsRoute.pageKeys, 'returnTo'].sort());
    expect(menu).toMatchObject({ permission: 'features:access', requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

});
