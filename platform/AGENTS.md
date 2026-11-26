# platform/ — built-in feature consumers

One-level `platform/<feature>/` packages assemble the built-in home, activity, notice, administration and platform feature (VOC, survey, task, finding) menus. They are Consumer-tier packages, never SDK packages ([ADR-0097](../docs/adr/0097-platform-features-and-role-based-names.md); placement authority: [platform-packages §3](../docs/integration/platform-packages.md)). Domain-system consumers stay at `menus/<system>/<group>/` ([rules](../menus/AGENTS.md)).

## Placement and wiring

- Read each feature's space only from `GROUPS`. Directory placement does not determine space: null-space and named-space features coexist here. Check group ownership and duplicates across both consumer roots.
- Declare only `manifests` here. Reusable screen/bridge runtime lives in `packages/feature/screens`, `packages/feature/bridge` and `packages/feature/shared`; consume their permitted public entry points. The `featureBridgeMenuPreset` ESLint preset enforces the exact bridge exceptions.
- App wiring uses the shared marker regions in `menus.ts`, `style.css`, app `package.json` and `dev/mock-assembly.tsx`. Match actual imports with their spreads; never derive bindings from package names (`@ap/menu-dashboard` uses `dashboard`, `@ap/menu-feature-admin` uses `featureAdmin`).
- Add the `GROUPS` row before `pnpm gen:menu <group> --platform …`. Null-space groups use this root automatically. Keep an explicit `/platform/<feature>/` CODEOWNERS entry. The package rules in [menus/AGENTS.md](../menus/AGENTS.md) (public exports, mock boundaries, versions, CHANGELOG) also apply here.

## Runtime identities and URLs (ADR-0097/0100/0110)

- Menu IDs are the former `fo-*` IDs without the prefix, except `survey-management` and `permission-request-review` (the personal menus keep `surveys` and `permission-requests`).
- Canonical URLs: 업무 흐름 menus live in the `flow` space at `/flow/<menu id>`. No old `/feedbackops/…` paths or aliases exist.

## Common rules for bridge menus

Every operator-screen menu below follows these unless its entry says otherwise.

- Lift the feature screen through the bridge entry `@ap/feature-screens/operator-screens/<name>`; permission is `features:access`; page keys equal the route tables in `@ap/feature-bridge` plus `returnTo` (carry-only, hand-over information; 06 §22).
- Validate address values before mount with the feature's search-schema check; reject and preserve a wrong value with a `값 지우기` warning and make no feature request.
- Under the mock adapter the screen shows `실서버 필요`.
- Pass `renderDetail` as always `undefined` when the page draws the detail itself in the shell detail slot (so the screen's `ListShell` never draws detail outside `FeatureBridge`); when the screen supplies detail parts through `renderDetail`, draw them in place with `FeatureDetailDrawer` and route closing through the screen (`requestClose`).
- Reason for the bridge shape: ADR-0081.

## Packages

Two pairs of names look alike but are different features (folder names stay as they are):

- `voc` = 업무 흐름 `VOC 처리` (operator inbox, triage, clusters); `notice-voc` = the `소통` notices and FAQ places (the user-side VOC and surveys of `소통` are declared by `my-activity`).
- `admin` = 운영 콘솔 `플랫폼 관리` (access directory, audit, usage, registry catalog); `feature-admin` = 업무 흐름 `설정` (managed systems, analytics areas, flow policy).

Package rules beyond the common ones (screen names, entries and page keys are in each package's `src/`):

- `@ap/menu-home`: `./launcher` is private app configuration, imported only by `apps/platform-web/src/menus.ts`. Home `내 할 일` arrives only through the Kernel slot `homeTodo`; home imports no feature package and no other menu.
- `@ap/menu-notice-voc`: notices use only the Kernel adapter ports `listNotices`, `saveNotice`, `deleteNotice` (ADR-0098); create/edit/delete show only with `console:access`, and the server decides.
- `@ap/menu-my-activity`: imports the `@ap/feature-bridge` root and the exact feature entries — the package-boundary rule 8 exception every feature consumer here follows. The VOC reading pane asks the public detail whether the caller owns the VOC first and never calls reporter or operator paths for someone else's VOC. The home `내 할 일` slot renders only when the session is `ready`.
- `@ap/menu-voc`: Clusters reads `managedSystem=all` as no scope and never stores it.
- `@ap/menu-surveys`: never alias the reporter `설문` paths `/surveys` and `/surveys/:id/respond`.
- `@ap/menu-feature-admin`: never alias `/admin/*` (owned by 플랫폼 관리). The screen's `PermissionGate` is a display hint; the backend decides.
- `@ap/menu-improvement-items`: the screen's `can()` is a hint and the server action decides. Use the menu's own query/action transport (`endpoints.ts`), not the feature REST bridge.
