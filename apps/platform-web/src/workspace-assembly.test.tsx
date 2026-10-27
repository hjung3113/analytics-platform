import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, usePlatform, type HomeTodoSlot, type NavCountsSlot, type NotificationsSlot, type ScopeControlSlot, type SpaceNavSectionSlot, type VocComposeSlot } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { createAssembly, type Assembly } from '#platform-assembly';
import { GROUPS, SPACES, registry } from './menus';
import { appSlots } from './slots';
import { NO_FEATURES, spaceId, type PlatformAdapter } from '@ap/contracts';
import { EQUIPMENT_AXES } from './equipmentAxes';

// The gen-menu probe (tooling/gen-menu/scripts/probe.ts) adds a `genProbe` group in the mars space and runs the
// whole suite with GEN_MENU_PROBE=1; the two tests that pin the exact decided IA skip during that run only.
const probeRun = process.env.GEN_MENU_PROBE === '1';

describe('workspace assembly (#260)', () => {
  it.each([
    ['rcc', 'RCC', '프로세스 시간 분석 (예정)', 'Process time (planned)'],
    ['mcc', 'MCC', '설비 사이클 분석 (예정)', 'Equipment cycle (planned)'],
    ['wpt', 'WPT', '웨이퍼 사이클 분석 (예정)', 'Wafer cycle (planned)'],
    ['configuration', 'Configuration', '파라미터 분석 (예정)', 'Parameter analysis (planned)'],
  ])('registers %s as a planned MARS menu', (id, label, ko, en) => {
    const entry = registry.menuById(id);
    expect(entry).toMatchObject({ group: id, path: `/${id}`, label: { ko: label, en: label }, description: { ko, en }, permission: 'platform:view', requiresScope: false, pageKeys: [] });
    expect(entry.component).toBeUndefined();
    expect(entry.moduleScreen).toBeUndefined();
    expect(entry.features).toEqual(NO_FEATURES);
    expect(registry.spaceOf(entry)?.id).toBe('mars');
  });
  it('enters productivity analysis at equipment-master for a partial-permission session (#264)', async () => {
    const assembly = await createAssembly({ registry }) as Assembly;
    const session = testSession(['platform:view', 'equipment:view'], { user: { id: 'partial', name: 'partial', title: { ko: '부분 권한', en: 'Partial access' } } });
    const adapter: PlatformAdapter = { ...assembly.adapter, session: () => session };
    function Probe() {
      const { spaceEntry } = usePlatform();
      return <p data-testid="entry">{JSON.stringify(spaceEntry(spaceId('mars')))}</p>;
    }
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    window.history.replaceState(null, '', '/?v=1');
    render(<I18nProvider><PlatformProvider equipmentAxes={EQUIPMENT_AXES} adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
    expect(JSON.parse(screen.getByTestId('entry').textContent!)).toEqual({ menuId: 'equipment-master', href: '/equipment?v=1', resumed: false });
    cleanup();
    vi.unstubAllGlobals();
  });

  it('registers the 내 활동 menus as global menus behind platform:view; 알림, 설문 and 권한 요청 have screens (ADR-0070, ADR-0071)', () => {
    for (const [id, path] of [['notifications', '/notifications'], ['surveys', '/surveys'], ['permission-requests', '/permission-requests']] as const) {
      const entry = registry.menuById(id);
      expect(entry).toMatchObject({ group: 'myActivity', path, permission: 'platform:view' });
      expect(registry.spaceOf(entry)).toBeNull();
      expect(entry.component).toBeDefined();
      expect(entry.moduleScreen).toBeUndefined();
    }
  });

  it('registers the survey response page as a navHidden child of 설문 with the survey ID as a path parameter (#653)', () => {
    const entry = registry.menuById('survey-respond');
    expect(entry).toMatchObject({ group: 'myActivity', parent: 'surveys', navHidden: true, path: '/surveys/:surveyId/respond', permission: 'platform:view', pageKeys: ['returnTo'] });
    expect(entry.component).toBeDefined();
    expect(registry.spaceOf(entry)).toBeNull();
    expect(registry.matchRoute('/surveys/11111111-1111-4111-8111-111111111111/respond')?.menu.id).toBe('survey-respond');
  });

  it('registers 내 VOC in 내 활동 behind voc:view with the reporter page keys, and its detail as a navHidden child with the VOC ID as a path parameter (#654)', () => {
    const entry = registry.menuById('voc');
    expect(entry).toMatchObject({ group: 'myActivity', path: '/voc', permission: 'voc:view', pageKeys: ['q', 'status', 'sort', 'focus'] });
    expect(entry.component).toBeDefined();
    expect(registry.spaceOf(entry)).toBeNull();
    const detail = registry.menuById('voc-detail');
    expect(detail).toMatchObject({ group: 'myActivity', parent: 'voc', navHidden: true, path: '/voc/:vocId', permission: 'voc:view', pageKeys: ['returnTo'] });
    expect(detail.component).toBeDefined();
    expect(registry.matchRoute('/voc/11111111-1111-4111-8111-111111111111')?.menu.id).toBe('voc-detail');
    expect(registry.matchRoute('/voc')?.menu.id).toBe('voc');
    expect(registry.menus.filter(menu => menu.group === 'myActivity' && !menu.navHidden).map(menu => menu.id)).toEqual(['notifications', 'voc', 'surveys', 'permission-requests']);
  });

  it.skipIf(probeRun)('registers seven spaces and the decided group order', () => {
    expect(GROUPS.map(group => [group.id, group.space])).toEqual([
      ['overview', null],
      ['myActivity', null],
      ['noticeVoc', null],
      ['analytics', 'mars'],
      ['equipment', 'mars'],
      ['masterData', 'mars'],
      ['hwTime', 'mars'],
      ['rcc', 'mars'],
      ['mcc', 'mars'],
      ['wpt', 'mars'],
      ['configuration', 'mars'],
      ['metrics', 'bravo'],
      ['clas', 'clas'],
      ['admin', 'operations'],
      ['logMyWork', 'log-dev'],
      ['logModels', 'log-dev'],
      ['logCross', 'log-dev'],
      ['logRules', 'log-dev'],
      ['impMyWork', 'improvement'],
      ['impTasks', 'improvement'],
      ['impReports', 'improvement'],
      ['foDashboard', 'feedbackops'],
      ['foVoc', 'feedbackops'],
      ['foFindings', 'feedbackops'],
      ['foTasks', 'feedbackops'],
      ['foIntegration', 'feedbackops'],
    ]);
    expect(SPACES.map(space => space.id)).toEqual(['mars', 'bravo', 'clas', 'tools', 'log-dev', 'improvement', 'operations', 'feedbackops']);
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
    // #817: the EV Top View lives in its own "tools" space; no entry permission (a space permission must be a platform permission, the module one is eqv:view).
    expect(SPACES[3]).toMatchObject({ label: { ko: '도구', en: 'Tools' }, homeMenuId: 'eqv:topview' });
    expect(SPACES[3].permission).toBeUndefined();
    expect(SPACES[6]).toMatchObject({
      label: { ko: '운영 콘솔', en: 'Operations console' },
      description: { ko: '권한·감사·메뉴 활용률을 운영합니다.', en: 'Operate permissions, audit, and menu usage.' },
      permission: 'console:access',
      homeMenuId: 'admin-roles',
    });
    expect(SPACES[6].subtitle).toBeUndefined();
    expect(SPACES[7]).toMatchObject({
      label: { ko: 'FeedbackOps', en: 'FeedbackOps' },
      subtitle: { ko: '피드백 운영', en: 'Feedback operations' },
      permission: 'feedbackops:access',
      carriedPageKeys: ['managedSystem', 'returnTo'],
      homeMenuId: 'fo-dashboard',
    });
    expect(registry.menuById('fo-dashboard')).toMatchObject({ group: 'foDashboard', path: '/feedbackops', permission: 'feedbackops:access', requiresScope: false, pageKeys: ['managedSystem', 'returnTo'] });
    // #761 p1: the VOC group sits after 대시보드 in the FeedbackOps space; every feedbackops menu declares managedSystem and the VOC menus a focus.
    expect(registry.menus.filter(menu => menu.group === 'foVoc').map(menu => menu.id)).toEqual(['fo-inbox', 'fo-triage', 'fo-clusters']);
    expect(registry.menuById('fo-inbox')).toMatchObject({ path: '/feedbackops/vocs', permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-triage')).toMatchObject({ path: '/feedbackops/triage', permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-clusters')).toMatchObject({ path: '/feedbackops/clusters', permission: 'feedbackops:access', requiresScope: false });
    for (const id of ['fo-inbox', 'fo-triage', 'fo-clusters']) expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('fo-inbox'))?.id).toBe('feedbackops');
    // #762 p1: the Findings group sits between VOC and Tasks; its one menu declares managedSystem, returnTo and focus.
    expect(registry.menus.filter(menu => menu.group === 'foFindings').map(menu => menu.id)).toEqual(['fo-findings']);
    expect(registry.menuById('fo-findings')).toMatchObject({ path: '/feedbackops/findings', primary: true, permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-findings').pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('fo-findings'))?.id).toBe('feedbackops');
    // #763: the Tasks group follows VOC (p2 adds Task Requests and Milestones); the Task list is hidden under Tasks (which the shell marks current for it), and every menu declares managedSystem, returnTo and focus.
    expect(registry.menus.filter(menu => menu.group === 'foTasks').map(menu => menu.id)).toEqual(['fo-task-requests', 'fo-tasks', 'fo-my-tasks', 'fo-milestones', 'fo-task-list']);
    expect(registry.menuById('fo-tasks')).toMatchObject({ path: '/feedbackops/tasks', primary: true, permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-my-tasks')).toMatchObject({ path: '/feedbackops/my-tasks', permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-task-requests')).toMatchObject({ path: '/feedbackops/task-requests', permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-milestones')).toMatchObject({ path: '/feedbackops/milestones', permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-task-list')).toMatchObject({ path: '/feedbackops/tasks/list', navHidden: true, parent: 'fo-tasks' });
    for (const id of ['fo-task-requests', 'fo-tasks', 'fo-my-tasks', 'fo-milestones', 'fo-task-list']) expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('fo-task-list'))?.id).toBe('feedbackops');
    // #762 p2: the 연동 group closes the rail; four menus, no Findings row (ADR-0081 decision 3), every menu declares managedSystem and returnTo.
    expect(registry.menus.filter(menu => menu.group === 'foIntegration').map(menu => menu.id)).toEqual(['fo-integration', 'fo-evidence', 'fo-entity-links', 'fo-coverage']);
    expect(registry.menuById('fo-integration')).toMatchObject({ path: '/feedbackops/integration', primary: true, permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-evidence')).toMatchObject({ path: '/feedbackops/evidence', permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-entity-links')).toMatchObject({ path: '/feedbackops/entity-links', permission: 'feedbackops:access', requiresScope: false });
    expect(registry.menuById('fo-coverage')).toMatchObject({ path: '/feedbackops/coverage', permission: 'feedbackops:access', requiresScope: false });
    for (const id of ['fo-integration', 'fo-evidence', 'fo-entity-links', 'fo-coverage']) {
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'returnTo']));
      expect(registry.spaceOf(registry.menuById(id))?.id).toBe('feedbackops');
    }
    // #252 (ADR-0065): work-queue first; every menu is planned and open to every signed-in user for now.
    expect(SPACES[4]).toMatchObject({ label: { ko: '표준 로그 개발', en: 'Standard log development' }, homeMenuId: 'log-my-queue' });
    expect(SPACES[5]).toMatchObject({ label: { ko: '개선 실행', en: 'Improvement execution' }, homeMenuId: 'imp-my-tasks' });
    expect(SPACES.slice(4, 6).every(space => space.permission === undefined)).toBe(true);
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
    const fakeSlot: NotificationsSlot = { menuId: 'notifications', UnreadCount: ({ children }) => children(null), Recent: () => null };
    const fakeVocCompose: VocComposeSlot = { Compose: () => null };
    const fakeHomeTodo: HomeTodoSlot = { Todo: () => null };
    const fakeScopeControl: ScopeControlSlot = { For: () => null };
    const fakeNavCounts: NavCountsSlot = { For: () => null };
    const fakeSection: SpaceNavSectionSlot = { For: () => null };
    const slots = appSlots(assembly, null, fakeSlot, fakeVocCompose, fakeHomeTodo, fakeScopeControl, fakeNavCounts, fakeSection);
    expect(slots.topBarTools).toBe(assembly.topBarTools);
    // The real composition (#251): mapped spaces get three entries, only 설문 disabled while the origin is absent (VOC and Task are in-shell); operations has no row.
    expect(slots.feedbackOps?.entriesFor(spaceId('bravo'))?.map(entry => [entry.key, 'href' in entry ? entry.href : undefined])).toEqual([['voc', undefined], ['task', undefined], ['survey', null]]);
    expect(slots.feedbackOps?.entriesFor(spaceId('operations'))).toBeNull();
    expect(slots.feedbackOps?.overall).toBeNull();
    expect(appSlots(assembly, 'https://feedbackops.example', fakeSlot, fakeVocCompose, fakeHomeTodo, fakeScopeControl, fakeNavCounts, fakeSection).feedbackOps?.entriesFor(spaceId('bravo'))?.filter(entry => 'href' in entry).every(entry => 'href' in entry && entry.href?.startsWith('https://feedbackops.example/'))).toBe(true);
    expect(Object.keys(slots)).toEqual(['contextBar', 'topBarTools', 'feedbackOps', 'plannedSpaces', 'boardEntry', 'notifications', 'vocCompose', 'homeTodo', 'scopeControl', 'navCounts', 'spaceNavSection']);
    expect(slots.notifications).toBe(fakeSlot);
    expect(slots.vocCompose).toBe(fakeVocCompose);
    expect(slots.homeTodo).toBe(fakeHomeTodo);
    expect(slots.scopeControl).toBe(fakeScopeControl);
    expect(slots.navCounts).toBe(fakeNavCounts);
    expect(slots.spaceNavSection).toBe(fakeSection);
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
    render(<I18nProvider><PlatformProvider equipmentAxes={EQUIPMENT_AXES} adapter={adapter} registry={registry} slots={slots}><Probe /></PlatformProvider></I18nProvider>);
    expect(screen.getByTestId('spaces').textContent).toBe('mars:MARS,bravo:BRAVO,log-dev:표준 로그 개발,improvement:개선 실행');
    expect(screen.getByTestId('allowed').textContent).toBe('home:true,notices:true,voc:true');
    cleanup();
    vi.unstubAllGlobals();
  });
});

afterEach(() => { cleanup(); });
