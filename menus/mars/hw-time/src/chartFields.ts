import { EQUIPMENT_SELECTION_DIMENSION, type MenuChartFields } from '@ap/contracts';
import { HW_TIME_UNIT } from './endpoints';
import { HW_TIME_CHART_MESSAGES as C, HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_OVERVIEW_MESSAGES as O } from './messages';

/** Row fields of the chart query (`pages/analysis/ChartPanel.tsx`): ids are also the saved `ChartConfig` fields. */
export const HW_TIME_CHART_FIELD = { module: 'moduleSeconds', motion: 'motionSeconds', equipment: 'equipment', day: 'day' } as const;

/**
 * `MenuMeta.chartFields` (#2761): what «종류로 만들기» offers. Both measures are server means in seconds of the drilled Module (and
 * Motion), read as given, so their reaggregation is `none`: the client never adds or averages them across equipment, days or Motions.
 * - Module mean: the Module's run duration (the server's sum of its Motion means): a bar reads `hwTime.matrix` `cells[].module.value`
 *   per equipment, a line `hwTime.equipmentDays` (drilled Module, no Motion) per equipment and day.
 * - Motion mean: the drilled Motion's mean: a bar reads `cells[].motions[drillMotion].value`, a line `hwTime.equipmentDays` with the Motion.
 * The one breakdown is equipment, whose selection feeds HW Time's equipment receivers. A Module or Motion breakdown is not offered: the
 * server returns no per-Module value across equipment and no daily value per Motion, so neither kind could draw it.
 */
export const HW_TIME_CHART_FIELDS: MenuChartFields = {
  measures: [
    { id: HW_TIME_CHART_FIELD.module, label: C.moduleSeconds, unit: HW_TIME_UNIT.en, reaggregation: 'none' },
    { id: HW_TIME_CHART_FIELD.motion, label: C.motionSeconds, unit: HW_TIME_UNIT.en, reaggregation: 'none' },
  ],
  breakdowns: [{ id: HW_TIME_CHART_FIELD.equipment, label: O.equipment, dimension: EQUIPMENT_SELECTION_DIMENSION }],
  time: { field: HW_TIME_CHART_FIELD.day, label: N.date },
};
