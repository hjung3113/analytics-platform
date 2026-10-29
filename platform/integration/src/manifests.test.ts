// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coverageRoute, entityLinksRoute, evidenceRoute, integrationDashboardRoute } from '@ap/feature-bridge';
import { manifests } from './index';

const FRONTEND = '../../../apps/feature-screens/src/';
const GLOSSARY = readFileSync(fileURLToPath(new URL(`${FRONTEND}lib/copy/glossary.ts`, import.meta.url)), 'utf8');
const glossary = (key: string) => new RegExp(`\\b${key}: '([^']+)'`).exec(GLOSSARY)?.[1] ?? null;
const byId = (id: string) => manifests.find(entry => entry.id === id)!;

describe('연동 manifests', () => {
  it('declares the four menus in the sidebar order, the first primary, at the planned paths', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['integration', 'evidence', 'entity-links', 'coverage']);
    expect(manifests.map(entry => entry.path)).toEqual(['/operations/integration', '/operations/evidence', '/operations/entity-links', '/operations/coverage']);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['integration']);
    expect(manifests.every(entry => entry.group === 'integration')).toBe(true);
  });

  it.each([
    ['integration', integrationDashboardRoute],
    ['evidence', evidenceRoute],
    ['coverage', coverageRoute],
    ['entity-links', entityLinksRoute],
  ])('%s declares its route table page keys plus returnTo, and the space permission', (id, route) => {
    // `returnTo` is navigation state the screen space carries (#760), not a route-table filter key.
    const menu = byId(id);
    expect([...menu.pageKeys!].sort()).toEqual([...route.pageKeys, 'returnTo'].sort());
    expect(menu).toMatchObject({ permission: 'features:access', requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

  it('keeps the approved ko labels and feature glossary values', () => {
    expect(byId('integration').label.ko).toBe(`연동 ${glossary('actionDashboard')}`);
    expect(byId('evidence').label.ko).toBe('Evidence');
    expect(byId('entity-links').label.ko).toBe(glossary('entityLinks'));
    expect(byId('coverage').label.ko).toBe(glossary('coverage'));
  });

  it('has no Findings row (ADR-0081 decision 3)', () => {
    expect(manifests.some(entry => /findings/i.test(entry.id) || entry.label.ko === 'Findings')).toBe(false);
  });
});
