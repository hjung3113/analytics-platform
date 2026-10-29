---
name: copy-plain-ko
description: Audit and rewrite Korean product/intro-site copy so it reads as written by a person, not an LLM, and uses 개조식 (terse noun-ending lines) where site/AGENTS.md allows it. Use when asked to check copy for "AI 티", "GPT 말투", "번역투", "문구 검사", "카피 리뷰", "개조식으로", "서술형 줄이기", or a "copy audit" of site/*.html, menu labels, or release notes.
---

# Plain Korean copy (AI 티 제거 · 개조식)

Owner's bar: "AI 티 안 나게", "너무 서술형보다는 딱 목적만 전하는 어투". The audit finds every tell below, the rewrite keeps every fact, number and `SOURCES.md` correspondence unchanged.

## Scope and the style split

`site/AGENTS.md` owns the site copy rules; this skill applies them. Do not change that file from here.

| Copy slot | Target style | Example |
| --- | --- | --- |
| Headings, card titles, diagram labels, TOC rows, status chips, captions, eyebrow/overline, section leads | **개조식**: noun or noun-phrase ending, one fact per line, key noun first, no particles/connectives that a reader can infer | `공통 기반 공유` · `조건 유지 · 메뉴 전환 후에도` · `패널만 꺼내기 아직 안 됨 → 예정 #575` |
| Behavior, accuracy, constraint and "how it works" sentences; `glossary.html` definitions | short factual `~합니다` sentence, one clause each (site/AGENTS.md) | `조건을 한 번 고르면 다른 메뉴로 가도 유지됩니다.` |
| Status of unsupported things | `아직 안 됨 → 예정 #n` (site/AGENTS.md) | — |

개조식 means the whole line becomes a noun phrase (`구매 전환율 하락`), not a `~합니다` sentence with the ending swapped to `~함` (`구매 전환율이 감소함`). Keep `~함/~임` only when the noun phrase would lose a time, size or comparison basis. Names on screen are `GLOSSARY.md` names.

## Checklist of tells

Each entry: pattern → Korean before → after. Flag by number in the report.

1. **Contrast rhetoric** `단순히 A가 아니라 B` / `A뿐만 아니라 B` / `A를 넘어 B` (negative parallelism, #607). `단순한 조회가 아니라 분석의 시작입니다` → `조건을 고르면 다음 메뉴에서도 유지됩니다`.
2. **Rule of three** adjective or phrase triads that pad: `빠르고, 안전하고, 유연한` → name the one measurable property, or list the actual items with their count (`메뉴 4개`).
3. **Summary/closing formulas** `결론적으로`, `종합하면`, `핵심은 ~입니다`, `즉`, `이처럼`, a last sentence restating the paragraph → delete the sentence.
4. **Stock openers and reader address** `~에 대해 알아보겠습니다`, `여러분`, `~해 보세요`, `~하시길 권합니다`, `도움이 되셨길` → delete; start with the fact.
5. **Promotional adjectives and metaphors** `혁신적인`, `강력한`, `획기적인`, `완벽한`, `손쉽게`, `척척`, `한 단계 위의`, `~를 변신시킵니다` → the concrete behavior: `비약적인 성능 개선` → `응답 1.2초 → 0.4초(측정 조건 L##)`.
6. **Inflated significance / participial tails** `~하는 데 핵심적인 역할을 합니다`, `~를 보여 줍니다`, `~를 강조합니다`, `~의 기반이 됩니다` → state what it does: `이 값이 기준입니다`.
7. **Copula avoidance** `~로 기능합니다`, `~를 제공합니다`, `~를 지원합니다`, `~를 가지고 있습니다` when `~입니다`/`~있습니다`/a noun phrase says it → `공유 기능을 제공합니다` → `링크 공유` (heading) / `링크에 조건이 들어갑니다` (body).
8. **Connective overuse** `또한`, `게다가`, `더욱이`, `나아가`, `결과적으로`, `따라서` at sentence starts → delete; let line order carry the link.
9. **Repeated modal ending** `~할 수 있습니다` in consecutive lines → noun phrase in headings (`칸 최대화`), plain present in body (`칸을 최대화합니다`). Keep `~할 수 있습니다` only where possibility vs. done matters.
10. **Translation-ese postpositions** `~을 통해` → `~으로`; `~에 있어서` → `~에서`/`~할 때`; `~에 대한 분석` → `~를 분석`; `~에 의해` → agent as subject (`알고리즘이 순위를 정합니다`); `~에도 불구하고` → `~는데도`; `~에 위치해` → `~에 있어`.
11. **Passive and double passive** `보여집니다`, `되어집니다`, `~로 확인되었습니다`, `~로 판단됩니다` → active or intransitive: `결과는 대시보드에 나옵니다`.
12. **Nominalization chains** `~의 ~에 대한 ~` and `~하는 것을 돕습니다` → verb or single noun: `방문자가 이해하는 것을 돕습니다` → `방문자가 이해하기 쉬워집니다`; `인프라에의 투자` → `인프라 투자`.
13. **Vague quantifiers and hedges** `다양한`, `여러 가지`, `효율적으로`, `원활하게`, `적절히`, `~ 중 하나` → the count or the named items: `다양한 차트` → `차트 3종: 막대·선·히트맵`; `가장 흔한 실수 중 하나` → `흔한 실수`.
14. **Possible written as done** `회의 시간이 줄었습니다` with no measurement → `회의록 정리 시간을 줄일 수 있습니다`, or cite the `SOURCES.md` row.
15. **Punctuation and markup habits** spaced em dash ` — ` as a connective, colon-led inline headers (`**이름:** 설명`), bold on every line, emoji → plain `·` separators, one heading level, no inline bold in body copy.
16. **Metronome rhythm** every sentence the same length and ending (`~합니다. ~합니다. ~합니다.`) → merge into one 개조식 line or vary clause length; in 개조식 blocks keep parallel items in the same grammatical shape (`한국: 증가 / 일본: 정체`).
17. **Unit-less compression and odd metaphors** `세 지식`, `두 축으로`, `첫 자리`, `떠받칩니다` → `세 가지`, `두 기준`, `첫 화면`, plain verb.
18. **Vague attribution** `전문가들은`, `많은 사용자가` without a source → delete or cite the row.
19. **Technology name instead of the user's gain** (site/AGENTS.md) `Dockview 기반 레이아웃` → `칸을 끌어서 붙이고 탭으로 겹치기`.

Tells 1–5 and 13 are the ones readers name first as "AI 티"; a single hit of 8–12 is weak evidence alone, so weigh clusters, not isolated words.

## Procedure

1. **Extract** copy by section: for `site/index.html` walk `<h1-3>`, `<p>`, card/label/caption elements, the `<template id="demo-step-copy">` block, `aria-label`s and `alt`s. Record location as `file:line` plus the element id or nearest heading. Skip code names allowed by `check-assembled.mjs`.
2. **Classify each line** into a copy slot from the style split table. That decides the target (개조식 vs `~합니다`).
3. **Flag** every tell with its number. One line can carry several flags; list all.
4. **Rewrite** per flagged line. Keep every fact, number, issue number, GLOSSARY name and `SOURCES.md` row unchanged; if a rewrite would drop a time/size/comparison basis, keep the basis and the longer form. Never introduce a new claim (that needs a ledger row first).
5. **Re-read the rewrite against the checklist** once more: the fix must not add a new tell (a terse noun run that drops units, a `~함` ending that only swaps the suffix).
6. **Report** in the format below, then apply edits only when asked or when the task brief includes the rewrite. After editing, run `node site/scripts/assemble.mjs …` and `check-assembled.mjs` per site/AGENTS.md.

Done when every extracted line has a slot, every flagged line has a rewrite, and the report's `After` column contains zero checklist hits.

## Audit report format

```
| ID | Location | Slot | Tell # | Before | After |
| --- | --- | --- | --- | --- | --- |
| C01 | site/index.html:72 #p1053-a-heading | heading | 1, 9 | 단순한 통합이 아니라 … 할 수 있습니다 | 여러 업무 시스템을 하나의 플랫폼에 연결 |
```

- `ID` is `C` + two digits, in document order; `Slot` is `heading` / `card` / `label` / `caption` / `status` / `lead` / `body` / `glossary`.
- A line with no tell is omitted; a section with no findings is listed once as `(section) — no findings`.
- Close with counts per tell number and the three most frequent, so the next rewrite round knows where to look.

Sources and the evidence weight of each tell: [`SOURCES.md`](SOURCES.md).
