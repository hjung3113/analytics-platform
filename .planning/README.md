# 남은 일 한눈에 보기

> 마지막 갱신 2026-10-27(앱 v0.18.0·sdk-v0.18.0 릴리스). 원본은 GitHub 이슈·마일스톤이고 이 보드는 그 요약이다. 이슈가 닫히거나 상태가 바뀌면 같은 PR에서 해당 줄을 고친다. 물어 와야 할 질문과 미결 범위는 [inputs.md](inputs.md), 이슈로 올리지 않은 아이디어는 [backlog.md](backlog.md).

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

다음 세션은 여기서 시작한다. 갈래마다 지금 열린 일만 적는다. 이슈별 흐름은 `lane:*` 라벨이고, 세션 분담·팀장·릴리스 담당은 [`LANES.md`](../.agents/conductor/LANES.md)다(2026-10-26). 끝난 일의 기록은 닫힌 이슈·ADR·[릴리스](https://github.com/hjung3113/analytics-platform/releases)(앱 [`v0.18.0`](https://github.com/hjung3113/analytics-platform/releases/tag/v0.18.0), SDK [`sdk-v0.18.0`](https://github.com/hjung3113/analytics-platform/releases/tag/sdk-v0.18.0))에 있다.

**`v0.18.0`·`sdk-v0.18.0`(2026-10-27, 완성도).** 다음을 끝냈다: 구조 정리 [#713](https://github.com/hjung3113/analytics-platform/issues/713)(+#712 D1–D5, ADR-0090), URL 정식 주소·공유 [#961](https://github.com/hjung3113/analytics-platform/issues/961)(ADR-0093), 저장된 뷰 1단계 [#1011](https://github.com/hjung3113/analytics-platform/issues/1011)(ADR-0092, mock 저장소; 마감 수정 [#1043](https://github.com/hjung3113/analytics-platform/issues/1043)), 보드 창·탭 상한·UX [#893](https://github.com/hjung3113/analytics-platform/issues/893) [#978](https://github.com/hjung3113/analytics-platform/issues/978), MARS 예정 메뉴 자리 [#969](https://github.com/hjung3113/analytics-platform/issues/969), 용어 [#714](https://github.com/hjung3113/analytics-platform/issues/714), CI를 바뀐 부분만 돌리기 [#1019](https://github.com/hjung3113/analytics-platform/issues/1019), 운영 규칙 축소 [#1030](https://github.com/hjung3113/analytics-platform/issues/1030)·[#1040](https://github.com/hjung3113/analytics-platform/issues/1040)(1차).

**다음 릴리스 후보.** 먼저 [#1040](https://github.com/hjung3113/analytics-platform/issues/1040) 나머지(흐름 지시서 한 장, 메시지 스크립트)를 한다. 그다음 후보: 이중 백엔드 ADR [#940](https://github.com/hjung3113/analytics-platform/issues/940), 마감 리뷰 follow-up Q6–Q8([backlog](backlog.md), Q8은 06 §6.4 문구라 사용자 결정), 재사용 패널 [#911](https://github.com/hjung3113/analytics-platform/issues/911)(보류).

1. **분석 작업 영역·MARS 이관(M7, Epic #557).** 계약 [ADR-0059](../docs/adr/0059-app-injected-equipment-axes-and-condition.md)·[ADR-0061](../docs/adr/0061-query-draft-applied-address-and-required-gate.md)·[ADR-0067](../docs/adr/0067-dockview-layout-engine-board-v2.md)·[ADR-0077](../docs/adr/0077-workspace-stack-mode-rows-keep-own-height.md). 조건 계약 [#552](https://github.com/hjung3113/analytics-platform/issues/552)는 1·2부가 끝났고 이슈는 열려 있다. 고밀도·다단계 드릴 작업 영역 [#690](https://github.com/hjung3113/analytics-platform/issues/690)은 보류(HW Time 보류, 사용자 2026-10-26 — 비교 메뉴의 드릴 중 위 패널 유지 [#912](https://github.com/hjung3113/analytics-platform/issues/912)는 끝, ADR-0078 보충)(1단계 완료 — [ADR-0078](../docs/adr/0078-hw-time-layout-recipes.md), HW Time 메뉴 4종(단계별·비교·개요·표)과 SDK 조각, 네 메뉴를 한 spec으로 보는 E2E `hw-time.spec.ts`; 두 번째 소비자 [#586](https://github.com/hjung3113/analytics-platform/issues/586)은 이 메뉴들이 소비. 남은 일: 깊이 4 이상 드릴·검색형 패널 전환기·레이아웃 undo/redo·보호 패널은 구현 안 함(다시 볼 조건은 이슈 #690), 구현 안 함 항목은 [backlog](backlog.md)). 분해 분석 #580은 닫혔다(2026-10-25, 1단계 완료) — 2단계 R6/R7/R8과 미룬 항목은 [backlog](backlog.md). 쌓기 기본값 전환과 상호작용 마무리 [#701](https://github.com/hjung3113/analytics-platform/issues/701)(UX-4 시안 컨펌 먼저). 끌기 E2E 3건은 정리됐다(2026-10-26): #705 확대 차트 끌기는 Playwright 문제가 아니라 누름 때 다시 그린 `notMerge`가 inside dataZoom·grid를 다시 만들던 결함(#863), 같은 계열의 #808 Brush 취소는 brush도 병합해 끝(#867), #683 dock 탭은 #685에서 이미 고쳐져 닫음, #723 쌓기 경계는 끄는 도중 엔진이 옛 높이로 줄을 한 프레임 비례 축소하던 제품 결함이라 고쳐 끝(`fromJSON` 앞에 새 총 높이로 `layout`). 임의 다중 시트 Workbook 내보내기 #860은 끝(`useWorkbookExport` — 메뉴가 시트 이름·구조를 선언, 06 §15; 메뉴 소비와 `조회 정보` 도우미는 [backlog](backlog.md)). 웨이브 2 후보: [#555](https://github.com/hjung3113/analytics-platform/issues/555) 비동기 Export, [#556](https://github.com/hjung3113/analytics-platform/issues/556) 표 고급 기능. 4단계 grid 경로 정리는 [백로그](backlog.md).
2. **FeedbackOps 합류(M6, 지도 #598, 열린 결함: 서랍 포커스·Esc·sticky 바 [#927](https://github.com/hjung3113/analytics-platform/issues/927), [ADR-0066](../docs/adr/0066-feedbackops-merges-into-platform.md)).** 전역 기능 이전 #594는 끝났다(#650–#657, [ADR-0070](../docs/adr/0070-global-features-platform-menu-and-voc-drawer.md)). 남은 단계: 실서버 공통 부분 [#593](https://github.com/hjung3113/analytics-platform/issues/593) → 피드백 운영 업무 시스템 [#595](https://github.com/hjung3113/analytics-platform/issues/595)(틀 결정 [ADR-0081](../docs/adr/0081-feedbackops-operator-screens-platform-frame.md), 하위 #759 골격(공간·`대시보드`·`목록 범위`), #761 VOC 화면(`수신함`·`Triage`·`Clusters`·사이드바 보기·개수·저장된 보기), #760 바닥 블록 `VOC`의 셸 안 이동·복귀 줄 끝, #763 `Tasks` 그룹(`Task Requests`·`Tasks`·`내 Task`·`Milestones`·숨은 `Task 목록`)과 바닥 블록 `Task`의 셸 안 이동 끝, #762 `Findings` 그룹(`전체 Finding`과 Finding 상세 드로어)과 Finding 링크 연결, `연동` 그룹(`연동 액션 대시보드`·`Evidence`·`엔티티 링크`·`커버리지`) 끝, #764 p1 `Surveys` 그룹(`Survey 관리`와 숨은 빌더·결과·후속 조치)과 바닥 블록 `설문`의 셸 안 이동 끝 → #764 `관리자`(p2) 남음) → 독립 앱 은퇴 [#597](https://github.com/hjung3113/analytics-platform/issues/597). 결함 #644(`Select` 빈 값 재생)는 끝(#849, `sdk-v0.14.0`). 다리 정리(대시보드 managedSystem 거부·새로고침 문구·UUID 단일화·알림 패널 지연 로드)는 끝(#820, #835). UX 후속 [#774](https://github.com/hjung3113/analytics-platform/issues/774)·[#798](https://github.com/hjung3113/analytics-platform/issues/798)(목록 범위)·[#797](https://github.com/hjung3113/analytics-platform/issues/797)은 한 묶음으로 FeedbackOps 세션이 #763 다음에 한다(2026-10-26). `entityAudit` 페이지의 FeedbackOps 백엔드 쪽 [#857](https://github.com/hjung3113/analytics-platform/issues/857)은 끝(한 쪽 50건 keyset 커서, 적합성 커서 검사 6건 실행). 화면 오류에서 VOC 등록 #606. 세션 공유는 사내 SSO(#150) 뒤.
3. **SDK 계약·품질(M8).** occurrence anchor를 파서 RecordSequence(불투명 숫자 문자열)로 바꾸고 시작 시각을 별도 필드로 분리하는 [#1007](https://github.com/hjung3113/analytics-platform/issues/1007)은 끝(#1055, [ADR-0094](../docs/adr/0094-occurrence-anchor-is-record-sequence.md)). [#1008](https://github.com/hjung3113/analytics-platform/issues/1008)의 계약(`Trust.sourceLogicVersions`)과 원천 로직 버전 혼재 표시가 들어갔다. 2026-10-22 전체 리뷰 후속 #671은 끝났다(#732). `defineEntity`·deprecated 포트 제거·E2E Tab 루프 도우미는 [백로그](backlog.md). `@ap/ui` `sideEffects`로 시작 청크 −27%(#706, `sdk-v0.13.0`). v0.16.0 점검 후속: 분석 보드 지연 청크 #821·드래그·입력 반응성 #823·문서·도구 정리 #827·공통 차트 렌더 #822는 끝(#831·#833·#836·#844). Kernel 공통 상태에서 셸 상태 떼기 [#824](https://github.com/hjung3113/analytics-platform/issues/824)는 끝(#824). 조회 캐시·중복 제거 [#825](https://github.com/hjung3113/analytics-platform/issues/825)는 끝(#825, [ADR-0086](../docs/adr/0086-kernel-query-engine-tanstack.md) — Kernel 내부 엔진으로 TanStack Query, 공유 키 중복 제거·5분 메모리 SWR, `sdk-v0.16.0`; 테스트 도우미 `settleQueries` #907), `entityAudit` 상한·페이지 [#826](https://github.com/hjung3113/analytics-platform/issues/826)은 끝(#826, [ADR-0085](../docs/adr/0085-entity-audit-cursor-pages.md) — A안 커서 + `이전 변경 이력 더 보기`, FeedbackOps 백엔드 쪽은 #857로 끝), SDK tarball 소비 방식 #806은 끝(형제 `@ap/*`를 정확 버전 peer로, 소비 검사는 HTTP URL 설치 — ADR-0056 보충, 다음 SDK 릴리스부터). `sdk-v0.14.0` 마감 리뷰 후속: `returnTo` 규칙 한 곳으로 [#851](https://github.com/hjung3113/analytics-platform/issues/851)은 끝(`@ap/contracts` `RETURN_TO_KEY`·`withoutReturnTo`·`carriesReturnTo`), 틀린 page key 거부 안내 공통 조각 #852는 끝(`usePageKeyRules`·`PageKeyWarning`·`RecoverButton`, HW Time이 첫 소비자; 지표 카탈로그·사이클타임·생산성 개요도 #924로 옮김). 탭이 하나뿐인 `DetailDrawer`는 탭 줄 없이 내용만 그린다(#886 UX-8, `sdk-v0.16.0`; 같은 이슈의 셸 토스트 위치 UX-6·좁은 폭 `ListToolbar` UX-7은 끝, `sdk-v0.17.0`). `sdk-v0.17.0`에 실린 것: 라벨–값 부품 두 벌 정리 [#891](https://github.com/hjung3113/analytics-platform/issues/891)(`Field` 폐기 예고, 지우기는 다음 릴리스 이후 — [백로그](backlog.md)), 셸 조회 바 기간 표시·거짓 '적용 안 된 변경' [#913](https://github.com/hjung3113/analytics-platform/issues/913)(`formatPeriod`), 공통 차트·보드 로드 성능 [#915](https://github.com/hjung3113/analytics-platform/issues/915). lazy 청크를 기다리는 메뉴 jsdom 테스트의 1초 대기 [#741](https://github.com/hjung3113/analytics-platform/issues/741)은 끝(3초로 조정, 임시 계측 제거). SDK 쪽 열린 것: 셸·공통 부품 다듬기 묶음 [#914](https://github.com/hjung3113/analytics-platform/issues/914)(드로어 초점 링·좁은 차트 눈금·Context 바 라벨 없앰·기간 접근 이름은 끝, 보드 도착 제목의 프로그램 초점 전용 처리까지 끝, #955; 마감 리뷰 Q2–Q5 정리 #956 끝), FeedbackOps 소비 전환·registry 공급자(#151 배포 경로 뒤), 모듈 엔드포인트 권한 [#492](https://github.com/hjung3113/analytics-platform/issues/492), 백엔드 스택 무관 적용 [#531](https://github.com/hjung3113/analytics-platform/issues/531), 모듈 권한만 있는 공간 숨김 [#829](https://github.com/hjung3113/analytics-platform/issues/829)(EV 세션이 맡음, 2026-10-26). 동시 실행·검사 안정성 묶음은 끝(2026-10-26, E2E는 `E2E_PORT`로 포트를 바꿔 동시에 돌린다): E2E 포트 [#809](https://github.com/hjung3113/analytics-platform/issues/809)·공용 tmpdir 개수 [#795](https://github.com/hjung3113/analytics-platform/issues/795)(한 기계의 다른 worktree), gen-menu vitest RPC 시간 초과 [#771](https://github.com/hjung3113/analytics-platform/issues/771)(로컬 동시 실행과 CI), probe lockfile integrity [#805](https://github.com/hjung3113/analytics-platform/issues/805)(#837을 합침), #592 전환기 CI 분기 정리([백로그](backlog.md)에서 옮김). 장기 설계는 [#396](https://github.com/hjung3113/analytics-platform/issues/396)([ADR-0043](../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)).
4. **구조·용어 정리.** 구조 정리 #713은 완료(22노드 병합, 이슈 닫힘; [ADR-0090](../docs/adr/0090-repo-structure-by-branch.md)). 용어 정리 #714는 문서를 용어집에 맞추며 코드 문구(A 묶음)는 소유 흐름 배정 대기다.
5. **소개 사이트.** 갱신 [#725](https://github.com/hjung3113/analytics-platform/issues/725) 끝(2026-10-24: 분석 보드 도킹·작업 영역, 플랫폼 메뉴·VOC 등록 드로어, 서버 연결 준비, 용어집 반영), 캡처 CI #608 끝(캡처가 기대는 경로를 바꾼 PR에서 `Intro site captures`). 남은 설득 장애는 사이트 밖 입력이다: 시범 인력·기간·비용, 실서버·실사용자, 도입 전 기준선(#233), 화면 하나 실제 이전 비용 측정.
6. **그 밖의 후보.** 가공 상태 모니터링·트레이스 #51(스키마 #37 Decided 2026-10-26, 화면 설계 대기), 이중 백엔드 분담 결정 [#940](https://github.com/hjung3113/analytics-platform/issues/940)(Fastify 코어 + FastAPI 분석 데이터 서버, 결정 대기), 메뉴 Context 기반 재사용 패널 [#911](https://github.com/hjung3113/analytics-platform/issues/911)(보류), HW Time은 보류(사용자 2026-10-26). 사용자 정의 Analysis Workspace·Saved View 결정 #294(저장 단위·소유·공유·UI는 **결정됨** 2026-10-27 — [ADR-0092](../docs/adr/0092-saved-view-units-tiers-and-groups.md), 시안 B 기본 + 요청형 뷰 관리 표면, 선택은 Astra 위임; 구현 [#1011](https://github.com/hjung3113/analytics-platform/issues/1011)은 mock 저장소 범위로 **끝남**(2026-10-27, 사이클타임 상세가 첫 소비자, 서버 저장·ACL·감사는 #155 뒤 — 미룬 것은 [백로그](backlog.md)), 서버 저장은 #155 뒤; Analysis Toolkit 지도 #291과 PoC #292·#293은 다시 여는 조건과 함께 닫음 — [백로그](backlog.md), 2026-10-26), EV 편입 이슈 #332·#333·#334·#335는 닫음(2026-10-26 — 서브모듈 대신 tarball, Viewer 마운트·딥링크 끝, Designer는 not planned, 실데이터 서버는 #155; 첫 외부 모듈 마운트 #801 끝 — `eqv:topview`·`eqv:focus`를 EV 릴리스 tarball(지금 `eqv-v0.7.0`)로 설치해 mock 조립에 탑재, 자리는 새 '도구' 공간·`/tools/topview`(#817, 사용자 결정 2026-10-25)), 데이터 자산 허브 #540, 계층 지표 보기 #513. conductor 엔진 후속은 hjung3113/conductor-engine(오탐 후속 conductor-engine#1), 레포 쪽 #643.

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

질문지와 미결 범위 전체는 [inputs.md](inputs.md), 사내 적용 순서는 [사내 적용 가이드](../docs/integration/in-house-rollout.md) §2.

## 보류

| 이슈 | 다시 볼 조건 |
| --- | --- |
| #163 Perspective 자유 피벗 POC | 자유 피벗이 업무 필수로 확인될 때 |
| #164 AG Grid Enterprise 평가 | 셀 범위 복붙·채우기가 사내 메뉴 2–3곳에서 필수로 확인될 때 |
| #91 전역 감사 조회에 room 권한 적용(결정됨, 05) | 일부 room만 가진 콘솔 역할이 생길 때 서버에서 구현 |
