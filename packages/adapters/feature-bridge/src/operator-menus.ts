import { spaceId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The operations console space that draws the operator sidebar surfaces (#1099c). Platform administration shares it but declares none of the groups below. */
export const OPERATIONS_SPACE = spaceId('operations');

/** The `managedSystem` list scope key a feature menu declares; the Kernel never names it. */
export const SCOPE_KEY = 'managedSystem';

/** Operator groups whose menus take the list scope (the feature-admin group shows the picker disabled with FeedbackOps' own explanation). `admin` (platform management) is deliberately absent. */
const SCOPED_GROUPS: ReadonlySet<string> = new Set(['voc', 'findings', 'tasks', 'surveys', 'dashboard', 'integration', 'featureAdmin']);
/** Groups whose rows carry FeedbackOps count badges (`SLOT_KEYS` in `nav-counts.tsx`). */
const COUNTED_GROUPS: ReadonlySet<string> = new Set(['voc', 'findings', 'surveys']);
/** Groups that use the saved VOC views section. */
const SAVED_VIEW_GROUPS: ReadonlySet<string> = new Set(['voc']);

function declares(spaceIdValue: string, menu: MenuEntry | null, groups: ReadonlySet<string>): boolean {
  return spaceIdValue === OPERATIONS_SPACE && menu !== null && menu.pageKeys.includes(SCOPE_KEY) && groups.has(menu.group);
}

/** True when the current menu is an operator menu with a list scope: the sidebar `목록 범위` mounts for it, and for nothing else. */
export const usesListScope = (space: string, menu: MenuEntry | null) => declares(space, menu, SCOPED_GROUPS);
/** True when the current menu is one whose sidebar rows show counts. */
export const usesNavCounts = (space: string, menu: MenuEntry | null) => declares(space, menu, COUNTED_GROUPS);
/** True when the current menu uses the saved VOC views section. */
export const usesSavedViews = (space: string, menu: MenuEntry | null) => declares(space, menu, SAVED_VIEW_GROUPS);
/** The feature-admin menus ignore the list scope: the picker is disabled there and the carried value stays in the URL. */
export const ignoresListScope = (menu: MenuEntry | null) => menu?.group === 'featureAdmin';
