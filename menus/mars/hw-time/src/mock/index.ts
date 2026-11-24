/** Mock endpoint list exported only to the platform-web dev assembly. */
import type { AnyMockEndpoint } from '@ap/mock-server';
import { hwTimeMock as existing } from './hwTime';
import { hwTimeOverviewMock } from './overview';
import { hwTimeNewPanelMock } from './newPanels';
import { MAX_EQUIPMENT_ROWS } from './syntheticEquipment';

/** Rows are the first 24 resolved equipment, so a larger fixed equipment selection is refused with the limit instead of
 * silently answering for part of it (06 §6.4, #2868). */
const fixedSelectionLimit = (endpoint: AnyMockEndpoint): AnyMockEndpoint => ({
  ...endpoint,
  validate: input => (input.context.selection?.length ?? 0) > MAX_EQUIPMENT_ROWS
    ? `This sample answers at most ${MAX_EQUIPMENT_ROWS} fixed equipment; ${input.context.selection!.length} were selected`
    : endpoint.validate?.(input) ?? null,
});

export const hwTimeMock = [...existing, ...hwTimeOverviewMock, ...hwTimeNewPanelMock].map(fixedSelectionLimit);
