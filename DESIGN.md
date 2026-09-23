---
version: alpha
name: analytics-platform-design
description: >
  Light-canvas enterprise application shell for a data-heavy analytics platform
  (equipment logs, processing pipelines, validation, alerts). Not a marketing
  system — every token here targets in-product density: a fixed dark-icon
  sidebar, a thin top bar, KPI stat tiles, a pipeline stepper, donut/gauge
  widgets, an alerts list, and dense data tables with status badges. Extracted
  from `.agents/references/design-md/` (linear.app, clickhouse, supabase,
  mongodb) — principles only, no brand copied wholesale. See "Sources" below
  for what was taken from where and what was rejected.

colors:
  # Brand / accent — single chromatic accent, scarce, per Linear + ClickHouse discipline
  primary: "#2563eb"
  primary-hover: "#1d4ed8"
  primary-soft: "#eff6ff"
  on-primary: "#ffffff"

  # Ink ladder — near-black, never pure black (Supabase discipline)
  ink: "#111827"
  ink-secondary: "#374151"
  ink-muted: "#6b7280"
  ink-faint: "#9ca3af"

  # Surface ladder — canvas → card → sunken, hairline borders carry hierarchy (Linear/ClickHouse: no drop-shadow stacking)
  canvas: "#f7f8fa"
  surface-card: "#ffffff"
  surface-sunken: "#f1f3f6"
  surface-dark-nav: "#0f1526"
  surface-dark-nav-hover: "#1a2236"
  hairline: "#e5e7eb"
  hairline-strong: "#d1d5db"

  # Semantic — status/data-quality vocabulary, mirrors docs/06 §19 confirmed/unconfirmed + quality states
  success: "#16a34a"
  success-soft: "#dcfce7"
  warning: "#d97706"
  warning-soft: "#fef3c7"
  danger: "#dc2626"
  danger-soft: "#fee2e2"
  info: "#2563eb"
  info-soft: "#eff6ff"
  neutral: "#6b7280"
  neutral-soft: "#f3f4f6"

  # Category accents — for chart series / tag differentiation only, never for primary actions (MongoDB course-tag discipline)
  accent-purple: "#7c3aed"
  accent-teal: "#0d9488"
  accent-amber: "#d97706"

  # Reference-series identity, separate from success/failure semantics; solid approximations.
  chart-blue: "#3b9cff"
  chart-teal: "#00a3b5"
  chart-green: "#00bc8b"
  chart-purple: "#a174f5"
  chart-remainder: "#cbd2e3"
  chart-grid: "#edf1f7"
  chart-queue-running: "#007bff"
  chart-queue-pending: "#70b7ff"
  icon-blue-soft: "#e3efff"
  icon-teal-soft: "#dcf8ef"
  surface-dark-nav-subtle: "#131d2f"
  surface-dark-nav-raised: "#243149"
  nav-divider: "#29354a"
  nav-text: "#c3d1e4"
  nav-focus: "#93c5fd"
  success-text: "#166534"
  warning-text: "#92400e"
  danger-text: "#991b1b"
  control-border: "#7b8799"
  focus-visible: "#2563eb"

  focus-ring: "rgba(37,99,235,0.45)"

typography:
  page-title:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.3px
  section-title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: 0
  card-title:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0
  stat-value:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.5px
  stat-value-secondary:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.3px
  stat-delta:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0
  table-header:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.3px
    textTransform: uppercase
  table-cell:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  nav-item:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  nav-group-label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.5px
    textTransform: uppercase
  badge:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.2px
  numeric:
    fontVariantNumeric: "tabular-nums lining-nums"
  chart-label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  compact-table-header:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.3
    textTransform: none

  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 4px
  md: 6px
  lg: 8px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 40px
  huge: 48px

# Additive reference recipe; measurements are approximate CSS px at 1672 × 941.
# sidebarWidth/topBarHeight are now the canonical shell defaults (see
# sidebar-shell/top-bar below) — resolved, see Open Decisions.
layout:
  reference-dashboard:
    viewport: 1672px 941px
    contentPadding: 20px
    sectionGap: 12px
    kpiColumns: 5
    kpiGap: 10px
    kpiMinHeight: 100px
    pipelineOperationsColumns: "1.8fr 1fr"
    lifecycleMetricsColumns: "0.9fr 1fr"
    metricsColumns: 4
    panelPadding: 12px 16px
    tableRowMinHeight: 25px
    tableHeaderMinHeight: 26px
  dashboard:
    sectionGap: 16px
    contentPadding: 20px
    focalRegion: pipeline-status
    wideBreakpoint: 1440px
    compactBreakpoint: 1024px
interaction:
  hover:
    backgroundColor: "{colors.surface-sunken}"
  pressed:
    backgroundColor: "{colors.primary-soft}"
  selected:
    backgroundColor: "{colors.primary-soft}"
    indicatorColor: "{colors.primary}"
  focus-visible:
    outline: "2px solid {colors.focus-visible}"
    outlineOffset: 2px
  disabled:
    textColor: "{colors.ink-muted}"
    backgroundColor: "{colors.surface-sunken}"
  loading:
    skeletonColor: "{colors.surface-sunken}"
    minBlockHeight: 96px
  empty:
    textColor: "{colors.ink-secondary}"
    padding: 16px
  error:
    textColor: "{colors.danger-text}"
    backgroundColor: "{colors.danger-soft}"
motion:
  state-transition: 120ms
  live-pulse-duration: 2000ms
  live-pulse-opacity: "1 → 0.65 → 1"
  reduced-motion-duration: 0ms

