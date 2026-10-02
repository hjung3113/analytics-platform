// <gen:menu-mock-imports>
import { analyticsMock } from '@ap/menu-analytics/mock';
import { equipmentMock } from '@ap/menu-equipment/mock';
import { homeMock } from '@ap/menu-home/mock';
import { metricsMock } from '@ap/menu-metrics/mock';
import { noticeVocMock } from '@ap/menu-notice-voc/mock';
// </gen:menu-mock-imports>
import type { CreateAssembly } from '#platform-assembly';
import { createMockAdapter, type AnyMockEndpoint } from '@ap/mock-server';
import { DevTools } from './DevTools';

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
  ...noticeVocMock,
  // </gen:menu-mock-spreads>
];

/**
 * Mock assembly (#153, ADR-0009): what `#platform-assembly` resolves to in `vite` dev and `--mode mock` builds.
 * Menu mocks are registered in MOCK_ENDPOINTS by `pnpm gen:menu`; a production build never reaches this file.
 */
export const createAssembly: CreateAssembly = ({ registry }) => ({
  adapter: createMockAdapter({ endpoints: MOCK_ENDPOINTS, registry }),
  topBarTools: <DevTools />,
});
