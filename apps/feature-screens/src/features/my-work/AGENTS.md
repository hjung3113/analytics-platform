# My Work Feature Agent Guide

#597: paths below describe semantic screen intents. Runtime registration belongs to platform menus and `@ap/feature-bridge`; standalone routes and `*Route` compositions are retired. Adapters under `src/test` are test-only.

## Ownership

Not implemented. ADR-0038 excludes a My Work view from MVP. ADR-0040 keeps this directory as the future implementation location only.

This folder does not own a screen. Home's assigned-work panel is `features/home/`, not this directory.

## Route Boundary

- `/my-work` is not a registered route. Do not add one in MVP.
- Do not treat `/tasks?view=my` as a `/my-work` route; it is `TaskListRoute` filtered to Tasks assigned to the current actor.

## Rules

- Backend permissions are authoritative; Role Level labels are display hints only.
- Linked context must use approved summaries from backend responses.
- Keep queues compact, list-first, and action-oriented.
- Do not create per-Managed-System route trees; use Managed System filters and defaults.

## Key files

- `apps/feature-screens/src/test/screen-host/routes/_authed/home.tsx` — mounts Home, which currently owns assigned-work rows.
- `apps/feature-screens/src/test/screen-host/routes/_authed/tasks.tsx` — maps `view=my` to `TaskListRoute` and passes its view mode.
- `apps/feature-screens/src/test/screen-host/features/tasks/routes/TaskListRoute.tsx` — Task list; `view=my` filters to Tasks assigned to the current actor.
- `docs/adr/history/feedbackops/0038-entity-link-management-surface-out-of-mvp.md` — records the MVP My Work exclusion.
- `docs/adr/history/feedbackops/0040-ux-voc-home-navigation-deviations.md` — records the remaining Home assigned-work panel.

## Verification

- Verify `/tasks?view=my` filters to the current actor's assigned Tasks, preserves the view on selection, and shows its toolbar and empty state. No dedicated `/my-work` route is added.
