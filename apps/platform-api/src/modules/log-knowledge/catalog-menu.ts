export const LOG_KNOWLEDGE_MENU_ID = 'log-knowledge-catalog';
// Menus owning the knowledge item reads (ADR-0109, #1197). The detail screens (`log-knowledge-model`, `log-knowledge-item`)
// are navHidden children that read their parent menu's endpoints, so they have no id here.
export const LOG_KNOWLEDGE_MODELS_MENU_ID = 'log-knowledge-models';
export const LOG_KNOWLEDGE_ITEMS_MENU_ID = 'log-knowledge-items';
// The object access management (#1504 S-a): its reads and writes have no screen yet (node S-f adds the search screen, a later node the
// management screen), so they sit on a menu of their own and the models / items menus keep exactly the declarations their screens use.
export const LOG_KNOWLEDGE_ACCESS_MENU_ID = 'log-knowledge-access';
// The knowledge search reads (#1507 S-d). The search screen and its menu entry are node S-f; until then the two reads sit on this id.
export const LOG_KNOWLEDGE_SEARCH_MENU_ID = 'log-knowledge-search';
