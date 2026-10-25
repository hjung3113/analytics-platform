// The platform bridge's entry for the operator Task Requests queue (platform ADR-0071; #763 q2). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The host frames the panel parts it gets through `renderDetail`. `TaskRequestsScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone `TaskRequestsRoute` composes it under the default host.
export {
  TaskRequestsScreen,
  type TaskRequestsScreenProps,
} from '@/features/tasks/routes/TaskRequestsScreen';
export type { TaskRequestPanelParts } from '@/features/tasks/routes/task-requests/TaskRequestPanelParts';
