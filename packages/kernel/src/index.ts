export { createBrowserLocation, createBasePathLocation, hasDotSegment, type PlatformLocation } from './location';
export { useDrill, type DrillInvalid, type DrillLevelState, type DrillState, type DrillTrailStep } from './drill';
export { contractErrorSentence, errorGuidance, I18nProvider, invalidValueSentence, topicParticle, useI18n, type ErrorGuidance, type Key, type Lang, type Text } from './i18n';
export { classifyMetricInit, type MetricInit } from './metric-init';
export { RETURN_CONTEXT_LABELS, PaneScreenProvider, PlatformLink, PlatformProvider, usePlatform, usePlatformOptional, type FeedbackOpsEntry, type FeedbackOpsEntryId, type FeedbackOpsSlot, type LinkOptions, type LinkResolution, type NotificationsSlot, type PaneScreen, type PlannedSpace, type PlatformSlots, type Recent, type ReturnContextKey, type ReturnOrigin, type ScopeState, type Toast } from './platform';
export { useMenuAction, type MenuActionState } from './action';
export { useAdapterRequest, useEntityQuery, useMenuFetch, useMenuQuery, usePlatformQuery, type MenuFetch, type QueryState, type RequestState } from './query';
export {
  BOARD_PATH, CONTEXT_LABELS, createRegistry, isBoardPath, PAGE_TYPE_LABELS, pathFor, routeParamNames, RegistryError,
  type AnyGroupId, type GroupDef, type MenuEntry, type ModuleGroupDef, type ModuleMenuEntry, type PageProps, type PlatformGroupDef, type PlatformMenuEntry, type Registry, type RouteMatch,
} from './registry';
export { type PageNavigation } from './pageNavigation';
export { paneHref, withPaneContext } from './paneContext';
export { mountModule, type MountOptions } from './module';
export { useModuleHost, type ModuleShellPorts } from './module-host';

export { useEquipmentAxes } from './platform';
export { labelledCondition } from './equipmentAxes';

export { useQueryDraft, type QueryDraft, type QueryMissing } from './query-draft';
export { PaneQueryDraftProvider } from './platform';
export { useAxisOptions, useEquipmentSearch, useResolvedSelection } from './selection-ports';
export type { PortContext, PortFailure, PortStatus, AxisOptionsParams, EquipmentSearchParams, PortPageResult, ResolvedSelectionParams, ResolvedSelectionResult } from './selection-ports';

export { useQueryHistory, type QueryHistory, type QueryHistoryRow } from './query-history';
