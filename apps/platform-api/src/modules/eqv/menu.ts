// Menu ids of the eqv declarations (#1645). The Layout Studio has no screen yet (step 6), so its reads and writes sit on this id:
// `invalidates` may name only same-menu endpoints. The equipment options belong to the viewer menu `eqv:focus` (step 4 reads them).
export const EQV_STUDIO_MENU_ID = 'eqv-studio';
export const EQV_FOCUS_MENU_ID = 'eqv:focus';

/** The menu permissions the declarations carry (`platform-port/permissions.ts` maps each to a capability rule). */
export const EQV_VIEW_PERMISSION = 'eqv:view';
export const EQV_EDIT_PERMISSION = 'eqv-studio:layout-edit';
export const EQV_PUBLISH_PERMISSION = 'eqv-studio:layout-publish';
