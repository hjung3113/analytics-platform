// <gen:menu-mock-imports>
import { analyticsMock } from '@ap/menu-analytics/mock';
import { equipmentMock } from '@ap/menu-equipment/mock';
import { homeMock } from '@ap/menu-home/mock';
import { metricsMock } from '@ap/menu-metrics/mock';
import { noticeVocMock } from '@ap/menu-notice-voc/mock';
// </gen:menu-mock-imports>
import type { ReactNode } from 'react';
import type { PlatformAdapter } from '@ap/contracts';
import type { Registry } from '@ap/kernel';
import { createMockAdapter } from '@ap/mock-server';
import { DevTools } from './DevTools';

/**
 * Mock assembly (#153, ADR-0009): what `#platform-assembly` resolves to in `vite` dev and `--mode mock` builds.
 * Menu mocks are registered here by `pnpm gen:menu`; a production build never reaches this file.
 */
export function createAssembly({ registry }: { registry: Registry }): { adapter: PlatformAdapter; topBarTools?: ReactNode } {
  return { adapter: mockAdapter(registry), topBarTools: <DevTools /> };
}

const mockAdapter = (registry: Registry): PlatformAdapter => createMockAdapter({
  endpoints: [
    // <gen:menu-mock-spreads>
    ...analyticsMock,
    ...equipmentMock,
    ...homeMock,
    ...metricsMock,
    ...noticeVocMock,
    // </gen:menu-mock-spreads>
  ],
  registry,
});
