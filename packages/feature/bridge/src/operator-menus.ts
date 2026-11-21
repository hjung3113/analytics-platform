import type { MenuEntry } from '@ap/kernel';

/** The `managedSystem` list scope key a feature menu declares; the Kernel never names it. */
export const SCOPE_KEY = 'managedSystem';

/** Operator groups (the 업무 흐름 space) whose menus take the list scope (`flowSettings` shows the picker disabled with the feature screens' own explanation). `admin` and `access` (the 운영 콘솔 space) are deliberately absent. Group ids are app-unique, so the group alone identifies the menu; no space is compared. */
const SCOPED_GROUPS: ReadonlySet<string> = new Set(['voc', 'findings', 'tasks', 'surveys', 'dashboard', 'integration', 'flowSettings']);
/** Groups whose rows carry feature count badges (`SLOT_KEYS` in `nav-counts.tsx`). */
const COUNTED_GROUPS: ReadonlySet<string> = new Set(['voc', 'findings', 'surveys']);
/** Groups that use the saved VOC views section. */
const SAVED_VIEW_GROUPS: ReadonlySet<string> = new Set(['voc']);

function declares(menu: MenuEntry | null, groups: ReadonlySet<string>): boolean {
  return menu !== null && menu.pageKeys.includes(SCOPE_KEY) && groups.has(menu.group);
}

/** A declared list scope mounts in the sidebar by default. Existing operator pickers also mount without a capability declaration. */
export const usesListScope = (menu: MenuEntry | null): boolean =>
  menu !== null && menu.pageKeys.includes(SCOPE_KEY) && menu.requiredCapability?.scopePicker !== 'page'
  && (menu.requiredCapability !== undefined || SCOPED_GROUPS.has(menu.group));
/** True when the current menu is one whose sidebar rows show counts. */
export const usesNavCounts = (menu: MenuEntry | null) => declares(menu, COUNTED_GROUPS);
/** True when the current menu uses the saved VOC views section. */
export const usesSavedViews = (menu: MenuEntry | null) => declares(menu, SAVED_VIEW_GROUPS);
/** The capability the list picker marks scope by. Omission keeps the picker's default. */
export const listScopeCapability = (menu: MenuEntry | null): string | undefined =>
  menu?.pageKeys.includes(SCOPE_KEY) ? menu.requiredCapability?.id : undefined;
/** The 흐름 설정 (`flowSettings`) menus ignore the list scope: the picker is disabled there and the carried value stays in the URL. */
export const ignoresListScope = (menu: MenuEntry | null) => menu?.group === 'flowSettings';
