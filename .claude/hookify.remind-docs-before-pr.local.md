---
name: remind-docs-before-pr
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: gh pr create
---

Before creating this PR: make sure related documentation (docs/, ADRs, AGENTS.md) is updated in the same PR if this change affects documented behavior or contracts.
