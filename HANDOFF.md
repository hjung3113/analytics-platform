# Handoff — 2026-10-01 다음 세션: 메뉴 조회 포트 9단계부터

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md) "작업 관리"·"화면/UI 설계":
  - 작업은 이슈에서 시작하고 PR에 `Closes #n`을 적는다. 확정 시 공통화 판단·문서 갱신·로드맵 갱신을 PR에서 확인한다(CI `PR checklist`).
  - 공통 UI·셸·토큰의 모양이 바뀌면 인터랙티브 프로토타입으로 사용자 컨펌. 기존 공통 컴포넌트만 조립한 메뉴 화면은 해당 없음.
- MVP는 데스크톱 웹만. 메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다.

## 현재 상태

- M1 완료. M2(디자인) 보류(FeedbackOps 디자인 확정 뒤, #52 코멘트).
- **메뉴 데이터 조회 포트(#100)** 1–6단계·사람 확인 게이트·7a(#125, 요청 모양 엄격화)·8(#126, 생성기 전환) 병합 완료(2026-10-01). 설계·결정 기록: [`docs/integration/menu-query-port.md`](docs/integration/menu-query-port.md)(결정 기록 표·§8·§10).
  - 계약: 메뉴가 `src/endpoints.ts`에 `defineEndpoint`로 조회를 선언하고, 화면은 Kernel `useMenuQuery(spec, params)`만 쓴다. 요청에는 `projectContext`가 만든 적용 키와 `scopeId`만 실린다. 서버(mock `serveEndpoint`)는 요청이 아니라 자기 선언 사본으로 권한·kind·한도를 판정한다. mock 계산은 메뉴 `src/mock/`에 두고 `@ap/menu-<g>/mock`을 `apps/platform-web/src/main.tsx`만 등록한다(lint로 강제).
  - 이전 완료 화면: `productivity-overview`, `execution-detail`. 나머지는 아직 `serve`(lint 래칫 `LEGACY_SERVE_PATHS`로 신규 사용 금지).
  - 서버(mock)는 선언과 다른 요청 모양을 `error`로 거부한다: 적용하지 않는 Context 키, 적용 키 누락, `time`의 `from`/`to` null, `metricId` 없는 `metricVersion`. 등록 규칙 6: Scope 없는 엔드포인트는 site 종속 키 6개를 apply할 수 없다.
  - `pnpm gen:menu`로 만든 새 메뉴는 처음부터 `src/endpoints.ts`·`src/mock/`(+`index.test.ts`로 등록 규칙 검증)·`./mock` export·`useMenuQuery`를 쓰고, `main.tsx`의 `<gen:menu-mock-imports>`·`<gen:menu-mock-spreads>` 마커 영역에 등록된다.
- #37 적재 워커 상태 스키마 **초안**(Candidate)은 파서 담당 합의 대기.
- CI: `Platform workspace`·`Platform contracts (E2E)`(41개)·`CSS selectors (build diff)`·Unit A–C·Python codec·`PR checklist`.

## 다음 세션 할 일 (순서대로, 한 PR씩)

1. **#127–#130 (9단계)** 나머지 화면 이전, 패키지별 1 PR. 패턴은 이미 이전한 `menus/analytics`(`src/endpoints.ts`, `src/mock/`, `ProductivityOverview.tsx`, `ExecutionDetail.tsx`)를 따른다. 화면 모양은 바꾸지 않고 `LEGACY_SERVE_PATHS`(`tooling/eslint/src/index.js`)에서 해당 파일을 뺀다.
   - #127 cycle-time(+내보내기). `cycleData.ts`를 `src/mock/`으로 옮기면 임시 lint 허용(`src/mock/** → ../pages/**`, `jobs-population` 테스트·`mock/execution.ts`가 사용)을 닫는다.
   - #128 equipment-master(PlatformDataTable 페이징 params).
   - #129 metrics(지표 쌍 검증을 서버로) — #123(요청 params의 `metricVersion` 서버 검증)과 함께.
   - #130 home(공지 `NOTICES`를 mock으로, 엔드포인트 권한 `notice:view`).
2. **#131 (10)** VOC 이전 → **#132 (11)** `serve` 제거 → **#133 (12)** 문서 이관(platform-packages §3–§5, 메뉴·패키지 AGENTS, 설계 §4 낡은 줄 번호, 설계 문서를 기록으로 전환. 06 §5·§19는 #134에서 반영됨).
3. 후속 **#122** 목적지 단건 조회(execution-detail)의 provisional을 대상 객체 시점으로.
4. #104의 레이아웃 슬롯 컴포넌트는 M2 재개 때 인터랙티브 프로토타입 컨펌 뒤(06 §12.6).

### 작업 방식 메모

- 메뉴 화면 이전은 `pnpm dev`로 시나리오(정상·일부 실패·too_large·forbidden·역할 전환)를 브라우저에서 확인한다. 역할마다 부여된 room이 달라 수치가 다르다(관리자 ≠ 공정 엔지니어).
- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 probe(`node tooling/gen-menu/scripts/probe.ts`)를 한 번 돌린다. 8단계에서 단위 테스트가 놓친 fixture·실제 파일 차이를 probe가 두 번 잡았다.
- 이 머신은 16GB다. 작업자에게는 패키지 범위 검사만 시키고, 루트 test/build/e2e는 마지막에 한 번씩 순서대로 돌린다(동시 실행 시 메모리 부족으로 작업이 강제 종료된 적 있음).

## 사람·외부 결정 대기 — 답이 나오기 전에 거기에 기대는 구현을 하지 않는다

- #37 파서 담당 합의(스키마 초안). 합의 뒤 #51 모니터링·트레이스 설계.
- #75 활용률 이벤트에 조회조건을 넣을지.
- #81 FeedbackOps 딥링크 확장.
- #84 = FeedbackOps#548 내 설문 응답 읽기 API. 지금 `mySurveyHistory`는 `respondent_history` `unknown`.
- #85 = FeedbackOps#549 신고자용 `view=my&selected=` 딥링크 확인.
- #86 실제 VOC 어댑터 — #59 토큰 공유(디자인 보류) 뒤.
- #90 지표 상세 이력을 감사 저장소로, #91 전역 감사 room 권한 결정.
- #98 역할 소속 원천(IdP 그룹 claim 사양). 답 전에는 부여·회수 포트, 변경 가능한 mock `USERS`, 두 번째 콘솔 권한을 만들지 않는다.
- 메뉴 조회 포트 Q2(선언 원본: TS ↔ FastAPI codegen)는 FastAPI 착수 때.

## 최근 플랫폼 계약

- **메뉴 조회 포트(#100):** 위 "현재 상태". `useMenuQuery`는 Scope가 현재 세션으로 서버 검증될 때까지(`ScopeState.validatedFor`), `time`을 적용하면 기간이 채워질 때까지 요청하지 않는다. `ok`/`empty` 응답의 kind가 선언과 다르면 `contract_violation` error(명시적 공집합 요청은 예외).
- **차트 주석(06 §16, #103):** 서버 소유, `(chartId, scopeId)` 키. Scope `null`은 "전체 사이트"가 아니다.
- **`resolveLink`(06 §22, #102):** 목적지 권한 `allowed`와 사이트 경계를 링크가 안다.
- **Error Boundary(06 §4, #101):** 메뉴 화면 렌더 실패는 콘텐츠 슬롯 안에 갇히고 식별 필드만 `reportClientError`로 보고한다.
- **실제 시점 vs wall-clock (06 §6.3):** epoch·timestamptz는 `formatInstant`, 설비 wall-clock은 `formatDateTime`(naive).
