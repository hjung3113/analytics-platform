import { useSyncExternalStore, type ReactNode } from 'react';
import type { AccessRequestSlot, AnalysisActionsSlot, HomeTodoSlot, NavCountsSlot, NotificationsSlot, PlannedSpace, PlatformSlots, ScopeControlSlot, SpaceNavSectionSlot, VocComposeSlot } from '@ap/kernel';
import { featureSlot } from './feature-systems';
import { spaceSystems } from './space-systems';

/** Business systems announced in the switcher but not built (15 §3.2). Display only: no Registry entry, no permission, no menu. */
const PLANNED_SPACES: readonly PlannedSpace[] = [];

/** Slots `main.tsx` passes to the Host; the Host supplies `contextBar`, `boardEntry` and `topBarTools` under them (`startAppHost`), so they are not repeated here. */
/** Screens whose `⋯` menu takes the analysis actions: analysis workspaces and overview dashboards (#1430). A slot can still narrow this with its own `pageTypes`. */
const ANALYSIS_ACTION_PAGE_TYPES = ['analysis', 'overview'] as const;
export function appSlots(notifications: NotificationsSlot, vocCompose: VocComposeSlot, homeTodo: HomeTodoSlot, scopeControl: ScopeControlSlot, navCounts: NavCountsSlot, spaceNavSection: SpaceNavSectionSlot, analysisActions?: AnalysisActionsSlot, accessRequest?: AccessRequestSlot): PlatformSlots {
  return { features: featureSlot(), plannedSpaces: PLANNED_SPACES, notifications, vocCompose, homeTodo, scopeControl, navCounts, spaceNavSection, ...(analysisActions ? { analysisActions: { pageTypes: ANALYSIS_ACTION_PAGE_TYPES, ...analysisActions } } : {}), ...(accessRequest ? { accessRequest } : {}) };
}

/** The slot objects the composition root builds once (their package subpath imports stay in `main.tsx`); `vocCompose` among them keeps one identity for the page's lifetime, so a held compose draft does not remount. */
export type AppSlotObjects = { notifications: NotificationsSlot; vocCompose: VocComposeSlot; homeTodo: HomeTodoSlot; scopeControl: ScopeControlSlot; navCounts: NavCountsSlot; spaceNavSection: SpaceNavSectionSlot; analysisActions?: AnalysisActionsSlot; accessRequest?: AccessRequestSlot };

/**
 * Builds the app's slots hook for the Host's `slots` option (what `AppRoot` did before #1702). The Kernel's feature slot
 * is synchronous (ADR-0110 decision 5), so the app owns the async part: the hook subscribes to the space → system store
 * and returns freshly built slots whenever the store completes, fails or refreshes (the subscription is the hook's only
 * re-render source, and the Host calls `slots` on every render). A new `slots` object re-renders the shell's sidebar
 * through the provider's context; the closed-over slot objects, `vocCompose` and an open form's draft with it, keep identity.
 * `accessRequest` (ADR-0154 decision 6) is passed only when the assembly has a feature API: mock has no request server, so every blocked place renders as without it.
 */
export function makeAppSlots(slotObjects: AppSlotObjects): (assembly: { topBarTools: ReactNode; featureApi?: unknown; sidebarNotice?: ReactNode }) => PlatformSlots {
  return function useAppSlots(assembly: { topBarTools: ReactNode; featureApi?: unknown; sidebarNotice?: ReactNode }): PlatformSlots {
    useSyncExternalStore(spaceSystems.subscribe, spaceSystems.getSnapshot);
    const slots = appSlots(slotObjects.notifications, slotObjects.vocCompose, slotObjects.homeTodo, slotObjects.scopeControl, slotObjects.navCounts, slotObjects.spaceNavSection, slotObjects.analysisActions, assembly.featureApi ? slotObjects.accessRequest : undefined);
    // The sidebar notice is the assembly's (mock says «synthetic data»; a real assembly passes none, so the shell draws nothing).
    return assembly.sidebarNotice == null ? slots : { ...slots, sidebarNotice: assembly.sidebarNotice };
  };
}
