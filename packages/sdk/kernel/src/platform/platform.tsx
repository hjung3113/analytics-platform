// Public surface of the platform runtime; the code lives in the sibling files (ADR-0090, #713d). Names are listed on purpose so the export surface stays visible.
export { RETURN_CONTEXT_LABELS, UNDO_WINDOW_MS } from './types';
export type { FeedbackOpsEntry, FeedbackOpsSlot, HomeTodoSlot, HostPlatform, LinkOptions, LinkResolution, MenuPlatform, NavCountsSlot, NotificationsSlot, PlannedSpace, PlatformSlots, Recent, ReturnContextKey, ReturnOrigin, ScopeControlSlot, ScopeState, SpaceNavSectionSlot, Toast, ToastAction, ToastOptions, VocComposeContext, VocComposeContextItem, VocComposeProps, VocComposeSlot } from './types';
export type { OverlayState } from './contexts';
export { PlatformProvider } from './PlatformProvider';
export { PaneQueryDraftProvider, PaneScreenProvider, type PaneScreen } from './PaneProviders';
export { PlatformLink, useEquipmentAxes, useHostPlatform, useHostPlatformOptional, useOverlayState, usePlatform, usePlatformOptional, useQueryEngine, useRecentVisits, useSelectionPortCache, useToastList } from './hooks';
