## analytics-platform addendum (AP addendum)

AP overrides and additions to the numbered rules above. The stricter rule wins.

- Stricter than rule 1: no `git` at all, not even reads. A blocked command is not retried; report it and stop.
- Do not revisit coordinator decisions marked "final — do not re-litigate" in the task file.
- Read first: root `AGENTS.md`, the `AGENTS.md` of the folder being changed, and the contracts the task names (06 sections, ADRs).
- Package checks: `pnpm --config.verify-deps-before-run=false --filter <pkg> run <lint|typecheck|test>`. Docs-only changes: `node .github/scripts/check-doc-links.mjs`; a "target exists locally but is not tracked by git" report for a new document is not a failure, only report it.
- No root `pnpm test`, `build`, `e2e`, dev servers or browsers (16 GB machine). If E2E tests are added or changed, report that they could not be run.
  - Exception, `site/` work: run the demo build, capture scripts (`shots.mjs`, `shots-real.mjs`), static server and real-server-mode dev server (captures and `check-assembled.mjs --browser` are acceptance criteria), then shut every server down. `assemble.mjs` writes inside the repository only to `_site/`, so assemble review previews outside it with `--site-base /analytics-platform/` and copy them into `.review/`.
- UI copy reuses the i18n dictionary and the screen's existing wording; domain terms follow `GLOSSARY.md`.
- The report also lists **host-only verification** (what the conductor must run).
