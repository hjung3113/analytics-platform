import { encodeFilterParam } from '@ap/contracts';
import type { MenuPlatform } from '@ap/kernel';
import { IMPROVEMENT_ITEMS_MENU_ID } from './endpoints';
import { filtersForView } from './model';

/** A fresh saved view, independent of any remembered search, drawer or table page. */
export function myAssignmentsLink(linkTo: MenuPlatform['linkTo']): string {
  return linkTo(IMPROVEMENT_ITEMS_MENU_ID, { page: { view: 'mine', filter: filtersForView('mine').map(encodeFilterParam), q: null, page: null, sort: null, focus: null, origin: null } });
}
