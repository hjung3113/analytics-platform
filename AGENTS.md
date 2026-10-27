# AGENTS.md — analytics-platform

## 이 레포의 목적

설비관리·기준정보·생산성 분석·지표·공지·VOC 같은 메뉴를 만드는 것이 목적이 아니다. **그 메뉴들이 얹힐 플랫폼**을 만든다. 플랫폼이 제공하는 것은 아래 다섯 갈래이고, 이 레포의 메뉴 화면은 이 갈래를 검증하는 견본(Consumer)일 뿐이다. 실제 메뉴는 사내에서 새로 만든다.

| 갈래 | 내용 | 원본 |
| --- | --- | --- |
| Kernel 기능 | Menu Registry, 전역 Context, 딥링크/URL 계약, 권한·Scope, Audit | `docs/contract/kernel.md` §4–6 |
| 공통 컴포넌트 | PlatformDataTable, DetailDrawer, AuditTimeline, DataTrustIndicator 등 | `docs/contract/components.md` §13 |
| 차트 계약 | Chart Frame + Zoom/Brush/Compare/Annotate 공통 Interaction | `docs/contract/chart.md` §16 |
| 레이아웃 | Overview/Analysis Workspace/Management/Catalog/Workflow 5개 Page Archetype | `docs/contract/layout.md` §12 |
| 메뉴간 연결 | Cross-menu Context Link, 목적지 ID와 분석 Context 분리 | `docs/contract/cross-menu-links.md` §22 |

상세 원본은 `docs/contract/platform-ui-contract.md`(색인)와 그 「절 → 문서」 대응표가 가리키는 갈래별 문서다(Platform Done §29, 공통화 기준 §24).

