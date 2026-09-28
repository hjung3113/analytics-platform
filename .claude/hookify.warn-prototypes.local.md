---
name: warn-prototypes
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: (^|/)prototypes/
---

`prototypes/`는 통합 전 Kernel 프로토타입 보존 폴더다. 새 기능을 넣지 않는다(`prototypes/AGENTS.md`).
