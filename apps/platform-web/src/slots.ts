import { createElement, type ReactNode } from 'react';
import type { HomeTodoSlot, NavCountsSlot, NotificationsSlot, PlannedSpace, PlatformSlots, ScopeControlSlot, SpaceNavSectionSlot, VocComposeSlot } from '@ap/kernel';
import { GlobalContextBar, OpenInBoardAction } from '@ap/shell';
import { featureSlot } from './feature-systems';

/** Business systems announced in the switcher but not built (15 §3.2). Display only: no Registry entry, no permission, no menu. */
export const PLANNED_SPACES: readonly PlannedSpace[] = [];

/** Slots `main.tsx` passes to PlatformProvider. */
export function appSlots(assembly: { topBarTools: ReactNode }, notifications: NotificationsSlot, vocCompose: VocComposeSlot, homeTodo: HomeTodoSlot, scopeControl: ScopeControlSlot, navCounts: NavCountsSlot, spaceNavSection: SpaceNavSectionSlot): PlatformSlots {
  return { contextBar: createElement(GlobalContextBar), topBarTools: assembly.topBarTools, features: featureSlot(), plannedSpaces: PLANNED_SPACES, boardEntry: createElement(OpenInBoardAction), notifications, vocCompose, homeTodo, scopeControl, navCounts, spaceNavSection };
}
