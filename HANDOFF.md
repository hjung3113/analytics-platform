# Handoff — 2026-10-02 다음 세션: 사내 적용 트랙 정리·기술 스택 검토 뒤

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- **사내 적용은 [`docs/integration/in-house-rollout.md`](docs/integration/in-house-rollout.md)(순서·담당자별 질문·사내 메뉴 개발 가이드·완료 기준)와 지도 이슈 [#157](https://github.com/hjung3113/analytics-platform/issues/157)(마일스톤 `M4 사내 적용`)부터 본다.** 서버 규칙은 [`real-server-checklist.md`](docs/integration/real-server-checklist.md).
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md) "작업 관리"·"화면/UI 설계":
  - 작업은 이슈에서 시작하고 PR에 `Closes #n`을 적는다. 확정 시 공통화 판단·문서 갱신·로드맵 갱신을 PR에서 확인한다(CI `PR checklist`).
  - 공통 UI·셸·토큰의 모양이 바뀌면 인터랙티브 프로토타입으로 사용자 컨펌. 기존 공통 컴포넌트만 조립한 메뉴 화면은 해당 없음.
- MVP는 데스크톱 웹만. **메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다(사용자, 2026-10-01: 실데이터 없는 견본 메뉴보다 플랫폼 자체를 단단하게 하는 데 노력을 쓴다).**

## 현재 상태

