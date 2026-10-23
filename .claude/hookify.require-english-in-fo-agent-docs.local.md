---
name: require-english-in-fo-agent-docs
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: (/memory/[^/]+\.md$|products/feedbackops/(.*/)?(AGENTS|CLAUDE)\.md$|\.claude/rules/fo-[^/]+\.md$)
  - field: content
    operator: regex_match
    pattern: '[가-힣ᄀ-ᇿ㄰-㆏]'
---

Write this file in English. Memory files, FeedbackOps AGENTS.md/CLAUDE.md and the fo-* rules are agent-facing docs and must be written in English regardless of the conversation language (user directive, 2026-09-27). Translate any quote (including an owner's Korean sentence) into English and retry the write to the same file; do not move the note to another file such as HANDOFF.md.
