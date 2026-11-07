import { createElement, type ReactNode } from 'react';
import type { AnalysisActionsSlot, HomeTodoSlot, NavCountsSlot, NotificationsSlot, PlannedSpace, PlatformSlots, ScopeControlSlot, SpaceNavSectionSlot, VocComposeSlot } from '@ap/kernel';
import { GlobalContextBar, OpenInBoardAction } from '@ap/shell';
import { featureSlot } from './feature-systems';

/** Business systems announced in the switcher but not built (15 §3.2). Display only: no Registry entry, no permission, no menu. */
export const PLANNED_SPACES: readonly PlannedSpace[] = [];

/** Slots `main.tsx` passes to PlatformProvider. */
/** Screens whose `⋯` menu takes the analysis actions: analysis workspaces and overview dashboards (#1430). A slot can still narrow this with its own `pageTypes`. */
const ANALYSIS_ACTION_PAGE_TYPES = ['analysis', 'overview'] as const;
export function appSlots(assembly: { topBarTools: ReactNode }, notifications: NotificationsSlot, vocCompose: VocComposeSlot, homeTodo: HomeTodoSlot, scopeControl: ScopeControlSlot, navCounts: NavCountsSlot, spaceNavSection: SpaceNavSectionSlot, analysisActions?: AnalysisActionsSlot): PlatformSlots {
  return { contextBar: createElement(GlobalContextBar), topBarTools: assembly.topBarTools, features: featureSlot(), plannedSpaces: PLANNED_SPACES, boardEntry: createElement(OpenInBoardAction), notifications, vocCompose, homeTodo, scopeControl, navCounts, spaceNavSection, ...(analysisActions ? { analysisActions: { pageTypes: ANALYSIS_ACTION_PAGE_TYPES, ...analysisActions } } : {}) };
}