components:
  sidebar-shell:
    backgroundColor: "{colors.surface-dark-nav}"
    textColor: "{colors.ink-faint}"
    width: 270px
  sidebar-group-label:
    textColor: "{colors.ink-faint}"
    typography: "{typography.nav-group-label}"
    padding: 8px 16px 4px
  sidebar-item:
    textColor: "rgba(255,255,255,0.72)"
    typography: "{typography.nav-item}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  sidebar-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.nav-item}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  top-bar:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    height: 54px
    border: "0 0 1px {colors.hairline} solid"
  scope-pill:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  stat-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 16px
    border: "1px solid {colors.hairline}"
  pipeline-step-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 16px
    border: "1px solid {colors.hairline}"
  panel-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 20px
    border: "1px solid {colors.hairline}"
  progress-track:
    backgroundColor: "{colors.surface-sunken}"
    rounded: "{rounded.pill}"
    height: 6px
  progress-fill-success:
    backgroundColor: "{colors.success}"
    rounded: "{rounded.pill}"
  progress-fill-danger:
    backgroundColor: "{colors.danger}"
    rounded: "{rounded.pill}"
  donut-metric:
    textColor: "{colors.ink}"
    typography: "{typography.stat-value-secondary}"
  alert-row-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 10px 12px
  alert-row-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 10px 12px
  status-badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  status-badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  status-badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  status-badge-neutral:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.neutral}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  live-indicator:
    textColor: "{colors.success}"
    typography: "{typography.badge}"
  data-table:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.hairline}"
  data-table-header-row:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.table-header}"
  data-table-row:
    textColor: "{colors.ink}"
    typography: "{typography.table-cell}"
    border: "0 0 1px {colors.hairline} solid"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px 14px
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px 14px
    border: "1px solid {colors.hairline-strong}"
  search-input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  icon-chip:
    size: 40px
    iconSize: 24px
    strokeWidth: 1.75px
    rounded: "{rounded.md}"
    backgroundColor: "{colors.icon-blue-soft}"
    textColor: "{colors.primary}"
  icon-chip-pipeline:
    size: 32px
    iconSize: 20px
    rounded: "{rounded.sm}"
  icon-chip-validation:
    backgroundColor: "{colors.icon-teal-soft}"
    textColor: "{colors.chart-green}"
  sidebar-group-icon:
    size: 16px
    chipBackground: transparent
    textColor: "{colors.nav-text}"
  sidebar-sub-item:
    backgroundColor: "{colors.surface-dark-nav-subtle}"
    textColor: "{colors.nav-text}"
    padding: 6px 12px 6px 32px
    minHeight: 28px
  sidebar-scroll-region:
    overflowY: auto
    minHeight: 0px
    dividerColor: "{colors.nav-divider}"
    scrollbarThumbColor: "{colors.surface-dark-nav-raised}"
    scrollPadding: 8px
  date-range-segments:
    labels: [7D, 30D, 90D, Custom]
    height: 36px
    gap: 4px
    padding: 0px 12px
    rounded: "{rounded.sm}"
    backgroundColor: "{colors.surface-card}"
    selectedBackgroundColor: "{colors.primary}"
    selectedTextColor: "{colors.on-primary}"
    border: "1px solid {colors.hairline}"
  date-range-trigger:
    height: 36px
    minWidth: 204px
    iconSize: 16px
    rounded: "{rounded.sm}"
    border: "1px solid {colors.hairline}"
  page-header:
    gap: 12px
    titleDescriptionGap: 4px
    marginBottom: 16px
    titleTypography: "{typography.page-title}"
    descriptionTypography: "{typography.body-sm}"
  breadcrumb:
    typography: "{typography.body-sm}"
    textColor: "{colors.ink-secondary}"
    gap: 8px
  profile-trigger:
    avatarSize: 32px
    gap: 8px
    minHeight: 36px
  dropdown-menu:
    minWidth: 192px
    padding: 4px
    itemMinHeight: 32px
    backgroundColor: "{colors.surface-card}"
    border: "1px solid {colors.hairline-strong}"
    rounded: "{rounded.md}"
    zIndex: 40
  top-bar-search:
    maxWidth: 500px
    height: 32px
    iconSize: 16px
  icon-button:
    size: 32px
    iconSize: 16px
    rounded: "{rounded.xs}"
  notification-count:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.badge}"
    minSize: 16px
    rounded: "{rounded.pill}"
  table-toolbar:
    minHeight: 44px
    gap: 8px
    padding: 12px
    searchWidth: 176px
    filterMinWidth: 112px
    controlHeight: 32px
  table-selection:
    columnWidth: 36px
    checkboxSize: 14px
    targetMinSize: 24px
    borderColor: "{colors.control-border}"
    checkedColor: "{colors.primary}"
  table-row-actions:
    columnWidth: 128px
    gap: 8px
    viewMinWidth: 72px
    menuTargetSize: 24px
    iconSize: 14px
  table-density:
    cellPadding: 4px 12px
    rowMinHeight: 32px
    headerMinHeight: 32px
    numericTypography: "{typography.numeric}"
  table-bulk-bar:
    minHeight: 40px
    padding: 8px 12px
    backgroundColor: "{colors.primary-soft}"
  pipeline-stage-progress:
    height: 6px
    fillColor: "{colors.chart-queue-running}"
    trackColor: "{colors.chart-remainder}"
    labelGap: 8px
    typography: "{typography.chart-label}"
  pipeline-connector:
    width: 24px
    iconSize: 20px
    textColor: "{colors.primary}"
  donut-chart:
    diameter: 88px
    ringWidth: 12px
    startAngle: -90deg
    strokeLinecap: butt
    remainderColor: "{colors.chart-remainder}"
    centerTypography: "{typography.body-sm}"
    centerFontWeight: 600
    legendGap: 8px
    seriesColors:
      coverage: "{colors.chart-blue}"
      traceability: "{colors.chart-teal}"
      consistency: "{colors.chart-green}"
    inconsistentColor: "{colors.accent-amber}"
  bar-chart:
    plotMinHeight: 88px
    seriesColor: "{colors.chart-purple}"
    gridColor: "{colors.chart-grid}"
    labelTypography: "{typography.chart-label}"
    barWidth: 14px
    barGap: 8px
    yAxisMin: 0
    unit: defects
  scheduler-panel:
    padding: 12px
    gap: 8px
    summaryColumns: 2
    alertRowMinHeight: 28px
  queue-status:
    typography: "{typography.numeric}"
    trackHeight: 12px
    segmentGap: 2px
    runningColor: "{colors.chart-queue-running}"
    pendingColor: "{colors.chart-queue-pending}"
    remainderColor: "{colors.chart-remainder}"
  lifecycle-cell:
    markerSize: 14px
    markerBorder: "1px solid {colors.control-border}"
    completeColor: "{colors.success-text}"
    completeBackgroundColor: "{colors.icon-teal-soft}"
    pendingColor: "{colors.ink-muted}"
    textAlign: center
  status-badge-accessible:
    successTextColor: "{colors.success-text}"
    warningTextColor: "{colors.warning-text}"
    dangerTextColor: "{colors.danger-text}"
  live-dot:
    size: 8px
    rounded: "{rounded.pill}"
    backgroundColor: "{colors.success}"
    animation: none

