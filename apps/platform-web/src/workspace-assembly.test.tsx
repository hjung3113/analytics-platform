import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, usePlatform, type HomeTodoSlot, type NavCountsSlot, type NotificationsSlot, type ScopeControlSlot, type SpaceNavSectionSlot, type VocComposeSlot } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { createAssembly, type Assembly } from '#platform-assembly';
import { GROUPS, SPACES, registry } from './menus';
import { appSlots } from './slots';
import { NO_FEATURES, spaceId, type PlatformAdapter, type SpaceDef } from '@ap/contracts';
import { EQUIPMENT_AXES } from './equipmentAxes';

/** `SPACES` keeps its literal ids for `AppSpaceId`; the optional SpaceDef fields (permission, subtitle) are read through the declared type. */
const SPACE_DEFS: readonly SpaceDef[] = SPACES;

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
    expect(entry).toMatchObject({ group: id, path: `/mars/${id}`, aliases: [`/${id}`], label: { ko: label, en: label }, description: { ko, en }, permission: 'analytics:view', requiresScope: false, pageKeys: [] });
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
    expect(JSON.parse(screen.getByTestId('entry').textContent!)).toEqual({ menuId: 'equipment-master', href: '/mars/equipment-master?v=1', resumed: false });
    cleanup();
    vi.unstubAllGlobals();
  });

  it('registers the 내 활동 menus as global menus behind platform:view; 알림, 설문 and 권한 요청 have screens (ADR-0070, ADR-0071)', () => {
    for (const [id, path] of [['notifications', '/notifications'], ['surveys', '/survey'], ['permission-requests', '/permission-requests']] as const) {
      const entry = registry.menuById(id);
      expect(entry).toMatchObject({ group: 'myActivity', path, permission: 'platform:view' });
      expect(registry.spaceOf(entry)).toBeNull();
      expect(entry.component).toBeDefined();
      expect(entry.moduleScreen).toBeUndefined();
    }
  });

  it('registers the survey response page as a navHidden child of 설문 with the survey ID as a path parameter (#653)', () => {
    const entry = registry.menuById('survey-respond');
    expect(entry).toMatchObject({ group: 'myActivity', parent: 'surveys', navHidden: true, path: '/survey/:surveyId/respond', aliases: ['/surveys/:surveyId/respond'], permission: 'platform:view', pageKeys: ['returnTo'] });
    expect(entry.component).toBeDefined();
    expect(registry.spaceOf(entry)).toBeNull();
    expect(registry.matchRoute('/survey/11111111-1111-4111-8111-111111111111/respond')).toMatchObject({ viaAlias: false, params: { surveyId: '11111111-1111-4111-8111-111111111111' } });
    expect(registry.matchRoute('/surveys/11111111-1111-4111-8111-111111111111/respond')).toMatchObject({ viaAlias: true, menu: { id: 'survey-respond' }, params: { surveyId: '11111111-1111-4111-8111-111111111111' } });
    expect(registry.matchRoute('/surveys')).toMatchObject({ viaAlias: true, menu: { id: 'surveys' } });
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
    expect(registry.menus.filter(menu => menu.group === 'myActivity' && !menu.navHidden).map(menu => menu.id)).toEqual(['notifications', 'voc', 'my-tasks', 'surveys', 'permission-requests']);
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
      ['logMyWork', 'log-dev'],
      ['logModels', 'log-dev'],
      ['logCross', 'log-dev'],
      ['logRules', 'log-dev'],
      ['logKnowledge', 'log-dev'],
      ['impMyWork', 'improvement'],
      ['impTasks', 'improvement'],
      ['impReports', 'improvement'],
      ['voc', 'operations'],
      ['findings', 'operations'],
      ['tasks', 'operations'],
      ['surveys', 'operations'],
      ['dashboard', 'operations'],
      ['integration', 'operations'],
      ['featureAdmin', 'operations'],
      ['admin', 'operations'],
    ]);
    expect(SPACES.map(space => space.id)).toEqual(['mars', 'bravo', 'clas', 'tools', 'log-dev', 'improvement', 'operations']);
    expect(SPACE_DEFS[0]).toMatchObject({
      label: { ko: 'MARS', en: 'MARS' },
      subtitle: { ko: '생산성 분석', en: 'Productivity analysis' },
      description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' },
      homeMenuId: 'productivity-overview',
    });
    expect(SPACE_DEFS[0].permission).toBeUndefined();
    expect(SPACE_DEFS[1]).toMatchObject({
      label: { ko: 'BRAVO', en: 'BRAVO' },
      subtitle: { ko: '지표관리', en: 'Metrics' },
      description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' },
      homeMenuId: 'metric-catalog',
    });
    expect(SPACE_DEFS[1].permission).toBeUndefined();
    expect(SPACE_DEFS[2]).toMatchObject({
      label: { ko: 'CLAS', en: 'CLAS' },
      subtitle: { ko: '생산성 분석', en: 'Productivity analysis' },
      homeMenuId: 'operation-time',
    });
    expect(SPACE_DEFS[2].permission).toBeUndefined();
    // #817: the EV Top View lives in its own "tools" space; no entry permission (a space permission must be a platform permission, the module one is eqv:view).
    expect(SPACE_DEFS[3]).toMatchObject({ label: { ko: '도구', en: 'Tools' }, homeMenuId: 'eqv:topview' });
    expect(SPACE_DEFS[3].permission).toBeUndefined();
    // #1099c: one operations console, no common F/C gate; it shows only when a member menu is permitted and lands on the dashboard (F) or the first permitted menu (C only).
    expect(SPACE_DEFS[6]).toMatchObject({ label: { ko: '운영 콘솔', en: 'Operations console' }, homeMenuId: 'dashboard' });
    expect(SPACE_DEFS[6].permission).toBeUndefined();
    expect(SPACE_DEFS[6].subtitle).toBeUndefined();
    // #1099b: the one production carry set; every feature operator and feature-admin menu is a member, no other menu is, and the space declares nothing.
    expect(registry.carrySets).toEqual([{ id: 'features', pageKeys: ['managedSystem', 'returnTo'] }]);
    expect(SPACE_DEFS[6]).not.toHaveProperty('carriedPageKeys');
    // Members: every operator and feature-admin menu in the operations console, plus global 내 Task; platform administration (group admin) is not a member.
    const operationsMenus = registry.menus.filter(menu => registry.spaceOf(menu)?.id === 'operations');
    const operatorMenus = operationsMenus.filter(menu => menu.group !== 'admin');
    expect(operatorMenus.length).toBeGreaterThan(0);
    expect(operatorMenus.every(menu => menu.carrySet === 'features')).toBe(true);
    expect(operationsMenus.filter(menu => menu.group === 'admin').every(menu => menu.carrySet === undefined)).toBe(true);
    expect(registry.menus.filter(menu => menu.carrySet !== undefined).map(menu => menu.id).sort()).toEqual([...operatorMenus.map(menu => menu.id), 'my-tasks'].sort());
    expect(registry.menuById('dashboard')).toMatchObject({ group: 'dashboard', path: '/operations/dashboard', permission: 'features:access', requiresScope: false, pageKeys: ['managedSystem', 'returnTo'] });
    // #761 p1: the VOC group opens the operations console; every operator menu declares managedSystem and the VOC menus a focus.
    expect(registry.menus.filter(menu => menu.group === 'voc').map(menu => menu.id)).toEqual(['inbox', 'triage', 'clusters']);
    expect(registry.menuById('inbox')).toMatchObject({ path: '/operations/inbox', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('triage')).toMatchObject({ path: '/operations/triage', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('clusters')).toMatchObject({ path: '/operations/clusters', permission: 'features:access', requiresScope: false });
    for (const id of ['inbox', 'triage', 'clusters']) expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('inbox'))?.id).toBe('operations');
    // #762 p1: the Findings group sits between VOC and Tasks; its one menu declares managedSystem, returnTo and focus.
    expect(registry.menus.filter(menu => menu.group === 'findings').map(menu => menu.id)).toEqual(['findings']);
    expect(registry.menuById('findings')).toMatchObject({ path: '/operations/findings', primary: true, permission: 'features:access', requiresScope: false });
    expect(registry.menuById('findings').pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('findings'))?.id).toBe('operations');
    // #763: the Tasks group follows VOC (p2 adds Task Requests and Milestones); the Task list is hidden under Tasks (which the shell marks current for it), and every menu declares managedSystem, returnTo and focus.
    expect(registry.menus.filter(menu => menu.group === 'tasks').map(menu => menu.id)).toEqual(['task-requests', 'tasks', 'milestones', 'task-list']);
    expect(registry.menuById('tasks')).toMatchObject({ path: '/operations/tasks', primary: true, permission: 'features:access', requiresScope: false });
    expect(registry.menuById('my-tasks')).toMatchObject({ group: 'myActivity', path: '/my-tasks', permission: 'features:access', requiresScope: false });
    expect(registry.spaceOf(registry.menuById('my-tasks'))).toBeNull();
    expect(registry.menuById('task-requests')).toMatchObject({ path: '/operations/task-requests', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('milestones')).toMatchObject({ path: '/operations/milestones', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('task-list')).toMatchObject({ path: '/operations/task-list', navHidden: true, parent: 'tasks' });
    for (const id of ['task-requests', 'tasks', 'my-tasks', 'milestones', 'task-list']) expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('task-list'))?.id).toBe('operations');
    // #762 p2: the 연동 group closes the rail; four menus, no Findings row (ADR-0081 decision 3), every menu declares managedSystem and returnTo.
    expect(registry.menus.filter(menu => menu.group === 'integration').map(menu => menu.id)).toEqual(['integration', 'evidence', 'entity-links', 'coverage']);
    expect(registry.menuById('integration')).toMatchObject({ path: '/operations/integration', primary: true, permission: 'features:access', requiresScope: false });
    expect(registry.menuById('evidence')).toMatchObject({ path: '/operations/evidence', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('entity-links')).toMatchObject({ path: '/operations/entity-links', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('coverage')).toMatchObject({ path: '/operations/coverage', permission: 'features:access', requiresScope: false });
    for (const id of ['integration', 'evidence', 'entity-links', 'coverage']) {
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'returnTo']));
      expect(registry.spaceOf(registry.menuById(id))?.id).toBe('operations');
    }
    // #764 p1: the Surveys group follows 연동; Survey 관리 is primary, its three screens are hidden children (navHidden, parent survey-management) with a :surveyId path param.
    expect(registry.menus.filter(menu => menu.group === 'surveys').map(menu => menu.id)).toEqual(['survey-management', 'survey-builder', 'survey-results', 'survey-follow-up']);
    expect(registry.menuById('survey-management')).toMatchObject({ path: '/operations/survey-management', primary: true, permission: 'features:access', requiresScope: false });
    for (const id of ['survey-builder', 'survey-results', 'survey-follow-up']) {
      expect(registry.menuById(id)).toMatchObject({ path: `/operations/${id}/:surveyId`, navHidden: true, parent: 'survey-management' });
    }
    for (const id of ['survey-management', 'survey-builder', 'survey-results', 'survey-follow-up']) {
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'returnTo']));
      expect(registry.spaceOf(registry.menuById(id))?.id).toBe('operations');
    }
    // #764 p2: the 관리자 group follows Surveys; every screen needs console:access (the workspace-admin rule), not just features:access.
    const adminIds = ['managed-systems', 'analytics-areas', 'permission-request-review', 'permission-grants', 'settings'];
    expect(registry.menus.filter(menu => menu.group === 'featureAdmin').map(menu => menu.id)).toEqual(adminIds);
    expect(registry.menuById('managed-systems')).toMatchObject({ path: '/operations/managed-systems', primary: true });
    for (const id of adminIds) {
      expect(registry.menuById(id)).toMatchObject({ permission: 'console:access', requiresScope: false, pageType: 'management' });
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'returnTo']));
      expect(registry.spaceOf(registry.menuById(id))?.id).toBe('operations');
    }
    // #252 (ADR-0065): work-queue first; every menu is planned and open to every signed-in user for now.
    expect(SPACE_DEFS[4]).toMatchObject({ label: { ko: '표준 로그 개발', en: 'Standard log development' }, homeMenuId: 'log-my-queue' });
    expect(SPACE_DEFS[5]).toMatchObject({ label: { ko: '개선 실행', en: 'Improvement execution' }, homeMenuId: 'imp-my-tasks' });
    expect(SPACE_DEFS.slice(4, 6).every(space => space.permission === undefined)).toBe(true);
    const planned = registry.menus.filter(menu => ['log-dev', 'improvement'].includes(registry.spaceOf(menu)?.id ?? ''));
    expect(planned.map(menu => menu.id)).toEqual([
      'log-my-queue', 'log-recent-models', 'log-models', 'log-defects', 'log-partner-reviews', 'log-rules', 'log-knowledge-catalog',
      'imp-my-tasks', 'imp-tasks', 'imp-effect-report', 'imp-equipment-history',
    ]);
    expect(planned.every(menu => !menu.component && menu.permission === 'platform:view')).toBe(true);
    expect(registry.menuById('home').label).toEqual({ ko: '플랫폼 홈', en: 'Platform home' });
    expect(registry.menuById('equipment-master').path).toBe('/mars/equipment-master');
    expect(registry.menuById('equipment-master').aliases).toEqual(['/equipment']);
    expect(registry.menuById('notices').path).toBe('/notices');
    expect(registry.menuById('voc').path).toBe('/voc');
  });

  it.skipIf(probeRun)('shows the eight operations sections in the decided order and the five 내 활동 entries in the decided order (#1099c)', () => {
    expect(registry.groups.filter(group => group.space === 'operations').map(group => group.label.ko)).toEqual(['VOC', 'Finding', 'Task 관리', '설문 관리', '대시보드', '연동', '기능 관리', '플랫폼 관리']);
    expect(registry.groups.filter(group => group.space === 'operations').map(group => group.id)).toEqual(['voc', 'findings', 'tasks', 'surveys', 'dashboard', 'integration', 'featureAdmin', 'admin']);
    expect(registry.menus.filter(menu => menu.group === 'myActivity' && !menu.navHidden).map(menu => menu.label.ko)).toEqual(['알림', '내 VOC', '내 Task', '응답 설문', '권한 요청']);
    expect(registry.groups.filter(group => group.space === null).map(group => group.id)).toEqual(['overview', 'myActivity', 'noticeVoc']);
    // F and C stay independent: operator sections need F, feature management F and C, platform management C, and 내 Task F without C.
    const need = (id: string) => registry.menuById(id);
    expect([need('inbox'), need('findings'), need('tasks'), need('survey-management'), need('dashboard'), need('integration'), need('my-tasks')].every(menu => menu.permission === 'features:access' && menu.additionalPermissions === undefined)).toBe(true);
    expect(need('managed-systems')).toMatchObject({ permission: 'console:access', additionalPermissions: ['features:access'] });
    expect(need('admin-roles')).toMatchObject({ permission: 'console:access' });
    expect(need('admin-roles').additionalPermissions).toBeUndefined();
    expect(registry.menuById('voc').permission).toBe('voc:view');
    expect(registry.menuById('surveys').permission).toBe('platform:view');
  });

  it.skipIf(probeRun)('gives a viewer the spaces their menus allow and the global utilities, and the app passes the feature slot', async () => {
    const assembly = await createAssembly({ registry }) as Assembly;
    const fakeSlot: NotificationsSlot = { menuId: 'notifications', UnreadCount: ({ children }) => children(null), Recent: () => null };
    const fakeVocCompose: VocComposeSlot = { Compose: () => null };
    const fakeHomeTodo: HomeTodoSlot = { Todo: () => null };
    const fakeScopeControl: ScopeControlSlot = { For: () => null };
    const fakeNavCounts: NavCountsSlot = { For: () => null };
    const fakeSection: SpaceNavSectionSlot = { For: () => null };
    const slots = appSlots(assembly, fakeSlot, fakeVocCompose, fakeHomeTodo, fakeScopeControl, fakeNavCounts, fakeSection);
    expect(slots.topBarTools).toBe(assembly.topBarTools);
    // The real composition (#251): mapped spaces get three in-shell entries (VOC, Task, 설문); operations has no row.
    expect(slots.features?.entriesFor(spaceId('bravo'))?.map(entry => entry.key)).toEqual(['voc', 'task', 'survey']);
    expect(slots.features?.entriesFor(spaceId('operations'))).toBeNull();
    expect(slots.features?.entriesFor(spaceId('bravo'))?.map(entry => entry.menuId)).toEqual(['inbox', 'task-list', 'survey-management']);
    expect(Object.keys(slots)).toEqual(['contextBar', 'topBarTools', 'features', 'plannedSpaces', 'boardEntry', 'notifications', 'vocCompose', 'homeTodo', 'scopeControl', 'navCounts', 'spaceNavSection']);
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
    expect(screen.getByTestId('spaces').textContent).toBe('bravo:BRAVO,log-dev:표준 로그 개발,improvement:개선 실행');
    expect(screen.getByTestId('allowed').textContent).toBe('home:true,notices:true,voc:true');
    cleanup();
    vi.unstubAllGlobals();
  });
});

afterEach(() => { cleanup(); });
