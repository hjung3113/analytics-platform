/**
 * Host entry `@ap/kernel/host` (ADR-0076): the full platform value and the shell-only Providers and helpers.
 * Only the shell, the platform components and the app import it (lint gate); menus use `usePlatform()` from `@ap/kernel`; host modules read only their injected `ModuleHost` (ADR-0053).
 */
export { PaneScreenProvider, PaneQueryDraftProvider, useHostPlatform, useHostPlatformOptional, useOverlayState, useToastList, type HostPlatform, type OverlayState, type PaneScreen } from './platform/platform';
export { useAdapterRequest } from './query/query';
export { type PageFocus, type PageNavigation } from './context/pageNavigation';
export { useModuleHost, type ModuleShellPorts } from './registry/module-host';
export { BOARD_PATH } from './registry/registry';
export { hasDotSegment } from './context/location';
export { paneHref, withPaneContext } from './context/paneContext';
export { useQueryHistory, type QueryHistory, type QueryHistoryRow } from './query/query-history';
export { captureApplied } from './saved-view/capture';
export { useSavedViews, type SaveInput, type SavedViews, type SelectOutcome, type Unsupported, type ViewState } from './saved-view';
