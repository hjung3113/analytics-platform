/**
 * Host entry `@ap/kernel/host` (ADR-0076): the full platform value and the shell-only Providers and helpers.
 * Only the shell, the platform components and the app import it (lint gate); menus use `usePlatform()` from `@ap/kernel`; host modules read only their injected `ModuleHost` (ADR-0053).
 */
export { PaneScreenProvider, PaneQueryDraftProvider, useHostPlatform, useHostPlatformOptional, useOverlayState, useToastList, useLeaveRequest, type HostPlatform, type OverlayState, type PaneScreen } from './platform/platform';
export { queryRecoveryEvidence } from './query/recovery-evidence';
export { textFor } from './i18n';
export { isChunkLoadFailure } from './error/chunkFailure';
export { isTransientReadError, useAdapterRequest, useKeptAnswers, type KeptAnswers } from './query/query';
export { type PageFocus, type PageNavigation } from './context/pageNavigation';
export { useArrivalFocus, type ArrivalFocusOptions } from './platform/useArrivalFocus';
export { useModuleHost, type ModuleShellPorts } from './registry/module-host';
export { BOARD_PATH, isImplementedMenu } from './registry/registry';
export { hasDotSegment } from './context/location';
export { drillHistorySummary } from './context/drillValueLabel';
export { buildShareLink, SHARE_LINK_MAX_LENGTH, type ShareLinkFailure, type ShareLinkKind, type ShareLinkResult } from './context/shareLink';
export { paneHref, withPaneContext } from './context/paneContext';
export { useQueryHistory, type QueryHistory, type QueryHistoryRow } from './query/query-history';
export { captureApplied } from './saved-view/capture';
export { ScreenContentLoading } from './saved-view/useSavedViews';
export { useSavedViews, type SaveInput, type SavedViews, type SelectOutcome, type Unsupported, type ViewState } from './saved-view';
export { type LeaveRequest } from './platform/navigationGuard';
export { type ScopeSelectorRequest } from './scope/scopeSelectorRequest';
export { useCustomGroupList, type CustomGroupList } from './saved-view/useCustomGroupList';
export { useSavedViewTableState } from './saved-view/useSavedViewTableState';
export { registerLentPanel } from './registry/LentPanel';
export { useAnalysisSelectionHoverTarget, useAnalysisSelectionSourceHighlighted } from './context/analysisSelection';
