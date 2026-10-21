import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { createAssembly, type Assembly } from '#platform-assembly';
import { GROUPS, SPACES, registry } from './menus';
import { appSlots } from './slots';

// The gen-menu probe (tooling/gen-menu/scripts/probe.ts) adds a `genProbe` group in the analytics space and runs the
// whole suite with GEN_MENU_PROBE=1; the two tests that pin the exact decided IA skip during that run only.
const probeRun = process.env.GEN_MENU_PROBE === '1';

describe('workspace assembly (#260)', () => {
  it('enters productivity analysis at equipment-master for a partial-permission session (#264)', async () => {
    const assembly = await createAssembly({ registry }) as Assembly;
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

  it.skipIf(probeRun)('registers six spaces and the decided group order', () => {
    expect(GROUPS.map(group => [group.id, group.space])).toEqual([
      ['overview', null],
      ['noticeVoc', null],
      ['analytics', 'analytics'],
      ['equipment', 'analytics'],
      ['masterData', 'analytics'],
      ['metrics', 'metrics'],
      ['clas', 'clas'],
      ['admin', 'operations'],
      ['logMyWork', 'log-dev'],
      ['logModels', 'log-dev'],
      ['logCross', 'log-dev'],
      ['logRules', 'log-dev'],
      ['impMyWork', 'improvement'],
      ['impTasks', 'improvement'],
      ['impReports', 'improvement'],
    ]);
    expect(SPACES.map(space => space.id)).toEqual(['analytics', 'metrics', 'clas', 'log-dev', 'improvement', 'operations']);
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
      label: { ko: 'CLAS', en: 'CLAS' },
      subtitle: { ko: '생산성 분석', en: 'Productivity analysis' },
      homeMenuId: 'operation-time',
    });
    expect(SPACES[2].permission).toBeUndefined();
    expect(SPACES[5]).toMatchObject({
      label: { ko: '운영 콘솔', en: 'Operations console' },
      description: { ko: '권한·감사·메뉴 활용률을 운영합니다.', en: 'Operate permissions, audit, and menu usage.' },
      permission: 'console:access',
      homeMenuId: 'admin-roles',
    });
    expect(SPACES[5].subtitle).toBeUndefined();
    // #252 (ADR-0065): work-queue first; every menu is planned and open to every signed-in user for now.
    expect(SPACES[3]).toMatchObject({ label: { ko: '표준 로그 개발', en: 'Standard log development' }, homeMenuId: 'log-my-queue' });
    expect(SPACES[4]).toMatchObject({ label: { ko: '개선 실행', en: 'Improvement execution' }, homeMenuId: 'imp-my-tasks' });
    expect(SPACES.slice(3, 5).every(space => space.permission === undefined)).toBe(true);
    const planned = registry.menus.filter(menu => ['log-dev', 'improvement'].includes(registry.spaceOf(menu)?.id ?? ''));
    expect(planned.map(menu => menu.id)).toEqual([
      'log-my-queue', 'log-recent-models', 'log-models', 'log-defects', 'log-partner-reviews', 'log-rules',
      'imp-my-tasks', 'imp-tasks', 'imp-effect-report', 'imp-equipment-history',
    ]);
    expect(planned.every(menu => !menu.component && menu.permission === 'platform:view')).toBe(true);
    expect(registry.menuById('home').label).toEqual({ ko: '플랫폼 홈', en: 'Platform home' });
    expect(registry.menuById('equipment-master').path).toBe('/equipment');
    expect(registry.menuById('notices').path).toBe('/notices');
    expect(registry.menuById('voc').path).toBe('/voc');
  });

  it.skipIf(probeRun)('gives a viewer the spaces their menus allow and the global utilities, and the app passes the FeedbackOps slot', async () => {
    const assembly = await createAssembly({ registry }) as Assembly;
    const slots = appSlots(assembly, null);
    expect(slots.topBarTools).toBe(assembly.topBarTools);
    // The real composition (#251): mapped spaces get four entries, disabled while the origin is absent; operations has no row.
    expect(slots.feedbackOps?.entriesFor('metrics')?.map(entry => [entry.id, entry.href])).toEqual([['voc-create', null], ['voc', null], ['task', null], ['survey', null]]);
    expect(slots.feedbackOps?.entriesFor('operations')).toBeNull();
    expect(slots.feedbackOps?.overall).toBeNull();
    expect(appSlots(assembly, 'https://feedbackops.example').feedbackOps?.entriesFor('metrics')?.every(entry => entry.href?.startsWith('https://feedbackops.example/'))).toBe(true);
    expect(Object.keys(slots)).toEqual(['contextBar', 'topBarTools', 'feedbackOps', 'plannedSpaces', 'boardEntry']);
    // Planned systems are display-only rows for the switcher: no Registry space or menu carries their id.
    // CLAS left the planned list for a real space (#590); log-dev and improvement left it in #252.
    expect(slots.plannedSpaces).toEqual([]);
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
    expect(screen.getByTestId('spaces').textContent).toBe('metrics:BRAVO,log-dev:표준 로그 개발,improvement:개선 실행');
    expect(screen.getByTestId('allowed').textContent).toBe('home:true,notices:true,voc:true');
    cleanup();
    vi.unstubAllGlobals();
  });
});

afterEach(() => { cleanup(); });
