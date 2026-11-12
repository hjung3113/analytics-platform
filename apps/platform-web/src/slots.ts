import { createElement, useSyncExternalStore, type ReactNode } from 'react';
import type { AnalysisActionsSlot, HomeTodoSlot, NavCountsSlot, NotificationsSlot, PlannedSpace, PlatformSlots, ScopeControlSlot, SpaceNavSectionSlot, VocComposeSlot } from '@ap/kernel';
import { GlobalContextBar, OpenInBoardAction } from '@ap/shell';
import { featureSlot } from './feature-systems';
import { spaceSystems } from './space-systems';

/** Business systems announced in the switcher but not built (15 §3.2). Display only: no Registry entry, no permission, no menu. */
export const PLANNED_SPACES: readonly PlannedSpace[] = [];

/** Slots `main.tsx` passes to PlatformProvider. */
/** Screens whose `⋯` menu takes the analysis actions: analysis workspaces and overview dashboards (#1430). A slot can still narrow this with its own `pageTypes`. */
const ANALYSIS_ACTION_PAGE_TYPES = ['analysis', 'overview'] as const;
export function appSlots(assembly: { topBarTools: ReactNode }, notifications: NotificationsSlot, vocCompose: VocComposeSlot, homeTodo: HomeTodoSlot, scopeControl: ScopeControlSlot, navCounts: NavCountsSlot, spaceNavSection: SpaceNavSectionSlot, analysisActions?: AnalysisActionsSlot): PlatformSlots {
  return { contextBar: createElement(GlobalContextBar), topBarTools: assembly.topBarTools, features: featureSlot(), plannedSpaces: PLANNED_SPACES, boardEntry: createElement(OpenInBoardAction), notifications, vocCompose, homeTodo, scopeControl, navCounts, spaceNavSection, ...(analysisActions ? { analysisActions: { pageTypes: ANALYSIS_ACTION_PAGE_TYPES, ...analysisActions } } : {}) };
}

/** The slot objects the composition root builds once (their package subpath imports stay in `main.tsx`); `vocCompose` among them keeps one identity for the page's lifetime, so a held compose draft does not remount. */
export type AppSlotObjects = { notifications: NotificationsSlot; vocCompose: VocComposeSlot; homeTodo: HomeTodoSlot; scopeControl: ScopeControlSlot; navCounts: NavCountsSlot; spaceNavSection: SpaceNavSectionSlot; analysisActions?: AnalysisActionsSlot };

/**
 * Builds the app's slots hook for the Host's `slots` option (what `AppRoot` did before #1702). The Kernel's feature slot
 * is synchronous (ADR-0110 decision 5), so the app owns the async part: the hook subscribes to the space → system store
 * and returns freshly built slots whenever the store completes, fails or refreshes (the subscription is the hook's only
 * re-render source, and the Host calls `slots` on every render). A new `slots` object re-renders the shell's sidebar
 * through the provider's context; the closed-over slot objects, `vocCompose` and an open form's draft with it, keep identity.
 */
export function makeAppSlots(slotObjects: AppSlotObjects): (assembly: { topBarTools: ReactNode }) => PlatformSlots {
  return function useAppSlots(assembly: { topBarTools: ReactNode }): PlatformSlots {
    useSyncExternalStore(spaceSystems.subscribe, spaceSystems.getSnapshot);
    return appSlots(assembly, slotObjects.notifications, slotObjects.vocCompose, slotObjects.homeTodo, slotObjects.scopeControl, slotObjects.navCounts, slotObjects.spaceNavSection, slotObjects.analysisActions);
  };
}
