import type { SavedViewSupport } from '@ap/contracts';

/**
 * What a Saved View may store from the cycle-time detail (docs/06 §21). The page registers it with `useSavedViewSupport`;
 * the shell's selector does the saving and restoring, so the menu never calls the store.
 * `contextKeys` lists only keys a view can hold (`SavedViewContext`); `lot`, `ppid`, `recipe` and `metric` are applied by the page but have no saved field yet.
 * `pageKeys` leaves out `page`: it is the table's page number, not a condition worth restoring.
 * Version 2 is the menu-view version the app's local seed treats as current; no migration exists yet.
 */
export const CYCLE_TIME_SAVED_VIEW: SavedViewSupport = {
  menuId: 'cycle-time',
  menuSchemaVersion: 2,
  contextKeys: ['time', 'roomNames', 'line', 'prcGroup', 'condition', 'selection'],
  pageKeys: ['granularity', 'percentile', 'sort', 'bucket', 'bin', 'conditionSet'],
};
