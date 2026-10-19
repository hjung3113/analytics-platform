import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { createAssembly } from '#platform-assembly';
import { GROUPS, SPACES, registry } from './menus';
import { appSlots } from './slots';

// The gen-menu probe (tooling/gen-menu/scripts/probe.ts) adds a `genProbe` group in the analytics space and runs the
// whole suite with GEN_MENU_PROBE=1; the two tests that pin the exact decided IA skip during that run only.
const probeRun = process.env.GEN_MENU_PROBE === '1';

describe('workspace assembly (#260)', () => {
  it('enters productivity analysis at equipment-master for a partial-permission session (#264)', () => {
    const assembly = createAssembly({ registry });
    const session = testSession(['platform:view', 'equipment:view'], { user: { id: 'partial', name: 'partial', title: { ko: '부분 권한', en: 'Partial access' } } });
    const adapter: PlatformAdapter = { ...assembly.adapter, session: () => session };
    function Probe() {
      const { spaceEntry } = usePlatform();
      return <p data-testid="entry">{JSON.stringify(spaceEntry('analytics'))}</p>;
    }
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    window.history.replaceState(null, '', '/?v=1');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
    expect(JSON.parse(screen.getByTestId('entry').textContent!)).toEqual({ menuId: 'equipment-master', href: '/equipment?v=1', resumed: false });
    cleanup();
    vi.unstubAllGlobals();
  });

  it.skipIf(probeRun)('registers three spaces and the decided group order', () => {
    expect(GROUPS.map(group => [group.id, group.space])).toEqual([
      ['overview', null],
      ['noticeVoc', null],
      ['analytics', 'analytics'],
      ['equipment', 'analytics'],
      ['masterData', 'analytics'],
      ['metrics', 'metrics'],
      ['admin', 'operations'],
    ]);
    expect(SPACES.map(space => space.id)).toEqual(['analytics', 'metrics', 'operations']);
    expect(SPACES[0]).toMatchObject({
      label: { ko: 'MARS', en: 'MARS' },
      subtitle: { ko: '생산성 분석', en: 'Productivity analysis' },
      description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' },
      homeMenuId: 'productivity-overview',
    });
    expect(SPACES[0].permission).toBeUndefined();
    expect(SPACES[1]).toMatchObject({
      label: { ko: 'BRAVO', en: 'BRAVO' },
      subtitle: { ko: '지표관리', en: 'Metrics' },
      description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' },
      homeMenuId: 'metric-catalog',
    });
    expect(SPACES[1].permission).toBeUndefined();
    expect(SPACES[2]).toMatchObject({
      label: { ko: '운영 콘솔', en: 'Operations console' },
      description: { ko: '권한·감사·메뉴 활용률을 운영합니다.', en: 'Operate permissions, audit, and menu usage.' },
      permission: 'console:access',
      homeMenuId: 'admin-roles',
    });
    expect(SPACES[2].subtitle).toBeUndefined();
    expect(registry.menuById('home').label).toEqual({ ko: '플랫폼 홈', en: 'Platform home' });
    expect(registry.menuById('equipment-master').path).toBe('/equipment');
    expect(registry.menuById('notices').path).toBe('/notices');
    expect(registry.menuById('voc').path).toBe('/voc');
  });

  it.skipIf(probeRun)('gives a viewer one space and the global utilities, and the app passes the FeedbackOps slot', () => {
    const assembly = createAssembly({ registry });
    const slots = appSlots(assembly, null);
    expect(slots.topBarTools).toBe(assembly.topBarTools);
    // The real composition (#251): mapped spaces get four entries, disabled while the origin is absent; operations has no row.
    expect(slots.feedbackOps?.entriesFor('metrics')?.map(entry => [entry.id, entry.href])).toEqual([['voc-create', null], ['voc', null], ['task', null], ['survey', null]]);
    expect(slots.feedbackOps?.entriesFor('operations')).toBeNull();
    expect(slots.feedbackOps?.overall).toBeNull();
    expect(appSlots(assembly, 'https://feedbackops.example').feedbackOps?.entriesFor('metrics')?.every(entry => entry.href?.startsWith('https://feedbackops.example/'))).toBe(true);
    expect(Object.keys(slots)).toEqual(['contextBar', 'topBarTools', 'feedbackOps', 'plannedSpaces']);
    // Planned systems are display-only rows for the switcher: no Registry space or menu carries their id.
    expect(slots.plannedSpaces?.map(item => item.label.ko)).toEqual(['CLAS', '표준 로그 개발', '개선 실행']);
    expect(slots.plannedSpaces?.[0]).toMatchObject({ id: 'clas', subtitle: { ko: '생산성 분석', en: 'Productivity analysis' } });
    expect(slots.plannedSpaces?.slice(1).every(item => item.subtitle === undefined)).toBe(true);
    for (const item of slots.plannedSpaces ?? []) expect(registry.spaces.some(space => space.id === item.id)).toBe(false);
    const session = testSession(['platform:view', 'metrics:view', 'notice:view', 'voc:view'], {
      user: { id: 'viewer', name: 'viewer', title: { ko: '현업 문의자', en: 'Field requester' } },
    });
    const adapter = testAdapter({ session: () => session });
    function Probe() {
      const { accessibleSpaces, resolveLink } = usePlatform();
      return <div>
        <p data-testid="spaces">{accessibleSpaces.map(space => `${space.id}:${space.label.ko}`).join(',')}</p>
        <p data-testid="allowed">{['home', 'notices', 'voc'].map(id => `${id}:${resolveLink(id).allowed}`).join(',')}</p>
      </div>;
    }
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    window.history.replaceState(null, '', '/');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={slots}><Probe /></PlatformProvider></I18nProvider>);
    expect(screen.getByTestId('spaces').textContent).toBe('metrics:BRAVO');
    expect(screen.getByTestId('allowed').textContent).toBe('home:true,notices:true,voc:true');
    cleanup();
    vi.unstubAllGlobals();
  });
});

afterEach(() => { cleanup(); });
