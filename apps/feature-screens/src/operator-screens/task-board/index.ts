// The platform bridge's entry for the operator Task board (platform ADR-0071; #763 b). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// It also never reaches the Task detail tree: the host passes `renderDetail`. `TaskBoardScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone `TaskBoardRoute` composes it with the Task detail panel.
export {
  TaskBoardScreen,
  type TaskBoardScreenProps,
} from '@/features/tasks/routes/TaskBoardScreen';
