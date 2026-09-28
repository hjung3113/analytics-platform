---
name: block-openrouter-model
enabled: true
event: bash
action: block
pattern: \bomp\b.*(--model|-m)[=\s]+[A-Za-z0-9._-]+/
---

omp에서 `vendor/model` 형태의 id(예: `z-ai/glm-…`)는 OpenRouter를 경유한다. OpenRouter는 쓰지 않는다. 직접 공급자 id를 쓴다(예: `--model glm-5.3-flash`).
