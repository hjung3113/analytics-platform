// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inboxRoute, triageRoute } from '@ap/feature-bridge';
import { manifests } from './index';

const ROUTES = { 'inbox': inboxRoute, 'triage': triageRoute };

const VIEWS = manifests.flatMap(menu => (menu.navViews ?? []).map(view => ({ menu, view })));

describe('VOC sidebar views', () => {
  it('declares the three original sidebar views', () => {
    expect(VIEWS.map(({ menu, view }) => `${menu.id}/${view.id}`)).toEqual(['inbox/no-link', 'triage/high', 'triage/unassigned']);
  });

  it.each(VIEWS.map(({ menu, view }) => [`${menu.id}/${view.id}`, menu, view] as const))('%s maps its view to the expected URL', (key, menu, view) => {
    const route = ROUTES[menu.id as keyof typeof ROUTES];
    const search = new URLSearchParams(route.toFoSearch(view.page as Record<string, string>));
    const href = `${route.screenPath}?${search.toString()}`;
    expect(href).toBe(({ 'inbox/no-link': '/vocs?view=inbox&tab=no-link', 'triage/high': '/vocs?view=triage&tab=high', 'triage/unassigned': '/vocs?view=triage&tab=unassigned' } as Record<string, string>)[key]);
  });

  it('keeps the ko labels equal to the feature glossary values', () => {
    const glossary = readFileSync(fileURLToPath(new URL('../../../apps/feature-screens/src/lib/copy/glossary.ts', import.meta.url)), 'utf8');
    for (const { view } of VIEWS) expect(glossary, view.id).toContain(`'${view.label.ko}'`);
  });
});
