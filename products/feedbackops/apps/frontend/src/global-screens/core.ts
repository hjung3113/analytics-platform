// The platform bridge's only entry into FeedbackOps (platform ADR-0071). Nothing
// reachable from here may import TanStack Router, `routes/**`, `lib/router/**`,
// `lib/layout/**`, `lib/auth/**`, `lib/api/auth.ts` or the `@/lib/api` barrel,
// or reach the network outside `lib/api/client.ts` (a test in the bridge menu walks this graph).
// Eagerly loaded bridge code (the notifications slot) imports this subset, so the screen barrel stays out of the main chunk.
export { configureApiClient } from '@/lib/api/client';
export { InboxPanel } from '@/features/home/InboxPanel';
export { useUnreadNotificationCount } from '@/lib/cross-system/useUnreadNotificationCount';
export type { DetailParts } from '@/lib/host/detail-parts';
export type { HostLinkProps, HostNavigate, HostNotice, HostSeam } from '@/lib/host/host-seam';
export type { HostSearch } from '@/lib/host/search';
export { createFoQueryClient } from '@/lib/query/query-client';
export { FoScreenRoot } from './FoScreenRoot';