---

## Overview

This project is a platform, not a screen collection (`AGENTS.md` — 목적). This
`DESIGN.md` is the **Design System** stage output of
`.agents/skills/analysis-platform-wireframe/SKILL.md` step 5, produced because
implementation was explicitly requested, not because a screen needed
decoration. It is scoped to the App Shell + data-dashboard vocabulary that
recurs across menus (`docs/06_platform_ui_contract.md`, `docs/07_app_shell_wireframe.md`),
not to any single screen.

The reference screenshot this system was built against is a light-canvas
industrial log analytics dashboard: a fixed dark sidebar with grouped icon
navigation, a thin top bar (scope switcher, search, notifications, profile),
a KPI stat-tile row, a horizontal pipeline stepper with per-stage progress
bars, a donut/gauge metrics panel, an alerts list, a lifecycle/status table,
and a dense equipment-status data table with pill status badges. Every
component below exists to serve that vocabulary — not a marketing site.

**None of the source `DESIGN.md` references in `.agents/references/design-md/`
document an in-product application UI** — they all capture marketing/landing
pages for their respective brands. Nothing here was copied structurally
(no hero bands, no pricing tiers, no CTA banners). What was extracted is
listed in **Sources** below: narrow, load-bearing *principles* about how each
brand disciplines color, radius, and elevation, re-applied to this platform's
own component set.

## Sources (principle extraction, not brand copy)

| Source | Principle taken | Why it applies here | Rejected |
|---|---|---|---|
| `linear.app` | Single chromatic accent (`{colors.primary}`) used only for the active-nav state, primary buttons, and focus rings; hierarchy otherwise carried by a neutral surface ladder + hairline borders, never by adding more color. | The reference screenshot uses blue this same way — nav active state, primary actions — while KPI/status color is semantic, not brand. | Near-black canvas, negative-tracked 80px display type, product-screenshot-led marketing layout — none of that is an application shell. |
| `clickhouse` | Flat elevation: no drop-shadow stacking, hierarchy from surface-color contrast + 1px hairlines only; small, disciplined radius scale (buttons smaller-radius than cards). | Dense dashboards read as noisy fast if every card has a shadow; the platform's tables/cards should feel like an "engineering-grade dim panel," not a marketing tile. | The yellow-as-brand-voltage idea itself — this platform's brand color is blue, and no single accent should be as loud as ClickHouse's yellow inside a data-dense screen. |
| `supabase` | Near-black ink (`#171717`-class, never pure `#000`), square-ish button radius (6–8px, not pill), calibrated grey ladder for text hierarchy instead of color. | Matches the reference screenshot's technical, non-playful tone — buttons and inputs in the screenshot are subtly rounded rectangles, not pills. | Pure-white-canvas-only doctrine — this platform's canvas is a very light warm-gray (`{colors.canvas}` `#f7f8fa`), matching the screenshot, not pure white. |
| `mongodb` | Reserve category-accent colors (purple/teal/amber) strictly for tag/series differentiation, never for primary actions or large surface fills. | The reference dashboard uses colored icons (blue equipment glyph, teal/purple accents in small icon chips) purely as category markers, never as a second CTA color. | Pill-shaped buttons everywhere, dark-teal marketing hero bands, 3-tier pricing pattern — not applicable to an app shell. |
| Supplied Industrial Log Analytics screenshot (`/Users/hyojung/.claude/uploads/00521d63-05d6-4f35-b771-a2b8bc1da6b7/0f3b051c-image.png`, 1672 × 941) | Five KPI tiles; five connected stages; queue/window + alerts; lifecycle table; three rings + one bar plot; equipment toolbar/checkboxes/actions. | Primary visual evidence for the additive reference recipe, not evidence of product behavior or exact source CSS. | Brand/logo/person data, screenshot nav IA, invented fourth donut, decorative chart gradients, inferred live animation. |
| `interface-design` + local `ui-ux-pro-max` focus-state/focus-not-obscured guidance | Explicit focal region, numeric alignment, tokenized density, visible keyboard focus. | Completes implementer-facing states without changing the reference's industrial direction. | Generic same-color sidebar/mobile-first defaults; screenshot and platform desktop-first contract take precedence. |
| `docs/06_platform_ui_contract.md` §§6, 9, 11, 18–19, 23–26 | Context/time ownership, canonical nav, evidence-backed states, accessibility, responsive boundaries. | Higher authority than visual references. | Treating screenshot data/status labels as backend contracts or menu-registration decisions. |

`posthog` and the `sentri` (Sentry-styled) reference were read and rejected outright: both are illustration/mascot-driven consumer-facing marketing systems with no analogue in an enterprise operations dashboard, and `docs/06_platform_ui_contract.md` explicitly asks that individual-menu style not diverge from the platform's shared, non-decorative contract.

