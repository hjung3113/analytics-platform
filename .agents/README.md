# Shared Agent Assets

Product contracts start at `docs/INDEX.md`. This directory contains agent tooling; it does not define product requirements or an approved design system.

## Sources and Compatibility Paths

| Asset | Single source of truth | Compatibility path |
| --- | --- | --- |
| Project instructions | `/AGENTS.md` | `/CLAUDE.md → AGENTS.md` |
| Skills | `.agents/skills/` | `.claude/skills`, `.omp/skills`, `.grok/skills`, `.opencode/skills → ../.agents/skills` |
| Command text | `.agents/commands/` | `.claude/commands → ../.agents/commands` |
| External design references | `.agents/references/` | `.claude/references → ../.agents/references` |

Keep workflow assets in one global location: reviewer personas in `~/.agents/agents/` (→ `~/.claude/agents`), and workflow skills such as `issue-wave-conductor`, `orca-dispatch-recipes`, and `session-handoff` in `~/.agents/skills/`. Put repository-specific standards in the `Review lens` section of `.agents/conductor/PROFILE.md`.

All links are relative paths inside the repository. Do not edit copies or install them in the user's home directory. Codex searches `.agents/skills` directly, so it does not need a `.codex/skills` copy. If OpenCode or OMP discovers the shared and compatibility paths, do not create another version of the same skill.

## Per-Agent Use

