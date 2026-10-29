# Frontend Documentation

Frontend docs translate product intent into implementable UI contracts. Since #597, `@ap/feature-screens` is a screen library mounted by the platform; it has no standalone Vite app, file-route tree, login shell, deployable frontend image, or visual runner. Its 36 public entries and feature behavior remain. The platform supplies navigation, session, permissions, notifications and detail hosting through the bridge. Tests use screen/bridge hosts; route generation is retired.

Surface specs live under `docs/design/features/specs/`:

- `docs/design/features/specs/voc.md`: as-built VOC surface spec. API authority is `docs/architecture/platform-api/api/voc.md`.
- `docs/design/features/specs/actors.md`: the general `GET /actors` workspace identity list contract. Triage owner candidates follow `docs/architecture/platform-api/api/voc.md`.

The user-facing mirror of these surfaces is `docs/USER-MANUAL.md` (text) and `docs/user-guide/README.md` (interactive guide); the two are updated together.

## Precedence

```text
1. docs/design/features/routes-and-layout.md
   Owns semantic screen URL state, list/detail behavior and panel behavior; actual mounted URLs and navigation belong to platform menus and the bridge.

2. docs/design/features/ui-design-system.md
   Owns reusable component patterns, state contracts, screen mapping, responsive behavior, and accessibility.

3. docs/design/features/component-inventory.md
   Owns implementation component inventory, variants, and required states.

4. docs/design/features/interaction-patterns.md
   Owns workflow-level UX state machines, cross-system creation flows, and permission UX.

5. docs/product/features/12-ui-ux-principles.md
   Owns product UI intent and traceability to requirements.

6. docs/architecture/platform-api/tech-stack/component-stack.md
   Owns approved frontend library stack and third-party component intake rules.
```

## Visual Input

`docs/design/features/tokens.md` is a raw visual token seed. It does not own component behavior,
route behavior, workflow states, accessibility behavior, or frontend source
paths.

External design prompts, generated HTML files, and external screenshots are
visual references only. The shipped UI is the UI authority (FO ADR-0060); the
`docs/design/history/feedbackops-prototype/` files are a design reference for surfaces not built
yet. External references may inform density,
spacing, layout feel, interaction inspiration, and visual polish, but they must
not override domain terminology, route contracts, workflow states, permission
rules, API contracts, accessibility behavior, or component behavior contracts.

## Domain Terminology

Frontend documentation should use `Managed System` for MVP scope, filters, and
defaults. Tableau, Power BI, and Looker-like analytics programs are Managed
Systems. Use `managedSystem=:managedSystemId|all` for user-facing MVP scope URL
state; do not introduce per-Managed-System route trees.
`all` means the actor's effective Managed System scope union and is truly
workspace-wide only for Admin.

Use Role Level labels for user-facing authority descriptions: `Admin`,
`Developer`, and `User`. Backend capability checks remain authoritative.

## Token Rule

Application code should consume semantic frontend tokens, not raw visual reference tokens directly.

```text
Allowed in screen and component code:
- --text-primary
- --surface-detail
- --border-selected
- --status-reporter-*
- --severity-*

Avoid outside token implementation files:
- --color-pitch-black
- --color-neon-lime
- hard-coded hex colors
```
