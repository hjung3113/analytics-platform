import type { PanelDeclaration } from '@ap/contracts';
import { AXIS_KEY, HW_DAYS_KEY, configurationDetailEndpoint, configurationExportEndpoint, configurationHistoryEndpoint, configurationLendingEndpoint, configurationPivotEndpoint, configurationTreeEndpoint, configurationTreeNavigationEndpoint, TREND_ITEM_KEY } from './endpoints';
import { MESSAGES } from './messages';

const context = ['time'] as const;
const equipment = { key: 'equipment' } as const;
const comparison = [{ key: 'mode' }, { key: 'ref' }] as const;

export const configurationPanels = {
  matrix: {
    id: 'matrix', title: MESSAGES.title, grain: 'configItemEquipment',
    queryInputs: { context, page: [equipment, ...comparison, { key: 'asOf' }, { key: 'core' }, { key: 'status' }, { key: 'q' }, { key: 'levels' }, { key: 'filter' }] },
    displayInputs: { page: [{ key: 'hideSameCols' }, { key: AXIS_KEY }] },
    outputs: [{ key: TREND_ITEM_KEY, action: 'drill' }],
    endpoints: [configurationTreeEndpoint, configurationTreeNavigationEndpoint, configurationDetailEndpoint, configurationExportEndpoint, configurationPivotEndpoint, configurationLendingEndpoint],
    pieces: ['TreeMatrix', 'QueryView', 'DetailDrawer', 'PlatformDataTable'],
  },
  trend: {
    id: 'trend', title: MESSAGES.trend, grain: 'configItemEquipmentChange',
    queryInputs: { context, page: [equipment, { key: TREND_ITEM_KEY, required: true }] },
    displayInputs: { page: [...comparison, { key: HW_DAYS_KEY, selection: 'highlight' }] },
    outputs: [], endpoints: [configurationHistoryEndpoint],
    availability: { requires: [{ anyOf: [TREND_ITEM_KEY] }], disabledReason: MESSAGES.trendItem },
    pieces: ['AnalysisChartFrame', 'LaneTimeline', 'QueryView'],
  },
} satisfies Record<string, PanelDeclaration>;
