# Handoff — 2026-10-01 다음 세션: 사내 적용 준비 완료 뒤

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md) "작업 관리"·"화면/UI 설계":
  - 작업은 이슈에서 시작하고 PR에 `Closes #n`을 적는다. 확정 시 공통화 판단·문서 갱신·로드맵 갱신을 PR에서 확인한다(CI `PR checklist`).
  - 공통 UI·셸·토큰의 모양이 바뀌면 인터랙티브 프로토타입으로 사용자 컨펌. 기존 공통 컴포넌트만 조립한 메뉴 화면은 해당 없음.
- MVP는 데스크톱 웹만. **메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다(사용자, 2026-10-01: 실데이터 없는 견본 메뉴보다 플랫폼 자체를 단단하게 하는 데 노력을 쓴다).**

## 현재 상태

- M1 완료. M2(디자인) 보류 — FeedbackOps 디자인이 아직 수정 중. 재개 때 "FeedbackOps 디자인을 최대한 그대로" 가져오는 방법 분석은 [#52 코멘트](https://github.com/hjung3113/analytics-platform/issues/52#issuecomment-5929729163)(걸림돌은 Tailwind v3.4 ↔ v4 하나, 추천 A안: 플랫폼을 3.4로 내리고 `@fops/ui` 원본을 그대로 사용 — 미결정·미검증).
- **메뉴 데이터 조회 포트(#100) 완료(2026-10-01).** 현재 계약은 06 §5·§19, [패키지 경계](docs/integration/platform-packages.md) §3–§5, `menus/AGENTS.md`. 설계·결정 경과는 [`menu-query-port.md`](docs/integration/menu-query-port.md)(설계 기록).
  - 메뉴는 `src/endpoints.ts`에 조회를 선언하고 화면은 Kernel `useMenuQuery`(렌더 시점)·`useMenuFetch`(표 `loadPage`·내보내기 같은 호출형)만 쓴다. 서버 쪽 핸들러는 메뉴 `src/mock/`, 앱 `main.tsx`만 등록.
  - mock 엔진(`serveEndpoint`)은 요청이 아니라 자기 선언 사본으로 요청 모양·권한·Scope·한도를 판정하고, `validate` 훅으로 params 값(예: 계열에 없는 `metricVersion`)을 거부한다. 비 mart 원천은 `mart: false`(Trust 없음, mart 개발 시나리오 비적용), 핸들러는 요청 시점 `actor`를 받고 `MockRequestError`로 잘못된 요청을 거부한다.
  - `PlatformAdapter`에는 메뉴 어휘가 없다(VOC 두 메서드 제거). 포트 메서드는 Kernel·셸이 부르거나 Kernel 책임 저장소(권한·감사·활용률)를 읽는 것만.
  - `serve` 공개 export·`src/api.ts`·이행용 lint 장치는 없다. 공용 순수 계산은 contracts(`paging.ts` `PageQuery`·`sortAndPage`, `period.ts` `periodHours`·`bucketStart`).
- **사내 적용 준비(#145) 완료.** [`real-server-checklist.md`](docs/integration/real-server-checklist.md)가 실서버·실어댑터가 지킬 것(포트 메서드별, `menuQuery` 판정 순서·등록 검증, 남은 사람 결정)을 한 장으로 묶었고, `@ap/server-conformance`가 엔드포인트 선언에서 검사를 도출해 어떤 어댑터든 같은 잣대로 판정한다 — 지금 mock으로 21개 엔드포인트·391개 검사 통과(`apps/platform-web/src/server-conformance.test.ts`). 새 메뉴 mock을 `main.tsx`에 등록하면 이 테스트의 `MOCKS`·params 표에도 넣는다(빠지면 실패).
- CI: `Platform workspace`·`Platform contracts (E2E)`(41개)·`CSS selectors (build diff)`·Unit A–C·Python codec·`PR checklist`.

## 다음 세션 할 일 — 사용자에게 먼저 확인

디자인(M2)을 빼면 남은 일은 사실상 사내 적용이다(사용자 확인, 2026-10-01). 밖에서 막히지 않고 할 수 있는 플랫폼 작업은 거의 없다.

1. **사내 적용**: 체크리스트 §7의 결정(Q2 선언 원본, 전송 형식, SSO, #98, #37)부터. 실어댑터가 생기면 적합성 묶음을 같은 하네스로 돌린다(체크리스트 §4).
2. **M2 디자인**: FeedbackOps 디자인 확정 뒤 [#52 코멘트](https://github.com/hjung3113/analytics-platform/issues/52#issuecomment-5929729163)부터.
3. 작은 후속: **#122** 목적지 단건 조회 provisional을 대상 객체 시점으로. #104 레이아웃 슬롯 컴포넌트는 M2 때.

### 작업 방식 메모

- 화면에 닿는 변경은 `pnpm dev`로 main과 같은 시나리오를 나란히 캡처해 비교하면 동작 동일성을 빠르게 증명할 수 있다(이번 세션 9단계에서 사용). 역할마다 부여된 room이 달라 수치가 다르다(관리자 ≠ 공정 엔지니어).
- 이번 세션에서 ego-browser가 최소 스크립트에도 응답하지 않았다(앱 프로세스는 떠 있음). 브라우저 확인은 `apps/platform-e2e`의 Playwright로 대체했다 — 다음에도 먼저 `ego-browser nodejs -e 'console.log(1)'`로 확인.
- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 probe(`node tooling/gen-menu/scripts/probe.ts`)를 한 번 돌린다.
- 이 머신은 16GB다. 작업자에게는 패키지 범위 검사만 시키고, 루트 test/build/e2e는 마지막에 한 번씩 순서대로 돌린다.

## 사람·외부 결정 대기 — 답이 나오기 전에 거기에 기대는 구현을 하지 않는다

- 메뉴 조회 포트 Q2(선언 원본: TS ↔ FastAPI codegen) — 실서버 착수 때.
- #37 파서 담당 합의(스키마 초안). 합의 뒤 #51 모니터링·트레이스 설계.
- #75 활용률 이벤트에 조회조건을 넣을지.
- #81 FeedbackOps 딥링크 확장.
- #84 = FeedbackOps#548 내 설문 응답 읽기 API. 지금 `noticeVoc.mySurveyHistory`는 `respondent_history` `unknown`.
- #85 = FeedbackOps#549 신고자용 `view=my&selected=` 딥링크 확인.
- #86 실제 VOC 어댑터 — #59 토큰 공유(디자인 보류) 뒤.
- #90 지표 상세 이력을 감사 저장소로, #91 전역 감사 room 권한 결정.
- #98 역할 소속 원천(IdP 그룹 claim 사양). 답 전에는 부여·회수 포트, 변경 가능한 mock `USERS`, 두 번째 콘솔 권한을 만들지 않는다.

## 최근 플랫폼 계약

- **메뉴 조회 포트(#100):** 위 "현재 상태". `useMenuQuery`·`useMenuFetch`는 Scope가 현재 세션으로 서버 검증될 때까지(`ScopeState.validatedFor`), `time`을 적용하면 기간이 채워질 때까지 요청하지 않는다(`useMenuFetch`는 `ready` 전 호출을 `not_ready` error로). `ok`/`empty` 응답의 kind가 선언과 다르면 `contract_violation` error(명시적 공집합 요청은 예외).
- **차트 주석(06 §16, #103):** 서버 소유, `(chartId, scopeId)` 키. Scope `null`은 "전체 사이트"가 아니다.
- **`resolveLink`(06 §22, #102):** 목적지 권한 `allowed`와 사이트 경계를 링크가 안다.
- **Error Boundary(06 §4, #101):** 메뉴 화면 렌더 실패는 콘텐츠 슬롯 안에 갇히고 식별 필드만 `reportClientError`로 보고한다.
- **실제 시점 vs wall-clock (06 §6.3):** epoch·timestamptz는 `formatInstant`, 설비 wall-clock은 `formatDateTime`(naive).
