import { createElement, type ReactNode } from 'react';
import type { HomeTodoSlot, NavCountsSlot, NotificationsSlot, PlannedSpace, PlatformSlots, ScopeControlSlot, VocComposeSlot } from '@ap/kernel';
import { GlobalContextBar, OpenInBoardAction } from '@ap/shell';
import { feedbackOpsSlot } from './feedbackops-systems';

/** Business systems announced in the switcher but not built (15 §3.2). Display only: no Registry entry, no permission, no menu. */
export const PLANNED_SPACES: readonly PlannedSpace[] = [];

/** Slots `main.tsx` passes to PlatformProvider. `feedbackOpsOrigin` is the one value `main.tsx` read from the env (#60). */
export function appSlots(assembly: { topBarTools: ReactNode }, feedbackOpsOrigin: string | null, notifications: NotificationsSlot, vocCompose: VocComposeSlot, homeTodo: HomeTodoSlot, scopeControl: ScopeControlSlot, navCounts: NavCountsSlot): PlatformSlots {
  return { contextBar: createElement(GlobalContextBar), topBarTools: assembly.topBarTools, feedbackOps: feedbackOpsSlot(feedbackOpsOrigin), plannedSpaces: PLANNED_SPACES, boardEntry: createElement(OpenInBoardAction), notifications, vocCompose, homeTodo, scopeControl, navCounts };
}
