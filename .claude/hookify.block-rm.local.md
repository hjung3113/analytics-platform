---
name: block-rm
enabled: true
event: bash
action: block
pattern: (^|[;&|(]\s*|\bxargs\s+(-\S+\s+)*|\bsudo\s+)rm(\s|$)
---

`rm` 대신 `trash`를 쓴다(복구 가능). git 추적 파일은 `git rm --cached` 뒤 `trash`.
