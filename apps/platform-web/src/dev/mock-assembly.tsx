import { EQUIPMENT_AXES } from '../equipmentAxes';
// <gen:menu-mock-imports>
import { analyticsMock } from '@ap/menu-analytics/mock';
import { equipmentMock } from '@ap/menu-equipment/mock';
import { homeMock } from '@ap/menu-home/mock';
import { metricsMock } from '@ap/menu-metrics/mock';
import { clasMock } from '@ap/menu-clas/mock';
import { hwTimeMock } from '@ap/menu-hw-time/mock';
// </gen:menu-mock-imports>
// Audit seeds of menu-owned destinations (ADR-0048) — hand-wired, outside the generator's import region.
import { metricsAuditEvents } from '@ap/menu-metrics/mock';
import type { CreateAssembly } from '#platform-assembly';
import type { AuditEvent } from '@ap/contracts';
import { createMockAdapter, storedUsage, type AnyMockEndpoint } from '@ap/mock-server';
import { DevTools } from './DevTools';
import { applyPersonaRole } from './proto-role'; // THROWAWAY #595 — never merge.

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
  // </gen:menu-mock-spreads>
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
  applyPersonaRole(); // THROWAWAY #595 — never merge.
  const adapter = createMockAdapter({ equipmentAxes: EQUIPMENT_AXES, endpoints: MOCK_ENDPOINTS, registry, permissions: registry.permissions, auditEvents: MOCK_AUDIT_EVENTS });
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
  };
};
