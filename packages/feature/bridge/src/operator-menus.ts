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

/** True when the current menu is an operator menu with a list scope: the sidebar `목록 범위` mounts for it, and for nothing else. */
export const usesListScope = (menu: MenuEntry | null) => declares(menu, SCOPED_GROUPS);
/** True when the current menu is one whose sidebar rows show counts. */
export const usesNavCounts = (menu: MenuEntry | null) => declares(menu, COUNTED_GROUPS);
/** True when the current menu uses the saved VOC views section. */
export const usesSavedViews = (menu: MenuEntry | null) => declares(menu, SAVED_VIEW_GROUPS);
/**
 * The capability each operator group's list reads, for the sidebar picker's in/out-of-scope marks (#2630). A group absent here keeps the
 * picker's default (`voc.read`). The `findings` group (전체 Finding, 근거) lists Findings, which `finding.read` grants per Managed System.
 * Declared here, next to the groups that mount the picker, because the capability is feature vocabulary the Kernel menu manifest does not carry.
 */
// Values are checked where ScopeControl passes them to the picker's `capability` prop:
// this module may not import feature-screens (boundary lint).
const LIST_SCOPE_CAPABILITY = { findings: 'finding.read' } as const;
type ListScopeCapability = (typeof LIST_SCOPE_CAPABILITY)[keyof typeof LIST_SCOPE_CAPABILITY];
/** The capability the sidebar `목록 범위` marks scope by on the current menu; `undefined` = the picker's default. */
export const listScopeCapability = (menu: MenuEntry | null): ListScopeCapability | undefined =>
  menu !== null && usesListScope(menu) && Object.hasOwn(LIST_SCOPE_CAPABILITY, menu.group)
    ? LIST_SCOPE_CAPABILITY[menu.group as keyof typeof LIST_SCOPE_CAPABILITY]
    : undefined;
/** The 흐름 설정 (`flowSettings`) menus ignore the list scope: the picker is disabled there and the carried value stays in the URL. */
export const ignoresListScope = (menu: MenuEntry | null) => menu?.group === 'flowSettings';
