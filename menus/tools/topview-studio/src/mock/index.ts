/** Mock server half of the Top View authoring group (@ap/menu-topview-studio): Layouts (#1654) and 설비 온보딩 (#1658). The app's mock
 * assembly registers `topviewStudioMock` (the reads of both menus, via the one `pnpm gen:menu` marker of the package) and the two action
 * lists (hand-wired into `MOCK_ACTIONS`) from `@ap/menu-topview-studio/mock`; pages never import this module. */
import type { AnyMockAction, AnyMockEndpoint } from '@ap/mock-server';
import { studioReadsMock } from './reads';
import { studioActionsMock } from './actions';
import { onboardingReadsMock } from './onboarding-reads';
import { onboardingActionsMock } from './onboarding-actions';

export { resetStudioMock } from './store';
export { resetOnboardingMock, stageOnboardingWindow } from './onboarding-store';

export const topviewStudioMock: readonly AnyMockEndpoint[] = [...studioReadsMock, ...onboardingReadsMock];
export const topviewStudioActionsMock: readonly AnyMockAction[] = studioActionsMock;
export const topviewOnboardingActionsMock: readonly AnyMockAction[] = onboardingActionsMock;
