export type { ChartChrome, ChartChromeOptions } from './chart/chartChrome';
export { TreeMatrix, type TreeMatrixProps } from './matrix/TreeMatrix';
export { MatrixLevelOrder, type MatrixLevelOrderProps } from './matrix/MatrixLevelOrder';
export { MatrixEmphasisBar, type MatrixEmphasisBarProps } from './matrix/MatrixEmphasisBar';
export { MatrixToneLegend, type MatrixToneLegendProps } from './matrix/MatrixToneLegend';
export type { MatrixCellTone } from './matrix/tones';
export { sameValueRule, type MatrixValueOf } from './matrix/emphasis';
export type { MatrixNode, MatrixColumn, MatrixWindowQuery, MatrixWindow, MatrixEmphasisRule, MatrixCell } from '@ap/contracts';
export type { ChartBounds, ChartBoundLabels } from './chart/chartBounds';
export type { ChartStatus, ChartRowGroups } from './chart';
export { orderRows, type OrderableRow, type RowOrderOptions, type RowOrderResult, type RowOrderSort } from './chart/rowOrder';
export { AnalysisChart, type AnalysisChartProps, type ChartSpec, type HeatmapSpec, type HeatmapCell, type HeatmapCategory, type DonutSpec, type DonutSlice, type ScatterPoint, type ScatterSpec, type BoxStats, type BoxPlotSpec, type ParetoSpec, type TopNBarSpec, type TopNBarItem, type HistogramSpec, type HistogramBin } from './chart/AnalysisChart';
export { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries, type ChartPoint, type ChartPointAction } from './chart/AnalysisChartFrame';
export { heatmapMinCanvasHeight, rowPitchChartHeight } from './chart/analysisChartGeometry';
export { AuditTimeline, type AuditTimelineProps, type AuditFieldDisplay } from './drawer/AuditTimeline';
export { copyText, useCopyLink } from './state/copyText';
export * from './state/DataTrustIndicator';
export type { ChartTrust } from './state/trustFormat';
export * from './drawer/DetailDrawer';
// Explicit: strokeToken·baseTextStyle stay package-internal (chart plumbing and tests only).
/** @deprecated use '@ap/components/host'; removed next SDK minor */
export { chartTheme } from './chart/EChart';
/** @deprecated use '@ap/components/host'; removed next SDK minor */
export { EChart } from './chart/EChart';
/** @deprecated use '@ap/components/host'; removed next SDK minor */
export { token } from './chart/EChart';
/** @deprecated use '@ap/components/host'; removed next SDK minor */
export { type EChartProps } from './chart/EChart';
export * from './filters/PageFilterBar';
export { FilterLine, type FilterLineProps } from './filters/FilterLine';
export { AnalysisSelectionChipZone } from './filters/AnalysisSelectionChipZone';
export { PageConditionCategories, type PageConditionCategoriesProps, type PageConditionOptions, type PageConditionOptionsLoader } from './filters/PageConditionCategories';
export { PageConditionTree, type PageConditionTreeProps } from './filters/PageConditionTree';
export { usePageConditionOptionsLoader, PageConditionOptionsError } from './filters/usePageConditionOptionsLoader';
export * from './table/PlatformDataTable';
export type { PlatformColumnGroup } from './table/PlatformDataTable';
export * from './table/tableUrlWarning';
export { TableQuickSearch, type TableQuickSearchProps } from './table/TableQuickSearch';
export type { FilterValueCheck, LegacyFilterKey, TableFilterOption, TableFilterProblem, TableFilterRead } from './table/tableFilterUrl';
export { FILTER_OP_LABELS } from './table/filterOps';
export { instantToLocalField, localFieldToInstant, type LocalFieldFailure, type LocalFieldResult } from './table/zonedInstant';
export type { InstantEntry } from './table/filterFields';
export { useTableFilterDeclaration } from './table/useTableFilterDeclaration';
export type { TableFilterDeclaration, TableFilterColumnProps } from './table/useTableFilterDeclaration';
export { useClearFiltersAction } from './table/useClearFiltersAction';
export type { ClearFiltersActionOptions } from './table/useClearFiltersAction';
export { RecoverButton } from './state/RecoverButton';
export { AccessRequestEntry, scopeRequestTarget, useScopeAccessRequest } from './state/AccessRequestEntry';
export { useAccessRequestRead, useAccessRequestState } from './state/useAccessRequestState';
export { focusPageFallback } from './state/pageFocus';
export { checkWorkbook, toWorkbookXlsx, WorkbookError, WORKBOOK_LIMITS, type WorkbookCell, type WorkbookErrorCode, type WorkbookSheet } from './table/workbook';
export { useWorkbookExport, WorkbookRefusal, type WorkbookExport, type WorkbookExportOptions, type WorkbookExportResult } from './table/useWorkbookExport';
export * from './archetypes/PlatformPage';
export * from './RadioGroup';
export { RowAction, type RowActionProps } from './drawer/RowAction';
export * from './state/StatCard';
// Explicit: OutcomeContent stays package-internal (QueryView and PlatformDataTable draw through it; no new public contract).
export { LoadingBlock, OutcomeView, QueryView, StateMessage } from './StateView';

export { ManagementLayout, type ManagementLayoutProps } from './archetypes/ManagementLayout';

