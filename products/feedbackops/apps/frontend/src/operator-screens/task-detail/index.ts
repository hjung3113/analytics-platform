// The platform bridge's entry for the operator Task detail (platform ADR-0071; #763 d). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The hook needs a `HostSeamProvider` (the bridge supplies it) and returns the parts the host places in its own drawer;
// the standalone `TaskDetailPanel` frames the same parts.
export { useTaskDetailParts } from '@/features/tasks/components/TaskDetailParts';
export type {
  TaskDetailParts,
  TaskDetailView,
  UseTaskDetailPartsArgs,
} from '@/features/tasks/components/TaskDetailParts';
