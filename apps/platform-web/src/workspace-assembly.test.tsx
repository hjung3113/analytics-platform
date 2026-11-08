import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, usePlatform, type HomeTodoSlot, type NavCountsSlot, type NotificationsSlot, type ScopeControlSlot, type SpaceNavSectionSlot, type VocComposeSlot } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { createAssembly, type Assembly } from '#platform-assembly';
import { GROUPS, SPACES, registry } from './menus';
import { appSlots } from './slots';
import { spaceSystems } from './space-systems';
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

  it('registers the 알림 and 권한 요청 (내 활동) and 설문 (소통) menus as global menus behind platform:view; all have screens (ADR-0070, ADR-0071, ADR-0110)', () => {
    for (const [id, group, path] of [['notifications', 'myActivity', '/notifications'], ['surveys', 'noticeVoc', '/survey'], ['permission-requests', 'myActivity', '/permission-requests']] as const) {
      const entry = registry.menuById(id);
      expect(entry).toMatchObject({ group, path, permission: 'platform:view' });
      expect(registry.spaceOf(entry)).toBeNull();
      expect(entry.component).toBeDefined();
      expect(entry.moduleScreen).toBeUndefined();
    }
  });

  it('registers the survey response page as a navHidden child of 설문 with the survey ID as a path parameter (#653)', () => {
    const entry = registry.menuById('survey-respond');
    expect(entry).toMatchObject({ group: 'noticeVoc', parent: 'surveys', navHidden: true, path: '/survey/:surveyId/respond', aliases: ['/surveys/:surveyId/respond'], permission: 'platform:view', pageKeys: ['returnTo'] });
    expect(entry.component).toBeDefined();
    expect(registry.spaceOf(entry)).toBeNull();
    expect(registry.matchRoute('/survey/11111111-1111-4111-8111-111111111111/respond')).toMatchObject({ viaAlias: false, params: { surveyId: '11111111-1111-4111-8111-111111111111' } });
    expect(registry.matchRoute('/surveys/11111111-1111-4111-8111-111111111111/respond')).toMatchObject({ viaAlias: true, menu: { id: 'survey-respond' }, params: { surveyId: '11111111-1111-4111-8111-111111111111' } });
    expect(registry.matchRoute('/surveys')).toMatchObject({ viaAlias: true, menu: { id: 'surveys' } });
  });

  it('registers VOC in 소통 behind voc:view with the reporter page keys, and its detail as a navHidden child with the VOC ID as a path parameter (#654)', () => {
    const entry = registry.menuById('voc');
    expect(entry).toMatchObject({ group: 'noticeVoc', path: '/voc', permission: 'voc:view', pageKeys: ['q', 'status', 'sort', 'focus', 'mine', 'system'] });
    expect(entry.component).toBeDefined();
    expect(registry.spaceOf(entry)).toBeNull();
    const detail = registry.menuById('voc-detail');
    expect(detail).toMatchObject({ group: 'noticeVoc', parent: 'voc', navHidden: true, path: '/voc/:vocId', permission: 'voc:view', pageKeys: ['returnTo'] });
    expect(detail.component).toBeDefined();
    expect(registry.matchRoute('/voc/11111111-1111-4111-8111-111111111111')?.menu.id).toBe('voc-detail');
    expect(registry.matchRoute('/voc')?.menu.id).toBe('voc');
    expect(registry.menus.filter(menu => menu.group === 'myActivity' && !menu.navHidden).map(menu => menu.id)).toEqual(['notifications', 'my-tasks', 'permission-requests', 'api-tokens']);
    expect(registry.menus.filter(menu => menu.group === 'noticeVoc' && !menu.navHidden).map(menu => menu.id)).toEqual(['notices', 'faq', 'voc', 'surveys']);
  });

  it.skipIf(probeRun)('registers seven spaces and the decided group order', () => {
    expect(GROUPS.map(group => [group.id, group.space])).toEqual([
      ['overview', null],
      ['improvementItems', null],
      ['noticeVoc', null],
      ['myActivity', null],
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
      ['logAnalysis', 'log-dev'],
      ['logCross', 'log-dev'],
      ['logRules', 'log-dev'],
      ['logKnowledge', 'log-dev'],
      ['dashboard', 'flow'],
      ['voc', 'flow'],
      ['findings', 'flow'],
      ['tasks', 'flow'],
      ['surveys', 'flow'],
      ['integration', 'flow'],
      ['flowSettings', 'flow'],
      ['admin', 'operations'],
      ['access', 'operations'],
      ['systems', 'operations'],
    ]);
    expect(SPACES.map(space => space.id)).toEqual(['mars', 'bravo', 'clas', 'tools', 'log-dev', 'flow', 'operations']);
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
    // ADR-0110: the 업무 흐름 space (F menus; lands on the dashboard) and the reduced 운영 콘솔 (C menus: platform management and access; lands on 역할); neither has a space permission, each shows only when a member menu is permitted.
    expect(SPACE_DEFS[5]).toMatchObject({ label: { ko: '업무 흐름', en: 'Workflow' }, description: { ko: '들어온 VOC를 판단하고 Task로 실행한 뒤 설문으로 효과를 확인합니다.', en: 'Judge incoming VOC, run it as Tasks and confirm the effect with surveys.' }, homeMenuId: 'dashboard' });
    expect(SPACE_DEFS[5].permission).toBeUndefined();
    expect(SPACE_DEFS[5].subtitle).toBeUndefined();
    expect(SPACE_DEFS[6]).toMatchObject({ label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '플랫폼 관리와 권한을 다룹니다.', en: 'Platform administration and access.' }, homeMenuId: 'admin-roles' });
    expect(SPACE_DEFS[6].permission).toBeUndefined();
    expect(SPACE_DEFS[6].subtitle).toBeUndefined();
    // #1099b: the one production carry set; every 업무 흐름 menu is a member, no other menu is, and the space declares nothing.
    expect(registry.carrySets).toEqual([{ id: 'features', pageKeys: ['managedSystem', 'returnTo'] }]);
    expect(SPACE_DEFS[5]).not.toHaveProperty('carriedPageKeys');
    expect(SPACE_DEFS[6]).not.toHaveProperty('carriedPageKeys');
    // Members: every 업무 흐름 menu and the two access menus (carry set `features`), plus global 내 Task; platform administration (group admin) is not a member.
    const flowMenus = registry.menus.filter(menu => registry.spaceOf(menu)?.id === 'flow');
    const operationsMenus = registry.menus.filter(menu => registry.spaceOf(menu)?.id === 'operations');
    const accessMenus = operationsMenus.filter(menu => menu.group === 'access');
    expect(flowMenus.length).toBeGreaterThan(0);
    expect(flowMenus.every(menu => menu.carrySet === 'features')).toBe(true);
    expect(accessMenus.map(menu => menu.id)).toEqual(['permission-request-review', 'permission-grants', 'service-tokens']);
    const accessCarryMenus = accessMenus.filter(menu => menu.id !== 'service-tokens');
    expect(registry.menuById('service-tokens').carrySet).toBeUndefined();
    expect(accessCarryMenus.every(menu => menu.carrySet === 'features')).toBe(true);
    expect(operationsMenus.filter(menu => menu.group === 'admin').every(menu => menu.carrySet === undefined)).toBe(true);
    expect(registry.menus.filter(menu => menu.carrySet !== undefined).map(menu => menu.id).sort()).toEqual([...flowMenus.map(menu => menu.id), ...accessCarryMenus.map(menu => menu.id), 'my-tasks'].sort());
    // Every group has exactly one primary menu (the Kernel enforces it; pinned here so a moved menu cannot leave a group without one).
    for (const group of registry.groups) expect(registry.menus.filter(menu => menu.group === group.id && menu.primary === true)).toHaveLength(1);
    expect(registry.menuById('dashboard')).toMatchObject({ group: 'dashboard', path: '/flow/dashboard', permission: 'features:access', requiresScope: false, pageKeys: ['managedSystem', 'returnTo'] });
    // #761 p1: the VOC group opens the 업무 흐름 space after the dashboard; every operator menu declares managedSystem and the VOC menus a focus.
    expect(registry.menus.filter(menu => menu.group === 'voc').map(menu => menu.id)).toEqual(['inbox', 'triage', 'clusters']);
    expect(registry.menuById('inbox')).toMatchObject({ path: '/flow/inbox', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('triage')).toMatchObject({ path: '/flow/triage', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('clusters')).toMatchObject({ path: '/flow/clusters', permission: 'features:access', requiresScope: false });
    for (const id of ['inbox', 'triage', 'clusters']) expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('inbox'))?.id).toBe('flow');
    // #762 p1: the Findings group sits between VOC and Tasks; its menus declare managedSystem, returnTo and focus. 근거 (evidence) joined it in ADR-0110.
    expect(registry.menus.filter(menu => menu.group === 'findings').map(menu => menu.id)).toEqual(['findings', 'evidence']);
    expect(registry.menuById('findings')).toMatchObject({ path: '/flow/findings', primary: true, permission: 'features:access', requiresScope: false });
    expect(registry.menuById('findings').pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('findings'))?.id).toBe('flow');
    // #763: the Tasks group follows VOC (p2 adds Task Requests and Milestones); the Task list is hidden under Tasks (which the shell marks current for it), and every menu declares managedSystem, returnTo and focus.
    expect(registry.menus.filter(menu => menu.group === 'tasks').map(menu => menu.id)).toEqual(['task-requests', 'tasks', 'milestones', 'task-list']);
    expect(registry.menuById('tasks')).toMatchObject({ path: '/flow/tasks', primary: true, permission: 'features:access', requiresScope: false });
    expect(registry.menuById('my-tasks')).toMatchObject({ group: 'myActivity', path: '/my-tasks', permission: 'features:access', requiresScope: false });
    expect(registry.spaceOf(registry.menuById('my-tasks'))).toBeNull();
    expect(registry.menuById('task-requests')).toMatchObject({ path: '/flow/task-requests', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('milestones')).toMatchObject({ path: '/flow/milestones', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('task-list')).toMatchObject({ path: '/flow/task-list', navHidden: true, parent: 'tasks' });
    for (const id of ['task-requests', 'tasks', 'my-tasks', 'milestones', 'task-list']) expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'focus', 'returnTo']));
    expect(registry.spaceOf(registry.menuById('task-list'))?.id).toBe('flow');
    // #762 p2: the 연동 group has three menus (evidence moved to the findings group, ADR-0110), no Findings row (ADR-0081 decision 3), every menu declares managedSystem and returnTo.
    expect(registry.menus.filter(menu => menu.group === 'integration').map(menu => menu.id)).toEqual(['integration', 'entity-links', 'coverage']);
    expect(registry.menuById('integration')).toMatchObject({ path: '/flow/integration', primary: true, permission: 'features:access', requiresScope: false });
    expect(registry.menuById('evidence')).toMatchObject({ path: '/flow/evidence', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('entity-links')).toMatchObject({ path: '/flow/entity-links', permission: 'features:access', requiresScope: false });
    expect(registry.menuById('coverage')).toMatchObject({ path: '/flow/coverage', permission: 'features:access', requiresScope: false });
    for (const id of ['integration', 'evidence', 'entity-links', 'coverage']) {
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'returnTo']));
      expect(registry.spaceOf(registry.menuById(id))?.id).toBe('flow');
    }
    // #764 p1: the Surveys group follows 연동; Survey 관리 is primary, its three screens are hidden children (navHidden, parent survey-management) with a :surveyId path param.
    expect(registry.menus.filter(menu => menu.group === 'surveys').map(menu => menu.id)).toEqual(['survey-management', 'survey-builder', 'survey-results', 'survey-follow-up']);
    expect(registry.menuById('survey-management')).toMatchObject({ path: '/flow/survey-management', primary: true, permission: 'features:access', requiresScope: false });
    for (const id of ['survey-builder', 'survey-results', 'survey-follow-up']) {
      expect(registry.menuById(id)).toMatchObject({ path: `/flow/${id}/:surveyId`, navHidden: true, parent: 'survey-management' });
    }
    for (const id of ['survey-management', 'survey-builder', 'survey-results', 'survey-follow-up']) {
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'returnTo']));
      expect(registry.spaceOf(registry.menuById(id))?.id).toBe('flow');
    }
    // #764 p2, ADR-0110: the 설정 group (flowSettings) closes the 업무 흐름 rail; the access group (권한) sits in the 운영 콘솔 under the paths it kept. Every screen needs console:access (the workspace-admin rule), not just features:access.
    const settingsIds = ['managed-systems', 'analytics-areas', 'settings'];
    expect(registry.menus.filter(menu => menu.group === 'flowSettings').map(menu => menu.id)).toEqual(settingsIds);
    expect(registry.menuById('managed-systems')).toMatchObject({ path: '/flow/managed-systems', primary: true });
    const accessIds = ['permission-request-review', 'permission-grants'];
    expect(registry.menus.filter(menu => menu.group === 'access').map(menu => menu.id)).toEqual([...accessIds, 'service-tokens']);
    expect(registry.menuById('service-tokens')).toMatchObject({ path: '/operations/service-tokens', permission: 'console:access', additionalPermissions: ['features:access'], pageKeys: ['noExpiry', 'kind'] });
    expect(registry.menuById('permission-request-review')).toMatchObject({ path: '/operations/permission-request-review', primary: true });
    expect(registry.menuById('permission-grants')).toMatchObject({ path: '/operations/permission-grants' });
    expect(registry.menuById('permission-grants').primary).toBeUndefined();
    for (const id of [...settingsIds, ...accessIds]) {
      expect(registry.menuById(id)).toMatchObject({ permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management' });
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['managedSystem', 'returnTo']));
      expect(registry.spaceOf(registry.menuById(id))?.id).toBe(accessIds.includes(id) ? 'operations' : 'flow');
    }
    // #252 (ADR-0065): work-queue first; every menu is planned and open to every signed-in user for now.
    expect(SPACE_DEFS[4]).toMatchObject({ label: { ko: '표준 로그 개발', en: 'Standard log development' }, homeMenuId: 'log-my-queue' });
    // #1323 (ADR-0106 amendment 2): the 개선 실행 space is retired; improvement items live in the platform DB.
    expect(SPACE_DEFS[4].permission).toBeUndefined();
    const planned = registry.menus.filter(menu => registry.spaceOf(menu)?.id === 'log-dev');
    expect(planned.map(menu => menu.id)).toEqual([
      'log-my-queue', 'log-recent-models', 'log-models', 'log-model-project', 'log-model-round', 'log-validation-requests', 'log-defects', 'log-partner-reviews', 'log-rules', 'log-rule', 'log-knowledge-models', 'log-knowledge-model', 'log-knowledge-spec', 'log-knowledge-items', 'log-knowledge-item', 'log-knowledge-catalog', 'log-explorer', 'log-explorer-view',
    ]);
    // #1194 r: the catalog management menu is the one admin-capability menu (design v0.6 §2.1); the rest stay open to every signed-in user.
    // #1194 b: it has its screen now, so only the others are component-less planned menus.
    expect(planned.every(menu => menu.permission === (menu.id === 'log-knowledge-catalog' ? 'knowledge:catalog-manage' : 'platform:view'))).toBe(true);
    // #1495 replaces the planned validation menu and adds one hidden Rule detail using the same lazy screen.
    expect(registry.menuById('log-rule')).toMatchObject({ parent: 'log-rules', navHidden: true, pageType: 'catalog' });
    for (const id of ['log-rules', 'log-rule']) {
      expect(registry.menuById(id).pageKeys).toEqual(expect.arrayContaining(['q', 'filter', 'sort', 'page']));
      expect(registry.menuById(id).pageKeys).not.toContain('targetQ');
      expect(registry.menuById(id).repeatedPageKeys).toEqual(['filter']);
      expect(registry.menuById(id).hiddenPageKeys).toEqual(['filter']);
    }
    // #1197 s1: 모델 탐색 (the group's primary) and its hidden 모델 프로파일 child have screens too.
    expect(planned.filter(menu => menu.component).map(menu => menu.id)).toEqual(['log-models', 'log-model-project', 'log-model-round', 'log-validation-requests', 'log-rules', 'log-rule', 'log-knowledge-models', 'log-knowledge-model', 'log-knowledge-spec', 'log-knowledge-items', 'log-knowledge-item', 'log-knowledge-catalog', 'log-explorer', 'log-explorer-view']);
    expect(registry.menuById('log-knowledge-model')).toMatchObject({ parent: 'log-knowledge-models', navHidden: true });
    expect(registry.menus.filter(menu => menu.group === 'logKnowledge' && menu.primary).map(menu => menu.id)).toEqual(['log-knowledge-models']);
    // #1197 s2: the item list and its navHidden detail screen have components too.
    expect(registry.menuById('log-knowledge-item')).toMatchObject({ parent: 'log-knowledge-items', navHidden: true, pageKeys: ['rev', 'returnTo', 'drawer'] });
    // #1196 e/f: the spec detail takes `tab=concept` and the Event filter `event=<targetKey>` (the Item chip links with `tab=spec&event=`).
    expect(registry.menuById('log-knowledge-spec').pageKeys).toEqual(['software', 'tab', 'drawer', 'change', 'module', 'event', 'review', 'revision', 'returnTo']);
    expect(registry.menuById('home').label).toEqual({ ko: '플랫폼 홈', en: 'Platform home' });
    expect(registry.menuById('equipment-master').path).toBe('/mars/equipment-master');
    expect(registry.menuById('equipment-master').aliases).toEqual(['/equipment']);
    expect(registry.menuById('notices').path).toBe('/notices');
    expect(registry.menuById('faq')).toMatchObject({ group: 'noticeVoc', path: '/faq', permission: 'notice:view', label: { ko: 'FAQ', en: 'FAQ' } });
    expect(registry.menuById('faq').component).toBeDefined();
    expect(registry.menuById('voc').path).toBe('/voc');
  });

  it.skipIf(probeRun)('shows the seven 업무 흐름 and three 운영 콘솔 sections, the 내 활동 entries and the 소통 entries in the decided order (#1099c, ADR-0110)', () => {
    expect(registry.groups.filter(group => group.space === 'flow').map(group => group.label.ko)).toEqual(['대시보드', 'VOC 처리', 'Finding', 'Task', '설문 운영', '연동', '설정']);
    expect(registry.groups.filter(group => group.space === 'flow').map(group => group.id)).toEqual(['dashboard', 'voc', 'findings', 'tasks', 'surveys', 'integration', 'flowSettings']);
    expect(registry.groups.find(group => group.id === 'dashboard')?.hideLabelWhenSingle).toBe(true);
    expect(registry.groups.filter(group => group.space === 'operations').map(group => group.label.ko)).toEqual(['플랫폼 관리', '권한', '시스템']);
    expect(registry.groups.filter(group => group.space === 'operations').map(group => group.id)).toEqual(['admin', 'access', 'systems']);
    expect(registry.menus.filter(menu => menu.group === 'myActivity' && !menu.navHidden).map(menu => menu.label.ko)).toEqual(['알림', '내 Task', '권한 요청', 'API 토큰']);
    expect(registry.groups.find(group => group.id === 'noticeVoc')?.label).toEqual({ ko: '소통', en: 'Communication' });
    expect(registry.menus.filter(menu => menu.group === 'noticeVoc' && !menu.navHidden).map(menu => menu.label.ko)).toEqual(['공지', 'FAQ', 'VOC', '설문']);
    expect(registry.menus.filter(menu => menu.group === 'noticeVoc').map(menu => menu.id)).toEqual(['notices', 'faq', 'voc', 'voc-detail', 'surveys', 'survey-respond']);
    expect(registry.groups.filter(group => group.space === null).map(group => group.id)).toEqual(['overview', 'improvementItems', 'noticeVoc', 'myActivity']);
    // F and C stay independent: operator sections need F, feature management F and C, platform management C, and 내 Task F without C.
    const need = (id: string) => registry.menuById(id);
    expect([need('inbox'), need('findings'), need('evidence'), need('tasks'), need('survey-management'), need('dashboard'), need('integration'), need('my-tasks')].every(menu => menu.permission === 'features:access' && menu.additionalPermissions === undefined)).toBe(true);
    expect(need('managed-systems')).toMatchObject({ permission: 'console:access', additionalPermissions: ['features:access'] });
    expect(need('permission-grants')).toMatchObject({ permission: 'console:access', additionalPermissions: ['features:access'] });
    expect(need('admin-roles')).toMatchObject({ permission: 'console:access' });
    expect(need('admin-roles').additionalPermissions).toBeUndefined();
    // #1289 node j: 시스템 (the third 운영 콘솔 section) is read-only, C only; the link it shows grants nothing (ADR-0068 decision 1).
    expect(need('systems')).toMatchObject({ permission: 'console:access', path: '/operations/systems', primary: true, group: 'systems', requiresScope: false });
    expect(need('systems').additionalPermissions).toBeUndefined();
    expect(need('systems').carrySet).toBeUndefined();
    expect(registry.spaceOf(need('systems'))?.id).toBe('operations');
    expect(SPACE_DEFS[6]!.homeMenuId).toBe('admin-roles');
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
    // The links come from the assembly's source into the app store (#1289 node j); until it answers the slot draws nothing.
    expect(slots.features?.entriesFor(spaceId('bravo'))).toBeNull();
    spaceSystems.start(['workspace-assembly'], assembly.spaceSystems ?? null);
    await vi.waitFor(() => expect(spaceSystems.getSnapshot().status).toBe('ready'));
    // The real composition (#251): mapped spaces get three in-shell entries (VOC, Task, 설문); operations has no link.
    expect(slots.features?.entriesFor(spaceId('bravo'))?.map(entry => entry.key)).toEqual(['voc', 'task', 'survey']);
    expect(slots.features?.entriesFor(spaceId('operations'))).toBeNull();
    expect(slots.features?.entriesFor(spaceId('flow'))).toBeNull();
    expect(slots.features?.entriesFor(spaceId('bravo'))?.map(entry => entry.menuId)).toEqual(['inbox', 'task-list', 'survey-management']);
    expect(Object.keys(slots)).toEqual(['contextBar', 'topBarTools', 'features', 'plannedSpaces', 'boardEntry', 'notifications', 'vocCompose', 'homeTodo', 'scopeControl', 'navCounts', 'spaceNavSection']);
    expect(slots.notifications).toBe(fakeSlot);
    expect(slots.vocCompose).toBe(fakeVocCompose);
    expect(slots.homeTodo).toBe(fakeHomeTodo);
    expect(slots.scopeControl).toBe(fakeScopeControl);
    expect(slots.navCounts).toBe(fakeNavCounts);
    expect(slots.spaceNavSection).toBe(fakeSection);
    // Planned systems are display-only rows for the switcher: no Registry space or menu carries their id.
    // CLAS left the planned list for a real space (#590); log-dev left it in #252.
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
    expect(screen.getByTestId('spaces').textContent).toBe('bravo:BRAVO,log-dev:표준 로그 개발');
    expect(screen.getByTestId('allowed').textContent).toBe('home:true,notices:true,voc:true');
    cleanup();
    vi.unstubAllGlobals();
  });
});

afterEach(() => { cleanup(); });
