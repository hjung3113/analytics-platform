// Mock assembly: the adapter comes from @ap/mock-server over the kit's own declarations; no server, no slots.
// A real-adapter assembly replaces this file, not the Host (node 1702i).
import type { HostAssembly } from '@ap/app-host';
import type { Registry } from '@ap/kernel';
import { createMockAdapter } from '@ap/mock-server';
import { VOCABULARY } from '../menus';

export function createAssembly({ registry }: { registry: Registry }): HostAssembly {
  const adapter = createMockAdapter({ endpoints: [], registry, permissions: VOCABULARY });
  return { adapter, topBarTools: null };
}
