/** Mock server half of the Top View authoring group (@ap/menu-topview-studio): Layouts (#1654) and 설비 온보딩 (#1658). The app's mock
 * assembly registers `topviewStudioMock` (the reads of both menus, via the one `pnpm gen:menu` marker of the package) and the combined action
 * list (generator-wired into `MOCK_ACTIONS`) from `@ap/menu-topview-studio/mock`, and hands `@eqv/core`'s import check in with
 * `setSampleWindowImport`; pages never import this module. */
import type { AnyMockAction, AnyMockEndpoint } from '@ap/mock-server';
import { studioReadsMock } from './reads';
import { studioActionsMock } from './actions';
import { onboardingReadsMock } from './onboarding-reads';
import { onboardingActionsMock } from './onboarding-actions';
import { onboardingImportMock } from './onboarding-import';

export { resetStudioMock } from './store';
export { resetOnboardingMock, stageOnboardingWindow } from './onboarding-store';
export { setSampleWindowImport, type SampleWindowImportHooks } from './onboarding-import';

export const topviewStudioMock: readonly AnyMockEndpoint[] = [...studioReadsMock, ...onboardingReadsMock];
export const topviewStudioActionsMock: readonly AnyMockAction[] = [...studioActionsMock, ...onboardingActionsMock, ...onboardingImportMock];
export const topviewOnboardingMockActions: readonly AnyMockAction[] = [...onboardingActionsMock, ...onboardingImportMock];

export { topviewStudioWriteSamples } from './write-samples';
export { setConformanceUpload } from './write-samples';
