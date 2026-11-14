import { EQUIPMENT_AXES } from '../equipmentAxes';
// <gen:menu-mock-imports>
import { analyticsMock } from '@ap/menu-analytics/mock';
import { equipmentMock } from '@ap/menu-equipment/mock';
import { homeMock } from '@ap/menu-home/mock';
import { metricsMock } from '@ap/menu-metrics/mock';
import { clasMock } from '@ap/menu-clas/mock';
import { hwTimeMock } from '@ap/menu-hw-time/mock';
import { logKnowledgeMock } from '@ap/menu-log-knowledge/mock';
import { systemsMock } from '@ap/menu-systems/mock';
import { improvementItemsMock } from '@ap/menu-improvement-items/mock';
import { logAnalysisMock } from '@ap/menu-log-analysis/mock';
import { logRulesMock } from '@ap/menu-log-rules/mock';
import { logModelsMock } from '@ap/menu-log-models/mock';
import { topviewMock } from '@ap/menu-topview/mock';
import { topviewStudioMock } from '@ap/menu-topview-studio/mock';
// </gen:menu-mock-imports>
// Mock actions and write samples of generated menus (ADR-0054) — written by `pnpm gen:menu`.
// <gen:menu-mock-action-imports>
import { logAnalysisActionsMock, logAnalysisWriteSamples } from '@ap/menu-log-analysis/mock';
import { logKnowledgeActionsMock, logKnowledgeWriteSamples } from '@ap/menu-log-knowledge/mock';
import { improvementItemsActionsMock, improvementItemsWriteSamples } from '@ap/menu-improvement-items/mock';
import { logModelsActionsMock, logModelsWriteSamples } from '@ap/menu-log-models/mock';
import { logRulesActionsMock, logRulesWriteSamples } from '@ap/menu-log-rules/mock';
import { topviewStudioActionsMock, topviewStudioWriteSamples } from '@ap/menu-topview-studio/mock';
// </gen:menu-mock-action-imports>
// Audit seeds of menu-owned destinations (ADR-0048) — hand-wired, outside the generator's import region.
import { metricsAuditEvents } from '@ap/menu-metrics/mock';
export { stagedImport, specFixture } from '@ap/menu-log-knowledge/mock';
export { setConformanceUpload } from '@ap/menu-topview-studio/mock';
import { setTopviewMockSource } from '@ap/menu-topview/mock';
import { setSampleWindowImport } from '@ap/menu-topview-studio/mock';
import { buildInventory, checkSampleWindowImport, eqvMockContext, eqvMockEquipmentOptions, eqvMockEvents } from '@ap/menu-topview/mock-data';
import type { CreateAssembly } from '#platform-assembly';
import { menuPermissions, type AuditEvent } from '@ap/contracts';
import { createMockAdapter, createLocalSavedViewStore, seedUsageNext, storedUsage, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import { DevTools } from './DevTools';
import { MockNotice } from './MockNotice';
import { MOCK_SPACE_SYSTEMS } from './mock-space-systems';

/**
 * Every menu mock endpoint the app registers — the one list (#153): the mock adapter below and the server
 * conformance test both read it. `pnpm gen:menu` writes the marker region.
 */
export const MOCK_ENDPOINTS: readonly AnyMockEndpoint[] = [
  // <gen:menu-mock-spreads>
  ...analyticsMock,
  ...equipmentMock,
  ...homeMock,
  ...metricsMock,
  ...clasMock,
  ...hwTimeMock,
  ...logKnowledgeMock,
  ...systemsMock,
  ...improvementItemsMock,
  ...logAnalysisMock,
  ...logRulesMock,
  ...logModelsMock,
  ...topviewMock,
  ...topviewStudioMock,
  // </gen:menu-mock-spreads>
];

// 설비 온보딩 Sample Window import (#1658): the mock judges an uploaded batch with the dev tool's own `@eqv/core` code.
setSampleWindowImport({ check: checkSampleWindowImport, inventory: buildInventory });
// Top View viewer (#801, #1659): the mock answers its three reads from the synthetic fixture.
setTopviewMockSource({ equipmentOptions: eqvMockEquipmentOptions, context: eqvMockContext, events: eqvMockEvents });

/**
 * Every menu mock action the app registers (ADR-0054); `pnpm gen:menu` writes the marker region. The mock adapter below and the conformance test read it.
 */
export const MOCK_ACTIONS: readonly AnyMockAction[] = [
  // <gen:menu-mock-action-spreads>
  ...logAnalysisActionsMock,
  ...logKnowledgeActionsMock,
  ...improvementItemsActionsMock,
  ...logModelsActionsMock,
  ...logRulesActionsMock,
  ...topviewStudioActionsMock,
  // </gen:menu-mock-action-spreads>
];

/**
 * Conformance write samples of generated menus, keyed by the full action id (`<group>.<action>`) — each menu's `./mock`
 * exports them next to its actions. The conformance test fails by action id when a registered action has no sample (#1904).
 */
export const MOCK_WRITE_SAMPLES: readonly Readonly<Record<string, () => Record<string, unknown>>>[] = [
  // <gen:menu-mock-sample-entries>
  logAnalysisWriteSamples,
  logKnowledgeWriteSamples,
  improvementItemsWriteSamples,
  logModelsWriteSamples,
  logRulesWriteSamples,
  topviewStudioWriteSamples,
  // </gen:menu-mock-sample-entries>
];

/**
 * Audit events of menu-owned destinations (ADR-0048). The mock server joins them with its own equipment events,
 * so the console audit log and each destination's history tab read one store. The conformance test reads this list too.
 */
export const MOCK_AUDIT_EVENTS: readonly AuditEvent[] = [...metricsAuditEvents];

/**
 * Mock assembly (#153, ADR-0009): what `#platform-assembly` resolves to in `vite` dev and `--mode mock` builds.
 * Menu mocks are registered in MOCK_ENDPOINTS by `pnpm gen:menu`; a production build never reaches this file.
 */
export const createAssembly: CreateAssembly = ({ registry }) => {
  // #605: map the opt-in synthetic navigation cases onto real registry rows, only once per empty store.
  const usageMenus = {
    'seed-solo': 'admin-roles', 'seed-tail': 'admin-audit', 'seed-back': 'admin-usage',
    'seed-loop': 'admin-registry', 'seed-dominant': 'metric-catalog',
    'seed-d1': 'equipment-detail', 'seed-d2': 'equipment-master', 'seed-d3': 'cycle-time',
    'seed-d4': 'productivity-overview', 'seed-d5': 'execution-detail', 'seed-d6': 'metric-detail',
  };
  if (storedUsage().length === 0 && Object.values(usageMenus).every(id => registry.menus.some(menu => menu.id === id))) seedUsageNext(Date.now(), usageMenus);
  const adapter = createMockAdapter({ equipmentAxes: EQUIPMENT_AXES, endpoints: MOCK_ENDPOINTS, registry, permissions: registry.permissions, auditEvents: MOCK_AUDIT_EVENTS, actions: MOCK_ACTIONS });
  const savedViews = createLocalSavedViewStore({
    menuPermissionsOf: menuId => { try { return menuPermissions(registry.menuById(menuId)); } catch { return undefined; } },
    sessionPermissions: () => adapter.session().user.permissions,
  });
  // Dev server only: the black-box E2E reads the raw usage rows (not exposed by any adapter port) to check the entry's
  // `via`/`fromMenuId` (#605). `NODE_ENV` is `development` only on the dev server (vitest and `--mode mock` builds differ), so never in a `--mode mock` build and never in a production graph.
  if (process.env.NODE_ENV === 'development') (window as unknown as { __apUsageEvents?: () => unknown }).__apUsageEvents = () => storedUsage().map(row => ({ ...row }));
  return {
    adapter: { ...adapter, menuQuery(request, signal) {
      // Mock analysis is in-process, so browser Network cannot count it. Endpoint-only marks give
      // the committed harness an observable request seam without copying any Context/filter values.
      performance.mark('platform:mock-menu-query', { detail: { endpoint: request.endpoint } });
      return adapter.menuQuery(request, signal);
    } },
    topBarTools: <DevTools />,
    sidebarNotice: <MockNotice />,
    savedViews,
    spaceSystems: async () => MOCK_SPACE_SYSTEMS,
  };
};
