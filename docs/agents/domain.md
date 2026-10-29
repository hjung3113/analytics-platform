# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. Layout: **single-context**.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root — domain glossary.
- **`docs/INDEX.md`** — role- and task-based reading paths into the design contracts (`docs/00`–`13`). Platform/frontend work starts at `docs/contract/platform-ui-contract.md`.
- **`docs/adr/`** — architectural decisions touching the area.
- The relevant per-directory **`AGENTS.md`** — technical-layer rules (`apps/platform-web`, `packages/*`, `menus`, `tooling`, `docs`).

If any of these files don't exist, proceed silently.

## Precedence

Root `AGENTS.md` → `docs/contract/platform-ui-contract.md` → per-folder `AGENTS.md`. A Decided item in `docs/overview/roadmap-and-open-questions.md` or an ADR beats older prose; fix stale docs in the same change. Feature domains use the same root glossary and platform authority; read [feature implementation](feature-implementation.md) and the relevant technical-layer guide.

## Changing the glossary

A change that picks a canonical term, renames one, or demotes a term to `_Avoid_` is a decision, not an edit. Before merging it, get one independent review (verify each cited `file:line`, flag collisions and missed synonyms), then send the owner a list of "term · what is mixed now → what we will do", and merge only the confirmed items (owner, 2026-10-23: PR #715 was merged before this and re-confirmed afterwards in #718). Definitions that only record an existing decision (an ADR, `docs/05`) need no extra confirmation. Code copy that must follow the glossary goes to an issue when other open PRs touch those files.

Use glossary vocabulary in issue titles, refactor proposals and tests. A missing concept is a gap to record, not a synonym to invent. Surface contradictions with an architectural decision explicitly; FO ADRs use their separate prefix and [history index](../integration/feature-history.md).