**Key Characteristics:**
- Light warm-gray canvas (`{colors.canvas}` `#f7f8fa`) with white cards (`{colors.surface-card}`) — never pure white-on-white, never dark mode by default.
- One chromatic accent (`{colors.primary}` `#2563eb`) reserved for active nav state, primary buttons, focus rings, and the info-semantic color. Everything else is neutral ink or semantic status color.
- Fixed dark sidebar (`{colors.surface-dark-nav}`) is the one deliberate polarity flip in the system — it exists to keep navigation visually separate from data content, not as a second brand mode.
- Flat elevation: hairline borders (`{colors.hairline}`) carry card boundaries; no shadow stacking. A `panel-card` and a `stat-card` differ only in padding, not in elevation.
- Small, square-ish radii (`{rounded.sm}` 4px buttons, `{rounded.md}` 6px inputs, `{rounded.lg}` 8px cards) — never pill-shaped except true status pills and the scope switcher chip. Aligned to `docs/06_platform_ui_contract.md` §23's `sm 4px / md 6px / lg 8px` scale.
- Status vocabulary is semantic-color-driven (`success`/`warning`/`danger`/`neutral`) and must map to the data-state evidence rules owned by `docs/06_platform_ui_contract.md` §19 — a badge color is never invented ad hoc per screen.

### Reference review and precedence

**Verdict:** the original tokens establish a recognizable visual family, but do
not specify enough geometry, chart encoding, controls, or states for faithful
reproduction. Additions below are an implementation recipe, not a claim of
pixel-exact extraction. Existing tokens and sections are retained. All new
`{components.*}` references use the YAML namespace; older `{component.*}` prose
references mean the same namespace, not a second token collection.

The operator's task is to identify where equipment logs stopped progressing,
inspect validation/queue evidence, and drill into the affected equipment. The
visual signature is the collection → conversion → parsing → raw data → validation
chain tied to exact counts, lifecycle milestones, coverage, and queue state.
Slate navigation, pale inspection surfaces, blue processing, teal coverage,
green confirmed results, amber review and red failure provide the color world.
Keep that density; do not replace it with hero-sized KPIs, decorative gauges,
or a flat wall of equally prominent cards.

P0 items 2–4 are confirmed for stat/pipeline chips, period controls and table
controls. P0 item 1 is **partially present**: category and semantic colors exist,
but chart identities, geometry and bindings are missing. The image has **three
donuts and one bar chart**, not four donuts. P1 item 5 is **incomplete, not absent**:
active nav, primary-hover color, focus-ring color and table hover already exist;
the additions provide the missing behavioral coverage. Item 6 needs navigation
hierarchy/overflow, not extra decorative elevation. Items 7–8 are confirmed.
P2 page-header/profile/nested-radius specifications are useful missing rules;
breadcrumb and pulse cannot be established from this image (see Open Decisions).

Scope: these are visual recipes; pipeline, scheduler and lifecycle compositions
remain menu-owned candidates until repeated use justifies promotion (§24).
The explicit additions qualify earlier shorthand: soft fills also belong on
icon chips, alerts, scope and selected rows; chart colors express category as
well as status; not every stage/lifecycle label is a success/failure badge.
Production navigation comes from the seven canonical §9 groups, **not** the
screenshot's group names quoted in the original Navigation paragraph.

## Colors

### Brand & Accent
- **Primary** (`{colors.primary}` `#2563eb`): active sidebar item, primary buttons, links, focus ring, "Info" semantic state. Scarce outside those four roles.
- **Primary Soft** (`{colors.primary-soft}`): info-tinted banners, selected-row backgrounds.

### Surface
- **Canvas** (`{colors.canvas}` `#f7f8fa`): page background behind the content area only — the sidebar has its own dark surface.
- **Surface Card** (`{colors.surface-card}` `#ffffff`): all cards, panels, the top bar, table backgrounds.
- **Surface Sunken** (`{colors.surface-sunken}`): table header rows, progress track background, search input fill — anything that should read as "recessed" relative to a card.
- **Surface Dark Nav** (`{colors.surface-dark-nav}` `#0f1526`): sidebar only. Do not reuse this surface for any content-area component.
- **Hairline** (`{colors.hairline}`) / **Hairline Strong** (`{colors.hairline-strong}`): card borders, table row dividers, input borders.

### Text
- **Ink** (`{colors.ink}`): headings, primary values, table cell text.
- **Ink Secondary** / **Ink Muted** / **Ink Faint**: descending emphasis for subtitles, metadata, and sidebar item text on dark surfaces.

### Semantic (status — see docs/06 §19 before wiring)
- **Success** (`{colors.success}`): "Success", "Passed", validation-coverage-met, positive delta arrows.
- **Warning** (`{colors.warning}`): "Needs Review", "Minor issue", stale-but-not-failed states.
- **Danger** (`{colors.danger}`): "Failed", "Action Required", parser/validation errors.
- **Neutral** (`{colors.neutral}`): "None" / no-issue / not-yet-evaluated — must not be confused with a confirmed-success green per the confirmed/unconfirmed distinction in the platform contract.
- **Info** (`{colors.info}` = `{colors.primary}`): informational banners, "Live" processing-window context.

Semantic color is a **display concern only**. Which underlying data state (collected / delayed / zero-result / permission-hidden / quality-warning / oversized-query / server-error) maps to which badge is owned by `docs/06_platform_ui_contract.md` §19 and `docs/04_frontend_ui_ux.md`'s state breakdown — this file does not reinterpret that mapping, it only defines the palette those states render in.

## Typography

Single family (**Inter**, system-sans fallback) across every role — no serif or display-face counterpart, matching the ClickHouse/Supabase "one geometric sans, weight-and-size does the hierarchy work" principle. Per `docs/06_platform_ui_contract.md` §23, no role exceeds weight 600 — `{typography.stat-value}` (Primary KPI) and `{typography.stat-value-secondary}` (Secondary KPI) carry the heaviest weight at 600; body and table cells stay at 400; table headers use 600.

