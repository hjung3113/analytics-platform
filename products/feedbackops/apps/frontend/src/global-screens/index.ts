// The platform bridge's only entry into FeedbackOps (platform ADR-0071). Nothing
// reachable from here may import TanStack Router, `routes/**`, `lib/router/**`,
// `lib/layout/**`, `lib/auth/**`, `lib/api/auth.ts` or the `@/lib/api` barrel,
// or reach the network outside `lib/api/client.ts` (a test in the bridge menu walks this graph).
export { configureApiClient } from '@/lib/api/client';
export { InboxPanel } from '@/features/home/InboxPanel';
export type { HostLinkProps, HostSeam } from '@/lib/host/host-seam';
export { createFoQueryClient } from '@/lib/query/query-client';
export { FoScreenRoot } from './FoScreenRoot';
