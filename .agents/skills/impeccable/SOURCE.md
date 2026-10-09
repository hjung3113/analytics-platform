# Source

- Source repo: `hjung3113/FeedbackOps`
- FeedbackOps commit: `9a20da1843971d4fe923fa3bfd8ed0a5c35fa203`, path `.claude/skills/impeccable/` (a real directory there, not a symlink; VERSION 0.1.5)
- Upstream: installed into FeedbackOps via `npx impeccable install --providers=claude --scope=project`; the engine binary (`scripts/bin/`) is gitignored there and downloads on first run. FeedbackOps disables its edit/stop hooks in `.claude/settings.local.json`.
- Copied: 2026-10-10 (#283)
- Local patch: none

FeedbackOps-specific bits stay as-is: `scripts/impeccable*` expect the `scripts/bin/` engine (not vendored — first run downloads it), and its companion agents live in this repo at `.agents/agents/impeccable-*.md`. This repo has no `.claude/settings.local.json` hook config; enable hooks only if a task needs them.

Do not edit; re-vendor from FeedbackOps (`npx impeccable update` there, then re-copy).
