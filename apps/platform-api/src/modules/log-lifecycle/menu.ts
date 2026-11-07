// The menu owning the log lifecycle reads and writes (the model list; its project and round details are navHidden
// children that read this menu's endpoints, so they have no id here). Already a planned manifest in `menus/log-dev/log-models`.
export const LOG_MODELS_MENU_ID = 'log-models';
/** The validation request queue menu (design §6.2): request list, request detail, attempts and rule results. */
export const LOG_VALIDATION_REQUESTS_MENU_ID = 'log-validation-requests';
