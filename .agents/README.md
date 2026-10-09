# 공통 에이전트 자산

제품 계약은 `docs/INDEX.md`에서 시작한다. 이 폴더는 에이전트 tooling이며 제품 요구사항이나 승인된 디자인 시스템이 아니다.

## 원본과 연결

| 자산 | 단일 원본 | 호환 경로 |
| --- | --- | --- |
| 프로젝트 지침 | `/AGENTS.md` | `/CLAUDE.md → AGENTS.md` |
| 스킬 | `.agents/skills/` | `.claude/skills`, `.omp/skills`, `.grok/skills`, `.opencode/skills → ../.agents/skills` |
| 리뷰어 에이전트 | `.agents/agents/` | `.claude/agents → ../.agents/agents` |
| 명령 텍스트 | `.agents/commands/` | `.claude/commands → ../.agents/commands` |
| 외부 디자인 자료 | `.agents/references/` | `.claude/references → ../.agents/references` |

모든 링크는 저장소 내부 상대 경로다. 복제본을 수정하거나 사용자 홈에 설치하지 않는다. Codex는 `.agents/skills`를 직접 탐색하므로 `.codex/skills` 복제 경로가 필요 없다. OpenCode/OMP가 공통 경로와 호환 경로를 함께 발견하더라도 같은 스킬의 별도 버전을 만들지 않는다.

## 에이전트별 사용

