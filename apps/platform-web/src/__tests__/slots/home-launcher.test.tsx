import { Suspense } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { EQUIPMENT_AXES } from '../../equipmentAxes';
import { HOME_LAUNCHER_GROUPS, HOME_LAUNCHER_SPACE_NAMES, SPACES, registry } from '../../menus';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/home?v=1&scopeId=MEM');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('app home launcher assembly (#1109)', () => {
  it('classifies every declared space exactly once', () => {
    const classified = HOME_LAUNCHER_GROUPS.flatMap(group => group.spaces.map(String));
    expect([...classified].sort(), 'every SPACES entry needs one HOME_LAUNCHER_GROUPS entry (apps/platform-web/AGENTS.md «Adding a space»)').toEqual(SPACES.map(space => space.id).sort());
    expect(new Set(classified).size).toBe(classified.length);
  });

  // #1905: expect one card per space in declared order, derived from HOME_LAUNCHER_GROUPS and SPACES.
  it.each([
    ['ko' as const, '업무 시스템'],
    ['en' as const, 'Work systems'],
  ])('renders selected A through the actual registry (%s)', async (lang, systems) => {
    const headings = HOME_LAUNCHER_GROUPS.map(group => group.label[lang]);
    // Cards inside a category follow SPACES (Registry) order, not the membership array order (ADR-0102 decision 1).
    const categoryPaths = HOME_LAUNCHER_GROUPS.map(group => SPACES
      .filter(space => (group.spaces as readonly string[]).includes(space.id))
      .map(space => {
        // #2535 picked Models for fresh Log-dev entry while My validation queue is planned.
        const entryMenuId = space.id === 'log-dev' ? 'log-models' : space.homeMenuId;
        return registry.menuById(entryMenuId)!.path;
      }));
    localStorage.setItem('platform:lang', lang);
    const session = testSession([...registry.permissions]);
    const adapter = testAdapter({ session: () => session, menuQuery: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }) });
    const Home = registry.menuById('home').component!;
    render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} equipmentAxes={EQUIPMENT_AXES}><Suspense fallback={null}><Home params={{}} /></Suspense></PlatformProvider></I18nProvider>);
    // Cold CI transforms the real lazy route; keep the wait bounded without weakening its assertions.
    const section = await screen.findByRole('region', { name: systems }, { timeout: 10_000 });
    expect(within(section).getAllByRole('heading').map(heading => heading.textContent)).toEqual(headings);
    const categories = within(section).getAllByRole('heading').map(heading => within(heading.closest('section')!).getAllByRole('link'));
    expect(categories.map(cards => cards.map(card => new URL(card.getAttribute('href')!, window.location.origin).pathname))).toEqual(categoryPaths);
    const toolsHomeName = HOME_LAUNCHER_SPACE_NAMES.tools[lang];
    expect(within(section).getByRole('link', { name: new RegExp(`^${toolsHomeName} `) })).toBeTruthy();
    expect(SPACES.find(space => space.id === 'tools')?.label[lang]).toBe(lang === 'ko' ? '도구' : 'Tools');
  }, 15_000);
});
