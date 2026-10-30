import { Suspense } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { modulePermissions } from './modules';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { HOME_LAUNCHER_GROUPS, SPACES, registry } from './menus';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/home?v=1&scopeId=MEM');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('app home launcher assembly (#1109)', () => {
  it('classifies every declared space exactly once', () => {
    const classified = HOME_LAUNCHER_GROUPS.flatMap(group => group.spaces.map(String));
    expect([...classified].sort()).toEqual(SPACES.map(space => space.id).sort());
    expect(new Set(classified).size).toBe(classified.length);
  });

  it.each([
    ['ko', ['분석', '업무 운영', '도구', '플랫폼 관리'], '업무 시스템'],
    ['en', ['Analysis', 'Work operations', 'Tools', 'Platform administration'], 'Work systems'],
  ])('renders selected A through the actual registry (%s)', async (lang, headings, systems) => {
    localStorage.setItem('platform:lang', lang);
    const session = testSession([...registry.permissions, ...modulePermissions(registry)]);
    const adapter = testAdapter({ session: () => session, menuQuery: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }) });
    const Home = registry.menuById('home').component!;
    render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} equipmentAxes={EQUIPMENT_AXES}><Suspense fallback={null}><Home params={{}} /></Suspense></PlatformProvider></I18nProvider>);
    const section = await screen.findByRole('region', { name: systems });
    expect(within(section).getAllByRole('heading').map(heading => heading.textContent)).toEqual(headings);
    const categories = within(section).getAllByRole('heading').map(heading => within(heading.closest('section')!).getAllByRole('link'));
    expect(categories.map(cards => cards.length)).toEqual([3, 2, 1, 1]);
    expect(categories.flat().map(card => new URL(card.getAttribute('href')!, window.location.origin).pathname)).toEqual([
      '/mars/productivity-overview', '/bravo/metric-catalog', '/clas/operation-time', '/log-dev/log-my-queue', '/improvement/imp-my-tasks', '/tools/eqv-topview', '/operations/dashboard',
    ]);
  });
});
