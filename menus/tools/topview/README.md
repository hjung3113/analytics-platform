# @ap/menu-topview

The Top View viewer as an ordinary menu package (#1659; it replaced the EV host-module mount `@eqv/platform-adapter`, EV ADR-0012, ADR-0132). Group `topview` (space `tools`), menus `eqv:topview` (primary, `/tools/eqv-topview`, alias `/tools/topview`) and `eqv:focus` (`/tools/eqv-focus`, alias `/tools/topview/focus`), permission `eqv:view` (declared in the app's `PERMISSIONS`). Read-only.

## Exports

- `.` — `manifests` only (screens are lazy, so `@eqv/*` stays out of the import graph).
- `./model-topview` — `ModelTopView`, the read-only Top View body `main.tsx` plugs into the Hub model profile slot (#1656).
- `./mock-data` — synthetic `eqvMockEquipmentOptions` / `eqvMockContext` / `eqvMockEvents`, the three endpoint declarations and `@eqv/core`'s Sample Window import check; dev and tests only (`pnpm --filter @ap/menu-topview gen:mock-data` regenerates from `packages/eqv/fixtures/cluster-single`).
- `./styles.css` — the `--eqv-*` theme and the replay/views styles.

## Screens

Both screens read the equipment from the page key `equipment`, the time from the applied Global Context (`time: 'apply'`, 8-hour default), and load through the Kernel's `useMenuFetch` with the two declared replay endpoints only (`src/replay-load.ts`, one hook `src/use-replay-input.ts`). They verify every Mapping Version and Layout (`verifyBindingContext`, then `assertReplayInput`) and draw nothing partial. Behaviour is in [INTEGRATION.md](../../../docs/design/features/equipment-visualization/INTEGRATION.md) (화면 동작).

- Outcomes: `ok` renders; `empty` empty state; `forbidden` an own «접근 권한이 필요합니다» state; `error`/`timeout`/`too_large` a danger or warning state with the response's correlation id.
- Data Trust (EV#187): the reads' `trust` and `assessments` are one `DataTrustIndicator` line (`TrustLine`); `unknown` is never worded as clear. Binding-context checks stay as notices.
- No detail slot: the Component detail (Top View) and the evidence detail (Focus tab) are inline.
- Gap: `Panel` has no SDK equivalent and stays from `@eqv/ui`, with `ViewerZoomControls` and the theme.

## Check

`pnpm --filter @ap/menu-topview lint typecheck test`. `test/screens.test.tsx` mounts the screens under the real Kernel (`test/test-support.tsx`); `test/contract.test.ts` registers the manifests in `createRegistry` and checks the endpoint declarations.