| Token | Size | Weight | Use |
|---|---|---|---|
| `{typography.page-title}` | 24px / 600 | Page-level heading ("Dashboard") |
| `{typography.section-title}` | 18px / 600 | Section headers ("Log Processing Pipeline") |
| `{typography.card-title}` | 14px / 600 | Card/widget titles |
| `{typography.stat-value}` | 32px / 600 | Primary KPI numbers (§23 range 30–36/600) |
| `{typography.stat-value-secondary}` | 22px / 600 | Secondary KPI numbers, default donut center (§23 range 20–24/600) |
| `{typography.caption}` | 12px / 400 | Plain caption text (§23 Caption 12/16/400) — distinct from the pill `{typography.badge}` |
| `{typography.stat-delta}` | 12px / 600 | "↑ 12%" delta labels next to a stat |
| `{typography.body-md}` / `{typography.body-sm}` | 14px / 13px, 400 | Default UI text, descriptions |
| `{typography.table-header}` | 12px / 600, uppercase | Table column headers |
| `{typography.table-cell}` | 13px / 400 | Table body cells |
| `{typography.nav-item}` / `{typography.nav-group-label}` | 13px / 11px | Sidebar item and group-label text |
| `{typography.badge}` | 11px / 600 | Status pill text |
| `{typography.mono}` | 12px / 400 | IDs, query IDs, correlation IDs (`docs/04` error-state requirement) |

Apply `{typography.numeric}` to KPI values/deltas, counts, percentages, chart
labels, table numbers and timestamps; keep labels proportional. Right-align
quantities in tables, align units/decimal precision within a column, and keep
IDs left-aligned in `mono`. Do not convert every number to monospace. Use
`Inter, system-ui, -apple-system, "Segoe UI", sans-serif`; font fallback and
localization may increase row heights. `{typography.compact-table-header}` is
the screenshot's sentence-case header variant; uppercase remains the existing
base variant. Default `donut-metric` centers use `{typography.stat-value-secondary}`
(22px/600). Compact reference donut centers instead use `donut-chart.centerTypography` (13px/600), not
the full Primary-KPI-sized `{typography.stat-value}` when rendering this compact reference.

## Layout

