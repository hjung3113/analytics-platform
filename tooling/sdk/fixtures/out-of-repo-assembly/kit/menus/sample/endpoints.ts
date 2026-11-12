// The sample menu's one read: the declaration the page queries and the mock (or server) answers.
// Copying this folder for a new menu: change the constants in ./menu.ts; this file follows them.
import { defineEndpoint } from '@ap/contracts';
import { MENU_ID, MENU_PERMISSION } from './menu';

/** One synthetic row. Replace with the menu's real data shape. */
export type SampleRow = { name: string; value: number };

export const sampleEndpoint = defineEndpoint<Record<never, true>, SampleRow[]>({
  id: `${MENU_ID}.rows`,
  menuId: MENU_ID,
  paramKeys: {},
  permission: MENU_PERMISSION,
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});
