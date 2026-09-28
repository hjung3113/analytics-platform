---
name: block-push-main
enabled: true
event: bash
action: block
pattern: git\s+push\b.*\s(origin\s+)?(HEAD:)?(refs/heads/)?main\b
---

main에 직접 push하지 않는다. 브랜치를 만들어 PR로 올린다(루트 `AGENTS.md` "작업 관리").
