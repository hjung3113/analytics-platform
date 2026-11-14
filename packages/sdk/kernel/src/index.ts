export { createBrowserLocation, createBasePathLocation, type PlatformLocation } from './context/location';
export { useDrill, type DrillInvalid, type DrillLevelState, type DrillState, type DrillTrailStep } from './context/drill';
export { contractErrorSentence, errorGuidance, formatText, I18nProvider, invalidValueSentence, objectParticle, queryMissingSentence, topicParticle, useI18n, useMessages, type ErrorGuidance, type Key, type Lang, type Text, type TextParams } from './i18n';
export { classifyMetricInit, type MetricInit } from './registry/metric-init';
export { RETURN_CONTEXT_LABELS, PlatformLink, PlatformProvider, usePlatform, usePlatformOptional, useRecentVisits, useUnsavedGuard, type MenuPlatform, type AccessRequestSlot, type AccessRequestState, type AnalysisActionsProps, type AnalysisActionsSlot, type FeatureEntry, type FeatureSlot, type HomeTodoSlot, type LinkOptions, type LinkResolution, type NavCountsSlot, type NotificationsSlot, type PlannedSpace, type PlatformSlots, type Recent, type ReturnContextKey, type ReturnOrigin, type ScopeControlSlot, type SpaceNavSectionSlot, type ScopeState, type Toast, type ToastAction, type ToastOptions, type VocComposeContext, type VocComposeContextItem, type VocAvailability, type VocComposeProps, type VocComposeSlot } from './platform/platform';
export type { UnsavedGuardOptions } from './platform/navigationGuard';
export { useSavedViewSupport, diagnoseSavedView } from './saved-view';
export type { DiagnoseCode, DiagnoseContext, DiagnoseReason, Migration, SavedViewDiagnosis } from './saved-view';
export { useMenuAction, type MenuActionState } from './query/action';
export { useEndpointRefreshEpoch, useEntityAudit, useEntityQuery, useMenuFetch, useMenuQuery, usePlatformQuery, type AuditMore, type AuditMoreError, type AuditMoreLast, type AuditMoreStatus, type MenuFetch, type MenuQueryOptions, type MenuQueryState, type QueryState, type RequestState } from './query/query';
export {
  CONTEXT_LABELS, createRegistry, isBoardPath, PAGE_TYPE_LABELS, pathFor, routeParamNames, RegistryError,
  type AnyGroupId, type GroupDef, type MenuEntry, type MissingLinkTarget, type ModuleGroupDef, type ModuleMenuEntry, type PageProps, type PlatformGroupDef, type PlatformMenuEntry, type Registry, type RouteMatch,
} from './registry/registry';
export { mountModule, type MountOptions } from './registry/module';

export { useEquipmentAxes, UNDO_WINDOW_MS } from './platform/platform';
export { usePreferenceController, usePreferenceState } from './platform/preferenceContext';
export type { PreferenceController, PreferenceFailure, PreferenceState } from './platform/preferenceController';
export { labelledCondition } from './context/equipmentAxes';

export { useConditionPreset, useQueryContext, type ConditionPresetView } from './query/condition-preset';
export { useQueryDraft, type QueryDraft, type QueryMissing } from './query/query-draft';
export { useAxisOptions, useEquipmentSearch, useResolvedSelection } from './scope/selection-ports';
export type { PortContext, PortFailure, PortStatus, AxisOptionsParams, EquipmentSearchParams, PortPageResult, ResolvedSelectionParams, ResolvedSelectionResult } from './scope/selection-ports';


export { useSessionDraft } from './platform/useSessionDraft';
