// The platform bridge's entry for the operator Task list and 내 Task (platform ADR-0071; #763 l). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// It also never reaches the Task detail tree: the host passes `renderDetail`. `TaskListScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone `TaskListRoute` composes it with the Task detail panel.
export {
  TaskListScreen,
  type TaskListScreenProps,
} from '@/features/tasks/routes/TaskListScreen';
