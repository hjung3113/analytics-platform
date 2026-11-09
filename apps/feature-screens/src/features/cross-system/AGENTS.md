# cross-system

Cross-system commands/adapters shared by VOC/Findings/Tasks; must not import feature internals.

- Everything under this directory is neutral shared surface: it may import `@/lib/*`, `@ap/feature-shared`, `@ap/feature-ui`, `@ap/ui`, and its own files only.
- Feature directories (`@/features/voc`, `@/features/integration`, `@/features/admin`, `@/features/tasks`) must never be imported from here.
- Consumers in any feature may import from `@/features/cross-system/*` without creating a feature-to-feature edge.
- `request-task/TaskRequestDraftCard.tsx` is the neutral Request Task form and pending-source read presentation. Source-specific mutations remain in the owning source feature; this component imports no Finding, VOC, Cluster, Tasks or other feature.
- `progress-notes/` is the shared Finding/Task timeline; `ProgressNotesResource` is `{ kind: 'finding' | 'task'; id }` only. Contract: `docs/adr/history/feedbackops/0049-finding-task-progress-notes.md`.
- `create-finding/` is the shared VOC-to-Finding form and command hook.
- `mentions/` is the shared @mention picker, actor-id extraction and editor insertion.