**SDK는 범용 조각을 준다.** 요구가 오면 그 메뉴 하나를 완성하는 부품을 찾는 대신, 그 기능과 다음 비슷한 기능을 메뉴가 직접 조립할 수 있는 **범용 조각**을 찾는다. 기준은 크기가 아니라 다른 메뉴도 그대로 쓸 수 있느냐다 — 범용이면 복잡한 기능도 SDK가 통째로 제공한다(승격 기준은 아래 목록). 위계와 단계 수, 줄 이름, 내려가는 조작(클릭·더블클릭·버튼)처럼 메뉴마다 다른 것은 메뉴가 선언하고, SDK는 그 선언을 받아 동작한다. SDK가 거는 제약(상한, 고정된 조작, 하나만 고르는 정책)은 보안·데이터 정합성·접근성 같은 이유가 있을 때만 두고 그 이유를 계약에 적는다. 요구 문장의 도메인 용어는 `GLOSSARY.md`로 확인한 뒤 조각으로 옮긴다. 예: HWTime3의 설비 → 설비-모듈 → 동작 드릴은 "메뉴가 선언한 단계대로 드릴"과 "가로 막대의 범주 줄" 두 조각으로 조립한다(#541, 사용자 2026-10-21).

- 메뉴 화면은 그것이 검증하는 플랫폼 계약만큼만 손댄다. 화면 자체를 다듬지 않는다.
- 승격 기준은 하나다. 도메인을 모르는 범용 조각은 소비자 수와 관계없이 SDK에 둔다([ADR-0052](docs/adr/0052-rich-content-stays-in-the-sdk.md)). 메뉴 안에서 생긴 패턴은 실제 소비자 2–3곳에서 확인된 뒤 공통으로 올린다(§24). Kernel 책임(§4: 계측·감사·Registry 등)은 이 기준과 무관하다.
- 메뉴 요구가 공통 계약(딥링크 키, wall-clock 시간, URL 보안 경계 등)과 충돌하면 메뉴를 계약에 맞춘다. 계약 자체를 바꿔야 하면 사용자에게 올린다.
- 메뉴 화면을 3개 이상 연속으로 새로 만들기 전에는 범위를 사용자에게 확인한다.

## 어디서 시작하나

| 알고 싶은 것 | 문서 |
| --- | --- |
| 남은 일, 다음 할 일, 결정 대기 | [`.planning/README.md`](.planning/README.md) |
| 설계·계약 문서와 작업별 읽기 경로 | [`docs/INDEX.md`](docs/INDEX.md) |
| 도메인 용어 | [`GLOSSARY.md`](GLOSSARY.md) |
| 시각 규칙 | [`DESIGN.md`](DESIGN.md) |
| 결정과 그 이유 | [`docs/adr/`](docs/adr/) |
| 에이전트 운영 메모(작업자 샌드박스, worktree, 캡처 함정) | [`docs/agents/operations.md`](docs/agents/operations.md) |
| 여러 세션의 흐름 분담·요청 분류(Kernel·SDK 조각·메뉴 몫)·팀장·릴리스 | [`.agents/conductor/LANES.md`](.agents/conductor/LANES.md) |

작업하는 폴더에 `AGENTS.md`가 있으면 함께 따른다(아래 표). 폴더 지침이 루트와 충돌하면 루트를 따른다.

## 코드

- 루트 pnpm workspace: `apps/*`, `packages/*`(FeedbackOps `fo-*`), `packages/sdk/*`, `packages/adapters/*`, `menus/*/*`, `tooling/*`. Node 26.7.0, pnpm 11.1.1. 명령은 루트에서 `pnpm install|dev|lint|typecheck|test|build|e2e`.
- 의존 방향은 `contracts → ui/kernel → components → shell → apps`, 역방향 import 금지(경계 lint가 강제, 원본 `docs/integration/platform-packages.md` §3). FeedbackOps primitive는 `@ap/ui`로만 소비한다.
- Kernel·공통 컴포넌트·셸은 메뉴와 mock을 모른다. 메뉴 목록은 Registry로, 서버는 `PlatformAdapter`로 앱이 주입한다.

## 검증

- 이슈의 첫 구현 커밋 전에는 Kernel·셸·공통 컴포넌트(`packages/sdk/{kernel,components,shell,ui,contracts}`)·mock 서버·`apps/platform-web` 조립을 건드리는 노드만 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`가 모두 0으로 끝나야 한다(`verify-root.sh`). 건드리지 않는 노드(메뉴·문서·도구·스크립트·위 경로 밖의 이동)는 `lint`·`typecheck`(와 바뀐 패키지 검사)만 돌리고 `test`·`build`는 PR CI에 맡긴다. 기준은 그 노드 diff의 경로이고 VERIFY에 한 줄 적는다. 공유 경로 PR(아래 작업 흐름의 다섯 갈래)은 경로와 관계없이 `verify-root.sh` 전체를 돈다([`PROFILE.md`](.agents/conductor/PROFILE.md) §Verify). 수정 라운드와 ship 직전은 아래 PROFILE 규칙을 따르며 `build`를 다시 돌리지 않을 수 있다. `--force` 없이 worktree 공용 turbo 캐시를 써서 바뀐 패키지와 그 의존자만 다시 돌게 한다. 작업 중에는 `pnpm --filter <pkg> …`로 충분하다.
- 전체 검사의 기록은 PR CI다(CI는 cold로 전체를 돈다. 문서·`.agents` 전용 PR만 무거운 단계를 건너뛴다 — `ci.yml`의 `code` 판정). 수정 라운드와 ship 직전에 로컬에서 무엇을 다시 돌리는지는 [`PROFILE.md`](.agents/conductor/PROFILE.md) §Verify의 「수정 라운드」·「Final head」를 따른다(#945).
- 화면이 바뀌면 브라우저로 확인한다. Kernel·셸·공통 컴포넌트·mock 서버를 바꾸면 관련 E2E만 `apps/platform-e2e`에서 `pnpm exec playwright test -g "<describe>"`로 돌린다. 로컬에서 전체 `pnpm e2e`는 돌리지 않는다(CI 실패 재현 때만). 새 describe와 브리프 「영향 범위」가 적은 describe만 `-g`로 돌린다. CI가 전체 E2E를 다시 돌리고 항목별 보고(`apps/platform-e2e/contract-report/`)를 남긴다.
- `main`은 ruleset `main: required CI`(2026-10-23, #670 D2)로 보호한다. `Platform workspace (pnpm monorepo)`·`Platform contracts (E2E)` 두 검사가 통과해야 병합되고, force push와 삭제는 막힌다. 브랜치가 최신일 필요는 없다(strict 아님).
- `pnpm lint`는 디자인 시스템 규칙(`@shadcn/lint`, #228)도 검사한다. 오류 메시지가 대신 쓸 토큰·variant·컴포넌트를 알려 주니 그대로 고친다. `.ts` 파일의 클래스 문자열도 검사한다. 예외 목록 파일은 없다(#236·#241에서 모두 해소) — 예외는 이유를 단 `eslint-disable-next-line`만 쓰고, 아무것도 막지 않는 disable 주석은 오류다. `@radix-ui/*`는 `@ap/ui`만 import한다.
- 문서만 바꿨으면 `pnpm docs:links`(문서 링크 검사)만 돌린다.
- 실행하지 않은 검증은 했다고 보고하지 않는다.

## 작업 흐름

- 기능·버그 작업은 GitHub 이슈에서 시작하고 PR 본문에 `Closes #n`을 적는다. 오타·문서 정리·작은 수정은 이슈 없이 해도 된다. 작업 중 발견한 별개의 일은 `issue-wave-conductor`의 fold·file·note 규칙을 따른다 — fold 조건(이슈 diff와 같은 메뉴 폴더, 30줄·3건 이하의 결함·문구 수정)이면 그 PR에서 같이 고치고, 나머지는 이슈로 남기거나 PR 본문 `Noted, not filed`에 한 줄 적는다.
- 병합은 하나씩, CI는 동시에 돈다. 공유 경로(다섯 갈래만: `packages/sdk/{contracts,kernel,components,shell}` 공개 API — `sdk:api` 스냅샷 `tooling/sdk/api/*.api.txt`나 그 패키지 `package.json`의 `exports`가 바뀜 — 와 루트 `package.json`·`pnpm-lock.yaml`·`turbo.json`, `.github/workflows`, `apps/platform-e2e`)를 건드리는 PR만 CI가 끝나 병합할 때까지 `merge.lock`을 쥐고, 나머지는 병합 직전 구간만 잠근다. 공유 경로 PR 뒤에 병합되는 일반 PR은 병합 직전 점검(fetch 뒤 main 쪽 변경이 다섯 갈래에 닿으면 rebase하고 CI를 다시 기다린다)으로 막고, 그 점검과 병합은 같은 `merge.lock` 안에서 한다([`LANES.md`](.agents/conductor/LANES.md) §흐름 세션 「병합」). 동시에 CI를 통과한 두 PR의 의미 충돌이 `main`에서 터지면 push CI가 잡고 LANES 「main 깨짐」 절차를 탄다. 동작 버그를 고칠 때는 고치기 전에 실패하는 회귀 테스트를 함께 넣는다.
- 작업자에게 맡기는 이슈는 전역 `issue-wave-conductor` 스킬 절차를 따르고, 이 레포의 부분은 [`.agents/conductor/PROFILE.md`](.agents/conductor/PROFILE.md)다(작업자 구현, 코디네이터 호스트 검증, diff에 따라 고르는 역할별 리뷰).
- 이슈별로 알려진 수정을 모두 반영한 뒤 최종 리뷰를 한 번 한다. 리뷰 지적과 코디네이터의 자체 관찰은 모두 모아 한 수정 라운드로 처리한다. 단, 작은 diff에서 blocker·major 없이 minor·nit만 나오면 수정 라운드 없이 병합하고 지적은 기록한다([`PROFILE.md`](.agents/conductor/PROFILE.md) §Review, 사용자 2026-10-27 O5).
- 재리뷰는 blocker 또는 major 동작 수정(특히 권한·데이터 누출 수정) 뒤에만 한다. 문구만 바꾸거나 기계적으로 수정한 뒤에는 리뷰를 추가하지 않는다. 단, `impl-complex` 이슈의 FIX1은 수정 diff 점검 한 번(issue-wave-conductor)을 받는다.
- 이슈가 닫히거나 상태가 바뀌면 `.planning/README.md`의 해당 줄을 같은 PR에서 고친다. 계약이 바뀌면 그 계약의 소유 문서를 고친다(소유권은 `docs/AGENTS.md`).
- 공간·메뉴 구성의 소유자는 사용자다. 이슈에 "도메인 소유자 합의" 같은 선행이 적혀 있어도 외부 대기로 두지 말고, 추천안과 실제 앱 시안을 사용자에게 올린다(#252).
- 사람이 답해야 하는 결정은 `ready-for-human` 이슈로 올리고, 답 전에는 그 결정에 기대는 구현을 하지 않는다. 실제 대안 중에서 고른 결정은 `docs/adr/`에 ADR로 남긴다.

## UI는 프로토타입 컨펌 뒤 구현

보이는 모양이 바뀌는 작업(공통 부품, 셸, 레이아웃, 디자인 토큰, DESIGN.md 방향)은 실제 앱 위 `?variant=` 2–3안 인터랙티브 프로토타입(전역 `prototype` 스킬의 `UI.md`)을 만들고, 사용자 컨펌은 **아티팩트 링크**로 받은 뒤 구현한다. 사용자는 모바일에서 보므로 localhost 미리보기 URL이나 로컬 경로를 보내지 않는다 — 안마다 실제 앱 캡처(지금 모습 포함)를 담은 아티팩트를 만들어 링크를 준다(사용자 2026-10-20). 문장 설명이나 실제 앱이 아닌 그림으로 컨펌을 대신하지 않는다. 컨펌된 안이 스펙이고, 벗어나야 하면 사용자 OK를 PR 본문에 적는다. 프로토타입 코드는 버리고 결정은 이슈·ADR에 남긴다. 버그 수정과 이미 컨펌된 모양을 그대로 옮기는 작업은 해당하지 않는다.

새 화면 설계 절차(Requirements → IA → Screen Spec → Wireframe → Open Decisions)는 `.agents/skills/analysis-platform-wireframe/SKILL.md`.

## FeedbackOps (`apps/fo-*`·`packages/fo-*`·`docs/feedbackops/`·`ops/feedbackops/`)

FeedbackOps는 이 저장소의 일반 코드다(서브모듈 아님, [ADR-0066](docs/adr/0066-feedbackops-merges-into-platform.md), #592). 앱·패키지(`@fops/*`)는 `apps/fo-backend`·`apps/fo-frontend`·`packages/fo-shared`·`packages/fo-ui`, 문서는 `docs/feedbackops/`에 있다([ADR-0090](docs/adr/0090-repo-structure-by-branch.md), #713). 루트 pnpm workspace의 일부이고(#642) Node 26.7·pnpm 11·루트 lockfile·turbo를 함께 쓰며 `@ap/ui`는 `workspace:*`로 받는다. 린트는 자체 Biome이고, 루트 `lint|typecheck|test|build`는 FeedbackOps를 뺀다. FeedbackOps 루트 도구(스크립트·게이트·compose·conductor, 워크스페이스 패키지 `@fops/ops`)는 `ops/feedbackops/`에 있고 FeedbackOps 명령은 저장소 루트에서 `pnpm --filter @fops/ops <script>`·`bash ops/feedbackops/scripts/ci/gate.sh …`로 실행한다(앱·패키지 위치는 `ops/feedbackops/paths.sh`·`paths.mjs` 한 곳, [ADR-0090](docs/adr/0090-repo-structure-by-branch.md)). 내부 작업은 `docs/feedbackops/AGENTS.md`와 각 앱·패키지의 `AGENTS.md`를 따르며, 플랫폼 규칙을 소급 적용하지 않는다. CI는 `.github/workflows/feedbackops.yml`(`docs/feedbackops/`·`apps/fo-*`·`packages/fo-*`·`ops/feedbackops/`, `packages/sdk/{ui,contracts}`·`packages/adapters/{http-adapter,server-conformance}`, 루트 manifest·lockfile 등이 바뀔 때 — 경로 목록의 원본은 그 파일). 통합 계약이 충돌하면 한쪽을 임의로 고치지 말고 사용자에게 올린다. 구조는 `docs/integration/repository-layout.md`.

## 폴더별 지침

| 폴더 | 역할 |
| --- | --- |
| [`docs/`](docs/AGENTS.md) | 설계 계약 원본, 상태 표기·소유권 규칙 |
| [`apps/platform-web/`](apps/platform-web/AGENTS.md) | 조립 지점(GROUPS·Registry 조립, 어댑터 주입), dev 도구 |
| [`apps/platform-e2e/`](apps/platform-e2e/AGENTS.md) | 플랫폼 계약 자동 검사(Playwright, 블랙박스)와 항목별 보고 |
| [`menus/`](menus/AGENTS.md) | 메뉴 Consumer 패키지(`@ap/menu-<group>`, 그룹별 manifest·화면) |
| [`packages/`](packages/AGENTS.md) | 플랫폼 패키지 공통 규칙과 의존 방향 → 각 패키지 `AGENTS.md` |
| [`tooling/`](tooling/AGENTS.md) | 공유 tsconfig·경계 lint·메뉴 생성기(`pnpm gen:menu`)·CSS selector 비교 |
| [`site/`](site/AGENTS.md) | 도입 소개 페이지(정적, workspace 밖)와 Pages 조립 |
| [`archive/`](archive/AGENTS.md) | 통합 전 Kernel 단위 프로토타입(보존, 새 기능 금지) |
| [`docs/feedbackops/`](docs/feedbackops/AGENTS.md) | FeedbackOps 문서와 규칙(앱·패키지는 `apps/fo-*`·`packages/fo-*`, 루트 workspace의 `@fops/*`, 위 경계 참조) |

## 에이전트 자산

- 지침 원본은 각 폴더의 `AGENTS.md`이고, 같은 폴더의 `CLAUDE.md`는 그 상대 심링크다. 새 폴더 지침도 `ln -s AGENTS.md CLAUDE.md`로 연결한다.
- 스킬·명령·외부 디자인 참고자료 원본은 `.agents/skills`·`.agents/commands`·`.agents/references`다(사용법 `.agents/README.md`). 외부 스킬과 참고자료는 제품 계약을 덮어쓰지 않는다.
- 이슈 트래커 설정(GitHub Issues, `area:*` 라벨, 마일스톤): `docs/agents/issue-tracker.md`. Triage 라벨 5종: `docs/agents/triage-labels.md`. 도메인 문서 구성: `docs/agents/domain.md`.
- 벤더링 스킬: `vercel-react-best-practices`(외부 공식 사본, 출처·우선순위는 각 `SOURCE.md`와 `.agents/README.md`). 꺼 둔 스킬(#155 전까지 `fastapi`·`supabase-postgres-best-practices`)은 `.agents/skills-off/`. `prototype`·`diagnosing-bugs` 같은 일반 스킬은 전역(`~/.agents/skills`)이다.
