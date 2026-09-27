# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. Layout: **single-context**.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — domain glossary.
- **`docs/INDEX.md`** — role- and task-based reading paths into the design contracts (`docs/00`–`13`). Platform/frontend work starts at `docs/06_platform_ui_contract.md`.
- **`docs/adr/`** — architectural decisions touching the area.
- The relevant per-directory **`AGENTS.md`** — technical-layer rules (`apps/platform-web`, `packages/*`, `menus`, `tooling`, `docs`).

If any of these files don't exist, proceed silently.

## Precedence

Root `AGENTS.md` → `docs/06_platform_ui_contract.md` → per-folder `AGENTS.md`. A Decided item in `docs/05_roadmap_and_open_questions.md` or an ADR beats older prose; fix stale docs in the same change. `products/feedbackops/` follows its own `AGENTS.md` and is not reinterpreted by these rules.
