# Gate Scripts Agent Guide

Frontend and migration gates. Root `AGENTS.md` owns verification sizing; feature-specific gates are in `docs/agents/feature-implementation.md` → Verification; CI runs these through `ops/platform-api/scripts/ci/gate.sh`. The platform wave verifies through `$LANES/verify-root.sh` and PR CI. `ops/platform-api/conductor/scripts/verify-fe.sh` and `verify-be.sh` belong to the standalone FeedbackOps flow (Node 22 path, `origin/develop` base) and fail here; see `.planning/backlog.md`.

## Frontend typecheck gate (`pnpm --filter @ap/platform-api-ops gate:fe-typecheck`)

- Vitest green does not mean type-green; run this gate separately.

## Frontend Biome gate (`pnpm --filter @ap/platform-api-ops gate:fe-lint`)

- Run `fe-biome-gate.mjs` from the repository root.
- It diffs committed history, not the working tree. Commit first, then run it; before a commit it reports a false pass.
  - A stale base in a worktree scans unrelated commits. Symptom: diagnostics on files you never touched, or "no biome-checkable files changed" when you did change `.ts`/`.tsx` files — diagnose by comparing `git rev-parse origin/main` with `git merge-base HEAD origin/main`.
- To prove a reported "NEW" identity already exists on `main`, check `main`'s content at the real path (swap the file in with `git show origin/main:<repo-relative path>`, run `biome check --reporter=json --max-diagnostics=500 <path>`, swap back). A copy under a different filename under-reports lint diagnostics.
- Allowlist lines name every file by its repository-root path (historical prototype paths retain their existing lint coverage). Update `frontend-typecheck-baseline.txt`, or add a line to `frontend-biome-allowlist.txt`, only when the existing diagnostic is intentionally accepted and documented in review.
- An allowlist line is `<repo-relative-path> <biome-category> -- <reason>`; each path carries its own lines, and a split file needs a new line for each category.
- Biome is not part of `pnpm typecheck` or any other gate, and a whole-repo `biome check` count is not a usable oracle. When fixing only import order in an existing file, use `biome check --write --formatter-enabled=false --linter-enabled=false <file>` so nothing else is reformatted.

## Design-system lint (ESLint, `pnpm --filter @ap/feature-screens lint`)

- `no-restyle` lets screens add layout classes by default. Its named container contract also permits spacing on `Card`, `EmptyState`, `PanelTitleBlock`, `ListToolbar`, and matching content/header/footer/group/panel/list/section-title components. The last matching contract wins.
- Controls that own their internal spacing (`TabsList`, `ToggleGroup`, `RadioGroup`, `DialogFooter`, `AlertDialogFooter`, `TooltipContent`, `SelectContent`, `DropdownMenuContent`, `DropdownMenuSubContent`, `PopoverContent`, and `HoverCardContent`) have a later contract that permits layout only.
- Use the control's existing spacing, padding, or size variant; add a variant to the control when a treatment repeats (the #783 pattern, e.g. `PopoverContent padding`, `RadioGroup spacing`); or move the spacing to a wrapper. `DetailPanelHeader`, `ShellHeader`, and `ListToolbar` keep their `h-*`, `min-h-*`, `max-h-*`, and `size-*` denial for the FO ADR-0020 50px rhythm.
- `packages/feature/screens/components.json` points the linter at `packages/feature/screens/src/styles.css`; without it, theme utilities such as `h-toolbar` read as unknown classes. They are not shadcn CLI configs.
- Messages suggest a variant, scale value, or token; they are hints, not an equivalence oracle (the theme's self-referencing aliases can make the "nearest" size wrong). Check the component API, the computed value, and line-height before applying one.

- Treat a failure as a real history problem. Migration traps: `.claude/rules/feature-db-migrations.md` at the platform root; the journal-registration rule: `apps/platform-api/AGENTS.md`.

## Other per-path allowlists

`packages/feature/screens/src/lib/api/api-unparsed-allowlist.txt` (`<path> <unparsed apiClient call count>`, checked by `unparsed-endpoints.test.ts`) is separate from the Biome gate. When a screen split moves `apiClient` calls to another file, move its allowlist entry with them.
