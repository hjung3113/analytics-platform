# AGENTS.md — analytics-platform

## 이 레포의 목적

설비관리·기준정보·생산성 분석·지표·공지·VOC 같은 메뉴를 만드는 것이 목적이 아니다. **그 메뉴들이 얹힐 플랫폼**을 만든다. 플랫폼이 제공하는 것은 아래 다섯 갈래이고, 이 레포의 메뉴 화면은 이 갈래를 검증하는 견본(Consumer)일 뿐이다. 실제 메뉴는 사내에서 새로 만든다.

| 갈래 | 내용 | 원본 |
| --- | --- | --- |
| Kernel 기능 | Menu Registry, 전역 Context, 딥링크/URL 계약, 권한·Scope, Audit | `docs/06_platform_ui_contract.md` §4–6 |
| 공통 컴포넌트 | PlatformDataTable, DetailDrawer, AuditTimeline, DataTrustIndicator 등 | §13 |
| 차트 계약 | Chart Frame + Zoom/Brush/Compare/Annotate 공통 Interaction | §16 |
| 레이아웃 | Overview/Analysis Workspace/Management/Catalog/Workflow 5개 Page Archetype | §12 |
| 메뉴간 연결 | Cross-menu Context Link, 목적지 ID와 분석 Context 분리 | §22 |

상세 원본은 `docs/06_platform_ui_contract.md`다(Platform Done §29, 공통화 기준 §24).

- 메뉴 화면은 그것이 검증하는 플랫폼 계약만큼만 손댄다. 화면 자체를 다듬지 않는다.
- 반복 패턴은 실제 소비자 2–3곳에서 확인된 뒤 공통으로 올린다(§24). Kernel 책임(§4: 계측·감사·Registry 등)은 이 기준과 무관하다.
- 메뉴 요구가 공통 계약(딥링크 키, wall-clock 시간, URL 보안 경계 등)과 충돌하면 메뉴를 계약에 맞춘다. 계약 자체를 바꿔야 하면 사용자에게 올린다.
- 메뉴 화면을 3개 이상 연속으로 새로 만들기 전에는 범위를 사용자에게 확인한다.

## 어디서 시작하나

| 알고 싶은 것 | 문서 |
| --- | --- |
| 남은 일, 다음 할 일, 결정 대기 | [`.planning/README.md`](.planning/README.md) |
| 설계·계약 문서와 작업별 읽기 경로 | [`docs/INDEX.md`](docs/INDEX.md) |
| 도메인 용어 | [`CONTEXT.md`](CONTEXT.md) |
| 시각 규칙 | [`DESIGN.md`](DESIGN.md) |
| 결정과 그 이유 | [`docs/adr/`](docs/adr/) |
| 에이전트 운영 메모(작업자 샌드박스, worktree, 캡처 함정) | [`docs/agents/operations.md`](docs/agents/operations.md) |

작업하는 폴더에 `AGENTS.md`가 있으면 함께 따른다(아래 표). 폴더 지침이 루트와 충돌하면 루트를 따른다.

## 코드

- 루트 pnpm workspace: `apps/*`, `packages/*`, `menus/*`, `tooling/*`, FeedbackOps `products/feedbackops/packages/{ui,shared}`. Node 26.7.0, pnpm 11.1.1. 명령은 루트에서 `pnpm install|dev|lint|typecheck|test|build|e2e`.
- 의존 방향은 `contracts → ui/kernel → components → shell → apps`, 역방향 import 금지(경계 lint가 강제, 원본 `docs/integration/platform-packages.md` §3). FeedbackOps primitive는 `@ap/ui`로만 소비한다.
- Kernel·공통 컴포넌트·셸은 메뉴와 mock을 모른다. 메뉴 목록은 Registry로, 서버는 `PlatformAdapter`로 앱이 주입한다.

## 검증

- 코드를 바꿨으면 커밋 전에 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`가 모두 0으로 끝나야 한다. 작업 중에는 `pnpm --filter <pkg> …`로 충분하다.
- 화면이 바뀌면 브라우저로 확인한다. Kernel·셸·공통 컴포넌트·mock 서버를 바꾸면 관련 E2E를 돌린다(`pnpm e2e`, 좁히려면 `apps/platform-e2e`에서 `pnpm exec playwright test -g "<describe>"`). CI가 전체 E2E를 다시 돌리고 항목별 보고(`apps/platform-e2e/contract-report/`)를 남긴다.
- `pnpm lint`는 디자인 시스템 규칙(`@shadcn/lint`, #228)도 검사한다. 오류 메시지가 대신 쓸 토큰·variant·컴포넌트를 알려 주니 그대로 고친다. 도입 전 위반은 패키지별 `eslint-suppressions.json`에 묶여 있다 — 고친 뒤 그 패키지에서 `eslint . --prune-suppressions`로 줄이고, 새 위반을 여기에 더하지 않는다.
- 문서만 바꿨으면 `pnpm docs:links`(문서 링크 검사)만 돌린다.
- 실행하지 않은 검증은 했다고 보고하지 않는다.

## 작업 흐름

- 기능·버그 작업은 GitHub 이슈에서 시작하고 PR 본문에 `Closes #n`을 적는다. 오타·문서 정리·작은 수정은 이슈 없이 해도 된다. 작업 중 발견한 별개의 일은 바로 하지 말고 이슈로 남긴다.
- PR은 하나씩 병합한다. 동작 버그를 고칠 때는 고치기 전에 실패하는 회귀 테스트를 함께 넣는다.
- 작업자에게 맡기는 이슈는 `.agents/skills/issue-wave-conductor/SKILL.md` 절차를 따른다(작업자 구현, 코디네이터 호스트 검증, diff에 따라 고르는 역할별 리뷰).
- 이슈별로 알려진 수정을 모두 반영한 뒤 최종 리뷰를 한 번 한다. 리뷰 지적과 코디네이터의 자체 관찰은 모두 모아 한 수정 라운드로 처리한다.
- 재리뷰는 blocker 또는 major 동작 수정(특히 권한·데이터 누출 수정) 뒤에만 한다. 문구만 바꾸거나 기계적으로 수정한 뒤에는 리뷰를 추가하지 않는다.
- 이슈가 닫히거나 상태가 바뀌면 `.planning/README.md`의 해당 줄을 같은 PR에서 고친다. 계약이 바뀌면 그 계약의 소유 문서를 고친다(소유권은 `docs/AGENTS.md`).
- 사람이 답해야 하는 결정은 `ready-for-human` 이슈로 올리고, 답 전에는 그 결정에 기대는 구현을 하지 않는다. 실제 대안 중에서 고른 결정은 `docs/adr/`에 ADR로 남긴다.

