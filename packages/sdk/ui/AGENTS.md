# @ap/ui

UI Primitive layer (06 §13) and the design-system CSS. It knows no platform concept (Context, Scope, menu).

## Rules

- This package is the design-system source (platform/SDK owned, [ADR-0043](../../../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0046](../../../docs/adr/0046-design-system-source-moves-to-platform-whole-package.md)); the transfer record is [repository layout](../../../docs/integration/repository-layout.md). Feature `@ap/feature-ui` is a separate copy that stays on the feature side. Change the shape of transferred pieces here first.
- Import external libraries only. Never import `@ap/*` or the feature package set (`tooling/eslint/src/feature-packages.js`) from any package (boundary lint enforces it).
- Put no data fetching, permission decisions, routing or domain copy here. Such combinations belong in `@ap/components`.
- Shared token, font, radius and body values originate in [tokens.css](src/styles/tokens.css) and [semantic.css](src/styles/semantic.css); the consumption contract follows [FO ADR-0058](../../../docs/adr/history/feedbackops/0058-tailwind-v4-css-first-theme.md) (platform decision: [ADR-0011](../../../docs/adr/0011-design-direction-feedbackops-shell.md)). The design source of the platform extension is [DESIGN.md](../../../DESIGN.md#platform-extension-layer); this package owns the implementation. No hex values outside token files.
- Apps import Tailwind → `@ap/ui/styles.css`, in that order. The entry keeps the order tokens·semantic (`layer(base)`) → theme → compat → `platform-tokens.css` (`layer(base)`) → `@source`; never change the cascade order. Apps import fonts without a layer.
- Follow [DESIGN accessibility pairing](../../../DESIGN.md#accessibility-pairing-rules) for the roles and allowed surfaces of label, vivid accent and control boundary; new consumers check these pairings too.
- Expose status colors only through `StatusBadge`/`Tone` (success/warning/danger/neutral/info). A new Tone is a DESIGN change.
- Motion (tokens, overlay enter/exit, reduced-motion) comes from `theme.css`, `compat.css` and the primitives (FO ADR-0063, 06 §26); never override it in the platform. `useListMotion` and the motion constants are public for feature screens; platform screens do not use them yet (06 §24).
- In the platform, pass `closeLabel` when rendering `DialogContent`/`SheetContent`, and `listboxLabel`/`emptyText` for `Combobox`, from i18n.
- The command palette uses `DialogContent scrim="palette"`; other `DialogContent` keep the default modal scrim.
- To publish a shadcn component, export it from `src/index.ts` and update the list in `src/public-exports.test.ts` in the same change. `@source "../"` in `styles/index.css` scans this package's whole `src`.
- Transferred tests run under `vitest.config.ts` (`globals`, jest-dom setup `src/vitest.setup.ts`) on dependency versions that differ from the feature's (vitest 3, jsdom 26, lucide 1.x). Find the cause of a new failure before changing code.

## Structure

- `src/styles/` — design-system CSS source (ADR-0043, ADR-0046): `tokens.css`, `semantic.css` (shared values), `theme.css` (Tailwind theme mapping), `compat.css`; above them `platform-tokens.css` (platform extension values only) and `index.css` (extended Tailwind theme mapping, base, typography utilities such as `t-page-title`). Entry = `@ap/ui/styles.css`.
  - Consumers without platform extensions (feature screens) import `@ap/ui/styles/{tokens,semantic,theme,compat}.css` individually, plus `@ap/ui/styles/sources.css` for class scanning.
  - `styles/__tests__/` checks the consumption contract, token fidelity and status-color contrast.
- `src/theme/` — `theme-tokens.json` and `tokens.generated.ts` are generated from the CSS source. Never edit them; change the color token, then run `pnpm --filter @ap/ui gen:theme`. Classify each new color token in `scripts/theme-tokens.config.mjs` as published or excluded, with the reason.
- `src/components/shadcn/*` owns the 22 shadcn primitives. Public exports are explicit in `src/index.ts` and pinned by `src/public-exports.test.ts`.
  - Feature screens import `DialogContentBare`, alert-dialog, avatar, card, combobox, hover-card, sheet, textarea and toggle-group directly from `@ap/ui`. The same export group includes `KeyboardShortcut`, `SkeletonBlocks`, `SkeletonRows`, motion constants, `readMotionTiming`, `useListMotion`, `isToastTarget`, and the unwrapped `TabsListBase` / `TabsTriggerBase`.
  - `@ap/feature-ui` aliases only those tab bases as `TabsList` / `TabsTrigger`; the SDK names `TabsList` / `TabsTrigger` add the platform selection marker. New platform consumers follow 06 §24.
- `src/components/PlatformTabs.tsx` — exception: `TabsList`/`TabsTrigger` wrap the same package's shadcn tabs with the platform selection marker (ADR-0023 amendment). `Tabs`/`TabsContent` export from `shadcn/tabs`. `TabsList`'s optional `overflow="menu"` (+`moreLabel`) is a general piece moving overflowing tabs into a `더보기` menu; the default `scroll` is unchanged.
- `src/utils/` holds platform-owned helpers:
  - `isProductionEnv` (platform environment check).
  - `platform.ts`: `isMacPlatform`, `shortcutLabel` (OS check and the single shortcut notation `⌘K` / `Ctrl+K`).
  - `copyText.ts`: the one success rule for plain-text copy (06 §15). In a secure context success means `writeText` resolved and rejection fails without fallback; in an insecure context success only when `execCommand('copy')` returns true and a one-time `copy` listener actually filled the value. Used by `DetailPanelHeaderActions` and `useCopyLink` in `@ap/components`.
  - `storage.ts`: `readLocalStorage(key, decode, fallback)` / `writeLocalStorage(key, value | null)`, one try/catch for optional remembered values; falls back to `fallback` when storage or `decode` throws, a failed write returns false. Used by components and shell. Kernel cannot import `@ap/ui`, so it keeps its own internal copy.
- `src/{layout,panel,toolbar,forms,feedback}/` — layout shells (`PageShell`, `ListShell`, `WorkbenchShell`), `ShellHeader`, `ToolbarKicker`, detail panel parts (`DetailPanelHeader`, `DetailPanelSectionNav`, `FieldRow`, `Callout` …), list toolbar, forms (`DatePicker`, `FieldLabel`, `SearchInput`), feedback (`DirtyConfirmation`, `EmptyState`, `PreviewModal`, `UndoToast` with optional `actionLabel`). `badges/StatusBadgeFrame.tsx` is here because `DetailPanelHeader` uses it. Public exports are in `src/index.ts` under the feature screens' names.
  - Platform pages keep using `PlatformPage` and do not adopt these shells.
  - sonner's `Toaster` and `toast` stay public exports; the board uses the shell toast stack, so platform code does not use them, and `UndoToast` is likewise kept as public SDK.
  - `ListToolbar`: one 50px line when tabs and actions are present; two lines (50px each) with a right-aligned action line under the tab line when the toolbar's own width (not the viewport) is too small, keeping the tab block `basis-[22rem]`. It does not use `role="toolbar"`. The tab/title block (`data-list-toolbar-main`) is drawn only when `tabs` or `title` is given; with neither it is an actions-only line (or an empty `min-h-toolbar` bar without actions). It carries only the fixed marker `data-list-toolbar`, no height value (add one when something reads it). The bottom rule is a 1px overlay, not a border, so one line is exactly 50px (two lines 100px); no sticky element reads this value yet.
- Inclusion rule for the SDK: keep a part with no specific product's domain data, copy or permission baked in, even with no consumer (product-specific mapping comes in by prop and is owned by the product; [ADR-0052](../../../docs/adr/0052-rich-content-stays-in-the-sdk.md)). Parts tied to a feature domain belong to the feature (ADR-0050): `badges/` except `StatusBadgeFrame`, `entity/LinkedEntityTrail`, `components/{ChipPicker,ManagedSystemPicker,AnalyticsAreaPicker}`. The SDK has `data/ObjectRow`, `identity/{UserAvatar,UserChip}`, `indicators/{ProgressMeter,SeverityIndicator}`, `permissions/PermissionBlockedPanel`, `badges/StatusBadgeFrame` and `rich-content/`.
- Sidebar grammar: public `navRowVariants` (CVA-backed active/collapsed/inset/feature), `NavCurrentMarker` (`data-current-marker`) and `navDrillAffordance` preserve existing row class output. `Button variant="navigation"` and `SearchInput size="toolbar"`/`aria-label`/`clearLabel` are opt-in; default rendering stays unchanged. Keep PUBLIC_EXPORTS and the shell characterization test green.

## Rich content

- **Allowlist parity (security):** `rich-content/allowlist-local.ts` and `fixtures-local.ts` are copies of the sanitizer allowlist. The `allowlist-drift` and `fixtures-drift` tests pin the copies to inline fixtures. The [feature-source parity test](../../../apps/platform-web/src/rich-content-allowlist-parity.test.ts) compares the allowlist's full rules and the fixture corpus without importing the feature package set (`tooling/eslint/src/feature-packages.js`). Changing the allowlist here requires the same change in the feature. Record: [backlog](../../../.planning/backlog.md).
- **Extension boundary:** `RichEditor.tsx` is the lazy public wrapper. Editing plugins live in `RichEditorImpl.tsx` / `editor-extensions.ts`; `content-schema.ts` holds reader-safe schema/render definitions.
  - Drive all controls from the mirrored surface capabilities.
  - Inline images store only a UUID `id` and optional bounded `width`; resolve URLs through the optional editor/renderer prop.
  - Keep full attr-schema and fixture parity with the feature original and the server ([ADR-0127](../../../docs/adr/0127-sdk-rich-editor-extensions-and-inline-attachment-images.md), [VOC §5.7](../../../apps/feature-screens/docs/specs/voc.md#57-richeditor-per-surface-contract)).
  - Engine DOM styling belongs in `styles/compat.css`, which both CSS entry recipes include.

## Detail panel slot

`DetailPanelSlot.tsx` is the shell detail-slot registration primitive (Provider, host hook, registration hooks). It knows no domain or URL (06 §13, ADR-0013). URL and geometry belong to Kernel and shell, never this primitive.

- One slot, two registration forms ([ADR-0047](../../../docs/adr/0047-detail-panel-slot-single-registrant-model.md)):
  - Portal registration: `useDetailPanelSlot(options?)` takes the host and portals directly; throws without a provider. `onSuperseded` fires when the active pane's portal registrant is replaced by a new registrant.
  - Content registration: `layout/useDetailPanelContent(node)` is the shell's `detailPanel` prop; no-op without a provider; `undefined` clears. The Provider portals the content into the host, so it sees React context at the Provider's position.
  - Both share one registrant list: the last registrant wins, and on cleanup the previous one returns. `useDetailPanelContent(null)` is a closed registrant that only holds the slot.
  - Both receive `DetailPanelFullscreenContext` (the Provider owns expansion state and Escape). The host hook returns `{ ref, open, activation, expanded, toggle }`.
- `activation` increases by 1 only when the detail **newly becomes visible** (a new portal registrant, a new non-null content registrant, the same registrant going `null` → node). It does not increase on a re-render with a new node of an open registrant, a closed (`null`) registrant, `clearContent`, or disposal / return of the previous registrant. The shell uses it only to yield the docked VOC drawer to the detail (06 §13).
- `SurfacePauseScope paused` / `useSurfacePaused()` declare that the screen owning a registrant is hidden but still mounted (domain-neutral, [ADR-0088](../../../docs/adr/0088-surface-pause-detail-slot.md)):
  - A paused registrant keeps its place but has `open` false, `activation` unchanged (also for content updates while paused) and no `onSuperseded` call.
  - On resume it becomes visible again (and `activation` increases) only if it is still the winner. Registering while paused places it at the end of the list.
  - A content registrant's content is not drawn while paused; a portal registrant's subtree stays mounted in the hidden host.
- `TransientOverlayScope` closes the transient portals of Dialog, AlertDialog, Popover, Sheet, DropdownMenu and Select by scope. A hidden scope keeps its children; `detached` separates it from the parent pane's visibility.

### Detail expansion (ADR-0126)

- `DetailPanelSlotProvider` is the single expansion owner: optional `expanded`/`onExpandedChange` support host control; omission keeps local state.
- Open replacements inherit expansion. Close, clear and surface pause end it; an initially empty controlled slot does not clear restored state.
- `useDetailPanelSlot({ localExpansion: true })` selects in-memory presentation for an owning surface such as a board pane. Both registration forms receive the same fullscreen context.
- `DetailPanelFullscreenToggle` uses the shared ghost/icon-sm Button and Tooltip, with optional translated `expandLabel`/`collapseLabel` (compatible Korean defaults).
- `DetailPanelReadingColumn` centres at 48rem; optional `asChild` applies width without adding a wrapper or changing footer flex sizing. Keep the subtree mounted.
- Shared `useDetailPanelEscape(onClose)`: a popup gets the first claim, then it collapses, then it calls the existing close path; the window listener must respect that claim. Escape focus return suppresses a newly opened tooltip so the next Escape can close.

## Verification

Narrow with `pnpm --filter @ap/ui test`, then run the root checks (root `AGENTS.md`). Check token and style changes on screen with `pnpm dev`.

- Changing this package makes root `pnpm typecheck|test` check the feature packages too. When feature UI part behavior changes, narrow with `pnpm --filter @ap/feature-ui exec vitest run`; the package lint is `pnpm --filter @ap/feature-ui lint` (ESLint). Integrated CI is `ci.yml`. Biome checks of the operations tools are a separate scope.
- Keep the `@formkit/auto-animate@0.10.0` patch while `useListMotion` exists (`patches/@formkit__auto-animate@0.10.0.patch`, `patchedDependencies` in root `pnpm-workspace.yaml`). Without it two `useListMotion` tests fail (polling timer after destroy). After changing the patch, check the `pnpm install` result and workspace state.
