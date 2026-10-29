---
name: require-english-in-feature-agent-docs
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: (/memory/[^/]+\.md$|(docs/(product/features|architecture/platform-api|design/features|user-guide/features)|apps/(platform-api|feature-screens)|packages/feature-(shared|ui)|ops/platform-api)/(.*/)?(AGENTS|CLAUDE)\.md$|\.claude/rules/feature-[^/]+\.md$)
  - field: content
    operator: regex_match
    pattern: '[가-힣ᄀ-ᇿ㄰-㆏]'
---

Write this file in English. Memory files, feature AGENTS.md/CLAUDE.md, and feature-* rules are agent-facing documents and must be written in English regardless of the conversation language. Translate all quoted text, including a Korean sentence from the owner, then retry writing the same file. Do not move the note to another file such as HANDOFF.md.
