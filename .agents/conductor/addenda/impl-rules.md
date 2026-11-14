## analytics-platform addendum (AP addendum)

AP overrides and additions to the numbered rules above. The stricter rule wins.

- Stricter than rule 1: no `git` at all, not even reads. A blocked command is not retried; report it and stop.
- Do not revisit coordinator decisions marked "final — do not re-litigate" in the task file.
- Package checks: `pnpm --config.verify-deps-before-run=false --filter <pkg> run <lint|typecheck|test>`. Docs-only changes: `node .github/scripts/check-doc-links.mjs`; a "target exists locally but is not tracked by git" report for a new document is not a failure, only report it.
- No root `pnpm test`, `build`, `e2e`, dev servers or browsers (16 GB machine). If E2E tests are added or changed, report that they could not be run.
  - Exception, `site/` work: run the demo build, capture scripts (`shots.mjs`, `shots-real.mjs`), static server and real-server-mode dev server (captures and `check-assembled.mjs --browser` are acceptance criteria), then shut every server down. `assemble.mjs` writes inside the repository only to `_site/`, so assemble review previews outside it with `--site-base /analytics-platform/` and copy them into `.review/`.
- UI copy comes from the i18n dictionary or the package's messages file, never a `lang === 'ko' ? … : …` ternary; domain terms follow `GLOSSARY.md`.
- **Quality — the failures reviewers keep finding** (rule, then reason):
  - Key every cache, draft, subscription and in-memory copy by session, Scope and generation, and clear it when they change; stale state across sessions and tabs is the most common review finding.
  - Never cap, drop or substitute data silently; a missing, partial or failed result shows as such (DataTrustIndicator, error state), never as a shorter or empty list.
  - One place per rule, list or state union; when two places must agree, import the one definition or add a test that compares them, because hand-copied lists drift; a predicate written twice (`ok || empty`) gets a name next to the type it tests.
  - Before writing a table, picker, formatter, drill or helper, search `@ap/*` (`.agents/skills/ap-sdk-consumer`); if the SDK lacks the general piece, report it instead of patching the menu, because menus patching around the SDK is the costliest miss.
  - Permission and Scope hold on every read path the change opens (list, detail, export, cached replay, audit), not only the one the issue names.
  - Validate URL, query and response values before they become a path, key or request, and guard environment APIs (clipboard, randomUUID, secure context), because these failed in several areas at once.
  - A `catch` that returns a default names why in a comment and surfaces the failure where the user would otherwise be misled; an error is not a value.
  - No ternary inside a ternary branch and no bare `true`/`false` as a positional argument: name the branch (const, `switch`, lookup map) and pass `{ enabled }`, because a reader must not decode a line.
  - A value with three meanings (undefined/null/object), or a state spread over two or more booleans or refs, is a named union whose legal transitions sit in one `switch` or table, not in comments.
  - Give a number that is not obvious (timeouts, limits, positions such as `parts[2]`) a named constant next to its use, because a bare number hides its meaning from the next reader.
- The report also lists **host-only verification** (what the conductor must run).