- Claude: `CLAUDE.md`와 `.claude/skills`를 통해 공통 원본을 읽는다.
- Codex: 루트 `AGENTS.md`와 `.agents/skills`를 사용한다. [공식 스킬 탐색 문서](https://developers.openai.com/codex/skills/).
- OMP: 루트 `AGENTS.md`와 `.omp/skills`를 사용한다. 설치된 OMP의 SDK skill discovery 문서에서 해당 경로를 확인했다.
- Grok Build: 루트 `AGENTS.md`와 `.grok/skills`를 사용한다. 설치된 CLI의 내장 Project Rules / Configuration 도움말에서 해당 경로를 확인했다.
- OpenCode: 루트 `AGENTS.md`와 `.opencode/skills`를 사용한다. `.agents/skills`도 공식 지원 경로다. [공식 문서](https://opencode.ai/docs/skills/).

탐색이 비활성화되거나 오래된 클라이언트에서는 `.agents/skills/<name>/SKILL.md`를 직접 읽도록 요청한다. `commands/*.md`는 모든 에이전트가 직접 읽어 실행할 수 있는 공통 절차이며, Claude 외 CLI의 slash command 등록을 보장하지 않는다.

## 실행·유지보수

- 작업 관리·프로토타입 스킬(`prototype`, `wayfinder`)은 FeedbackOps에 벤더링된 `mattpocock/skills` 복사본이다. `to-tickets`·`to-spec`·`triage`는 꺼서 `.agents/skills-off/`에 두었다. 이슈 추적 설정은 `docs/agents/`. UI 방향은 `prototype` 스킬의 UI 분기로 사용자 컨펌을 받는다(루트 `AGENTS.md` "UI는 프로토타입 컨펌 뒤 구현").
- 외부 공식 스킬 3종을 벤더링했다(`fastapi`·`supabase-postgres-best-practices`는 #155 착수 전까지 `.agents/skills-off/`에 꺼 둠, #162, 원본 그대로(이름 변경·로컬 패치는 각 `SOURCE.md`) — 출처·커밋 SHA·라이선스도 각 폴더 `SOURCE.md`, MIT 고지는 fastapi·supabase는 `LICENSE.upstream`, vercel은 upstream에 LICENSE 파일이 없어 `SOURCE.md`에 기록). `fastapi`는 사내 FastAPI 서버(#155)의 조회·검증·응답 모델에, `supabase-postgres-best-practices`는 플랫폼 스키마·mart SQL의 인덱스·쿼리·연결 관리에(자체 호스팅 Postgres 일반 조언으로만 — Supabase 도입이 아니다), `vercel-react-best-practices`는 요청 지연·렌더링·번들에 쓴다(Next.js 전용 규칙은 이 Vite SPA에 해당 없음).
  - 외부 스킬은 제품 계약과 저장소 규칙을 덮어쓰지 않는다 — 루트·폴더 `AGENTS.md`, `docs/03_backend_stack.md`(SQL-first·시간), `docs/06_platform_ui_contract.md`, `docs/integration/platform-packages.md`(패키지 경계), `docs/integration/real-server-checklist.md`. 충돌하면 이쪽을 따른다. 자주 부딪히는 곳:
    - **시간:** Postgres 스킬의 "항상 `timestamptz`"는 실제 시점(감사·활용률·오류 보고)에만. 설비 업무 시각은 `timestamp without time zone`(naive wall-clock, UTC로 옮기지 않음 — 03 시간 계약, 06 §6.3).
    - **SQL과 스키마:** ORM(SQLModel 등)보다 mart SQL(03 SQL-first). 파서 원천 스키마는 read-only — 인덱스·제약은 플랫폼 스키마에만.
    - **권한:** RLS 정책·`auth.uid()` 같은 Supabase 인증 패턴을 쓰지 않는다. 권한·Scope는 FastAPI가 매 요청 서버 판정(체크리스트 §3, room 부여는 메타 DB — #98).
    - **FastAPI 기본값:** 요청 모델은 모르는 키를 거부(`extra='forbid'`)하고, 검증 실패를 FastAPI 기본 422 본문 그대로 두지 않는다 — 어댑터가 받는 결과는 envelope `error`다(체크리스트 §2). HTTP 상태 코드와 `outcome`의 대응은 #149에서 정한다. 판정 순서는 체크리스트 §3가 우선.
    - **React:** 데이터 조회는 Kernel 조회 수명주기(`useMenuQuery`·`useMenuFetch`)가 우선 — SWR 등 일반 fetching 조언은 해당 없음. `@ap/*`는 공개 진입점만 import(barrel 회피 조언보다 패키지 경계 규칙이 우선, lint 강제).
- FeedbackOps에서 온 스킬 5종과 에이전트 4개(#283, 2026-10-10, FeedbackOps `9a20da18` — 각 폴더 `SOURCE.md` 참조): 스킬 `diagnosing-bugs`·`codebase-design`·`research`·`shadcn`·`impeccable`, 에이전트 `agents/impeccable-asset-producer.md`·`impeccable-documenter.md`·`impeccable-finish-reviewer.md`·`impeccable-manual-edit-applier.md`. FeedbackOps 전용 경로·명령(`.claude/skills/impeccable/scripts/impeccable`의 엔진 바이너리 등)은 원본 그대로다 — 이 레포에서도 `.claude/skills → ../.agents/skills` 링크로 그대로 풀린다.
- 이 레포에서는 계약이 스킬의 일반 조언보다 우선이다: 루트·폴더 `AGENTS.md`, `docs/06_platform_ui_contract.md`, `DESIGN.md`, `docs/integration/platform-packages.md`. 특히 `shadcn` 스킬의 컴포넌트 추가·수정 흐름은 이 레포에 그대로 쓰지 않는다 — FeedbackOps primitive는 `@ap/ui`로만 소비하고(루트 `AGENTS.md` 의존 방향), 디자인 시스템 위반은 `@shadcn/lint`(`pnpm lint`) 오류 메시지가 알려 주는 토큰·variant·컴포넌트로 고친다.
- 이슈 처리 흐름(작업자 구현 → 코디네이터 호스트 검증 → 역할별 리뷰 → 병합)은 `skills/issue-wave-conductor/SKILL.md`다(FeedbackOps에서 옮김, #255; conductor 4커밋 반영 #283). 리뷰어 역할 `review-ux`·`review-quality`의 지침은 `agents/`, 코드 리뷰어·구현 작업자 규칙은 `docs/agents/templates/`. 모델은 전역 `orca-dispatch-recipes/routing.tsv`가 정한다.
- 화면 설계 진입점은 `skills/analysis-platform-wireframe/SKILL.md`다. 기본 종료점은 Wireframe + Open Decisions이며 구현 요청이 있을 때 후속 단계를 진행한다.
- 스킬 안의 `scripts/`, `references/`는 그 `SKILL.md`가 있는 디렉터리를 기준으로 해석한다. `ui-ux-pro-max`의 검색 예제는 해당 디렉터리에서 실행한다: `python3 scripts/search.py "analytics dashboard" --domain product`.
- 도구 이름·이미지 생성·외부 요청·자격 증명은 실행 환경에 따라 다르다. 현재 사용 가능한 도구로 대응하고, 필요한 의존성이 없으면 해당 작업의 제한을 보고한다. 경로 공유가 모든 외부 기능의 실행 검증을 뜻하지 않는다.
- `references/design-md`는 외부 시각 참고자료다. 제품의 IA/권한/Scope 계약을 덮어쓰거나 자체 `DESIGN.md`로 그대로 채택하지 않는다.
- `frontend-design`, `web-design-guidelines`를 포함해 후속 단계에서 참조하는 스킬은 저장소에 포함되어 있다.
- 가져온 스킬의 일부 테스트는 원본 배포 저장소의 생성 스크립트/fixture를 요구한다. 이 저장소의 전체 테스트 스위트로 간주하지 않는다. 이동 후에는 링크 해석, 스킬 frontmatter, 실행 경로 및 필요한 보조 스크립트를 확인한다.
- Git이 심링크를 실제 링크로 체크아웃하는 환경을 사용한다. 링크가 일반 텍스트로 체크아웃된 환경에서는 클라이언트 탐색을 사용하기 전에 심링크 지원을 확인한다.
