---
name: analysis-platform-wireframe
description: Orchestrates the UI/UX workflow for this analysis platform (data-heavy dashboards, admin tools, internal enterprise screens) — Requirements → IA → Conceptual Contract → Wireframe → Open Decisions. Design System, Prototype, Visual Polish and implementation review are optional gated follow-ups. Use when asked to design, plan, wireframe, or spec a new page/feature/screen for this project, before any JSX/HTML is written. Does not replace the other design skills — it sequences them and stops each one at its own boundary. Not for marketing/landing pages.
---

# Analysis Platform Wireframe

This is the entry point for any new screen or feature on this platform. It does not do design work itself — it sequences four other skills so they don't compete, and it owns the two stages none of them cover: turning requirements into an information architecture, and turning that IA into a low-fidelity wireframe.

Read `references/wireframe-rules.md` before Step 2 — it has the wireframe template, the screen-spec checklist, and this platform's density/table/chart principles.

## Why this exists

Four design skills are installed in this project and their scopes overlap on paper:

| Skill | Owns | Does NOT own |
|---|---|---|
| **this skill** (analysis-platform-wireframe) | Requirements → user tasks → IA → screen inventory → wireframe → component/data requirements | Visual styling, pixel-level polish, final review |
| **ui-ux-pro-max** | Pattern/product classification, chart type selection, color/typography/design-token intelligence, dashboard pattern library | Page architecture — never let it decide the overall IA or navigation structure on its own |
| **interface-design** | Enterprise UI discipline: information density, hierarchy, spacing, component consistency, dashboard/admin conventions | Decorative or marketing-oriented choices — its rules win over those when they conflict |
| **frontend-design** | Visual refinement: typography, visual identity, intentional layout, avoiding generic AI-default look | Product architecture — invoke it only *after* IA + wireframe + main components + design-system direction exist, never at the start |
| **web-design-guidelines** | Final review: accessibility, keyboard/focus, forms, interaction conventions | Redesign — it fixes high-confidence issues, it doesn't re-architect |
| **`.agents/references/design-md/`** (awesome-design-md) | External visual references only, filtered to dev-tools/observability/data-platform/enterprise-SaaS examples | Never copy a brand's DESIGN.md wholesale as this project's identity — extract 1–3 principles into this project's own `DESIGN.md` |

Never ask more than one of these to solve the same problem independently. If instructions here conflict with something already established in this project (an existing `DESIGN.md`, `docs/`, or a prior architectural decision), preserve the existing constraint and report the conflict instead of overwriting it.

## Design stage (default stopping point)

```
Requirements → Information Architecture → Conceptual Contract / Screen Spec
             → Wireframe → Open Decisions

Separate implementation request → Design System → Prototype → Visual Polish → UX Review
```

1. **Requirements** (this skill) — primary users, primary tasks, objects/entities analyzed, key decisions the user makes, data volume, interaction frequency, desktop/mobile priority. Desktop-first by default for this project unless told otherwise.
2. **Information Architecture** (this skill) — global nav, workspace hierarchy, pages/sub-pages, entity↔detail relationships, cross-page navigation. No JSX/HTML yet. Produce a short IA tree.
3. **Conceptual Contract / Screen Specification** (this skill) — per screen: purpose, primary task, input, output, primary/secondary actions, navigation, data requirements, empty/loading/error state.
4. **Wireframe** (this skill) — region-level ASCII layout per `references/wireframe-rules.md`. Hierarchy, density, relationships, workflow, navigation, information placement only — no shadows, gradients, animation, decorative artwork, or micro-polish at this stage.

After Step 4, record Decided / Candidate / Open / Deferred decisions and finish the design task. A document review is sufficient; no prototype, DESIGN.md or visual polish is required. Start the following stages only when the user requests implementation/prototyping and the necessary design decisions are resolved or explicitly bounded.

## Optional implementation stages

5. **Design System** — invoke **ui-ux-pro-max** + **interface-design** together to establish spacing, type scale, surface hierarchy, semantic colors, table rules, form rules, chart rules, navigation rules, responsive behavior. Write the result to this project's `DESIGN.md` (create it if it doesn't exist yet; it becomes the source of truth for visual consistency). If useful, pull 1–3 extracted principles from `.agents/references/design-md/` first (prefer linear.app, sentry, clickhouse, posthog, mongodb, hashicorp, ibm, supabase, cursor over consumer/landing-page entries) — extract principles, don't copy a brand wholesale.
6. **Interactive Prototype** — build it only after IA + wireframe + `DESIGN.md` exist. Default stack unless the project already specifies otherwise: React + TypeScript + Tailwind + shadcn/ui. Use realistic mock data. Must demonstrate real workflows: navigation, filters, table interactions, selection, sorting, search, detail views, drawer/panel behavior, loading/empty/error states. Never a static screenshot dressed up as a prototype.
7. **Visual Polish** — invoke **frontend-design** now, not earlier. Typography, visual hierarchy, balance, surface treatment, micro-layout, interaction polish. Do not change IA or core workflows unless a clear usability issue surfaces during this pass — if one does, report it rather than silently re-architecting.
8. **UX/Accessibility Review** — invoke **web-design-guidelines** last. Accessibility, keyboard nav, focus states, form behavior, responsive behavior, typography, interaction clarity, error handling. Fix high-confidence issues only; don't redesign the app during review.

## Analysis-platform design principles

Full list in `references/wireframe-rules.md`. The short version: information density beats decorative whitespace, tables beat cards when exact values matter, charts are for trends not decoration, filters persist across a session, master-detail layouts drive investigation workflows, and every summary number should be traceable down to raw evidence. Avoid card-grid-everything, oversized KPI tiles, dashboard-only navigation, modal-heavy workflows, hidden context, and generic consumer-SaaS landing-page aesthetics.

## Required output for every new major UI

Before implementation:

1. USER TASK
2. IA
3. SCREEN INVENTORY
4. WIREFRAME
5. COMPONENT MAP
6. DATA REQUIREMENTS
7. INTERACTION RULES
8. DESIGN DECISIONS

Finish with OPEN QUESTIONS / RISKS and a document-level UX REVIEW. Only after the implementation gate, add:

9. UX REVIEW
10. OPEN QUESTIONS / RISKS

## Notes for this project specifically

- This platform consumes data from `context_recognized_parser` (see `docs/01_architecture_and_data_contract.md`) — screens are read-mostly analysis/CRUD over that data, not a marketing surface. Enterprise principles apply by default.
- Global filter context, deep-link query params, and confirmed/unconfirmed data-state indicators (see `docs/06_platform_ui_contract.md`) are recurring cross-cutting concerns — call them out explicitly in INTERACTION RULES and DATA REQUIREMENTS whenever a screen touches them, don't reinvent them per screen.
- Root `DESIGN.md` exists and is the visual source of truth (tokens, component visual specs, shell/table dimensions). Read it before inferring a palette/type baseline. No interactive prototype is checked in yet — don't assume one exists.
- `docs/06_platform_ui_contract.md` owns navigation IA and cross-menu contracts; `docs/07_app_shell_wireframe.md` consumes them. Use conceptual responsibilities, not framework component APIs or roadmap phases, in design-stage output.
