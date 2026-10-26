export { AnalysisChart, type AnalysisChartProps, type ChartSpec, type HeatmapSpec, type HeatmapCell, type DonutSpec, type DonutSlice, type ScatterPoint, type ScatterSpec, type BoxStats, type BoxPlotSpec, type ParetoSpec, type TopNBarSpec, type TopNBarItem } from './chart/AnalysisChart';
export * from './chart/AnalysisChartFrame';
export * from './drawer/AuditTimeline';
export { copyText, useCopyLink } from './state/copyText';
export * from './state/DataTrustIndicator';
export * from './drawer/DetailDrawer';
// Explicit: strokeToken·baseTextStyle stay package-internal (chart plumbing and tests only).
export { chartTheme, EChart, token, type EChartProps } from './chart/EChart';
export * from './filters/PageFilterBar';
export * from './table/PlatformDataTable';
export * from './table/tableUrlWarning';
export { RecoverButton } from './state/RecoverButton';
export { focusPageFallback } from './state/pageFocus';
export { checkWorkbook, toWorkbookXlsx, WorkbookError, WORKBOOK_LIMITS, type WorkbookCell, type WorkbookErrorCode, type WorkbookSheet } from './table/workbook';
export { useWorkbookExport, WorkbookRefusal, type WorkbookExport, type WorkbookExportOptions, type WorkbookExportResult } from './table/useWorkbookExport';
export * from './archetypes/PlatformPage';
export * from './RadioGroup';
export { RowAction, type RowActionProps } from './drawer/RowAction';
export * from './state/StatCard';
export * from './StateView';
export { useManagementFilters, type FilterDraft, type ManagementFiltersOptions } from './filters/useFilterDraft';

export { ManagementLayout, type ManagementLayoutProps } from './archetypes/ManagementLayout';

export { badgeCountText } from './workspace/PanelBadge';
export { PanelWorkspace, type PanelWorkspaceLayout, type PanelWorkspacePanel, type PanelWorkspacePreset, type PanelWorkspaceProps } from './workspace/PanelWorkspace';
export { AnalysisLayout, type AnalysisLayoutProps, type AnalysisSection } from './archetypes/AnalysisLayout';
export { DrillLayout, DrillPath, ReturnLink, type DrillLayoutProps, type DrillPathProps, type DrillSibling, type DrillSiblings } from './archetypes/DrillLayout';
export { LegendTree, type LegendTreeNode, type LegendTreeSort, type LegendTreeProps } from './chart/LegendTree';

export { formatQuerySummary, presetOutsideAxes, querySummaryItems, summaryPreset, type QuerySummaryOptions, type QuerySummaryItem, type SummaryPreset } from './filters/querySummary';
export { QueryBarExtensionContext, QueryBarExtensionsProvider, useQueryBarExtension, type QueryBarExtension } from './filters/QueryBarExtension';
export { LaneTimeline, type LaneTimelineProps, type LaneTimelineHandle, type TimelineLane, type TimelineSegment } from './chart/LaneTimeline';
export { Inspector, type InspectorProps, type InspectorSection } from './inspector/Inspector';
