# 남은 일 한눈에 보기

> 마지막 갱신 2026-10-26. 원본은 GitHub 이슈·마일스톤이고 이 보드는 그 요약이다. 이슈가 닫히거나 상태가 바뀌면 같은 PR에서 해당 줄을 고친다. 물어 와야 할 질문과 미결 범위는 [inputs.md](inputs.md), 이슈로 올리지 않은 아이디어는 [backlog.md](backlog.md).

## 지금 어디까지

| 단계 | 상태 |
| --- | --- |
| 1. 계약 문서 | 완료 |
| 2. Kernel 프로토타입 | 완료 |
| 3. 모노레포 정리 | 완료 |
| 4. 플랫폼 기능 (M1) | 완료 — 후속 드릴다운(#225) v0.4.0 |
| 5. 디자인 시스템 (M2) | **완료** — v0.1.0, 후속 #218·#156 v0.2.0, FeedbackOps 모양·크기 정리와 디자인 lint 위반 0(#228) v0.3.0, 표 컬럼 설정(#239) v0.4.0, 페이지 필터 줄 접기(#230) v0.6.0 |
| 6. FeedbackOps 1단계 (M3) | 완료 — 남은 #84·#85·#86은 ADR-0066으로 전역 기능 이전(#594)에 흡수돼 닫힘(2026-10-21) |
| 7. 사내 적용 (M4) | 플랫폼 쪽 준비 끝. 사내 답 대기 — 지도 #157 |
| 8. FeedbackOps 합류 (M6) | 플랫폼에 합친다 — 전역 기능 + `피드백 운영` 업무 시스템, 서버는 FeedbackOps 백엔드에서 출발, 독립 앱 은퇴(ADR-0066, 2026-10-21, M5 대체) — 지도 #598 |
| 9. 멀티 워크스페이스 셸 | **완료** — v0.5.0(#250, ADR-0026·0027·0028), 공간 진입·메뉴 열기 판정 Kernel화(#264) v0.6.0 |

## 다음 할 일

다음 세션은 여기서 시작한다. 갈래마다 지금 열린 일만 적는다. 끝난 일의 기록은 닫힌 이슈·ADR·[릴리스](https://github.com/hjung3113/analytics-platform/releases)(앱 [`v0.16.0`](https://github.com/hjung3113/analytics-platform/releases/tag/v0.16.0), SDK [`sdk-v0.14.0`](https://github.com/hjung3113/analytics-platform/releases/tag/sdk-v0.14.0))에 있다.

1. **분석 작업 영역·MARS 이관(M7, Epic #557).** 계약 [ADR-0059](../docs/adr/0059-app-injected-equipment-axes-and-condition.md)·[ADR-0061](../docs/adr/0061-query-draft-applied-address-and-required-gate.md)·[ADR-0067](../docs/adr/0067-dockview-layout-engine-board-v2.md)·[ADR-0077](../docs/adr/0077-workspace-stack-mode-rows-keep-own-height.md). 조건 계약 [#552](https://github.com/hjung3113/analytics-platform/issues/552)는 1·2부가 끝났고 이슈는 열려 있다. 지금: 고밀도·다단계 드릴 작업 영역 [#690](https://github.com/hjung3113/analytics-platform/issues/690)(1단계 완료 — [ADR-0078](../docs/adr/0078-hw-time-layout-recipes.md), HW Time 메뉴 4종(단계별·비교·개요·표)과 SDK 조각, 네 메뉴를 한 spec으로 보는 E2E `hw-time.spec.ts`; 두 번째 소비자 [#586](https://github.com/hjung3113/analytics-platform/issues/586)은 이 메뉴들이 소비. 남은 일: 깊이 4 이상 드릴·검색형 패널 전환기·레이아웃 undo/redo·보호 패널은 구현 안 함(다시 볼 조건은 이슈 #690), 구현 안 함 항목은 [backlog](backlog.md)). 분해 분석 #580은 닫혔다(2026-10-25, 1단계 완료) — 2단계 R6/R7/R8과 미룬 항목은 [backlog](backlog.md). 쌓기 기본값 전환과 상호작용 마무리 [#701](https://github.com/hjung3113/analytics-platform/issues/701)(UX-4 시안 컨펌 먼저). 원인 미확인 끌기 E2E [#723](https://github.com/hjung3113/analytics-platform/issues/723)·[#683](https://github.com/hjung3113/analytics-platform/issues/683)은 sdk 세션이 맡는다(2026-10-26). #705 확대 차트 끌기는 끝 — Playwright 문제가 아니라 누름 때 다시 그린 `notMerge`가 inside dataZoom·grid를 다시 만들던 결함(#863). 끄는 중 옵션 재적용으로 Brush 선택이 취소되던 #808도 끝 — 주석이 있어 폭을 따르는 option이 다시 적용되면 brush 컴포넌트가 교체됐다(이제 brush도 병합). 웨이브 2 후보에 임의 다중 시트 Workbook 내보내기 [#860](https://github.com/hjung3113/analytics-platform/issues/860)(#541 우산 이슈에서 분리, #541은 닫힘). 웨이브 2 후보: [#555](https://github.com/hjung3113/analytics-platform/issues/555) 비동기 Export, [#556](https://github.com/hjung3113/analytics-platform/issues/556) 표 고급 기능. 4단계 grid 경로 정리는 [백로그](backlog.md).
2. **FeedbackOps 합류(M6, 지도 #598, [ADR-0066](../docs/adr/0066-feedbackops-merges-into-platform.md)).** 전역 기능 이전 #594는 끝났다(#650–#657, [ADR-0070](../docs/adr/0070-global-features-platform-menu-and-voc-drawer.md)). 남은 단계: 실서버 공통 부분 [#593](https://github.com/hjung3113/analytics-platform/issues/593) → 피드백 운영 업무 시스템 [#595](https://github.com/hjung3113/analytics-platform/issues/595)(틀 결정 [ADR-0081](../docs/adr/0081-feedbackops-operator-screens-platform-frame.md), 하위 #759 골격(공간·`대시보드`·`목록 범위`), #761 VOC 화면(`수신함`·`Triage`·`Clusters`·사이드바 보기·개수·저장된 보기), #760 바닥 블록 `VOC`의 셸 안 이동·복귀 줄 끝 → #762–#764 남음; `Task`·`설문` 블록 항목은 #763·#764에서 셸 안으로) → 독립 앱 은퇴 [#597](https://github.com/hjung3113/analytics-platform/issues/597). 결함 #644(`Select` 빈 값 재생)는 끝(#849, `sdk-v0.14.0`). 다리 정리(대시보드 managedSystem 거부·새로고침 문구·UUID 단일화·알림 패널 지연 로드)는 끝(#820, #835). UX 후속 [#774](https://github.com/hjung3113/analytics-platform/issues/774)·[#798](https://github.com/hjung3113/analytics-platform/issues/798)(목록 범위)·[#797](https://github.com/hjung3113/analytics-platform/issues/797)은 한 묶음으로 FeedbackOps 세션이 #763 다음에 한다(2026-10-26). `entityAudit` 페이지의 FeedbackOps 백엔드 쪽 [#857](https://github.com/hjung3113/analytics-platform/issues/857)은 #826 뒤. 화면 오류에서 VOC 등록 #606. 세션 공유는 사내 SSO(#150) 뒤.
3. **SDK 계약·품질(M8).** 2026-10-22 전체 리뷰 후속 #671은 끝났다(#732). `defineEntity`·deprecated 포트 제거·E2E Tab 루프 도우미는 [백로그](backlog.md). `@ap/ui` `sideEffects`로 시작 청크 −27%(#706, `sdk-v0.13.0`). v0.16.0 점검 후속: 분석 보드 지연 청크 #821·드래그·입력 반응성 #823·문서·도구 정리 #827·공통 차트 렌더 #822는 끝(#831·#833·#836·#844). Kernel 공통 상태에서 셸 상태 떼기 [#824](https://github.com/hjung3113/analytics-platform/issues/824)는 끝(#824). 열린 것: 조회 캐시·중복 제거 범위 결정 [#825](https://github.com/hjung3113/analytics-platform/issues/825), `entityAudit` 상한·페이지 [#826](https://github.com/hjung3113/analytics-platform/issues/826)(진행 중 — A안 `이전 변경 이력 더 보기` 결정), `sdk-v0.14.0` 마감 리뷰 후속: `returnTo` 규칙 한 곳으로 [#851](https://github.com/hjung3113/analytics-platform/issues/851)(#763 전), 틀린 page key 거부 안내 공통 조각 후보 [#852](https://github.com/hjung3113/analytics-platform/issues/852). SDK 쪽 열린 것: FeedbackOps 소비 전환·registry 공급자(#151 배포 경로 뒤), 모듈 엔드포인트 권한 [#492](https://github.com/hjung3113/analytics-platform/issues/492), 백엔드 스택 무관 적용 [#531](https://github.com/hjung3113/analytics-platform/issues/531), SDK tarball 형제 의존이 pnpm `blockExoticSubdeps`에 막히는 소비 방식 [#806](https://github.com/hjung3113/analytics-platform/issues/806)(ADR-0056), 모듈 권한만 있는 공간 숨김 [#829](https://github.com/hjung3113/analytics-platform/issues/829)(EV 세션이 맡음, 2026-10-26). 동시 실행·검사 안정성 묶음(한 PR, 진행 중, 2026-10-26): E2E 포트 [#809](https://github.com/hjung3113/analytics-platform/issues/809)·공용 tmpdir 개수 [#795](https://github.com/hjung3113/analytics-platform/issues/795)(한 기계의 다른 worktree), gen-menu vitest RPC 시간 초과 [#771](https://github.com/hjung3113/analytics-platform/issues/771)(로컬 동시 실행과 CI), probe lockfile integrity [#805](https://github.com/hjung3113/analytics-platform/issues/805)(#837을 합침), #592 전환기 CI 분기 정리([백로그](backlog.md)에서 옮김). 장기 설계는 [#396](https://github.com/hjung3113/analytics-platform/issues/396)([ADR-0043](../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)).
4. **최종 릴리스 전 구조·용어 정리(보류, 2026-10-23).** 진행 중인 세션·이슈가 정리되고 제품 출시 결정권자가 허가한 뒤 한다(사용자 2026-10-23): 결정 5건 [#712](https://github.com/hjung3113/analytics-platform/issues/712), 폴더 정리 [#713](https://github.com/hjung3113/analytics-platform/issues/713), 코드 문구·문서를 용어집에 맞추기 [#714](https://github.com/hjung3113/analytics-platform/issues/714).
5. **소개 사이트.** 갱신 [#725](https://github.com/hjung3113/analytics-platform/issues/725) 끝(2026-10-24: 분석 보드 도킹·작업 영역, 플랫폼 메뉴·VOC 등록 드로어, 서버 연결 준비, 용어집 반영), 캡처 CI #608 끝(캡처가 기대는 경로를 바꾼 PR에서 `Intro site captures`). 남은 설득 장애는 사이트 밖 입력이다: 시범 인력·기간·비용, 실서버·실사용자, 도입 전 기준선(#233), 화면 하나 실제 이전 비용 측정.
6. **그 밖의 후보.** 사용자 정의 Analysis Workspace·Saved View 결정 #294(Analysis Toolkit 지도 #291과 PoC #292·#293은 다시 여는 조건과 함께 닫음 — [백로그](backlog.md), 2026-10-26), EV 편입 #332·#333·#335(#334는 저장소 안 부분 끝, 실데이터 서버는 #155로 이관; 첫 외부 모듈 마운트 #801 끝 — `eqv:topview`·`eqv:focus`를 EV 릴리스 tarball(지금 `eqv-v0.6.0`)로 설치해 mock 조립에 탑재, 자리는 새 '도구' 공간·`/tools/topview`(#817, 사용자 결정 2026-10-25)), 데이터 자산 허브 #540, 계층 지표 보기 #513. conductor 엔진 후속은 hjung3113/conductor-engine(오탐 후속 conductor-engine#1), 레포 쪽 #643.

작업 규칙은 루트 `AGENTS.md`, 작업자 함정은 [`docs/agents/operations.md`](../docs/agents/operations.md). 작업자 배정은 전역 `routing.tsv`가 원본이다.

## 결정 대기 — 사람이 고를 것

이슈가 있는 것:

| 이슈 | 질문 | 권고·메모 | 막는 것 |
| --- | --- | --- | --- |
| #148 | 엔드포인트 선언의 원본(TS ↔ FastAPI codegen) | 사내 백엔드 담당 의견과 함께 | #154, #155 |
| #98 | 권한 부여·회수의 원천 — 역할 소속 쪽 절반 | #150 IdP 그룹 claim 사양 뒤. 그전에는 권한 부여·회수 동작·화면을 만들지 않는다(일반 쓰기 포트 ADR-0054와 별개) | 권한 쓰기 |

이슈가 없는 것(이번 문서·코드 대조에서 나왔다 — 필요하면 이슈로 올린다):

| 질문 | 현재 상태 | 막는 것 |
| --- | --- | --- |
| TanStack Router·Zustand 미채택을 확정할지 | 04가 "미도입(Kernel 자체 구현)"으로 기록 | — |
| `defaultRangeTo`를 서버가 산출하지 못할 때 | 06 §6.3은 Decided인데 포트는 항상 값을 준다. 실서버 전에 포트를 `string \| null`로 넓힐지 | #154 |
| 사용자 설정(즐겨찾기·최근·언어·표 열) 저장 위치 | 브라우저 localStorage에만 있다(기기 간 동기 없음). v1을 이대로 둘지, 서버 보존 포트를 둘지 | 사내 적용 |
| 접근 가능한 메뉴가 0개일 때 안내 화면 | 07이 요구하지만 미구현. 만들지, 요구를 지울지 | — |
| Site를 Context 키로 둘지 | Line은 전역 키 `lineNames`로 정했다(ADR-0059). Site는 코드에 키가 없다(ADR-0004: Site는 분리된 DB) | — |
| 생산성 개요의 지표별 버전 page key | 11 설계는 지표별 버전 키, 구현은 미등록 | — |
| 프로토타입 컨펌 캡처 보관 | ADR-0011·0013·0015·0017이 원격 프로토타입 브랜치에만 있는 캡처를 근거로 든다. 레포로 가져올지, 브랜치를 남겨 둘지 | 그 브랜치 삭제 |

## 사내·외부 답 대기

사내 적용(M4)의 전체 순서는 지도 이슈 #157.

| 이슈 | 내용 | 누구에게 | 답이 오면 풀리는 것 |
| --- | --- | --- | --- |
| #150 | 사내 SSO(IdP) 사양과 설정값 | 사내 SSO 담당 | #98, #154, #155 |
| #151 | 배포·인프라 환경(on-prem·망분리·CI·브라우저) | 사내 인프라 담당 | — |
| #149 | 실어댑터 전송 형식 초안 → 합의 | 사내 백엔드 담당 | #154, #165 |
| #155 | 사내 FastAPI 플랫폼 API | 사내 백엔드 | #154 |
| #154 | 실어댑터(HTTP) + 사내 테스트 서버로 적합성 묶음 | 실어댑터 `@ap/http-adapter`(#632)·비동기 조립·`dev:real`(FeedbackOps 백엔드) 끝. 남은 것: 실서버 대상 적합성 하네스, 사내 SSO 값(#150) | 사내 적용 |
| #165 | Kernel 5분 폴링·계산 세대 재검증 | ← #149, #155 세대 신호 | — |
| #37 | 적재 워커 상태 스키마 합의(초안 있음) | 파서 담당 | #51 모니터링·트레이스 |

질문지와 미결 범위 전체는 [inputs.md](inputs.md), 사내 적용 순서는 [사내 적용 가이드](../docs/integration/in-house-rollout.md) §2.

## 보류

| 이슈 | 다시 볼 조건 |
| --- | --- |
| #163 Perspective 자유 피벗 POC | 자유 피벗이 업무 필수로 확인될 때 |
| #164 AG Grid Enterprise 평가 | 셀 범위 복붙·채우기가 사내 메뉴 2–3곳에서 필수로 확인될 때 |
| #91 전역 감사 조회에 room 권한 적용(결정됨, 05) | 일부 room만 가진 콘솔 역할이 생길 때 서버에서 구현 |
