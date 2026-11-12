// The constants a copy of this folder changes: id, path and label. Everything else in the folder reads them.
import type { Text } from '@ap/contracts';

export const MENU_ID = 'kit-sample';
export const MENU_PATH = '/sample';
export const MENU_LABEL: Text = { ko: '견본 메뉴', en: 'Sample menu' };
/** A kernel permission every session holds. A menu of its own permission declares it in ../../menus.ts KIT_PERMISSIONS. */
export const MENU_PERMISSION = 'platform:view';
