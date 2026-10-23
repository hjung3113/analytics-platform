export { createBrowserLocation, createBasePathLocation, type PlatformLocation } from './location';
export { useDrill, type DrillInvalid, type DrillLevelState, type DrillState, type DrillTrailStep } from './drill';
export { contractErrorSentence, errorGuidance, I18nProvider, invalidValueSentence, topicParticle, useI18n, type ErrorGuidance, type Key, type Lang, type Text } from './i18n';
export { classifyMetricInit, type MetricInit } from './metric-init';
export { RETURN_CONTEXT_LABELS, PlatformLink, PlatformProvider, usePlatform, usePlatformOptional, type MenuPlatform, type FeedbackOpsEntry, type FeedbackOpsSlot, type HomeTodoSlot, type LinkOptions, type LinkResolution, type NotificationsSlot, type PlannedSpace, type PlatformSlots, type Recent, type ReturnContextKey, type ReturnOrigin, type ScopeState, type Toast, type VocComposeContext, type VocComposeContextItem, type VocComposeProps, type VocComposeSlot } from './platform';
export { useMenuAction, type MenuActionState } from './action';
export { useEntityQuery, useMenuFetch, useMenuQuery, usePlatformQuery, type MenuFetch, type QueryState, type RequestState } from './query';
export {
  CONTEXT_LABELS, createRegistry, isBoardPath, PAGE_TYPE_LABELS, pathFor, routeParamNames, RegistryError,
  type AnyGroupId, type GroupDef, type MenuEntry, type ModuleGroupDef, type ModuleMenuEntry, type PageProps, type PlatformGroupDef, type PlatformMenuEntry, type Registry, type RouteMatch,
} from './registry';
export { mountModule, type MountOptions } from './module';

export { useEquipmentAxes } from './platform';
export { labelledCondition } from './equipmentAxes';

export { useQueryDraft, type QueryDraft, type QueryMissing } from './query-draft';
export { useAxisOptions, useEquipmentSearch, useResolvedSelection } from './selection-ports';
export type { PortContext, PortFailure, PortStatus, AxisOptionsParams, EquipmentSearchParams, PortPageResult, ResolvedSelectionParams, ResolvedSelectionResult } from './selection-ports';

