export { createBrowserLocation, createBasePathLocation, type PlatformLocation } from './context/location';
export { useDrill, type DrillInvalid, type DrillLevelState, type DrillState, type DrillTrailStep } from './context/drill';
export { ANALYSIS_SELECTION_MAX_VALUES, analysisSelectionParam, parseAnalysisSelection, useAnalysisSelectionChips, useAnalysisSelectionInputs, useAnalysisSelectionOutput, type AnalysisSelectionChip, type AnalysisSelectionOutputOptions, type AppliedAnalysisSelection, type ChipSelectionEditor, type ReplaceChipSelection } from './context/analysisSelection';
export type { AnalysisSelectionAvailability, AnalysisSelectionCompare } from './context/analysisSelectionAvailability';
export type { AddressTransition } from './platform/contexts';
export { contractErrorSentence, errorGuidance, formatText, I18nProvider, invalidValueSentence, objectParticle, queryMissingSentence, topicParticle, useI18n, useMessages, type ErrorGuidance, type Key, type Lang, type Text, type TextParams } from './i18n';
export { formatFeedTime, formatListTime, formatSummaryTime, type TimeNotationOptions } from './notation/time';
export { classifyMetricInit, type MetricInit } from './registry/metric-init';
export type { CarryProof } from './platform/return-origin';
export { RETURN_CONTEXT_LABELS, PlatformLink, PlatformProvider, usePlatform, usePlatformOptional, useRecentVisits, useUnsavedGuard, type MenuPlatform, type AccessRequestSlot, type AccessRequestState, type AnalysisActionsProps, type AnalysisActionsSlot, type DroppedSelection, type FeatureEntry, type FeatureSlot, type HomeTodoSlot, type ObjectLink, type ObjectLinkOptions, type ObjectSelectionLink, type ObjectSelectionLinkOptions, type LinkOptions, type LinkResolution, type SelectionLinkResolution, type NavCountsSlot, type NotificationsSlot, type PlannedSpace, type PlatformSlots, type Recent, type ReturnContextKey, type ReturnOrigin, type ScopeControlSlot, type SpaceNavSectionSlot, type ScopeState, type Toast, type ToastAction, type ToastOptions, type UndeclaredMenu, type UndeclaredMenusSlot, type VocComposeContext, type VocComposeContextItem, type VocAvailability, type VocComposeProps, type VocComposeSlot } from './platform/platform';
export type { UnsavedGuardOptions } from './platform/navigationGuard';
export { useSavedViewSupport, diagnoseSavedView } from './saved-view';
export { useSavedViewPanels, type SavedViewPanelsOutcome } from './saved-view/useSavedViewPanels';
export { customGroupItemId, customGroupMembers, customGroupReadState, expandCustomGroups } from './saved-view/expand-custom-groups';
export type { ExpandCustomGroupsInput, ExpandCustomGroupsResult } from './saved-view/expand-custom-groups';
export type { DiagnoseCode, DiagnoseContext, DiagnoseReason, Migration, SavedViewDiagnosis } from './saved-view';
export { useMenuAction, type MenuActionState } from './query/action';
export { useEndpointRefreshEpoch, useEntityAudit, useEntityQuery, useMenuFetch, useMenuQuery, usePlatformQuery, type AuditMore, type AuditMoreError, type AuditMoreLast, type AuditMoreStatus, type MenuFetch, type MenuQueryOptions, type MenuQueryState, type QueryState, type QueryStatus, type RequestState } from './query/query';
export {
  CONTEXT_LABELS, CUSTOM_GROUP_LABELS, createRegistry, isBoardPath, PAGE_TYPE_LABELS, pathFor, routeParamNames, RegistryError,
  type AnyGroupId, type GroupDef, type MenuEntry, type MissingLinkTarget, type ModuleGroupDef, type ModuleMenuEntry, type PageProps, type PlatformGroupDef, type MenuSuccessor, type PlatformMenuEntry, type Registry, type RetiredMenu, type RouteMatch, withPagePreset,
} from './registry/registry';
export { mountModule, type MountOptions } from './registry/module';

export { useEquipmentAxes, UNDO_WINDOW_MS } from './platform/platform';
export { usePreferenceController, usePreferenceState } from './platform/preferenceContext';
export type { PreferenceController, PreferenceFailure, PreferenceState } from './platform/preferenceController';
export { labelledCondition } from './context/equipmentAxes';

export { useConditionPreset, useQueryContext, type ConditionPresetView } from './query/condition-preset';
export { useQueryDraft, type QueryDraft, type QueryMissing } from './query/query-draft';
export { useAxisOptions, useEquipmentFacts, useEquipmentSearch, useResolvedSelection } from './scope/selection-ports';
export type { PortContext, PortFailure, PortStatus, AxisOptionsParams, EquipmentSearchParams, PortPageResult, ResolvedSelectionParams, ResolvedSelectionResult } from './scope/selection-ports';


export { useSessionDraft } from './platform/useSessionDraft';

export { PAGE_CONDITION_EMPTY, PAGE_CONDITION_LIMITS, PageConditionError, decodePageConditions, encodePageConditions, summarizePageConditions, derivePageConditionExtension } from './query/page-conditions';
export type { PageConditionMenu, PageConditionIssueReason, PageConditionSummaryItem, PageConditionSummaryIssue, PageConditionRange, PageConditionValue, PageConditionValues, PageConditionIssue, DecodedPageConditions, PageConditionExtension, PageConditionSummaryInput } from './query/page-conditions';

export { disabledReason, projectQueryInputs, projectDisplayInputs, panelQueryIdentity } from './registry/panel-inputs';
export type { RegisteredPanel } from './registry/panels';
export { LentPanel, useLentPanel, type LentPanelProps, type LentPanelRegistration } from './registry/LentPanel';
export type { LentPanelBindingValues, LentPanelReason, LentPanelVerdict, RegisteredLentPanel } from './registry/lent-panels';
