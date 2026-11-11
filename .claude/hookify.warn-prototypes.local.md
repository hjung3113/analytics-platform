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

`archive/` holds read-only records. Do not add anything here (`archive/AGENTS.md`).
