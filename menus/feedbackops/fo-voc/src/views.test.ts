// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inboxRoute, triageRoute } from '@ap/fo-bridge';
import { manifests } from './index';

const AUTHED = fileURLToPath(new URL('../../../../apps/fo-frontend/src/routes/_authed.tsx', import.meta.url));
const NAV_TREE = readFileSync(AUTHED, 'utf8');
const ROUTES = { 'fo-inbox': inboxRoute, 'fo-triage': triageRoute };

/** The `NAV_TREE.voc` entry with this `href` and the `countKey` it carries. */
function entryFor(href: string): { countKey: string } | null {
  const at = NAV_TREE.indexOf(`href: '${href}'`);
  if (at === -1) return null;
  const end = NAV_TREE.indexOf('},', at);
  const countKey = /countKey: '([^']+)'/.exec(NAV_TREE.slice(at, end))?.[1];
  return countKey === undefined ? null : { countKey };
}

const VIEWS = manifests.flatMap(menu => (menu.navViews ?? []).map(view => ({ menu, view })));

describe('VOC sidebar views', () => {
  it('declares the three original sidebar views', () => {
    expect(VIEWS.map(({ menu, view }) => `${menu.id}/${view.id}`)).toEqual(['fo-inbox/no-link', 'fo-triage/high', 'fo-triage/unassigned']);
  });

  it.each(VIEWS.map(({ menu, view }) => [`${menu.id}/${view.id}`, menu, view] as const))('%s lands on the FeedbackOps NAV_TREE href and count key', (key, menu, view) => {
    const route = ROUTES[menu.id as keyof typeof ROUTES];
    const search = new URLSearchParams(route.toFoSearch(view.page as Record<string, string>));
    const href = `${route.foPath}?${search.toString()}`;
    const entry = entryFor(href);
    expect(entry, `${key} has no NAV_TREE entry for ${href}`).not.toBeNull();
    expect(entry!.countKey).toBe(({ 'fo-inbox/no-link': 'voc.inbox.no-link', 'fo-triage/high': 'voc.tab.high', 'fo-triage/unassigned': 'voc.tab.unassigned' } as Record<string, string>)[key]);
  });

  it('keeps the ko labels equal to the FeedbackOps glossary values', () => {
    const glossary = readFileSync(fileURLToPath(new URL('../../../../apps/fo-frontend/src/lib/copy/glossary.ts', import.meta.url)), 'utf8');
    for (const { view } of VIEWS) expect(glossary, view.id).toContain(`'${view.label.ko}'`);
  });
});
