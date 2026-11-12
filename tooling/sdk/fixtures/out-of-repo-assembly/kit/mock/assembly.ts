// Mock assembly: the adapter comes from @ap/mock-server over the kit's own declarations; no server, no slots.
// Vite selects this file by default, or real/assembly.tsx with --mode real.
import type { HostAssembly } from '@ap/app-host';
import type { Registry } from '@ap/kernel';
import { menuPermissions } from '@ap/contracts';
import { createLocalSavedViewStore, createMockAdapter } from '@ap/mock-server';
import { mockEndpoints as sample } from '../menus/sample/mock';
import { KIT_PERMISSIONS, VOCABULARY } from '../menus';

// Menu packages' mock lists (README «둘째 메뉴»: one import and one entry per copied folder).
const MOCK_ENDPOINTS = [sample];

export function createAssembly({ registry }: { registry: Registry }): HostAssembly {
  // 주석 권한(#1863): 키트 메뉴의 권한으로 판정한다. 넘기지 않으면 저장소 견본 메뉴의 analytics:view가 기본이다.
  const adapter = createMockAdapter({ endpoints: MOCK_ENDPOINTS.flat(), registry, permissions: VOCABULARY, annotationPermissions: KIT_PERMISSIONS });
  // 저장된 뷰(#1864): 브라우저 저장소 시뮬레이션. 메뉴 권한은 Registry에서, 세션 권한은 어댑터에서 판정한다.
  const savedViews = createLocalSavedViewStore({
    menuPermissionsOf: menuId => { try { return menuPermissions(registry.menuById(menuId)); } catch { return undefined; } },
    sessionPermissions: () => adapter.session().user.permissions,
  });
  return { adapter, topBarTools: null, savedViews };
}
