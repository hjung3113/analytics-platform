---
name: korean-humanizer
description: 'AI가 쓴 티가 나는 한국어 글을 자연스러운 사람 글로 고친다. 번역체, AI 상투어, 과도한 명사화·피동, 3의 법칙, 과장된 의의 부여, 마무리 상투구, 챗봇 잔재, 줄표·곡선따옴표 같은 한국어 특유의 AI 흔적을 심각도(S1/S2/S3)로 분류해 잡아내고 의미는 보존하면서 다시 쓴다. 목표 글자수를 함께 주면(예: "1000자로", length=1000) 그 분량에 맞춰 늘리거나 줄인다. "AI 티 안 나게", "사람이 쓴 것처럼", "자연스럽게 다듬어줘", "번역체 고쳐줘", "어색한 거 고쳐줘", "N자로 맞춰서" 같은 요청에 사용.'
license: MIT
---

# korean-humanizer

Read [instruction.md](instruction.md) and follow it as the primary instructions. The full 60+ pattern table is [references/ai-tell-taxonomy.md](references/ai-tell-taxonomy.md); where `instruction.md` says to run `npx … read korean-humanizer references/ai-tell-taxonomy.md`, read that local file instead. Do not run the `@nomadamas/k-skill` CLI.

For review without rewriting (detect only), run steps 0–1 of the procedure and report each trace as span · pattern ID · severity · fix in a few words.

In this repository, `site/AGENTS.md` and `site/SOURCES.md` take precedence: keep every fact, number and ledger correspondence, and keep the site's 개조식/`~합니다` style split.
