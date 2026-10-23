/**
 * Host entry `@ap/kernel/host` (ADR-0075): the full platform value and the shell-only Providers and helpers.
 * Only the shell, the platform components and the app import it (lint gate); menus and host modules use `usePlatform()` from `@ap/kernel`.
 */
export { PaneScreenProvider, PaneQueryDraftProvider, useHostPlatform, useHostPlatformOptional, type HostPlatform, type PaneScreen } from './platform';
export { useAdapterRequest } from './query';
export { useModuleHost, type ModuleShellPorts } from './module-host';
export { BOARD_PATH } from './registry';
export { hasDotSegment } from './location';
export { paneHref, withPaneContext } from './paneContext';
export { useQueryHistory, type QueryHistory, type QueryHistoryRow } from './query-history';
