/** Mock endpoint list exported only to the platform-web dev assembly. */
import { hwTimeMock as existing } from './hwTime';
import { hwTimeOverviewMock } from './overview';
import { hwTimeNewPanelMock } from './newPanels';
import { MAX_EQUIPMENT_ROWS } from './syntheticEquipment';

/** Rows are the first 24 resolved equipment, so a larger fixed equipment selection is refused with the limit instead of
 * silently answering for part of it (06 §6.4, #2868). */
export const hwTimeMock = [...existing, ...hwTimeOverviewMock, ...hwTimeNewPanelMock].map(endpoint => ({
  ...endpoint,
  maxFixedEquipment: MAX_EQUIPMENT_ROWS,
}));
