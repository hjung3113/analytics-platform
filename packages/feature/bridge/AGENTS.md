# @ap/feature-bridge

Runtime of the feature bridge (ADR-0071, ADR-0081). A consumer-side package, not an SDK.

## Rules

- Pulling the full feature-screens entry into permanently loaded code puts feature screens in the main bundle (ADR-0071 decision 1).
- Do not re-export screens. Bridge menus import the exact feature entry directly.
- Keep session singletons in this package only. No other package creates `featureQueryClient` or a session.
- Put slot and page tests in the menu package that uses the slot, not here: they need the menu's manifest, registry and fixtures, and `packages/*` cannot import menus.
- Keep one `managedSystem` read/write rule: `src/feature/list-scope.ts` (`useListScope`), shared by the sidebar picker and the page-owned `ListScope` (root export, lazy) that 내 Task draws in its filter area.
- Keep one UUID check: `UUID_PATTERN`, `isUuid` (`src/feature/uuid.ts`, root export). `VOC_ID`, `SURVEY_ID` and route-table `detailPath.pattern` derive from it.

## Sidebar slots (Kernel slot values; imported by app `main.tsx` only)

- Use module-level components for `scope-control` and `nav-counts`; creating one per call would remount the sidebar.

- Do not link an `/admin/…` path with no mapping or a fragment other than `#coverage`.
- `src/feature/RejectedPage.tsx` (root export): the shared rejection screen for a wrong address value (`값 지우기`). Every bridge-menu operations screen (all that use `FeatureScreenPage`, and `dashboard`) uses the same wording (ADR-0071 decision 9).
- Saved VOC views page: [docs/saved-views.md](docs/saved-views.md).
