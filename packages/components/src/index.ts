export { AnalysisChart, type AnalysisChartProps, type ChartSpec, type HeatmapSpec, type HeatmapCell, type DonutSpec, type DonutSlice, type ScatterPoint, type ScatterSpec, type BoxStats, type BoxPlotSpec, type ParetoSpec, type TopNBarSpec, type TopNBarItem } from './AnalysisChart';
export * from './AnalysisChartFrame';
export * from './AuditTimeline';
export { copyText, useCopyLink } from './copyText';
export * from './DataTrustIndicator';
export * from './DetailDrawer';
// Explicit: strokeToken·baseTextStyle stay package-internal (chart plumbing and tests only).
export { chartTheme, EChart, token, type EChartProps } from './EChart';
export * from './PageFilterBar';
export * from './PlatformDataTable';
export * from './tableUrlWarning';
export { focusPageFallback } from './pageFocus';
export { checkWorkbook, toWorkbookXlsx, WorkbookError, WORKBOOK_LIMITS, type WorkbookCell, type WorkbookErrorCode, type WorkbookSheet } from './workbook';
export { useWorkbookExport, type WorkbookExport, type WorkbookExportOptions } from './useWorkbookExport';
export * from './PlatformPage';
export * from './RadioGroup';
export { RowAction, type RowActionProps } from './RowAction';
export * from './StatCard';
export * from './StateView';
export { useManagementFilters, type FilterDraft, type ManagementFiltersOptions } from './useFilterDraft';

export { ManagementLayout, type ManagementLayoutProps } from './ManagementLayout';

export { badgeCountText } from './workspace/PanelBadge';
export { PanelWorkspace, type PanelWorkspaceLayout, type PanelWorkspacePanel, type PanelWorkspacePreset, type PanelWorkspaceProps } from './workspace/PanelWorkspace';
export { AnalysisLayout, type AnalysisLayoutProps, type AnalysisSection } from './AnalysisLayout';
export { DrillLayout, DrillPath, ReturnLink, type DrillLayoutProps, type DrillPathProps, type DrillSibling, type DrillSiblings } from './DrillLayout';
export { LegendTree, type LegendTreeNode, type LegendTreeSort, type LegendTreeProps } from './LegendTree';

export { formatQuerySummary, presetOutsideAxes, querySummaryItems, summaryPreset, type QuerySummaryOptions, type QuerySummaryItem, type SummaryPreset } from './querySummary';
export { QueryBarExtensionContext, QueryBarExtensionsProvider, useQueryBarExtension, type QueryBarExtension } from './QueryBarExtension';
export { LaneTimeline, type LaneTimelineProps, type LaneTimelineHandle, type TimelineLane, type TimelineSegment } from './LaneTimeline';
export { Inspector, type InspectorProps, type InspectorSection } from './inspector/Inspector';