export { badgeCountText } from './workspace/PanelBadge';
export { PanelWorkspace, type PanelWorkspaceLayout, type PanelWorkspacePanel, type PanelWorkspacePersistence, type PanelWorkspacePreset, type PanelWorkspaceProps, type PanelWorkspaceStorage } from './workspace/PanelWorkspace';
export { PANEL_RECIPE_ITEM, panelRecipe, type PanelRecipe, type PanelRecipeCode, type PanelRecipeFeature, type PanelRecipeFeatureState, type PanelRecipeHost, type PanelRecipeInput, type PanelRecipeKey } from './panel-recipe/panelRecipe';
export { PanelRecipeBack, PanelRecipeFrame } from './panel-recipe/PanelRecipeBack';
export { changedPanelOptions, PANEL_OPTIONS_COLLAPSE_BELOW, PanelOptionChips, PanelOptions, usePanelOptions, type PanelOption, type PanelOptionChipsProps, type PanelOptionChoice, type PanelOptionsProps, type PanelOptionValues } from './workspace/PanelOptions';
export { PanelAddMenu, usePinnedPanels, type PanelAddItem, type PanelAddMenuProps } from './workspace/PanelAdd';
export { EmbeddedPane } from './workspace/panelContext';
export { AnalysisLayout, type AnalysisLayoutProps, type AnalysisSection } from './archetypes/AnalysisLayout';
export { DrillLayout, DrillPath, ReturnLink, type DrillLayoutProps, type DrillPathProps, type DrillSibling, type DrillSiblings } from './archetypes/DrillLayout';
export { LegendTree, type LegendTreeNode, type LegendTreeSort, type LegendTreeProps } from './chart/LegendTree';

export { formatQuerySummary, presetOutsideAxes, querySummaryItems, summaryPreset, type QuerySummaryOptions, type QuerySummaryItem, type SummaryPreset } from './filters/querySummary';
export { WorkspaceQueryBarRow } from './archetypes/WorkspaceQueryBar';
export { useReportQueryBarStatus, useRegisterContextEditorFocus, useFocusContextEditor, type QueryBarStatus } from './filters/QueryBarStatus';
export { useCompactPageDensity } from './pageDensity';
export { QueryBarExtensionContext, QueryBarExtensionsProvider, useQueryBarExtension, type QueryBarExtension } from './filters/QueryBarExtension';
export { OrderedIntervalTrack } from './chart/OrderedIntervalTrack';
export { ORDERED_TRACK_RESPONSE_LIMIT, type OrderedIntervalTrackProps, type OrderedTrackLane, type OrderedTrackState, type OrderedTrackItem, type OrderedTrackMarker, type OrderedTrackStatus, type OrderedTrackLoadState } from './chart/orderedIntervalTypes';
export type { ChartExportActionsPolicy } from './chart/ChartImageCopyButton';
export { LaneTimeline, type LaneTimelineProps, type LaneTimelineHandle, type TimelineLane, type TimelineSegment, type TimelineOverlay } from './chart/LaneTimeline';
export { useRangeBrush, RANGE_BRUSH_DRAG_THRESHOLD, type AxisRange, type RangeBrush, type RangeBrushOptions, type RangeBrushKey } from './chart/useRangeBrush';
export { findSequenceMatches, findRepeatedSequences, sequenceSteps, itemsInRange, SEQUENCE_MAX_LENGTH, type SequenceLane, type SequenceMatch, type SequenceMatchOptions, type RepeatedSequence, type RepeatedSequenceOptions } from './chart/sequenceMatch';
export { Inspector, type InspectorProps, type InspectorSection } from './inspector/Inspector';

export * from './floating';

export { ViewSelector, type ViewFilter, type ViewSelectorProps, type ViewSelectorState } from './saved-view/ViewSelector';
export { SaveViewDialog, type SaveViewDialogProps, type SaveViewSubmit } from './saved-view/SaveViewDialog';
export { VisibilityOptionsPicker, type VisibilityOption, type VisibilityOptionsPickerProps } from './saved-view/VisibilityOptionsPicker';
export { summarizeContext as summarizeSavedViewContext } from './saved-view/text';
export { failureText } from './saved-view/text';
export { ShareTargetPicker, type ShareGroupsState, type ShareMode, type ShareTargetDraft, type ShareTargetPickerProps } from './saved-view/ShareTargetPicker';
export { GroupEditor, type GroupEditorProps } from './saved-view/GroupEditor';
export { personLabel, toggleMember, usePeopleSearch, type PeopleSearch, type PeopleSearchState } from './saved-view/people';
export { ViewManagement, type ViewManagementFilter, type ViewManagementProps } from './saved-view/ViewManagement';
export { ApprovalQueue, type ApprovalQueueProps, type ApprovalQueueStatus } from './saved-view/ApprovalQueue';
export type { ApprovalRequestInfo, ViewActionOutcome, ViewDecideHandler, ViewDiagnosis, ViewRevokeHandler } from './saved-view/viewInfo';

export { HierarchyNav, type HierarchyNavProps } from './hierarchy/HierarchyNav';
export { useHierarchyNavState } from './hierarchy/useHierarchyNavState';
export { type HierarchyNavState } from './hierarchy/hierarchyState';
export { ObjectLinks, type ObjectLinksProps } from './archetypes/ObjectLinks';

export { browserPreferenceKey } from './preferences/browserPreference';
export { useCollapsePreference, type CollapsePreference, type CollapsePreferenceOptions } from './filters/useCollapsePreference';

export { PageConditionLayer, type PageConditionLayerProps } from './filters/PageConditionLayer';
export type { PageConditionLayerOptions } from './filters/DeclaredPageConditions';

export { FacetedSetDialog, type FacetedSetDialogProps } from './filters/FacetedSetDialog';
export type { FacetedSetFacet, FacetedSetItem, FacetedSetValue } from './filters/facetedSet';
