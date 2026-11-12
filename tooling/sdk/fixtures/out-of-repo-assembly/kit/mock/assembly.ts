// Mock assembly: the adapter comes from @ap/mock-server over the kit's own declarations; no server, no slots.
// A real-adapter assembly replaces this file, not the Host (node 1702i).
import type { HostAssembly } from '@ap/app-host';
import type { Registry } from '@ap/kernel';
import { createMockAdapter } from '@ap/mock-server';
import { mockEndpoints as sample } from '../menus/sample/mock';
import { VOCABULARY } from '../menus';

// Menu packages' mock lists (README «둘째 메뉴»: one import and one entry per copied folder).
const MOCK_ENDPOINTS = [sample];

export function createAssembly({ registry }: { registry: Registry }): HostAssembly {
  const adapter = createMockAdapter({ endpoints: MOCK_ENDPOINTS.flat(), registry, permissions: VOCABULARY });
  return { adapter, topBarTools: null };
}