- **Base spacing unit**: 4px, stepping `{spacing.xxs}` 4px → `{spacing.huge}` 48px. Card internal padding defaults to `{spacing.md}` (16px) for compact tiles, `{spacing.lg}`–`{spacing.xl}` (20–24px) for panel cards with headers.
- **Sidebar**: fixed `{component.sidebar-shell}` width 270px, collapsible per `docs/07_app_shell_wireframe.md`; grouped sections with `{component.sidebar-group-label}` uppercase micro-labels, never unlabeled flat lists.
- **Top bar**: fixed 54px `{component.top-bar}`, hairline bottom border only — no shadow.
- **Content grid**: KPI stat row is a flex/grid of equal-width `{component.stat-card}` tiles (5–6 max per row per `docs/04`'s "limit KPI card count" rule) — do not let this row grow to substitute for a proper metrics screen.
- **Density over whitespace**: per the wireframe skill's platform principles, tables beat cards when exact values matter; this file's `{component.data-table}` is the default for any list of ≥5 comparable records, not a card grid.

### Dashboard composition and focal point

`layout.reference-dashboard` records approximate image proportions beyond the
shell itself (sidebar width and top-bar height are now the single canonical
`sidebar-shell`/`top-bar` values above, not duplicated here). At reference width: header and
period controls, five equal KPI tiles, then pipeline left / Scheduler & Operations
right (~64/36), lifecycle left / four quality widgets right (~47/53), then a
full-width equipment table. Rings occupy the first three quality cells; the
fourth is the bar plot. Panel headers align on a shared baseline. Use 8px internal
label/value gaps; do not stretch compact cards to fill the viewport vertically.

The **pipeline-status region** is the primary task focal point: first major
content row, widest panel, five connected stages. KPIs summarize; operations
exposes exceptions; tables provide evidence. This is a design judgment, not a
fact extractable from pixels; do not enlarge all widgets to compete with it.

At ≥1440px use the two-column rows. At 1024–1439px collapse navigation, use three
KPI columns and move secondary operations into an accessible drawer per §25;
keep pipeline order with contained horizontal scrolling if needed. Below 1024px
use stacked panels, two/one KPI columns as content allows, and a horizontally
scrollable table with its toolbar outside the scroll region. Never shrink table
text to fit. Use `table-density` for normal desktop (32px minimum rows); the 25px
reference rows are a compact visual target only, growing for wrapping, focus and
24px minimum desktop targets. Coarse-pointer controls/rows grow to 44px targets.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No border, no shadow | Canvas background, sidebar |
| 1 — Hairline | 1px `{colors.hairline}` border, no shadow | `stat-card`, `panel-card`, `pipeline-step-card`, `data-table` |
| 2 — Sunken | `{colors.surface-sunken}` fill, no border | Table header row, progress track, search input |
| 3 — Active nav | `{colors.primary}` fill | `sidebar-item-active` only — the single filled-color surface outside semantic badges |

No drop-shadow elevation anywhere in this system (ClickHouse/PostHog discipline) — depth comes from the canvas → card → sunken surface contrast plus hairline borders, matching a dense operational tool rather than a marketing surface.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Inline chips inside table cells |
| `{rounded.sm}` | 4px | Buttons, sidebar item hover/active fill |
| `{rounded.md}` | 6px | Inputs, alert rows, inline banners |
| `{rounded.lg}` | 8px | Cards, panels, tables |
| `{rounded.pill}` | 9999px | Status badges, the scope-switcher pill, progress bar fill/track |

Nested surfaces follow `inner radius = max(0, outer radius − inset)` when
corners track each other (e.g. an 8px card with a 2px inset → 6px inner surface).
This is not a rule for every descendant: independent badges/progress tracks
remain pills, inset alert rows keep their own radius. Do not give all children
the parent's 8px radius or flatten a pill to satisfy concentric geometry.

## Components

### Navigation
- **`sidebar-shell`** — dark, fixed-width, grouped by domain (Equipment, Data Management, Processing Pipeline, Monitoring & Operations, Quality & Analytics, System), matching the platform's menu-registry groups in `docs/06_platform_ui_contract.md` §9 rather than inventing new groupings per screen.
- **`sidebar-item`** / **`sidebar-item-active`** — active state is the system's only large filled-`{colors.primary}` surface; everything else on the sidebar is translucent white text on dark.
- **`top-bar`** — global search, scope switcher (`scope-pill`), notification badge, profile menu. Owns Context display per `docs/06_platform_ui_contract.md` §11, not a decorative element.

### KPI & Metrics
- **`stat-card`** — icon + label + `{typography.stat-value}` + `{typography.stat-delta}` + supporting caption. One primary number per card; never stack two unrelated metrics in one tile.
- **`donut-metric`** — center value in `{typography.stat-value-secondary}`, ring drawn in `{colors.success}` / `{colors.warning}` / `{colors.hairline}` segments; a legend row underneath always pairs each ring color with its raw count (percentage alone is not sufficient per the platform's traceability principle).
- **`progress-track`** + **`progress-fill-success`** / **`progress-fill-danger`** — used inside `pipeline-step-card` to show per-stage completion; track color is always `{colors.surface-sunken}`, fill color follows the semantic mapping above.

### Pipeline / Process
- **`pipeline-step-card`** — icon, stage name, primary count, two-line success/failed breakdown. Cards connect left-to-right with a simple arrow glyph, not a decorative connector graphic.

### Alerts
- **`alert-row-danger`** / **`alert-row-warning`** — left-aligned icon, message, right-aligned timestamp + action-required badge. Alerts list is capped and links to a full Alerts screen — it is a summary widget, not the system of record.

### Tables
- **`data-table`** with **`data-table-header-row`** (sunken, uppercase, sortable) and **`data-table-row`** (hairline bottom border, hover = `{colors.surface-sunken}` fill). Status column always renders one of the four `status-badge-*` variants — never raw text for a status value.

### Status & Badges
- **`status-badge-success`** / **`-danger`** / **`-warning`** / **`-neutral`** — pill, soft-tint background, saturated text color. This is the only place `{colors.*-soft}` tokens are used as a fill.
- **`live-indicator`** — small `{colors.success}` dot + "Live" label in `{typography.badge}`, used only when a widget is genuinely on a real-time/near-real-time feed — not decorative on static/cached panels (ties to the data-freshness disclosure rule in `docs/04_frontend_ui_ux.md`).

### Forms & Actions
- **`button-primary`** / **`button-secondary`** — 4px radius, never pill. Primary reserved for one action per view context (e.g. "Export"), matching the single-accent discipline above.
- **`search-input`** — sunken fill, no visible border until focus, magnifier glyph left-aligned.

### Reference component bindings

- **Icons/navigation:** `icon-chip` is the stat-card blue chip; `icon-chip-pipeline`
  overrides only size/radius (inherits base colors/stroke); `icon-chip-validation`
  supplies teal colors to either size. Sidebar group glyphs use
  `sidebar-group-icon` **without a filled chip**, as observed. Use one consistent
  outline family, decorative glyphs hidden from assistive technology and named
  icon-only actions. Brand artwork is outside this component contract.
- **Sidebar hierarchy:** shell base → `sidebar-sub-item` subtle grouping →
  existing hover → raised scroll/control affordances, with `nav-divider` between
  groups. Group disclosure is a button with `aria-expanded`; links remain links,
  current link uses `aria-current="page"`. Scroll the central menu independently
  of the brand/footer, keep focused entries visible, never communicate depth
  through color alone. Collapsed icon rail needs accessible names/tooltips and
  keyboard-accessible group flyouts; no nested scroll trap.
- **Page header/period:** title + description left, `date-range-trigger` and
  `date-range-segments` right; wrap controls without hiding current Context.
  Implement the segments as a labelled single-select radio group with arrow-key
  selection and selected semantics. Custom opens the shared range picker; draft
  dates commit on Apply, Escape/Cancel preserves the previous range. The trigger
  exposes the exact applied interval. This is a rendering of the **same global
  period control**, not a second page-owned filter. Materialize URL wall-clock
  `[from,to)` values via §6.3; never derive defaults from browser now. Calendar
  inclusive end dates convert to next-day exclusive midnight. Presets use the
  decided rolling wall-clock mechanism in [06 §6.3](docs/06_platform_ui_contract.md#ctx-time)
  (see Date preset meaning below); the initial automatic default duration and
  shift/business-day semantics remain Open.
- **Top bar/profile:** `top-bar-search` left, scope then notification and profile
  right; use `icon-button` + `notification-count`, with a readable notification
  count label. `profile-trigger` shows avatar, display name, role and chevron;
  `dropdown-menu` anchors right, flips within viewport, overlays content without
  reflow. Use an accessible menu primitive (Enter/Space opens, arrow/Home/End
  navigates, Escape closes and restores trigger focus). Items follow actual
  account capabilities; do not invent profile actions. The screenshot search
  appearance does not authorize deferred entity/action search (§10).
- **Tables:** toolbar title/subtitle left; equipment search, stage filter, status
  filter, secondary Export right. Filters have persistent accessible labels;
  wrap the toolbar rather than compress controls. These filters are page-owned
  unless the registry contract declares otherwise; they preserve global Context.
  Use `table-selection` first, data columns next, `table-row-actions` last with
  visible View and named ellipsis menu using `dropdown-menu`. Header checkbox
  selects eligible visible-page rows; mixed selection is indeterminate. Explicit
  broader selection needs a separate action, never an implicit all-records scope.
  Show selected count and Clear in `table-bulk-bar`; expose only permitted bulk
  actions. Clear selection on Scope/Context change. Export scope is explicit
  (filtered result or selected rows), permission-checked and uses applied filters.
  Sort buttons expose `aria-sort`; focus/selection must survive row hover. No
  clickable-row wrapper around nested buttons. Width overflow stays in the table.
- **Charts:** `pipeline-stage-progress` is completion, not success share; show
  denominator/percentage and independent success/failure counts. Five stage fills
  are blue in the reference (with a teal terminal tint), not five unrelated
  category colors. Use solid blue for production per §24's gradient restraint;
  retain `progress-fill-success/danger` for genuinely semantic measures.
  `donut-chart` binds coverage→blue, traceability→teal, consistency→green;
  missing/untraced use remainder gray, inconsistent uses amber. Title, centered
  percentage and two-row legend identify each measure; expose numerator and
  denominator in an accessible detail/table even if the compact legend shows %.
  `bar-chart` shows daily defect count with zero baseline, integer ticks and date
  labels, not a fourth percentage widget. Autoscale its max; never hardcode the
  image's counts into product logic. Tooltips also work on focus, show label/value/
  unit; provide text summary and same-data table access. Chart clicks do not
  silently mutate global Context. Missing values use an unknown state, not 0%.
- **Scheduler/queue:** `scheduler-panel` contains equal queue-status and processing-
  window subpanels above a full-width alerts list. Queue total + running/pending
  text accompanies the stacked bar; segment widths need an explicit denominator.
  A gray remainder must have a named category, never be inferred by subtraction
  of inconsistent sample figures. Processing window uses a calendar chip, wall-
  clock interval and next-run text from its source; alerts align icon/message,
  time and issue badge. Use compact white rows with tinted badges here, not the
  existing full-row danger/warning fills (those remain emphasis variants).
- **Lifecycle:** `lifecycle-cell` centers a checked green disk for complete, hollow
  circle for pending and labelled alternative for unknown; each marker has a
  textual accessible state. Model names stay left-aligned; final lifecycle label
  (Alpha/Beta/In Progress/Planned) is categorical, not evidence of validation
  success. Product milestone/state mapping remains domain-owned.

### Shared interaction and data states

All interactive components inherit `interaction.*` and `motion.state-transition`
(color/opacity only); static text/cards/badges have no fake hover, pressed or
focus behavior. The following is the binding contract, not just a color list:

| Family | Hover / pressed / selected | Focus / disabled / busy |
|---|---|---|
| Buttons, toolbar actions, icon/profile/range triggers | Neutral hover/pressed; primary uses primary-hover; open trigger shows pressed | 2px solid focus-visible ring; disabled blocks pointer and keyboard activation with a visible reason; busy retains width + spinner/label and blocks duplicate submission |
| Sidebar/disclosure/sub-items | dark-nav-hover; pressed dark-nav-raised; current item retains primary + current marker | nav-focus ring on dark; disable unavailable action with reason (permission visibility remains registry-owned) |
| Range segments/checkboxes | neutral hover; selected fill plus radio/checked mark | shared ring; native disabled/checked/mixed semantics; no color-only selection |
| Search/filter fields | hover control-border; typed value ink, placeholder ink-muted | ring and control-border; error text + aria-invalid; read-only distinct from disabled; retain input during query refresh |
| Menu items | neutral hover and keyboard highlight; selected check where applicable | managed menu focus; disabled item cannot activate; restore trigger focus on close |
| Table rows/links | existing sunken hover; selected primary-soft + checkbox; pressed only on actual actions | focus-within visible without obscuring cells; busy table keeps headers; no row focus unless row itself is an action |
| Chart marks/linked metric cards | highlight relevant series/outline, without changing meaning | focusable drill-down only if actionable, equivalent tooltip/data access; passive marks have no pressed/disabled state |

Use `interaction.loading` skeletons with reserved geometry for first load;
`aria-busy` on the affected region, no fabricated values. Same-Context refresh
keeps values with a Refreshing label. Context/Scope changes hide stale results
and revalidate access (§11). Empty uses explanatory text + appropriate clear-filter
or navigation action; error uses message, Retry and correlation ID. Partial widget
failure stays local; retain healthy panels. These rules cover KPI, pipeline,
queue, lifecycle, donut/bar and equipment-table regions. Never collapse §19's
no-match, not-collected, delayed, coverage, forbidden, too-large and unknown
states into one empty view; assert a cause only with source evidence.

`status-badge-accessible` overrides text colors of success/warning/danger badges
(and corresponding small semantic text) while retaining existing soft fills;
original bright semantic colors remain available for dots/charts. The opaque
`focus-visible` ring replaces the translucent decorative ring for keyboard focus.
Use `control-border` where a border is necessary to identify a control, not on
every card. Verify 4.5:1 normal text and 3:1 meaningful control/focus contrast in
the eventual render; faint text is not for essential labels on white.

`live-dot` defaults to static. The optional pulse tokens are Candidate only:
opacity animation of the dot, never the label/layout, and only while a source
confirms live freshness. Reduced-motion uses no animation; freshness loss stops
pulse and displays Updated/Data through/Unknown as appropriate. Live is not proof
of completeness. Breadcrumb is optional on nested pages, absent on this root
Dashboard; link ancestors, mark the current page, preserve Context on navigation.


## Do's and Don'ts

### Do
- Keep `{colors.primary}` scarce: active nav, primary buttons, links, focus ring, info-semantic only.
- Render every status as one of the four semantic badge variants — resolve which one via the data-state evidence rules in `docs/06_platform_ui_contract.md` §19, not by screen-local judgment.
- Use hairline borders + surface contrast for all elevation. No shadows.
- Cap KPI stat rows at 5–6 tiles; anything beyond belongs on a dedicated metrics screen.
- Keep the sidebar dark surface exclusive to navigation — never reuse it as a content-area "dark mode" card.

- Apply numeric alignment, named chart-series bindings and shared state rules consistently across menus.
- Treat the supplied image as visual evidence only; use platform Context, permissions and Data Trust contracts for behavior.
- Use three compact rings + one bar plot in the reference quality panel; expose exact data and units.

### Don't
- Don't introduce a second saturated brand color alongside `{colors.primary}` — category-accent colors (`accent-purple`, `accent-teal`, `accent-amber`) are for chart-series/tag differentiation only.
- Don't pill-round buttons or inputs — pills are reserved for status badges, the scope chip, and progress bars.
- Don't stack drop shadows on cards to fake depth; add a hairline border instead.
- Don't invent a new status color per screen — extend the four-variant `status-badge-*` set or raise it as an Open Decision, don't freelance a fifth color.
- Don't treat this file as marketing-system guidance — it has no hero, pricing, or CTA-banner components on purpose.

- Don't infer a live feed, animation, queue denominator, permission, or backend assessment from screenshot pixels.
- Don't reuse screenshot navigation names as the platform menu registry or add a duplicate global date filter.
- Don't force concentric rounding onto independent status pills or use semantic success color for every progress measure.

## Open Decisions (per wireframe-skill convention)

- **Dark mode**: not designed. The reference screenshot and this system are light-canvas only; if dark mode is requested, it needs its own pass, not a naive token invert (the sidebar is already dark — inverting the whole app would collide with it).
- **Chart library token mapping**: `docs/04_frontend_ui_ux.md` recommends Apache ECharts as a candidate; this file's semantic/category colors are the palette contract charts should consume, but the actual ECharts theme config is not authored here.
- **Icon set — Resolved (2026-09-22)**: Lucide is decided (rounded-outline, matching the reference screenshot's style). Actual binding into components is implementation work, not done here.
- **Component library binding**: token names above are design intent, not shadcn/ui or Radix component props. Binding these tokens to `docs/04_frontend_ui_ux.md`'s shadcn/ui candidate stack is implementation work for the Prototype stage, not this document.

- **Review correction — P0.1 / fourth donut**: the supplied image contains three rings plus the Parser Defects bar chart. No fourth ring token binding is invented; a fourth metric requires its own meaning/data contract.
- **Review correction — P0.2 sidebar chips**: sidebar group glyphs are unboxed; stat and pipeline glyphs use soft chips. A filled sidebar-group chip is not adopted for reference fidelity.
- **Review correction — P1.5 / P1.6**: interactive coverage was incomplete, not wholly absent (active nav/table hover existed). Navigation depth is hierarchy + scrolling; additional shadow/elevation tiers are not required by this image.
- **P1.8 focal choice (Candidate)**: pipeline-status is the chosen task focal region; a static image cannot establish the operator's top business priority. Revisit only if the approved dashboard task makes an attention list primary.
- **P2 breadcrumb / pulse**: no breadcrumb or observable animation in the static reference. Optional breadcrumb and reduced-motion-safe pulse recipes are specified, but neither is required for reproduction; pulse activation needs a confirmed live-source policy.
- **Reference vs platform baseline — Resolved**: this file's radius and headline/KPI typography now match `docs/06_platform_ui_contract.md` §23 exactly: `rounded.sm/md/lg` corrected to 4px/6px/8px (scale is `sm 4 / md 6 / lg 8`, matching §23's `sm/md/lg`); `page-title` 24/600 (§23 Page Title 24/32/600); `section-title` 18/600 (§23 Section Title 18/28/600); `stat-value` (Primary KPI) 32/600 (§23's 30–36/600 range), with a new `stat-value-secondary` 22/600 added for §23's Secondary KPI (20–24/600); `page-title`/`section-title`/`card-title` line-heights are explicit 32px/28px/20px; `body-md`/`body-sm` line-heights are explicit 20px/18px; a plain `caption` (12/16/400) token was added to cover §23's Caption row, distinct from the pill-badge `badge` token. `spacing` already matched §23's 4px-based scale — `xxxl` (40px) and `huge` (48px) were added only to cover §23's full listed scale, not to change existing values. §23's abstract `--background`/`--surface`/`--text-primary`/etc. semantic-variable naming is satisfied conceptually by this file's `colors.canvas`/`colors.surface-card`/`colors.ink` tokens plus the `components:` layer that consumes them — no renaming was done, since §23 does not mandate the literal variable names, only that raw Tailwind primitives not be used directly in components (already the case here).
- **Sidebar/top-bar width — Resolved**: neither `docs/06_platform_ui_contract.md` nor `docs/07_app_shell_wireframe.md` pins an exact pixel width, so this was never a platform-contract conflict, only a duplicate-number issue resolved using the screenshot's measured value (270px/54px). Resolved by adopting the measured 270px/54px as the single canonical `sidebar-shell.width` / `top-bar.height` — the separate `layout.reference-dashboard.sidebarWidth`/`topBarHeight` duplicates were removed so there is exactly one source of truth.
- **Existing prose qualifications**: screenshot groups in Navigation do not match canonical §9 IA; category chip/series colors and soft fills are exceptions to earlier “only” wording, specified above. Exact source font, CSS colors, subtle gradients and sizing cannot be recovered with certainty from a raster; chosen solid colors are approximations, not sampled authoritative CSS. Full pixel fidelity remains unverified without a rendered implementation.
- **Date preset meaning — Resolved (2026-09-22)**: actual usage is "usually 1 day, sometimes 7 days, rarely longer" — the reference screenshot's `7D/30D/90D` set doesn't match. Presets are now `1일/7일/사용자 지정` (1-day/7-day/custom), materialized as rolling wall-clock durations off the existing `defaultRangeTo` mechanism (§6.3, midnight-unaligned, naive duration arithmetic) — 1일=Δ24h, 7일=Δ168h. No calendar-day alignment. See `docs/05` §기간 프리셋과 집계 단위.
- **Queue/lifecycle semantics**: screenshot queue total (28) and running/pending counts (12/16) do not explain its visible gray segment. Do not manufacture a third category. Lifecycle marker meanings and categorical badge mappings likewise require domain definitions before production use.
- **Profile/bulk action inventory**: visual controls are specified, but actual account items, permitted bulk operations and export limits depend on existing auth/menu capabilities; do not invent operational actions from the screenshot.
