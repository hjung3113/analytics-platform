# Source

- Source repo: https://github.com/NomaDamas/k-skill
- Commit: `c91382e1c75eb9c5ec0f0d9c5118691cf6079ea0`
- Source path: `korean-humanizer/` (instruction.md, skill.json, references/ai-tell-taxonomy.md copied unchanged)
- License: MIT (repository license and skill frontmatter)
- Copied: 2026-11-01

Local patch (the only content edit): upstream `SKILL.md` is a generated stub whose first step runs `npx -y @nomadamas/k-skill@0 instruct korean-humanizer`, which downloads and runs an external package each time. The local `SKILL.md` keeps the upstream `name` and `description` and points to the vendored `instruction.md` and reference instead. Re-apply after re-vendoring.

Do not edit the other files; re-vendor from upstream.
