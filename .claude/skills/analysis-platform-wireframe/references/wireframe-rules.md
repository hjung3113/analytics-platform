# Wireframe Rules

Loaded by `analysis-platform-wireframe` before Step 2 of the pipeline. This file holds the templates and the platform's opinions on density/tables/charts — it does not do visual design (that's `interface-design` + `frontend-design`'s job).

**Scope reminder (see root `CLAUDE.md`):** this project's goal is the platform core — global filter context, deep-link protocol, menu registry, metric governance, permissions, audit — not an exhaustive set of domain screens. When designing any individual screen, check first whether it correctly reuses the platform-common contracts before polishing the screen itself.

## Step 1 — Product Context (answer before anything else)

- Primary users
- Primary tasks
- Objects/entities being analyzed
- Important decisions the user makes from this screen
- Expected data volume
- Interaction frequency (glanced at once a shift vs. lived in all day)
- Desktop/mobile priority — **assume desktop-first** for this project unless the request says otherwise

## Step 2 — Information Architecture

Global navigation → workspace hierarchy → pages → sub-pages → entity/detail relationships → cross-page navigation. No JSX/HTML yet — produce a short tree.

Example shape:

```
Analysis Platform
├── Overview
├── Explorer
│   ├── Query
│   ├── Result
│   └── Saved Views
├── Systems
│   └── System Detail
├── Issues
│   └── Issue Detail
└── Settings
```

For this project, the top level is the 7-group navigation confirmed in `docs/06_saas_design.md` §31 and `docs/07_app_shell_wireframe.md` §2 — Overview(운영 개요) / Equipment(설비관리) / Master Data(기준정보관리) / Analytics(생산성 분석) / Metrics(지표관리) / Notice & VOC(공지·VOC) / Admin(관리·감사). The six domain menus from `docs/02_domain_menus.md` map into these groups (Notice and VOC share one nav group but stay separate domain models) plus two platform-level groups (Overview, Admin). A new screen almost always nests under one of these seven rather than introducing a new top-level entry.

## Step 3 — Screen Specification

For each screen, define all of:

- Purpose
- Primary user task
- Input
- Output
- Primary action
- Secondary actions
- Navigation (where it's reached from, where it leads)
- Data requirements
- Empty state
- Loading state
- Error state

## Step 4 — Wireframe template

Region-level only — hierarchy, density, relationships, workflow, navigation, information placement. Not shadows, gradients, animation, decorative artwork, or micro-polish; those belong to the Visual Polish stage.

```
┌─────────────────────────────────────────────┐
│ Global Header                               │
├────────────┬────────────────────────────────┤
│            │ Context / Filters              │
│ Navigation ├────────────────────────────────┤
│            │ KPI / Summary                  │
│            ├────────────────────────────────┤
│            │                                │
│            │ Main Analysis Workspace        │
│            │                                │
│            ├────────────────────────────────┤
│            │ Table / Detail / Evidence      │
└────────────┴────────────────────────────────┘
```

Adapt regions per screen — a master-detail investigation screen may need a third column; a CRUD screen may replace "Main Analysis Workspace" with a table + row-selection action bar + drawer.

## Analysis-platform design principles

**Prioritize:**

- Information density > decorative whitespace
- Comparability > isolated cards
- Tables when exact values matter; charts when trends/patterns matter
- Progressive disclosure for secondary information
- Persistent filters for repeated analysis
- Master-detail layouts for investigation workflows
- Clear selected/filter/time-range state, always visible
- Saved views for repeated investigations
- Traceability: summary → evidence → raw data, always drillable

**Avoid:**

- Excessive card grids
- Huge KPI cards where a compact stat would do
- Dashboard-only navigation (no path to the underlying record)
- Modal-heavy workflows for anything multi-step
- Hidden context (filters or scope that silently change what's shown)
- Generic consumer-SaaS landing-page aesthetics

These principles override `ui-ux-pro-max`'s general pattern suggestions and `frontend-design`'s aesthetic instincts whenever they'd pull toward a marketing-site or consumer-dashboard look. This is an enterprise analysis tool, not a landing page.

## Design System stage — `DESIGN.md` sourcing

When Step 5 runs:

1. Optionally pull 1–3 references from `.claude/references/design-md/` (74 brand folders from awesome-design-md). For this project, prefer developer-tool / observability / data-platform / enterprise-SaaS entries over consumer ones. Reasonable candidates already in the folder: `linear.app`, `sentry`, `clickhouse`, `posthog`, `mongodb`, `hashicorp`, `ibm`, `supabase`, `cursor`.
2. Extract only specific principles (density, navigation pattern, typography, spacing, table treatment, surface hierarchy) — never copy a brand's `DESIGN.md` wholesale into this project.
3. Combine with `ui-ux-pro-max` (pattern/chart/color/type intelligence) and `interface-design` (enterprise density/hierarchy/spacing/consistency rules) to write this project's own `DESIGN.md` at the repo root.
4. Once `DESIGN.md` exists, treat it as the source of truth — later screens conform to it instead of re-deriving tokens.

## Required output checklist (copy into the response for every new major UI)

Before implementation: USER TASK, IA, SCREEN INVENTORY, WIREFRAME, COMPONENT MAP, DATA REQUIREMENTS, INTERACTION RULES, DESIGN DECISIONS.

After implementation: UX REVIEW, OPEN QUESTIONS / RISKS.
