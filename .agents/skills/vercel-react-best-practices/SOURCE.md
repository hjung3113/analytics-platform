# Source

- Source repo: https://github.com/vercel-labs/agent-skills
- Commit: `063bee94c3f4df8453406c830b0a7df0f2860278`
- Source path: `skills/react-best-practices/` (SKILL.md, AGENTS.md, README.md, metadata.json, rules/)
- License: MIT per README; the repo has no LICENSE file
- Copied: 2026-10-02

Note: the upstream `AGENTS.md` was renamed to `AGENTS.upstream.md` so agents do not treat it as folder instructions; it is otherwise unchanged.

- Local folder is `vercel-react-best-practices/` to match the SKILL.md frontmatter `name` (Agent Skills spec: name must match the directory); the upstream folder is `skills/react-best-practices/`.
- Local patch (the only content edit): `SKILL.md` line 149 "Full Compiled Document" now points to `AGENTS.upstream.md` instead of `AGENTS.md`, so an agent that loads only SKILL.md does not open the repository root `AGENTS.md`. Re-apply after re-vendoring.
- `README.md` was renamed to `README.upstream.md`: it is the upstream contributor guide (its `pnpm install`/`pnpm build` refer to upstream build scripts that are not vendored). Do not run those commands here.

Do not edit; re-vendor from upstream.
