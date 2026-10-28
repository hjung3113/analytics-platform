---
name: require-english-in-fo-agent-docs
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: (/memory/[^/]+\.md$|(docs/feedbackops|apps/(platform-api|feature-screens)|packages/feature-(shared|ui)|ops/platform-api)/(.*/)?(AGENTS|CLAUDE)\.md$|\.claude/rules/fo-[^/]+\.md$)
  - field: content
    operator: regex_match
    pattern: '[가-힣ᄀ-ᇿ㄰-㆏]'
---

Write this file in English. Memory files, FeedbackOps AGENTS.md/CLAUDE.md, and fo-* rules are agent-facing documents and must be written in English regardless of the conversation language. Translate all quoted text, including a Korean sentence from the owner, then retry writing the same file. Do not move the note to another file such as HANDOFF.md.
