---
name: ap-sdk-consumer
description: Finds and reuses public platform SDK pieces (`@ap/*`) for menu work. Use when adding or changing a screen under `menus/` or `platform/`, or when a table, chart, filter, layout, detail drawer, query, Context, permission or loading state is needed and the SDK may already have it.
---

# Use the platform SDK from a menu

Reuse a public piece before writing one. The menu declares what differs; the SDK acts on it.

1. **Find.** Look up the need in [intents.md](intents.md). If no row fits, search the public surface: `rg -i '<word>' tooling/sdk/api/*.root.api.txt`.
2. **Confirm.** Read the signature in the snapshot, and follow any `@ap/<pkg>#Type` it mentions the same way:
   `rg '^PlatformDataTable' tooling/sdk/api/components.root.api.txt`
   Read the linked contract section. For usage, read a menu that already uses it: `rg -l '<Name>' menus platform`. SDK tests use relative imports, so never copy their imports.
3. **Import only what a menu may.** Menus import the package entries of `@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui`, and `@ap/ui/theme`. Never import a deep `src/` path, `@ap/shell`, `@ap/kernel/host`, `@ap/components/dock`, `@radix-ui/*`, `dockview*`, or the table and query engines. `*/testing` entries are for tests only.
4. **New menu package.** Generate it; do not write the wiring by hand: `pnpm gen:menu <group> --dry-run`, then without `--dry-run`.
5. **Context.** A screen reads the Context its queries see with `useQueryContext`. The keys an endpoint applies are declared in `defineEndpoint` and projected by `projectContext`. There is no panel Context API yet: do not invent one.
6. **No piece fits.** Do not copy SDK internals or rebuild a near match. Keep the code in the menu and report the gap; the promotion rule is in the root `AGENTS.md`.
7. **Verify by running.** Say a check passed only after it exited 0:
   `pnpm --config.verify-deps-before-run=false --filter <menu package> run lint`, then `run typecheck`. Follow the root `AGENTS.md` for tests and browser checks.

The API snapshots show public names and types only. They do not tell you a piece is right for the screen: the contract section does.
