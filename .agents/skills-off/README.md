# 꺼 둔 스킬

여기 있는 스킬은 로딩 경로(`.agents/skills`, `.claude/skills` 심링크) 밖에 보관한다. 지우지 않았고, 다시 쓰려면 `git mv .agents/skills-off/<name> .agents/skills/`로 되돌린다.

근거: 2026-09-28..10-05 세션 분석에서 명시적 호출 0회(`.review/skill-candidates-sol.md`). 다른 스킬·문서가 호출하는 후보(`frontend-design`, `design-deslop`·`design-review` 명령)는 끄지 않았다. 2026-10-15에 `to-spec`·`to-tickets`·`triage`는 전역으로 옮기고 `ui-styling`은 지웠다.

| 스킬 | 메모 |
| --- | --- |
| `fastapi`, `supabase-postgres-best-practices` | 외부 공식 사본(#162). **#155(사내 FastAPI 서버) 착수 때 다시 켠다.** |
