import { carrySetId, type CarrySetDef } from '@ap/contracts';

/**
 * The `hwTime` carry set the app declares (`apps/platform-web/src/menus.ts`, pinned by `workspace-assembly.test.tsx`): the one HW Time menu joins
 * it so its sidebar View links keep the drill and the filter panel. Every test Registry built from `manifests` declares it too.
 */
export const HW_TIME_CARRY_SET: CarrySetDef = { id: carrySetId('hwTime'), pageKeys: ['drillModule', 'drillMotion', 'moduleType', 'module', 'motion', 'split'] };
