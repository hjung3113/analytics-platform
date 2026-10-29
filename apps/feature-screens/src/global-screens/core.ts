// The platform bridge's only entry into feature (platform ADR-0071). Nothing
// reachable from here may import TanStack Router, `routes/**`, `lib/router/**`,
// `lib/layout/**`, `lib/auth/**`, `lib/api/auth.ts` or the `@/lib/api` barrel,
// or reach the network outside `lib/api/client.ts` (a test in the bridge menu walks this graph).
// Eagerly loaded bridge code (the notifications slot) imports this subset, so the screen barrel stays out of the main chunk.
export { configureApiClient } from '@/lib/api/client';
export { useUnreadNotificationCount } from '@/lib/cross-system/useUnreadNotificationCount';
export type { DetailParts } from '@/lib/host/detail-parts';
export type { HostLinkProps, HostNavigate, HostNotice, HostSeam } from '@/lib/host/host-seam';
export type { HostSearch } from '@/lib/host/search';
export { createFeatureQueryClient } from '@/lib/query/query-client';
export { FeatureScreenRoot } from './FeatureScreenRoot';
export { scopeSwitchClears } from '@/lib/host/scope-switch';
export type { ScopeSwitchInput } from '@/lib/host/scope-switch';
