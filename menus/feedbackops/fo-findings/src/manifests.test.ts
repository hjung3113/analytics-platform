// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findingsRoute } from '@ap/fo-bridge';
import { manifests } from './index';

const AUTHED = fileURLToPath(new URL('../../../../products/feedbackops/apps/frontend/src/routes/_authed.tsx', import.meta.url));
const NAV_TREE = readFileSync(AUTHED, 'utf8');
const GLOSSARY = readFileSync(fileURLToPath(new URL('../../../../products/feedbackops/apps/frontend/src/lib/copy/glossary.ts', import.meta.url)), 'utf8');
/** The `NAV_TREE.findings` entry with this `href` labels itself `GLOSSARY.<key>`; resolves that key to its text. */
const navLabel = (href: string) => {
  const at = NAV_TREE.indexOf(`href: '${href}'`);
  const key = at === -1 ? undefined : /label: GLOSSARY\.(\w+)/.exec(NAV_TREE.slice(NAV_TREE.lastIndexOf('{', at), at))?.[1];
  return key === undefined ? null : new RegExp(`\\b${key}: '([^']+)'`).exec(GLOSSARY)?.[1] ?? null;
};
const menu = manifests[0]!;

describe('Findings manifests', () => {
  it('declares the one primary menu at the planned path', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['fo-findings']);
    expect(menu).toMatchObject({ primary: true, path: '/feedbackops/findings', label: { ko: '전체 Finding', en: 'All Findings' } });
  });

  it('declares its route table page keys plus returnTo, and the space permission', () => {
    // `returnTo` is navigation state the FO space carries (#760), not a route-table filter key.
    expect([...menu.pageKeys!].sort()).toEqual([...findingsRoute.pageKeys, 'returnTo'].sort());
    expect(menu).toMatchObject({ permission: 'feedbackops:access', requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

  it('keeps the ko label equal to the FeedbackOps NAV_TREE.findings entry', () => {
    expect(menu.label.ko).toBe(navLabel('/findings'));
  });
});