- M1 완료. M2(디자인) 보류 — FeedbackOps 디자인이 아직 수정 중. 재개 방법은 [#52 코멘트](https://github.com/hjung3113/analytics-platform/issues/52#issuecomment-5929729163)(걸림돌은 Tailwind v3.4 ↔ v4 하나, 추천 A안: 플랫폼을 3.4로 내리고 `@fops/ui` 원본을 그대로 사용 — 미결정·미검증). 레이아웃 슬롯 컴포넌트는 #156.
- 사내 적용: 플랫폼 쪽 준비(#100 메뉴 조회 포트, #145 적합성 묶음·체크리스트)는 끝났고 남은 일은 지도 #157·가이드에 있다.
- 기술 스택: 결과는 04 "그리드·차트·데이터 도구 검토", 방침은 05 Decided(무료로 시작, 필요성 확인 시 유료). 남은 것은 #159 사람 결정뿐이다(→ #163/#164 보류 해제. 붙여넣기 편집은 쓰기 계약이 먼저, 04 전환 계획 4).
- 이슈 없이 05 Open으로만 기록한 것: ECharts 렌더러가 결정(SVG)과 달리 코드에서 canvas, Router·Zustand 미채택 확정 여부.
- CI: `Platform workspace`·`Platform contracts (E2E)`(41개)·`CSS selectors (build diff)`·Unit A–C·Python codec·`PR checklist`.

## 다음 세션 할 일 — 사용자에게 먼저 어느 쪽인지 확인

1. **외부 입력 없이 지금 가능(에이전트)**, 추천 순서: #152 적합성 묶음 확장 → #153 운영 빌드 조립 분리 → #167 Scope 확인 실패 처리 → #149 전송 형식 초안. 작은 후속 #122, #90, #166(불안정 테스트).
2. **사내에 물을 것(사람)**: #150 SSO 사양, #151 배포·인프라, #148 선언 원본(백엔드 담당과). 질문 목록은 가이드 §3. 답이 오면 해당 이슈에 남기고 05(와 그 결정의 원본 문서)를 Decided로, 가이드 §3 체크박스를 고친다.
3. **사용자 결정**: #159 그리드 "엑셀 수준 편의성"의 실제 요구. 답은 #159에 남기고 05 Open → Decided, 04 검토 절·전환 계획을 고친 뒤 결과에 따라 #163 또는 #164의 보류를 푼다.
4. 답이 다 오면 #154 실어댑터, #155 사내 FastAPI(사내 구현), #165 폴링·세대 재검증(#149 합의 뒤).
5. M2 디자인: FeedbackOps 디자인 확정 뒤 #52부터.

### 작업 방식 메모

- 화면에 닿는 변경의 동일성 증명: main과 워크트리에서 dev 서버를 다른 포트로 띄우고 같은 URL·역할의 DOM(머리글 클래스·`aria-sort`·첫 행)을 Playwright로 비교한다. 역할마다 부여된 room이 달라 수치가 다르다(관리자 ≠ 공정 엔지니어).
- 지난 세션들에서 ego-browser가 최소 스크립트에도 응답하지 않은 적이 있다. 먼저 `ego-browser nodejs -e 'console.log(1)'`로 확인하고, 안 되면 `apps/platform-e2e`의 Playwright로 대체한다고 말한다.
- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 probe(`node tooling/gen-menu/scripts/probe.ts`)를 한 번 돌린다. #153은 생성기 마커 위치를 건드릴 수 있다.
- 새 메뉴 mock을 `main.tsx`에 등록하면 `apps/platform-web/src/server-conformance.test.ts`의 `MOCKS`·`PARAMS` 표에도 넣는다(빠지면 실패).
- 이 머신은 16GB다. 작업자에게는 패키지 범위 검사만 시키고, 루트 test/build/e2e는 마지막에 한 번씩 순서대로 돌린다.

## 사람·외부 결정 대기 — 답이 나오기 전에 거기에 기대는 구현을 하지 않는다

- #148 엔드포인트 선언 원본(TS ↔ FastAPI codegen) — 메뉴 조회 포트 Q2.
- #149 전송 형식 — 초안은 에이전트가 써도 되지만 확정은 사내 백엔드 담당 합의. #165 폴링·세대 재검증은 그 합의 뒤.
- #150 사내 SSO 사양, #151 배포·인프라 환경.
- #37 파서 담당 합의(스키마 초안). 합의 뒤 #51 모니터링·트레이스 설계.
- #75 활용률 이벤트에 조회조건을 넣을지. #91 전역 감사 room 권한.
- #98 역할 소속 원천(IdP 그룹 claim 사양 — #150 답에 기댐). 답 전에는 부여·회수 포트, 변경 가능한 mock `USERS`, 두 번째 콘솔 권한을 만들지 않는다.
- FeedbackOps: #81 딥링크 확장, #84 = FeedbackOps#548 설문 응답 읽기 API(지금 `noticeVoc.mySurveyHistory`는 `respondent_history` `unknown`), #85 = FeedbackOps#549 신고자용 딥링크, #86 실제 VOC 어댑터(#59 토큰 공유 뒤).

## 최근 플랫폼 계약

- **메뉴 조회 포트(#100):** 메뉴는 `src/endpoints.ts`에 조회를 선언하고 화면은 Kernel `useMenuQuery`(렌더 시점)·`useMenuFetch`(표 `loadPage`·내보내기 같은 호출형)만 쓴다. mock 엔진(`serveEndpoint`)은 요청이 아니라 자기 선언 사본으로 판정한다. `PlatformAdapter`에는 메뉴 어휘가 없다. 계약은 06 §5·§19, [패키지 경계](docs/integration/platform-packages.md) §3–§5, `menus/AGENTS.md`.
- **차트 주석(06 §16, #103):** 서버 소유, `(chartId, scopeId)` 키. Scope `null`은 "전체 사이트"가 아니다.
- **`resolveLink`(06 §22, #102):** 목적지 권한 `allowed`와 사이트 경계를 링크가 안다.
- **Error Boundary(06 §4, #101):** 메뉴 화면 렌더 실패는 콘텐츠 슬롯 안에 갇히고 식별 필드만 `reportClientError`로 보고한다.
- **실제 시점 vs wall-clock (06 §6.3):** epoch·timestamptz는 `formatInstant`, 설비 wall-clock은 `formatDateTime`(naive).
