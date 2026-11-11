// Menu ids of the eqv declarations (#1645). The Studio Layouts menu (#1654) owns this id; its reads and writes sit on it:
// `invalidates` may name only same-menu endpoints. The equipment options belong to the viewer menu `eqv:focus` (step 4 reads them).
import type { MenuPermissionDeclaration } from '../menu-dispatch/types.js';
export const EQV_STUDIO_MENU_ID = 'eqv-studio';
export const EQV_FOCUS_MENU_ID = 'eqv:focus';
/** Menu id of the Onboarding reads and actions (#1658). The prototype's recommended id; if the owner picks another, only this constant changes. */
export const EQV_ONBOARDING_MENU_ID = 'eqv-onboarding';

/**
 * The menu permissions the declarations carry. `eqv:view` keeps its name: the module menu permission the app declares today; the server reads
 * and the stored links use it. The two write names are the Studio menu permissions step 6 declares in the app; they are not `eqv:*` because
 * the Kernel registry refuses a namespace clash with the module (registry.ts:124,171,213).
 */
export const EQV_VIEW_PERMISSION = 'eqv:view';
/** Entry permission of the Studio Layouts menu (#1654): same capability as `eqv:view`, a separate name because the registry refuses a second non-module menu on an `eqv:*` name. */
export const EQV_STUDIO_VIEW_PERMISSION = 'eqv-studio:view';
export const EQV_EDIT_PERMISSION = 'eqv-studio:layout-edit';
export const EQV_PUBLISH_PERMISSION = 'eqv-studio:layout-publish';

/** Onboarding write permissions (#1658, ADR-0139): Studio names (the menu is entered with `eqv-studio:view`, its reads declare `eqv:view`), not `eqv:*`-prefixed, for the same registry reason. */
export const EQV_RULES_EDIT_PERMISSION = 'eqv-studio:rules-edit';
export const EQV_DICTIONARY_GLOBAL_EDIT_PERMISSION = 'eqv-studio:dictionary-global-edit';
export const EQV_MAPPING_PUBLISH_PERMISSION = 'eqv-studio:mapping-publish';

/** The capability behind each (the declaration of `MenuDispatchContribution.permissions`). */
export const EQV_VIEW_CAPABILITY = 'eqv.view';
export const EQV_EDIT_CAPABILITY = 'eqv.layout.edit';
export const EQV_PUBLISH_CAPABILITY = 'eqv.layout.publish';
export const EQV_RULES_EDIT_CAPABILITY = 'eqv.rules.edit';
export const EQV_DICTIONARY_GLOBAL_EDIT_CAPABILITY = 'eqv.dictionary.global_edit';
export const EQV_MAPPING_PUBLISH_CAPABILITY = 'eqv.mapping.publish';
export const EQV_MENU_PERMISSIONS: readonly MenuPermissionDeclaration[] = [
  { permission: EQV_VIEW_PERMISSION, capability: EQV_VIEW_CAPABILITY },
  { permission: EQV_STUDIO_VIEW_PERMISSION, capability: EQV_VIEW_CAPABILITY },
  { permission: EQV_EDIT_PERMISSION, capability: EQV_EDIT_CAPABILITY },
  { permission: EQV_PUBLISH_PERMISSION, capability: EQV_PUBLISH_CAPABILITY },
  { permission: EQV_RULES_EDIT_PERMISSION, capability: EQV_RULES_EDIT_CAPABILITY },
  { permission: EQV_DICTIONARY_GLOBAL_EDIT_PERMISSION, capability: EQV_DICTIONARY_GLOBAL_EDIT_CAPABILITY },
  { permission: EQV_MAPPING_PUBLISH_PERMISSION, capability: EQV_MAPPING_PUBLISH_CAPABILITY },
];
