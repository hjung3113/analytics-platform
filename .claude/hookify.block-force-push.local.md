---
name: block-force-push
enabled: true
event: bash
action: block
pattern: git\s+push\b.*(--force\b|--force-with-lease|\s-f\b)
---

force push는 막혀 있다. 사용자가 명시적으로 요청했다면 사용자에게 `! git push --force-with-lease …`로 직접 실행해 달라고 한다.
