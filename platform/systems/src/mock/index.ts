/** Mock server half of @ap/menu-systems. The 「시스템」 screen reads the feature API (`GET /managed-systems/space-links`, `GET /managed-systems`), which the mock preview does not have, so
 * the menu registers no mock endpoint; the list exists because `pnpm gen:menu` wires every platform package's `./mock` export into the mock assembly. */
import type { AnyMockEndpoint } from '@ap/mock-server';

export const systemsMock: readonly AnyMockEndpoint[] = [];
