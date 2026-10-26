// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coverageRoute, entityLinksRoute, evidenceRoute, integrationDashboardRoute } from '@ap/fo-bridge';
import { manifests } from './index';

const FRONTEND = '../../../../products/feedbackops/apps/frontend/src/';
const NAV_TREE = readFileSync(fileURLToPath(new URL(`${FRONTEND}routes/_authed.tsx`, import.meta.url)), 'utf8');
const GLOSSARY = readFileSync(fileURLToPath(new URL(`${FRONTEND}lib/copy/glossary.ts`, import.meta.url)), 'utf8');
/** The `NAV_TREE.integration` entry with this `href` and its raw `label:` expression. */
const navLabelExpr = (href: string) => {
  const at = NAV_TREE.indexOf(`href: '${href}'`);
  return at === -1 ? null : /label: ([^,\n]+),/.exec(NAV_TREE.slice(NAV_TREE.lastIndexOf('{', at), at))?.[1] ?? null;
};
const glossary = (key: string) => new RegExp(`\\b${key}: '([^']+)'`).exec(GLOSSARY)?.[1] ?? null;
/** A `GLOSSARY.<key>` label resolves to its text; a quoted literal is read as is. */
const navLabel = (href: string) => {
  const expr = navLabelExpr(href);
  if (expr === null) return null;
  const key = /^GLOSSARY\.(\w+)$/.exec(expr)?.[1];
  return key !== undefined ? glossary(key) : /^'([^']+)'$/.exec(expr)?.[1] ?? null;
};
const byId = (id: string) => manifests.find(entry => entry.id === id)!;

describe('연동 manifests', () => {
  it('declares the four menus in the sidebar order, the first primary, at the planned paths', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['fo-integration', 'fo-evidence', 'fo-entity-links', 'fo-coverage']);
    expect(manifests.map(entry => entry.path)).toEqual(['/feedbackops/integration', '/feedbackops/evidence', '/feedbackops/entity-links', '/feedbackops/coverage']);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['fo-integration']);
    expect(manifests.every(entry => entry.group === 'foIntegration')).toBe(true);
  });

  it.each([
    ['fo-integration', integrationDashboardRoute],
    ['fo-evidence', evidenceRoute],
    ['fo-coverage', coverageRoute],
    ['fo-entity-links', entityLinksRoute],
  ])('%s declares its route table page keys plus returnTo, and the space permission', (id, route) => {
    // `returnTo` is navigation state the FO space carries (#760), not a route-table filter key.
    const menu = byId(id);
    expect([...menu.pageKeys!].sort()).toEqual([...route.pageKeys, 'returnTo'].sort());
    expect(menu).toMatchObject({ permission: 'feedbackops:access', requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

  it('keeps the ko labels equal to the FeedbackOps NAV_TREE.integration entries (the dashboard is 연동 + GLOSSARY.actionDashboard; Evidence is a literal there)', () => {
    expect(navLabelExpr('/integration')).toBe('GLOSSARY.actionDashboard');
    expect(byId('fo-integration').label.ko).toBe(`연동 ${navLabel('/integration')}`);
    expect(navLabelExpr('/integration/evidence')).toBe("'Evidence'");
    expect(byId('fo-evidence').label.ko).toBe(navLabel('/integration/evidence'));
    expect(byId('fo-entity-links').label.ko).toBe(navLabel('/integration/links'));
    expect(byId('fo-coverage').label.ko).toBe(navLabel('/integration/coverage'));
  });

  it('has no Findings row (ADR-0081 decision 3)', () => {
    expect(manifests.some(entry => /findings/i.test(entry.id) || entry.label.ko === 'Findings')).toBe(false);
  });
});
