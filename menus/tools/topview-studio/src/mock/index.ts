/** Mock server half of the Layouts menu (@ap/menu-topview-studio, #1654). The app's mock assembly registers `topviewStudioMock` (reads, via the
 * `pnpm gen:menu` marker) and `topviewStudioActionsMock` (writes, hand-wired into `MOCK_ACTIONS`) from `@ap/menu-topview-studio/mock`; pages never import this module. */
import type { AnyMockAction, AnyMockEndpoint } from '@ap/mock-server';
import { studioReadsMock } from './reads';
import { studioActionsMock } from './actions';

export { resetStudioMock } from './store';

export const topviewStudioMock: readonly AnyMockEndpoint[] = studioReadsMock;
export const topviewStudioActionsMock: readonly AnyMockAction[] = studioActionsMock;
