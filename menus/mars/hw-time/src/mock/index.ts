/** Mock endpoint list exported only to the platform-web dev assembly. */
import { hwTimeMock as existing } from './hwTime';
import { hwTimeOverviewMock } from './overview';
import { hwTimeNewPanelMock } from './newPanels';
export const hwTimeMock = [...existing, ...hwTimeOverviewMock, ...hwTimeNewPanelMock];
