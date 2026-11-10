/**
 * Ids of the Templates that ship with the package (`packages/eqv/assets/templates`). A stored Template may not reuse
 * one: a clashing row could never be deleted. `test/bundled-templates.test.ts` compares this list with the folder.
 */
export const BUNDLED_TEMPLATE_IDS: readonly string[] = [
  'cluster-dual-hub',
  'cluster-rotary-stations',
  'cluster-single',
  'lithography-dual-stage',
  'track-stacked',
  'vertical-batch-furnace',
  'wet-linear',
];
