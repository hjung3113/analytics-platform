---
name: warn-feedbackops-submodule
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: products/feedbackops/
---

`products/feedbackops/`는 독립 제품 서브모듈이다. 사용자가 요청한 범위에서만 고치고, 원본 기능 개발은 FeedbackOps 저장소에서 한다(루트 `AGENTS.md` "FeedbackOps 서브모듈 경계").