## UI는 프로토타입 컨펌 뒤 구현

보이는 모양이 바뀌는 작업(공통 부품, 셸, 레이아웃, 디자인 토큰, DESIGN.md 방향)은 실제 앱 위 `?variant=` 2–3안 인터랙티브 프로토타입(`.agents/skills/prototype/UI.md`)으로 사용자 컨펌을 받은 뒤 구현한다. 정적 이미지나 문장 설명으로 컨펌을 대신하지 않는다. 컨펌된 안이 스펙이고, 벗어나야 하면 사용자 OK를 PR 본문에 적는다. 프로토타입 코드는 버리고 결정은 이슈·ADR에 남긴다. 버그 수정과 이미 컨펌된 모양을 그대로 옮기는 작업은 해당하지 않는다.

새 화면 설계 절차(Requirements → IA → Screen Spec → Wireframe → Open Decisions)는 `.agents/skills/analysis-platform-wireframe/SKILL.md`.

## FeedbackOps 서브모듈

`products/feedbackops/`는 별도 저장소의 특정 커밋을 가리키는 독립 제품이다. 내부 작업은 그 디렉터리의 `AGENTS.md`를 따르고, 플랫폼 규칙을 소급 적용하지 않는다. 서브모듈 수정·참조 커밋 갱신은 요청받은 범위에서만 하고, gitlink를 올리면 플랫폼 lockfile도 같은 PR에서 고친다. 통합 계약이 충돌하면 한쪽을 임의로 고치지 말고 사용자에게 올린다. 절차는 `docs/integration/repository-layout.md`.

## 폴더별 지침

| 폴더 | 역할 |
| --- | --- |
| [`docs/`](docs/AGENTS.md) | 설계 계약 원본, 상태 표기·소유권 규칙 |
| [`apps/platform-web/`](apps/platform-web/AGENTS.md) | 조립 지점(GROUPS·Registry 조립, 어댑터 주입), dev 도구 |
| [`apps/platform-e2e/`](apps/platform-e2e/AGENTS.md) | 플랫폼 계약 자동 검사(Playwright, 블랙박스)와 항목별 보고 |
| [`menus/`](menus/AGENTS.md) | 메뉴 Consumer 패키지(`@ap/menu-<group>`, 그룹별 manifest·화면) |
| [`packages/`](packages/AGENTS.md) | 플랫폼 패키지 공통 규칙과 의존 방향 → 각 패키지 `AGENTS.md` |
| [`tooling/`](tooling/AGENTS.md) | 공유 tsconfig·경계 lint·메뉴 생성기(`pnpm gen:menu`)·CSS selector 비교 |
| [`prototypes/`](prototypes/AGENTS.md) | 통합 전 Kernel 단위 프로토타입(보존, 새 기능 금지) |
| [`products/feedbackops/`](products/feedbackops/AGENTS.md) | 독립 제품 서브모듈(위 경계 참조) |

## 에이전트 자산

- 지침 원본은 각 폴더의 `AGENTS.md`이고, 같은 폴더의 `CLAUDE.md`는 그 상대 심링크다. 새 폴더 지침도 `ln -s AGENTS.md CLAUDE.md`로 연결한다.
- 스킬·명령·외부 디자인 참고자료 원본은 `.agents/skills`·`.agents/commands`·`.agents/references`다(사용법 `.agents/README.md`). 외부 스킬과 참고자료는 제품 계약을 덮어쓰지 않는다.
- 이슈 트래커 설정(GitHub Issues, `area:*` 라벨, 마일스톤): `docs/agents/issue-tracker.md`. Triage 라벨 5종: `docs/agents/triage-labels.md`. 도메인 문서 구성: `docs/agents/domain.md`.
- 벤더링 스킬: `prototype`·`wayfinder`(mattpocock/skills 사본), `vercel-react-best-practices`(외부 공식 사본, 출처·우선순위는 각 `SOURCE.md`와 `.agents/README.md`). 꺼 둔 스킬(`to-tickets`·`to-spec`·`triage`·`ui-styling`, #155 전까지 `fastapi`·`supabase-postgres-best-practices`)은 `.agents/skills-off/`.
