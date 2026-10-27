---
name: warn-prototypes
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: (^|/)archive/
---

`archive/` preserves pre-integration Kernel prototypes. Do not add new features (`archive/AGENTS.md`).
