# Shared Agent Assets

Product contracts start at `docs/INDEX.md`. This directory contains agent tooling; it does not define product requirements or an approved design system.

## Sources and Compatibility Paths

| Asset | Single source of truth | Compatibility path |
| --- | --- | --- |
| Project instructions | `/AGENTS.md` | `/CLAUDE.md → AGENTS.md` |
| Skills | `.agents/skills/` | `.claude/skills`, `.omp/skills`, `.grok/skills`, `.opencode/skills → ../.agents/skills` |
| Command text | `.agents/commands/` | `.claude/commands → ../.agents/commands` |
| External design references | `.agents/references/` | `.claude/references → ../.agents/references` |

Workflow assets are global: reviewer personas in `~/.agents/agents/`, workflow skills (`issue-wave-conductor`, `orca-dispatch-recipes`, `session-handoff`) in `~/.agents/skills/`. Repository standards go in the `Review lens` sections of `.agents/conductor/PROFILE.md`.

All links are relative paths inside the repository. Do not edit copies or install them in the user's home directory. Codex searches `.agents/skills` directly, so it does not need a `.codex/skills` copy. If OpenCode or OMP discovers the shared and compatibility paths, do not create another version of the same skill.

## Per-Agent Use

- **Claude:** reads the shared source through `CLAUDE.md` and `.claude/skills`.
- **Codex:** uses the root `AGENTS.md` and `.agents/skills`. See the [official skill discovery documentation](https://developers.openai.com/codex/skills/).
- **OMP:** uses the root `AGENTS.md` and `.omp/skills`. The installed OMP SDK skill-discovery documentation confirms this path.
- **Grok Build:** uses the root `AGENTS.md` and `.grok/skills`. Consult the installed CLI's built-in Project Rules / Configuration help.
- **OpenCode:** uses the root `AGENTS.md` and `.opencode/skills`; `.agents/skills` is also an officially supported path. See the [official documentation](https://opencode.ai/docs/skills/).

If skill discovery is disabled or a client is outdated, ask it to read `.agents/skills/<name>/SKILL.md` directly. Every agent can read and run the shared procedures in `commands/*.md`, but slash-command registration is not guaranteed for CLIs other than Claude.

## Run and Maintenance

- Global skills live in `~/.agents/skills` (`prototype`, `diagnosing-bugs`, `codebase-design`, `research`, `triage`, `tdd`, `to-spec`, `to-tickets`, `domain-modeling` from `mattpocock/skills`, plus `issue-wave-conductor`); keep no repository copies. Issue settings are in `docs/agents/`. UI direction needs owner confirmation through the `prototype` skill's UI branch (root `AGENTS.md`).
- Two external skills are vendored unchanged in `.agents/skills-off/` until work begins on the internal FastAPI server (#155): `fastapi` (querying, validation, response models) and `supabase-postgres-best-practices` (indexes, queries, connections in the platform schema and mart SQL; general Postgres guidance only, not adopting Supabase). Each `SOURCE.md` records source, commit SHA and license. Request latency, rendering and bundles are covered by the global `vercel-react-best-practices` skill (its Next.js rules do not apply to this Vite SPA).
- Four presentation skills are vendored for decision-maker decks (`SOURCE.md` in each): `made-to-stick`, `data-storytelling`, `slides` (unchanged) and `korean-humanizer` (its CLI stub `SKILL.md` is replaced by a local pointer so nothing runs `npx`). Tone and facts follow `site/AGENTS.md` and `site/SOURCES.md` (every claim needs a ledger row; no unmeasured numbers, ad or contrast rhetoric), so skip `slides` copywriting formulas that conflict. A deck published as an Artifact follows the Artifact rules, not the `slides` template's CDN and stock-image links.
- External skills do not override product contracts or repository rules: root and folder `AGENTS.md` files, `docs/architecture/backend-stack.md` (SQL-first and time), `docs/contract/platform-ui-contract.md`, `docs/integration/platform-packages.md` (package boundaries), and `docs/integration/real-server-checklist.md`. Follow these sources when they conflict with a skill. Common conflict areas:
  - **Time:** Postgres skill advice to always use `timestamptz` applies only to real instants (audit, utilization, error reports). Equipment work time uses `timestamp without time zone` (naive wall-clock time; do not convert to UTC — time contract 03 and 06 §6.3).
  - **SQL and schema:** Prefer mart SQL (03 SQL-first) over an ORM such as SQLModel. Source parser schemas are read-only; add indexes and constraints only to the platform schema.
  - **Permissions:** Do not use Supabase authentication patterns such as RLS policies or `auth.uid()`. FastAPI makes the permission and Scope decision on every request (checklist §3); room grants belong in the metadata database (#98).
  - **FastAPI defaults:** Request models reject unknown keys (`extra='forbid'`). Do not leave validation failures as FastAPI's default 422 body; the adapter returns an `error` envelope (checklist §2). Issue #149 decides the mapping between HTTP status codes and `outcome`. The checklist §3 controls decision order.
  - **React:** Prefer the Kernel query lifecycle (`useMenuQuery`, `useMenuFetch`) for data fetching; general advice such as SWR does not apply. Import `@ap/*` only from public entry points (the package-boundary rule is enforced by lint and takes precedence over advice to avoid barrels).
- Repository contracts take precedence over general skill advice: root and folder `AGENTS.md`, `docs/contract/platform-ui-contract.md`, `DESIGN.md`, and `docs/integration/platform-packages.md`. The global `shadcn` skill applies to the feature screens only. Do not use the shadcn component-add or edit workflow for the platform. Consume feature primitives only through `@ap/ui` (root `AGENTS.md` dependency direction). For a design-system violation, use the token, variant, or component named in the `@shadcn/lint` (`pnpm lint`) error.
- The issue workflow is the global `issue-wave-conductor` skill; repository rules are in `conductor/PROFILE.md`, engine settings in `conductor/conductor.json`, repository additions in `conductor/addenda/`. Models are selected by the global `orca-dispatch-recipes/routing.tsv`.
- Start screen design at `skills/analysis-platform-wireframe/SKILL.md`. The default endpoint is Wireframe + Open Decisions; continue to later stages only when implementation is requested.
- Resolve `scripts/` and `references/` inside a skill relative to the directory containing its `SKILL.md`. Run the `ui-ux-pro-max` search example from that directory: `python3 scripts/search.py "analytics dashboard" --domain product`.
- Tool names, image generation, external requests and credentials vary by environment: use the tools available and report a missing dependency.
- `references/design-md` is an external visual reference. Do not let it override product IA, permission, or Scope contracts, and do not adopt it as the repository's `DESIGN.md` without changes.
- `interface-design`, `frontend-design` and `web-design-guidelines` are parked in `.agents/skills-off/`; use the global copy of the same name or move the local one back. `ui-ux-pro-max` stays enabled but is not used until measured to find something the repo lens and `impeccable` miss.
- Some tests in imported skills require generation scripts or fixtures from the upstream repository. Do not treat them as this repository's full test suite. After moving a skill, check its links, frontmatter, execution paths, and required helper scripts.
- Git checks out symlinks as actual links in the supported environment. If links are checked out as plain text, verify symlink support before relying on client discovery.