- **Claude:** reads the shared source through `CLAUDE.md` and `.claude/skills`.
- **Codex:** uses the root `AGENTS.md` and `.agents/skills`. See the [official skill discovery documentation](https://developers.openai.com/codex/skills/).
- **OMP:** uses the root `AGENTS.md` and `.omp/skills`. The installed OMP SDK skill-discovery documentation confirms this path.
- **Grok Build:** uses the root `AGENTS.md` and `.grok/skills`. Consult the installed CLI's built-in Project Rules / Configuration help.
- **OpenCode:** uses the root `AGENTS.md` and `.opencode/skills`; `.agents/skills` is also an officially supported path. See the [official documentation](https://opencode.ai/docs/skills/).

If skill discovery is disabled or a client is outdated, ask it to read `.agents/skills/<name>/SKILL.md` directly. Every agent can read and run the shared procedures in `commands/*.md`, but slash-command registration is not guaranteed for CLIs other than Claude.

## Run and Maintenance

- Keep global skills in `~/.agents/skills`, with their source and version in `~/.agents/.skill-lock.json`. This includes `prototype`, `diagnosing-bugs`, `codebase-design`, `research`, `triage`, `tdd`, `to-spec`, `to-tickets`, `domain-modeling` from `mattpocock/skills`, and `issue-wave-conductor`. Do not keep repository copies. Track issue settings in `docs/agents/`. For UI direction, get owner confirmation through the `prototype` skill's UI branch (root `AGENTS.md`, “Prototype confirmation before UI implementation”).
- Three external official skills are vendored (`fastapi`, `supabase-postgres-best-practices`, and `vercel-react-best-practices`). Keep `fastapi` and `supabase-postgres-best-practices` in `.agents/skills-off/` until work begins on the internal FastAPI server (#155). Use `fastapi` for querying, validation, and response models in that server; use `supabase-postgres-best-practices` for indexes, queries, and connection management in the platform schema and mart SQL (general self-hosted Postgres guidance only; this does not mean adopting Supabase); use `vercel-react-best-practices` for request latency, rendering, and bundles (Next.js-specific rules do not apply to this Vite SPA). The originals are unchanged (no renaming or local patches; see each `SOURCE.md`). Each folder records its source, commit SHA, and license. `fastapi` and `supabase-postgres-best-practices` include `LICENSE.upstream`; upstream has no LICENSE file for `vercel-react-best-practices`, so its `SOURCE.md` records the license.
- Three presentation skills are vendored unchanged for decision-maker decks (`SOURCE.md` in each): `made-to-stick` (explaining to non-developers, curse of knowledge), `data-storytelling` (setup → conflict → resolution → ask), and `slides` (HTML slide layouts). Product facts and tone still follow `site/AGENTS.md` and `site/SOURCES.md`: every claim needs a ledger row, no unmeasured numbers or invented case-study figures, and no ad or contrast rhetoric, so skip `slides` copywriting formulas that conflict. A deck published as an Artifact follows the Artifact rules, not the `slides` template's own CDN and stock-image links.
- External skills do not override product contracts or repository rules: root and folder `AGENTS.md` files, `docs/architecture/backend-stack.md` (SQL-first and time), `docs/contract/platform-ui-contract.md`, `docs/integration/platform-packages.md` (package boundaries), and `docs/integration/real-server-checklist.md`. Follow these sources when they conflict with a skill. Common conflict areas:
  - **Time:** Postgres skill advice to always use `timestamptz` applies only to real instants (audit, utilization, error reports). Equipment work time uses `timestamp without time zone` (naive wall-clock time; do not convert to UTC — time contract 03 and 06 §6.3).
  - **SQL and schema:** Prefer mart SQL (03 SQL-first) over an ORM such as SQLModel. Source parser schemas are read-only; add indexes and constraints only to the platform schema.
  - **Permissions:** Do not use Supabase authentication patterns such as RLS policies or `auth.uid()`. FastAPI makes the permission and Scope decision on every request (checklist §3); room grants belong in the metadata database (#98).
  - **FastAPI defaults:** Request models reject unknown keys (`extra='forbid'`). Do not leave validation failures as FastAPI's default 422 body; the adapter returns an `error` envelope (checklist §2). Issue #149 decides the mapping between HTTP status codes and `outcome`. The checklist §3 controls decision order.
  - **React:** Prefer the Kernel query lifecycle (`useMenuQuery`, `useMenuFetch`) for data fetching; general advice such as SWR does not apply. Import `@ap/*` only from public entry points (the package-boundary rule is enforced by lint and takes precedence over advice to avoid barrels).
- Repository contracts take precedence over general skill advice: root and folder `AGENTS.md`, `docs/contract/platform-ui-contract.md`, `DESIGN.md`, and `docs/integration/platform-packages.md`. The `shadcn` skill belongs to the feature screens and is in `.agents/skills/shadcn`; its contents are unchanged. Do not use the shadcn component-add or edit workflow for the platform. Consume feature primitives only through `@ap/ui` (root `AGENTS.md` dependency direction). For a design-system violation, use the token, variant, or component named in the `@shadcn/lint` (`pnpm lint`) error.
- The issue workflow (worker implementation → coordinator host verification → role-based review → merge) is the global `issue-wave-conductor` skill in `~/.agents/skills/issue-wave-conductor/`. Repository-specific rules for checks, previews, complexity, and fold scope are in `conductor/PROFILE.md`; shared engine settings are in `conductor/conductor.json`; repository additions are in `conductor/addenda/`. Reviewer roles `review-ux` and `review-quality` are defined in global `~/.agents/agents/`. Shared code-reviewer and implementation-worker rules are in global skill `templates/`. The global `orca-dispatch-recipes/routing.tsv` selects models.
- Start screen design at `skills/analysis-platform-wireframe/SKILL.md`. The default endpoint is Wireframe + Open Decisions; continue to later stages only when implementation is requested.
- Resolve `scripts/` and `references/` inside a skill relative to the directory containing its `SKILL.md`. Run the `ui-ux-pro-max` search example from that directory: `python3 scripts/search.py "analytics dashboard" --domain product`.
- Tool names, image generation, external requests, and credentials vary by environment. Use the tools currently available; report limitations when a required dependency is missing. A shared path does not prove external functionality has been validated.
- `references/design-md` is an external visual reference. Do not let it override product IA, permission, or Scope contracts, and do not adopt it as the repository's `DESIGN.md` without changes.
- Skills referenced in later design stages, including `frontend-design` and `web-design-guidelines`, are included in the repository.
- Some tests in imported skills require generation scripts or fixtures from the upstream repository. Do not treat them as this repository's full test suite. After moving a skill, check its links, frontmatter, execution paths, and required helper scripts.
- Git checks out symlinks as actual links in the supported environment. If links are checked out as plain text, verify symlink support before relying on client discovery.

