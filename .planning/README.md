# 남은 일 한눈에 보기

> 마지막 갱신 2026-10-21. 원본은 GitHub 이슈·마일스톤이고 이 보드는 그 요약이다. 이슈가 닫히거나 상태가 바뀌면 같은 PR에서 해당 줄을 고친다. 물어 와야 할 질문과 미결 범위는 [inputs.md](inputs.md), 이슈로 올리지 않은 아이디어는 [backlog.md](backlog.md).

## 지금 어디까지

| 단계 | 상태 |
| --- | --- |
| 1. 계약 문서 | 완료 |
| 2. Kernel 프로토타입 | 완료 |
| 3. 모노레포 정리 | 완료 |
| 4. 플랫폼 기능 (M1) | 완료 — 후속 드릴다운(#225) v0.4.0 |
| 5. 디자인 시스템 (M2) | **완료** — v0.1.0, 후속 #218·#156 v0.2.0, FeedbackOps 모양·크기 정리와 디자인 lint 위반 0(#228) v0.3.0, 표 컬럼 설정(#239) v0.4.0, 페이지 필터 줄 접기(#230) v0.6.0 |
| 6. FeedbackOps 1단계 (M3) | 대부분 완료. 남은 4개는 FeedbackOps·사내 SSO 답 대기 |
| 7. 사내 적용 (M4) | 플랫폼 쪽 준비 끝. 사내 답 대기 — 지도 #157 |
| 8. FeedbackOps 합류 (M6) | 플랫폼에 합친다 — 전역 기능 + `피드백 운영` 업무 시스템, 서버는 FeedbackOps 백엔드에서 출발, 독립 앱 은퇴(ADR-0066, 2026-10-21, M5 대체) — 지도 #598 |
| 9. 멀티 워크스페이스 셸 | **완료** — v0.5.0(#250, ADR-0026·0027·0028), 공간 진입·메뉴 열기 판정 Kernel화(#264) v0.6.0 |

## 다음 할 일

다음 세션은 여기서 시작한다. 보드 첫 사용 다듬기(슬라이스 17)를 v0.15.0으로 릴리스했다(아래 "끝난 것").

0b. **MARS 이관 웨이브 1 진행 중(#557, 2026-10-21).** 계약 [ADR-0059](../docs/adr/0059-app-injected-equipment-axes-and-condition.md)(#552·#513). #552 1부 끝: 조건은 앱이 주입한 축의 다중값 맵(축 간 AND·축 안 OR), Line·PRC 그룹은 전역 키 `lineNames`·`prcGroups`(사용자 2026-10-21), 소속 기준 `membershipBasis`, 기존 링크 호환, 서버 모양 검증. #552 2부 끝: `listAxisOptions`(조건 축 + 전역 Line·PRC)·`searchEquipment`·`resolveSelection` 포트, `PortError`, Kernel hook `useAxisOptions`·`useEquipmentSearch`·`useResolvedSelection`(화면별 캐시). 조회 바 시안 결정 B 두 줄 + 접으면 C 요약(UX 리뷰 권고, 사용자 위임 2026-10-21, #553 코멘트) → #553 Kernel 초안→적용 끝([ADR-0061](../docs/adr/0061-query-draft-applied-address-and-required-gate.md): 메뉴가 `query.mode: 'apply'`로 선택, URL = 적용 조건, 필수조건 게이트·idle·조회 완료 시각; cycle-time opt-in 구현) → 조회 바 끝(#553: SDK `QueryBar` B 두 줄 + 접으면 실제 값 요약, `PageFilterBar` 초안 모드, 결과 줄 조회 완료 시각, 기간 프리셋은 서버 기준 시각; 사이클타임이 첫 적용 메뉴; UX 리뷰 통과 — `MultiCombobox` 키보드 확인 포함, 경미 2건은 [백로그](backlog.md)) → #554 최근 조건 끝(SDK 저장 포트 `QueryHistoryStore`·현재 견본 호스트의 브라우저 로컬 저장 구현, Apply 확인 때만 기록, 초안만 복원·자동 조회 없음, 행마다 권한 재확인; 사이클타임 첫 소비자; 저장 위치 local-only vs server sync는 파일럿 전에 결정 대기). #541 드릴 조각·범주 줄 끝(차트 활성화·동작 메뉴·가로 누적 막대·외부 시리즈 표시 제어, ADR-0063). #576 TopN·LaneTimeline 끝(ADR-0064, 차트 카탈로그 소비 예). 다음: #575 → #580(순서 결정 2026-10-21, #541 코멘트). #541-D `MultiCombobox`(`@ap/ui`) 끝. 슬라이스 마감 품질 정리 끝(#591), 후속은 [백로그](backlog.md). **[`sdk-v0.11.0`](https://github.com/hjung3113/analytics-platform/releases/tag/sdk-v0.11.0) 발행(2026-10-21)**: 다섯 패키지 tarball·`SHA256SUMS`, 깨지는 변경(`Condition` 맵·`PlatformAdapter` 새 필수 포트·`QueryState` idle·`Platform` 조회 필드·`AnalysisChart` null 반환·`ChartSpec` TopN)은 [변경 기록](../docs/integration/sdk-git-tag-consumption.md#변경-기록). #575 Dockview: P0 시안 컨펌(2026-10-22, 메뉴 `balanced`+`focus`, 보드 `board-dock-tabs`, 메뉴 opt-in) → [ADR-0067](../docs/adr/0067-dockview-layout-engine-board-v2.md)(Opus 설계 리뷰 반영, 보드 먼저) → 1 보드 저장소 V2·이행 → 2 `DockLayout`·보드 dock 렌더러(플래그, 컨펌 뒤 기본값 전환) → 3 메뉴 façade.

0a. **보드 첫 사용 다듬기(#526, 슬라이스 17) — 완료, v0.15.0(2026-10-21).** Sol high UX 리뷰의 BX-1–5와 슬라이스 16 품질 리뷰 후속을 네 이슈로 나눴다. 사용자 결정(2026-10-20): BX-2는 보드에서 새 칸 상세가 이전 칸 상세를 닫는다, BX-3은 우선순위 시안 비교 뒤 결정, BX-5·BX-1·BX-3 시안은 실제 앱 `?variant=`.

   - [#533](https://github.com/hjung3113/analytics-platform/issues/533) 실행 취소 토스트 Enter 두 번 실행(BX-4) — 완료.

   - [#534](https://github.com/hjung3113/analytics-platform/issues/534) 품질 후속(Q3–Q7, F1–F3) — 완료. `dropResetKeys`는 제거 예고만 했다(ADR-0044 한 릴리스 예고, [backlog](backlog.md)).

   - [#535](https://github.com/hjung3113/analytics-platform/issues/535) 다른 칸 상세가 열리면 이전 칸 상세를 닫음(BX-2) — 완료(`useDetailPanelSlot` `onSuperseded`, 06 §13·ADR-0047 보충).

   - [#536](https://github.com/hjung3113/analytics-platform/issues/536) 2×2 칸 높이·빈 화면 안내·좁은 폭 차이 칩(BX-5·BX-1·BX-3) — 빈 화면(C + A 안내)·차이 칩(A) 완료(사용자 2026-10-21). 칸 높이(BX-5)는 2차 시안 D(경계선·열별 행 비율·접기·최대화·저장) 확정(사용자 2026-10-21, [ADR-0060](../docs/adr/0060-analysis-board-pane-sizing-collapse-maximize.md)). 구현 완료(쌓기 칸 최소 400px, 콘덕터 결정). #536 완료.

   - 슬라이스 품질 리뷰(PASS-WITH-NITS) 후속: [#567](https://github.com/hjung3113/analytics-platform/issues/567) 접힌 칸 머리 포커스 복귀 — 완료, [#568](https://github.com/hjung3113/analytics-platform/issues/568) 정리(Q2–Q6, 후속은 백로그).

0. **분석 보드 1차(#421, 사용자 2026-10-19).** 설계 질의로 1차 동작을 정했다([16](../docs/16_analysis_board.md), [ADR-0049](../docs/adr/0049-analysis-context-belongs-to-a-pane.md)). 사례 조사([분석 보드 화면 패턴](../docs/research/2026-10-19-analysis-board-patterns.md))와 시안 3안 UX 리뷰로 칸 머리·선택 표시를 정했다([ADR-0051](../docs/adr/0051-analysis-board-pane-header-signal-chips-numbered-selection.md)). #496 Kernel 칸 Context, #497 보드 화면(골격·칸 머리·동작), #498 메뉴 보드 지원·E2E를 완료해 분석 보드 1차 구현을 마쳤다(v0.14.0).

1. **소개 사이트 재구성(#468) — 완료(2026-10-20).** 근거 문서 [17 플랫폼 요구사항](../docs/17_platform_requirements.md)(기능 전체·상태)을 쓰고, 사이트를 "플랫폼 안이라서 되는 장면" 8개(핵심 3·이어짐 2·기본기)로 다시 짰다. 페르소나 독립 평가 5회(분석가·기존 시스템 개발 리드·도입 결정자·아키텍트·디자인)로 고쳤고, 견본 메뉴는 조연으로만 쓴다(사용자 2026-10-20). 남은 설득 장애는 사이트 밖 입력이다: 시범 인력·기간·비용 산정, 실서버·실사용자, 도입 전 기준선(#233), 화면 하나 실제 이전 비용 측정. SDK 모듈이 공통 표·차트 부품(`@ap/components`)을 아직 못 받는 것은 SDK 배포 모양 후속(아래 1a).
1a. **SDK 만들기 착수(#396, 사용자 2026-10-19 — 다음 세션부터).** 각 프로젝트가 따로 프레임워크를 키우고 있어서, 지금 시작하지 않으면 셋 사이의 차이가 더 벌어진다. 그래서 #396 §8의 착수 증거를 기다리지 않고 보류를 푼다. 목표는 [ADR-0043](../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)이다: 플랫폼이 소유하는 하나의 프레임워크 + 앱 계약, 의존은 SDK ← 제품, 독립 실행은 제품 책임, 디자인 시스템 원본도 플랫폼. 첫 슬라이스는 문서 2건이다(사용자 2026-10-19): [포괄 목록](../docs/integration/sdk-coverage-inventory.md)(Candidate, 작성됨)과 [통합 계획 §4.4](../docs/integration/framework-unification-plan.md#44-sdk-저장소릴리즈-구조-candidate-2026-10-19)의 저장소·릴리즈 구조 권고 [ADR-0044](../docs/adr/0044-sdk-source-in-platform-repo-released-separately.md)(Decided, 사용자 2026-10-19 — 이 저장소에 두고 따로 묶음 버전 릴리스). 같은 날 정한 것: SDK는 백엔드 구현 프레임워크를 덮지 않고 서버는 계약만, 이전 순서는 `@ap/contracts` 배포 먼저. 열린 것: registry 공급자(#151), 접두사 치환 시점. 이어지는 구현: [#430](https://github.com/hjung3113/analytics-platform/issues/430)(`@ap/contracts` 배포 가능한 모양 — dist 빌드·`check:pack`·저장소 밖 소비자 검사, 완료, 발행은 안 함) → [#431](https://github.com/hjung3113/analytics-platform/issues/431)(디자인 시스템 코드 이전 우산 — [ADR-0046](../docs/adr/0046-design-system-source-moves-to-platform-whole-package.md): `@fops/ui` 전체를 세 묶음으로 이전, 사용자 2026-10-19). 지금: [#441](https://github.com/hjung3113/analytics-platform/issues/441)(토큰·유틸·primitive — 병합 완료: `@ap/ui`가 실제 구현을 갖고 `@fops/*` import·workspace 연결이 없다, 2026-10-19) → [#442](https://github.com/hjung3113/analytics-platform/issues/442)(레이아웃·패널·툴바·폼·피드백 + 상세 슬롯 통합 ADR-0047 — 병합 완료, 2026-10-19) → [#443](https://github.com/hjung3113/analytics-platform/issues/443)(도메인 결합 부분 — 병합 완료, 2026-10-19; #431 우산도 완료). ADR-0050/#479에서 SDK의 도메인 결합 UI를 FeedbackOps 소유로 되돌렸다(rich-content는 사용자 지적으로 [ADR-0052](../docs/adr/0052-rich-content-stays-in-the-sdk.md)/#483에서 SDK에 복원, `sdk-v0.5.0`: 도메인 데이터를 박지 않은 범용 부품은 쓸 곳이 없어도 SDK에 둔다). 남은 것(열림): FeedbackOps 소비 전환(#443 완료 + 배포 경로 #151), registry 공급자(#151), `@ap/ui`·`@ap/contracts` 전체 UI 패키지 배포 모양, SDK React peer 범위([#470](https://github.com/hjung3113/analytics-platform/issues/470)). 결정: FeedbackOps가 SDK를 쓰는 전환 시점 = #443 완료 + 배포 경로 확정(#151). 그 전까지 @fops/ui는 FO에 그대로 둔다. 사용자 결정(2026-10-19): SDK는 FeedbackOps 적용을 먼저 하고 나머지 조각을 진행한다. 사내에는 패키지 레지스트리가 없어 git·workspace로 받는다(#151 답, 발행 없는 소비 — 버전 고정은 git 태그 의존성 — FeedbackOps package.json이 이 레포의 `@ap/ui` 번들 태그를 가리킨다, 사용자 2026-10-19; 태그 발급은 ADR-0044의 묶음 릴리스, 시험 결과와 소비자 조건은 [sdk-git-tag-consumption](../docs/integration/sdk-git-tag-consumption.md), #458 완료). 전환은 묶음별(토큰·primitive → 레이아웃·패널 → 나머지)로 단계 전환한다. 되돌릴 수 있다. 전환 선행: FeedbackOps#1283(`DetailPanelSlotProvider` 채택, FeedbackOps 쪽 처리), #459(allowlist 사본 동등성 검사) 완료. SDK 태그는 `sdk-v0.1.0`부터다(앱 `v0.x` 태그와 구분, ADR-0044의 묶음 버전). `sdk-v0.1.0`으로는 얇은 재수출이 성립하지 않아(공개 이름 약 40개 누락, 탭 래퍼, CSS 진입점) #466에서 열고 `sdk-v0.2.0`을 냈다. **1번 묶음(토큰·유틸·primitive)은 FeedbackOps#1289로 전환 끝**(`@fops/ui` 공개 이름 252개 동일, 시각 하네스 145/145 변화 없음). 소비자는 radix·lucide를 `pnpm.overrides`로 이전 버전에 고정했다(Radix Tabs 1.2.x는 마우스다운에 `focus()`를 더해 `onValueChange`가 두 번 나가 FeedbackOps InboxRoute 테스트 3건이 깨졌다). **2번 묶음도 전환 끝:** 패널·툴바·폼·피드백은 FeedbackOps#1291, 레이아웃 셸과 `AppFrame` 슬롯은 FeedbackOps#1295(#1283 닫힘)·#1299. 이를 위해 SDK 슬롯에 닫힌 등록자·확장 상태·호스트 `expanded`/`toggle`을 더했다(#473 `sdk-v0.3.0`, #476 `sdk-v0.3.1`, ADR-0047 추가). **3a 전환 끝(FeedbackOps#1304):** SDK에 남긴 `ObjectRow`·신원·`ProgressMeter`·`SeverityIndicator`·`PermissionBlockedPanel`·`StatusBadgeFrame`이 `@ap/ui`(`sdk-v0.5.0`)에서 온다. **3b 전환 끝(FeedbackOps#1307):** `rich-content`의 편집기·렌더러·첨부 버튼·확장이 `@ap/ui` 복원본에서 온다(시각 하네스 145/145 변화 없음). 허용 목록 원본과 FeedbackOps쪽 드리프트 검사는 FeedbackOps에 남고, SDK 사본 동등성은 SDK 쪽 검사가 맡는다. 남은 것: 마지막 단계(앱 import를 `@ap/ui`로 옮기고 `@fops/ui` 정리)는 **구현하지 않는다(보류, 코디네이터 판단 2026-10-19, 되돌릴 수 있다)**: 앱 import가 287개 파일·238문에 걸치는데 `@fops/ui`가 이미 SDK 부품은 `@ap/ui`에서 그대로 재수출하고 공개 이름도 같아서, 옮겨도 동작·SDK 소비 증거가 늘지 않고 FeedbackOps 쪽 diff만 크다. 다시 여는 조건: FeedbackOps가 재수출 층을 없애고 싶다고 하거나, `@fops/ui`가 `@ap/ui`와 이름이 어긋나기 시작할 때(공개 이름 일치 검사가 깨질 때). **다음 SDK 슬라이스(2026-10-19 착수): 호스트 → 모듈 계약 1판**([ADR-0053](../docs/adr/0053-host-module-contract-v1.md)) — [#403](https://github.com/hjung3113/analytics-platform/issues/403)(계약 타입 + `mountModule` 등록, 끝) → [#489](https://github.com/hjung3113/analytics-platform/issues/489)(화면 `{ params, host }` 렌더와 포트 구현, 끝). 후속: 모듈 엔드포인트 권한 [#492](https://github.com/hjung3113/analytics-platform/issues/492). 첫 소비자는 저장소 안 고정 모듈, EV 연결은 #332 뒤. **지금(2026-10-20): 쓰기 포트**([ADR-0054](../docs/adr/0054-write-port-declared-actions-idempotency-version.md)) — [#501](https://github.com/hjung3113/analytics-platform/issues/501)(동작 선언·`menuAction` 포트·mock 엔진·적합성, 끝) → [#502](https://github.com/hjung3113/analytics-platform/issues/502)(`useMenuAction`·호스트 `write`·다시 읽기, 끝). **기계가 읽는 테마 계약(2026-10-20, 끝 — `sdk-v0.8.0`, PR #515·#516)**([ADR-0055](../docs/adr/0055-theme-contract-css-source-dtcg-json-typed-names.md)) — [#512](https://github.com/hjung3113/analytics-platform/issues/512). **완료(2026-10-20): 패키지 배포 모양**([ADR-0056](../docs/adr/0056-sdk-release-github-release-tarballs.md)) — [#519](https://github.com/hjung3113/analytics-platform/issues/519)(tarball·외부 소비자 게이트, 완료) → [#520](https://github.com/hjung3113/analytics-platform/issues/520)(공개 API 스냅샷, 완료). **`sdk-v0.9.0` 발행 끝(2026-10-20)**: [Release](https://github.com/hjung3113/analytics-platform/releases/tag/sdk-v0.9.0)에 다섯 패키지 tarball과 `SHA256SUMS`가 있고, 내려받은 파일로 돌린 외부 소비자 검사가 통과했다. 그 뒤 후보: 자동 접근성·시각·성능 게이트(포괄 목록 §5-7), 호스트 쪽 입력 검증 위치(§5-6). SDK React peer 범위는 `^19.0.0`으로 정했다([#470](https://github.com/hjung3113/analytics-platform/issues/470), 다음 SDK 태그부터). 선행으로 `DetailPanelSlotProvider`에 닫힌 등록자·확장 상태·호스트 `expanded`를 더한다(#473). 전환 구현은 FeedbackOps 저장소에서 한다 — `@fops/ui`를 얇은 재수출로 두고 묶음마다 내용을 `@ap/ui`에서 가져오게 바꾼 뒤, 마지막에 앱 import를 `@ap/ui`로 옮기고 `@fops/ui`를 지운다(코디네이터 판단, 되돌릴 수 있다). 열린 것: 픽셀 비주얼 하니스는 FeedbackOps에 남기고 SDK에서는 구현하지 않는다([백로그](backlog.md)).
1b. **SDK 차트 슬라이스 — 끝, [`sdk-v0.10.0`](https://github.com/hjung3113/analytics-platform/releases/tag/sdk-v0.10.0) 발행(2026-10-21).** [#529](https://github.com/hjung3113/analytics-platform/issues/529) 차트 종류 확장: 사례 조사([차트 종류 조사](../docs/research/2026-10-20-chart-kinds-patterns.md)) → `?variant=` 시안 → UX 리뷰 권장 톤(사용자: 크기·배치는 모두 제공, 디자인은 코디네이터 판단) → [#544](https://github.com/hjung3113/analytics-platform/issues/544) 차트 색 토큰 + `chartTheme()`, [#545](https://github.com/hjung3113/analytics-platform/issues/545) `AnalysisChart` + ChartSpec 히트맵·도넛([ADR-0058](../docs/adr/0058-analysis-chart-spec-union.md)), [#546](https://github.com/hjung3113/analytics-platform/issues/546) 산점도·박스플롯·파레토, [#547](https://github.com/hjung3113/analytics-platform/issues/547) 크기·밀도(기본 2열 그대로, `span: full`·`density: compact`·`size`), [#560](https://github.com/hjung3113/analytics-platform/issues/560) 슬라이스 품질 정리(후속은 [백로그](backlog.md)). 함께: [#539](https://github.com/hjung3113/analytics-platform/issues/539) 계층 범례 트리 `LegendTree`(행 이동 방향키 예외 [ADR-0057](../docs/adr/0057-legend-tree-arrow-key-row-navigation.md), 첫 소비자 MARS HW 동작시간·CLAS 간트 상태 필터는 저장소 밖). Release에 다섯 패키지 tarball과 `SHA256SUMS`, 내려받은 파일로 돌린 외부 소비자 검사 통과. [#530](https://github.com/hjung3113/analytics-platform/issues/530) 차트 카탈로그 견본 메뉴(새 종류의 첫 소비자) — 완료(2026-10-21, [ADR-0062](../docs/adr/0062-chart-catalog-focus-layout.md): 종류 탭 + 큰 단일 차트 + 접히는 동작·지원 레일 + 집중 모드; 레일 저장·line/bar 드릴은 [백로그](backlog.md)). 다음 슬라이스 [#531](https://github.com/hjung3113/analytics-platform/issues/531) 백엔드 스택 무관 적용(#148 답 A안 + Zod, 사용자 2026-10-20).
1c. **CLAS를 사용 중 업무 시스템으로(#590, 사용자 2026-10-21) — 완료.** 소개·데모에서 CLAS를 `준비 중`이 아니라 사용하는 시스템으로 보인다. CLAS 공간 + 견본 메뉴 1개(설비 동작시간: TopN 가로 막대·LaneTimeline 소비자, 권한 `analytics:view`), 전환기 준비 중 행에서 CLAS 제거, 소개 페이지 그림·문구·근거 원장 갱신과 CLAS 캡처 추가. 기존 CLAS 화면 이전은 계속 계획(R7.2). 같이 고친 것: 사이클타임 조회 바(#553) 뒤 깨진 `inset-context` 캡처를 생산성 개요에서 찍게 함. 남은 관찰: LaneTimeline 머리 도구와 칸 접기 버튼 겹침 #599.
2. 정비 후속: 없음 — #413·#419는 끝났고 남은 관찰은 [백로그](backlog.md)에 보류 기록(#419 ②·④, 슬라이스 15 품질 Q5, 소유자 결정 후보 1건).
3. 그다음 후보: 멀티 워크스페이스 v2(지도 #249). #310 명령 팔레트 가벼운 scrim은 끝났다(같은 값이 FeedbackOps #1050으로 이미 있어 FeedbackOps#1202는 닫고, ADR-0046으로 옮겨 온 `@ap/ui`의 `DialogContent scrim="palette"`로 반영). conductor 스크립트 전역 공통본(#394)은 끝났다(세 레포 전환, 엔진 원본 hjung3113/conductor-engine). 남은 오탐 후속은 hjung3113/conductor-engine#1.
4. 그 밖의 후보: 바로 할 수 있는 일 표. #251 FeedbackOps 링크 계약·매핑은 구현을 마쳤다(#81 결정, ADR-0045), #252 표준 로그 개발·개선 실행 공간 등록은 끝났다 — 내 작업 우선(C) 메뉴 구성, 메뉴는 모두 예정([ADR-0065](../docs/adr/0065-log-dev-and-improvement-spaces-work-queue-first.md), 사용자 2026-10-21). 화면은 사내에서 만든다.
5. 작업 규칙은 루트 `AGENTS.md`(2026-10-05 간소화), 작업자 함정은 [`docs/agents/operations.md`](../docs/agents/operations.md). 문서만 바꾸면 `pnpm docs:links`만 돌린다. 작업자 배정은 전역 `routing.tsv`가 원본이다(역할별 모델·effort·fallback은 그 파일에만 두고, 다른 곳에는 역할 이름만 쓴다, #283).

## 결정 대기 — 정비 슬라이스에서 나온 것 (2026-10-13, 10-15)

| 이슈 | 할 일 | 상태 |
| --- | --- | --- |
| #413 Q8 | `AnalysisChartFrame.test.tsx`의 메모이제이션 호출 횟수 단언(F4)을 지울지 | 소유자 결정: 유지(2026-10-18) |

## 바로 할 수 있는 일 (에이전트)

| 이슈 | 할 일 | 메모 |
| --- | --- | --- |
| #413 | 관리 화면 필터 키 경고 공통화(Q6), compact 동작 열 테스트 기하 stub 공통화(Q7) | 끝남 — #413 PR (Q8은 위 표) |
| #419 | #413 품질 리뷰 Noticed 묶음(topicParticle 소비자·초기화 범위·감사 상수 파생·RowAction TooltipProvider) | 끝남 — #419 PR(①조사 순서 결합·③감사 허용 목록 파생). ②·④는 [백로그](backlog.md)에 보류 기록 |
| #90 | 지표 상세 이력을 감사 저장소(`entityAudit`)로 통합 | 끝남 — C안(메뉴 감사 시드를 조립이 주입, ADR-0048, 사용자 2026-10-19) |
| #451 | FeedbackOps 진입 링크 회귀 E2E(복귀·무권한·미지원 필터·새로고침/Back·공간 0개/많음) | 끝남 — #451 PR. **구현 안 함:** 공간이 정말 0개인 세션 검사(mock에 그런 역할이 없어 역할 추가가 필요, 이번엔 "블록을 그릴 공간이 없는 화면"으로 검사). 다시 볼 조건: mock에 공간 0개 역할이 생기거나 실제 SSO 역할 매핑이 들어올 때 |
| #234 | 내 VOC 상태 라벨 8개를 FeedbackOps 정본(FO ADR-0005)으로 | 끝남 — #234 PR |

## 다음 슬라이스 후보 — 멀티 워크스페이스 v2 (지도 #249)

공간을 업무 시스템 단위(생산성 분석 · 지표관리 · 표준 로그 개발 · 개선 실행 + 운영 콘솔)로 나누고, FeedbackOps는 각 공간 사이드바의 진입 링크와 권한자용 전체 허브 링크로 붙인다([ADR-0026](../docs/adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md), [ADR-0027](../docs/adr/0027-feedbackops-stays-standalone-entry-links.md), 설계 [15](../docs/15_multi_workspace_ui.md)). 이번 슬라이스(셸·Registry·귀속)는 완료다([ADR-0028](../docs/adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)). 남은 4·5행은 후속이다.

| 순서 | 할 일 | 상태 |
| --- | --- | --- |
| 1 | 설계·ADR·시안을 저장소에 반영, 06 §9.1 개정 | 완료(이 문서 PR) |
| 2 | 셸·Registry 확장(#250): 플랫폼 홈(런처), 공간별 사이드바, 사이드바의 FeedbackOps 진입 자리, 권한별 레일, 기존 라우트 호환 → `?variant=` 시안 컨펌 | 완료 — ADR-0028, #259(Kernel·Registry·팔레트), #260(카드 런처 홈·전역 화면·공간 분리·마지막 화면 복원·FeedbackOps 자리) |
| 3 | 기존 분석 메뉴를 생산성 분석·지표관리 공간으로 나눔. 귀속은 ADR-0028(운영 개요 → 홈, 설비·기준정보 → 생산성 분석, 공지·내 VOC → 전역 유틸리티) | 완료(#260) |
| 4 | 표준 로그 개발·개선 실행 공간(#252). 도메인 구현은 별도 제품 | 공간·메뉴 등록 완료(ADR-0065, 메뉴는 예정). 화면은 사내 |
| 5 | FeedbackOps 링크 계약·매핑(#251 — 완료, ADR-0045)과 시스템 간 링크 회귀(복귀, 무권한, 미지원 필터, 새로고침·Back/Forward, 공간 0개·많음) | 링크 계약·매핑 완료, 복귀 키 `platformReturn`(FeedbackOps ADR-0071) 반영 #448, 회귀 E2E #451 |
| 6 | 셸 탑재 구조 재검토 — 시스템 전환기 + 시스템별 레일, FeedbackOps는 이동·미리 채움·복귀([ADR-0042](../docs/adr/0042-system-switcher-and-system-owned-rail.md), 사양 [15 §3.2](../docs/15_multi_workspace_ui.md#32-시스템별-레일-decided-2026-10-19-adr-0042)). A–D 시안 UX 리뷰가 D + A 연결을 권함 | 화면 Decided(2026-10-19, 전환기 A안, 사례 조사 [docs/research](../docs/research/2026-10-18-app-switcher-patterns.md)) — 구현 #423 완료(#426) |
| 7 | 분석 보드(#421, [16](../docs/16_analysis_board.md)): 하단 시트 탭·그리드 칸·칸별 조건 | 1차 동작 Decided(사용자 2026-10-19, ADR-0049 분석 Context는 칸 단위), 칸 머리·선택 표시 Decided(ADR-0051). #496·#497·#498 완료 — 분석 보드 1차 구현 완료. 서버 저장·공유는 보류 |

## 그 다음 — FeedbackOps 합류 (M6, 지도 #598)

> 2026-10-21: #592 1a단계 완료(서브모듈 → 디렉터리, CI 이전; 도구 통일은 다음 단계). [ADR-0066](../docs/adr/0066-feedbackops-merges-into-platform.md)이 아래 M5 계획(ADR-0027)을 대체했다. 단계는 [합류 설계](../docs/integration/feedbackops-merge-design.md) §6: #592 저장소 → #593 실서버 → #594 전역 기능·#595 피드백 운영 시스템 → #597 독립 앱 은퇴, #596 권한·업무 시스템 Decided([ADR-0068](../docs/adr/0068-permission-scope-and-business-system-link.md), 2026-10-22). 사내 확인 #150·#151은 병행. 아래 M5 서술은 전환 기간의 진입 링크 기록으로만 남는다.

FeedbackOps 화면은 플랫폼으로 옮기지 않는다. FeedbackOps가 VOC → Evidence → Finding → Task 흐름을 전담하고, 각 업무 공간은 그 시스템으로 좁힌 진입 링크만 둔다([ADR-0027](../docs/adr/0027-feedbackops-stays-standalone-entry-links.md), ADR-0018 대체). 남은 일은 매핑과 링크 계약이다.

| 순서 | 할 일 | 상태 |
| --- | --- | --- |
| 1 | 공간 → Managed System 매핑 표의 모양과 원천(#81) | 결정됨 — 앱 정적 표, 공간당 하나([ADR-0045](../docs/adr/0045-feedbackops-entry-link-mapping-and-scope.md), 2026-10-19) |
| 2 | 링크 계약 확장: 시스템별 목록 진입(VOC·Task·설문 + `managedSystem`)과 범위 없는 허브 진입을 `feedbackops-link` 계약·딥링크 문서에 더함 | #251 완료 |
| 3 | 셸의 진입 자리(#250에서 컨펌한 위치)에 링크를 연결, 허브 링크는 전용 권한(ADR-0045) | #251 완료 |
| 3a | FeedbackOps → 플랫폼 복귀: FeedbackOps#1278 → 그쪽 ADR-0071 `platformReturn`, 플랫폼 링크가 현재 화면 URL을 실음(contract 2) | #448 |
| 4 | 세션 공유(#150) — 그전에는 FeedbackOps 로그인이 한 번 더 있을 수 있음 | 사내 답 대기 |

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
| Line·Site를 Context 키로 둘지 | GLOSSARY·ADR-0005는 Line을 독립 축이라 하지만 코드에 키가 없다 | — |
| 생산성 개요의 지표별 버전 page key | 11 설계는 지표별 버전 키, 구현은 미등록 | — |
| 프로토타입 컨펌 캡처 보관 | ADR-0011·0013·0015·0017이 원격 프로토타입 브랜치에만 있는 캡처를 근거로 든다. 레포로 가져올지, 브랜치를 남겨 둘지 | 그 브랜치 삭제 |

## 사내·외부 답 대기

사내 적용(M4)의 전체 순서는 지도 이슈 #157.

| 이슈 | 내용 | 누구에게 | 답이 오면 풀리는 것 |
| --- | --- | --- | --- |
| #150 | 사내 SSO(IdP) 사양과 설정값 | 사내 SSO 담당 | #86, #98, #154, #155 |
| #151 | 배포·인프라 환경(on-prem·망분리·CI·브라우저) | 사내 인프라 담당 | — |
| #149 | 실어댑터 전송 형식 초안 → 합의 | 사내 백엔드 담당 | #154, #165 |
| #155 | 사내 FastAPI 플랫폼 API | 사내 백엔드 | #154 |
| #154 | 실어댑터(HTTP) + 사내 테스트 서버로 적합성 묶음 | ← #148·#149·#150 | 사내 적용 |
| #165 | Kernel 5분 폴링·계산 세대 재검증 | ← #149, #155 세대 신호 | — |
| #37 | 적재 워커 상태 스키마 합의(초안 있음) | 파서 담당 | #51 모니터링·트레이스 |
| #84 | 내 설문 응답 이력 읽기 API | FeedbackOps#548 | M3 마무리 |
| #85 | 신고자가 열 수 있는 VOC 상세 딥링크 | FeedbackOps#549 | M3 마무리 |
| #86 | 내 VOC 이력 실제 어댑터 | ← #150 | M3 마무리 |

질문지와 미결 범위 전체는 [inputs.md](inputs.md), 사내 적용 순서는 [사내 적용 가이드](../docs/integration/in-house-rollout.md) §2.

## 보류

| 이슈 | 다시 볼 조건 |
| --- | --- |
| #163 Perspective 자유 피벗 POC | 자유 피벗이 업무 필수로 확인될 때 |
| #164 AG Grid Enterprise 평가 | 셀 범위 복붙·채우기가 사내 메뉴 2–3곳에서 필수로 확인될 때 |
| #91 전역 감사 조회에 room 권한 적용(결정됨, 05) | 일부 room만 가진 콘솔 역할이 생길 때 서버에서 구현 |
| #389 F-2 tableFit 관찰 범위 축소(명시 height 표는 폭만, mutation 경로 좁히기) — 측정(2026-10-17) hover 1회당 rebind ≈1, long task 0으로 구현 안 함 | hover 중 long task가 측정되거나 CPU 4× 감속 측정에서 프레임 저하가 보일 때 |

## 끝난 것

작업 흐름(2026-10-09, #255): FeedbackOps의 이슈 처리 흐름과 역할별 리뷰어(`issue-wave-conductor`, `review-ux`·`review-quality`)를 옮겼다. conductor 후속(2026-10-10, #283): FeedbackOps conductor 4커밋 반영 — `impl-mid` 단계, 브리프 사전 점검(`templates/brief-check.md`), 웨이브 스냅숏(`wave-status.py`), 작업자 위생(`worker-hygiene.sh`), 지적 fold·file·note 분류와 가치 게이트. 스킬 5종·에이전트 4개 추가(`.agents/README.md`). 전역으로 합침(2026-10-15, #361): conductor 공통 절차는 전역 `issue-wave-conductor` 스킬로, 이 레포의 부분은 `.agents/conductor/PROFILE.md`로. 스킬 정리(2026-10-15, #363): 일반 스킬은 전역 `~/.agents/skills`로, 쓰지 않는 스킬(`shadcn`·`impeccable`·`wayfinder`·`ui-styling`) 삭제, 용어 문서는 `GLOSSARY.md`.

v0.1.0(2026-10-04): Kernel(Registry·전역 Context·URL 계약·권한·Scope·감사·활용률 계측·화면 오류 격리), 공통 컴포넌트(서버 페이징 표·내보내기·복사, 셸 상세 슬롯, 감사 타임라인, 신뢰 표시, 상태 화면, 필터 바, 같은 응답 배너), 차트 계약(Brush·Compare·Annotate·Export, 범례), FeedbackOps 디자인 시스템 기반 셸, 플랫폼 계약 E2E, 메뉴 조회 포트와 서버 적합성 묶음, 운영 빌드 조립 분리. 세부는 닫힌 이슈와 [v0.1.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.1.0).

v0.2.0(2026-10-05): M2 후속 — Context 바 1440px에서 기간 프리셋 다시 인라인(#218), 레이아웃 슬롯 `ManagementLayout`·`AnalysisLayout`(#156, ADR-0022). 세부는 [v0.2.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.2.0).

v0.3.0(2026-10-08): FeedbackOps 서브모듈 `13a3c5a`와 디자인 lint 설정(FeedbackOps ADR-0062)을 가져오고(#236), inline style 정리(#238), 플랫폼이 FeedbackOps 부품을 덮어쓰던 83곳을 걷어 내 FeedbackOps 모양·크기로(#241, 시안 C·[ADR-0023](../docs/adr/0023-feedbackops-primitive-shapes-and-sizes.md)) — 디자인 lint 위반 0, 접근성 하한 셋만 lint contract. Context 바 넘침 버튼을 이웃 칩 모양으로(#240). 설비 도메인 정정 — 설비명 없음(EquipmentID가 유일 키), room_name은 PHOTO·ETCH 같은 공정명(#242). 세부는 [v0.3.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.3.0).

v0.4.0(2026-10-08): 표 열 너비는 머리 끝 끌기로만, 컬럼 목록은 보이기 체크박스와 줄 끝 핀(#239, 시안 C·[ADR-0024](../docs/adr/0024-table-column-controls-drag-width-pin-in-list.md)). 드릴다운 — 단계마다 page key, Context가 바뀌면 단계를 지우고, 경로 바 + 단계마다 본문 교체, 출발 메뉴와 단계를 보이는 복귀 버튼(#225, 시안 A·[ADR-0025](../docs/adr/0025-drilldown-level-page-keys-path-bar-layout.md), 06 §6.4·§12.7·§22). 세부는 [v0.4.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.4.0).

v0.5.0(2026-10-09): 멀티 워크스페이스 셸 — 공간은 업무 시스템 단위(생산성 분석 · 지표관리 · 운영 콘솔 등록, [ADR-0026](../docs/adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)). FeedbackOps 화면은 옮기지 않고 공간별 진입 링크만 둔다([ADR-0027](../docs/adr/0027-feedbackops-stays-standalone-entry-links.md), ADR-0018 대체). 실제 앱 위 시안 A/B/C를 사용자가 위임한 UX 판정(GPT-6-Astra high)으로 골라 [ADR-0028](../docs/adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md): 홈 = 업무 시스템 카드 런처, 홈·공지·내 VOC = 공간 밖 전역 유틸리티(`GroupDef.space: null`, #259), 공간별 마지막 화면 복원, 레일 로고 = 홈, FeedbackOps 바닥 고정 블록·전체 링크 자리(슬롯, 앱 미주입 — #251·#81 대기), 팔레트 공간 묶음(#260). 슬라이스 품질 리뷰 반영(#267). 세부는 [v0.5.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.5.0).

v0.6.0(2026-10-10): 페이지 필터 줄 접기 — `PageFilterBar` opt-in 접기, 접힌 상태는 필드명·값을 모두 담은 펼치기 버튼(말줄임 없이 항목 단위 줄바꿈), 메뉴별 접힘 기억, 첫 소비자 사이클타임 상세(#230, 시안 A+C 혼합을 사용자가 위임한 판정(GPT-6-Astra high)으로 골라 [ADR-0029](../docs/adr/0029-page-filter-bar-collapse-summary.md)). 공간 진입 목적지와 메뉴 열기 판정을 Kernel `canOpen`·`spaceEntry`로 — 부분 권한 공간은 마지막 화면 → 열 수 있는 홈 → 첫 열 수 있는 메뉴(#264). 테스트 결정성(#262·#273), app-preview 종료 전 소유 확인(#266, 규칙표 테스트를 CI에 연결 #279), 내부 fixture builder(#265). 세부는 [v0.6.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.6.0).

v0.6.1(2026-10-12): 후속 정리 — 목적지 단건 조회의 provisional을 대상 객체 시점으로 판정(#122, `MockEndpoint.provisional` 훅), FeedbackOps 서브모듈 변경이 turbo 캐시에 가려지지 않게 `globalDependencies`(#237), 사이클타임 도움말 용어를 필드명 '느린 실행 기준'으로(#277), 접힘 요약 잘림·정렬 계약 E2E(#278), FeedbackOps conductor 후속과 스킬 5종·에이전트 4개(#283). 세부는 [v0.6.1 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.6.1).

v0.7.0(2026-10-15): 전체 점검 정비 — 코드 품질·컴포넌트·UX 워크스루 지적 7묶음과 마감 리뷰 4건. 키보드 포커스 복귀(상세 닫기·명령 팔레트·드릴, #296), 닫히는 오버레이가 다음 Escape를 가로채지 않음(#312, FeedbackOps 닫힘 모션 제거), 차트 데이터 표·CSV 같은 x 투영과 reduced-motion(#297), 지표 목록→상세 복귀와 Kernel 홈 fallback·되돌린 Context 알림(#298, Scope 포함 #337), 상태 표시(실패 조회 건수·정의 절 신뢰 표시, #299), 링크 복사는 쓰기가 끝난 뒤에만 성공(#300), 접근성 하한(#301), 화면 문구 정리(#302, 마감 묶음 #336), 표 쪽 이동 포커스(#338), 메뉴 이동 뒤 포커스를 새 화면 제목으로(#339, 사용자 결정). 하위 경로 배포 위치 어댑터([ADR-0030](../docs/adr/0030-location-adapter-base-path.md), #318), 소개 사이트 `site/`와 GitHub Pages(#317·#322·#327), 테스트 워커 상한 turbo 통과(#328), E2E 오버레이 포커스 settle(#326). 세부는 [v0.7.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.7.0).

v0.8.0(2026-10-15): 탭 선택 표식과 메뉴 폴더 시스템 단계 — 상세 패널·설비 상세 탭 선택을 색 대신 2px 아래 막대+굵기로, `@ap/ui` `TabsList`·`TabsTrigger` 플랫폼 구현(#340, 실제 앱 시안 B 사용자 컨펌, [ADR-0023](../docs/adr/0023-feedbackops-primitive-shapes-and-sizes.md) 개정). 메뉴 폴더 `menus/<space>/<group>/`, 생성기 위치·폴더-space 일치 검사, probe 복구(#331, [ADR-0031](../docs/adr/0031-menu-folders-by-space.md)). 문서 표류(#235·#231), 마감 리뷰 문서 2건. 세부는 [v0.8.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.8.0).

v0.9.0(2026-10-15): 정비 슬라이스 9 — 팔레트→제목 포커스 인계를 Kernel `paletteFocus.ts` 한 경계로, 공개 `PageNavigation`은 페이지 소비용만, 셸 포커스 테스트의 고정 대기 제거(#345). 상세 패널 탭이 URL·전체 화면으로 — 권한/역할 관리 `tab` 키, 설비 [전체 화면] 탭 전달, 알 수 없는 탭 경고가 history 이동에도 유지(#350, 06 §13). 지표 상세 도착 스크롤 — 위쪽 조회 응답 뒤 한 번, 고정 머리 아래 착지, 카탈로그 쌍 검증 중복 요청 제거(#325). 마감 정리(#357). 세부는 [v0.9.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.9.0).

v0.9.1(2026-10-15): 정비 슬라이스 10 — 키보드로 누른 버튼이 사라질 때 포커스가 BODY로 떨어지지 않게. 상세 패널은 패널 수명 관찰로 선택된 탭(없으면 패널)으로 — 알 수 없는 탭 복구 버튼, 탭 내용 안 포커스 + history 탭 전환. Scope 게이트 `최근 Scope 적용`·`다시 시도`는 main으로(#353, 06 §13·§26). 세부는 [v0.9.1 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.9.1).

v0.10.0(2026-10-16): 정비 슬라이스 11 — 데모 실사 결함 마감(#320: 주석·선택 라벨 겹침, 사이트 D9 링크 Scope). 감사 시각 필터는 한쪽만 열 수 있고 보는 사람 시간대로 입력, 칸별 오류(#305, ADR-0033). URL 도착으로 함께 열린 상세 패널은 제목 포커스를 빼앗지 않는다(#356, ADR-0032). 범위 밖 page 딥링크는 마지막 쪽으로 맞추고 URL은 replace(#314). 서버 message는 세부로, 사용자 문구에 계약 어휘 없음(#304, ADR-0034). 페이지 머리는 좁아지면 설명 → Data Trust 요약 → 잠정 배지 순으로 양보하고 보조 동작은 ⋯ Popover, 모든 양보 뒤에만 가로 스크롤(#303, ADR-0035). 차트 구간을 키보드(시작·끝·프리셋)로 고르고 막대 경계에 맞추며 비교 중에는 현재 기간으로 자른다(#307, ADR-0036). 머리 설명이 접히고 펼쳐질 때 포커스를 잇는다(품질 리뷰 DQ1). 세부는 [v0.10.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.10.0).

v0.10.1(2026-10-16): 정비 슬라이스 12 — 잘못된 URL 값 경고 문장(필드 이름 + 원래 값 + 원인·행동)을 Kernel i18n `invalidValueSentence` 한 곳에서 만든다(#371, 메뉴 5곳, 한국어 그대로). 차트 구간 시작·끝을 Tab·방향키·Enter만으로 고르고 적용하는 E2E(#374). #367(복원된 패널까지 Tab 80번)은 받아들이고 닫음. 세부는 [v0.10.1 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.10.1).

v0.11.0(2026-10-16): 정비 슬라이스 13 — 표·필터 일관성([ADR-0037](../docs/adr/0037-table-filter-consistency.md), #306 시안 A + 표 높이 C + 미적용 표시 B). 표는 내용만큼 커지고(`min(N, max(240px, R))`) 동작 열은 오른쪽 고정, 선택 열은 내보내기·복사·일괄 동작이 있을 때만, 행 32px(#384). 관리 화면 필터는 초안 뒤 `적용 (n)`으로 반영, 접혀도 `미적용 n` 표시, `필터 초기화`는 적용된 필터가 있을 때만, 입력 40px(#385). 표 sort/page 경고 4곳을 `useTableUrlWarning`·`TableUrlWarning` 하나로, 드릴 형식 오류 제목에서 `key=value` 제거(#380, ADR-0034). 품질 리뷰 반영 — 사라진 `필터 초기화` 뒤 포커스를 첫 필드로, `useFilterDraft` 키 타입, 중복 테스트 정리(#391). 세부는 [v0.11.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.11.0).

v0.12.0(2026-10-18): 정비 슬라이스 14 — 루트 검사가 의존 패키지 변경을 캐시 해시에 전파(#390). 잘못된 주소 안내를 필드 이름 + 원래 값 문장으로, 사용자 문구의 구현 어휘 제거, 0건·과대·모집단 상태 안내(#397). 테스트 픽스처는 `@ap/kernel/testing` 한 곳([ADR-0040](../docs/adr/0040-public-test-adapter-entry.md)). 차트 주석은 작성자만 지우고 삭제를 감사에 남김, 겹치는 주석 라벨 정리([ADR-0041](../docs/adr/0041-annotation-author-delete-audit.md), #399). 좁은 페이지 머리 겹침 해소·즐겨찾기 제거 뒤 포커스·KPI 증감 P50 표기(#398). 경고 초기화 뒤 포커스·감사·권한 sort/page 경고 공통화·드릴 형식 오류 복구(#389), 관리 필터 초안+적용 배선을 `useManagementFilters` 하나로(#389), 좁은 폭(1024 + 상세 패널)에서 동작 열을 72px 아이콘 + 툴팁으로 고정 유지(#399 AC-3, 시안 A). tableFit 관찰 범위 축소는 측정 뒤 보류. 세부는 [v0.12.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.12.0).

v0.13.0(2026-10-19): v0.12.0 뒤 쌓인 일과 정비 슬라이스 15. 업무 시스템 전환기 A안과 시스템별 레일(#423, [ADR-0042](../docs/adr/0042-system-switcher-and-system-owned-rail.md)). FeedbackOps 공간별 진입 링크 계약·매핑(#251, [ADR-0045](../docs/adr/0045-feedbackops-entry-link-mapping-and-scope.md)), 복귀 키 `platformReturn`(#448), 회귀 E2E(#451). 내 VOC 상태 라벨을 FeedbackOps 정본으로(#234). 지표 변경 이력을 공용 감사 저장소에서(#90, ADR-0048). SDK 착수: 목표(ADR-0043)·저장소 구조(ADR-0044)·`@ap/contracts` 배포 모양(#430)·디자인 시스템 원본을 `@ap/ui`로 전체 이전(#441–#443, ADR-0046)·상세 슬롯 통합(ADR-0047)·git 태그 소비 시험(#458)·rich-content allowlist 동등성 검사(#459). 정비 15: 명령 팔레트 가벼운 scrim(#310, FeedbackOps#1202는 #1050과 같은 값이라 닫음), #413 관찰 ①·③(#419), 품질 리뷰 정리. conductor 공통본 전환(#394·#436).

v0.14.0(2026-10-20): 분석 보드 1차와 v0.13.0 뒤 쌓인 일. 분석 Context는 칸 단위([ADR-0049](../docs/adr/0049-analysis-context-belongs-to-a-pane.md)) — Kernel 칸 Context(#496), `/board` 화면·시트·레이아웃·선택한 칸의 Context 바·브라우저 저장(#497 골격), 칸 머리 차이 칩·`같음 N`·`⋯` 동작·시트 조건 복사·`분석 보드에 열기…`·상세 공유·`이전 화면`(#497, [ADR-0051](../docs/adr/0051-analysis-board-pane-header-signal-chips-numbered-selection.md)), 생산성 개요·사이클타임 상세·설비 마스터 보드 지원과 보드 계약 E2E(#498). SDK 트랙: 호스트 → 모듈 계약 1판(#403·#489, ADR-0053), 쓰기 포트(#501·#502, ADR-0054), 기계가 읽는 테마 계약(#512, ADR-0055), SDK 배포 모양(#519, ADR-0056), 공개 API 스냅샷 검사(#520) — 묶음 태그 `sdk-v0.5.0`–`sdk-v0.9.0`. 업무 시스템 이름 MARS·BRAVO(+CLAS 준비 중)·사이트 MEM·FDRY(#472). 소개 사이트 재구성과 플랫폼 요구사항 문서 17(#468). 구현 안 함: 보드 서버 저장·공유 등(16 §10), 보드 자체 사용 계측(백로그). 세부는 [v0.14.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.14.0).

v0.15.0(2026-10-21): 보드 첫 사용 다듬기(슬라이스 17, #526)와 v0.14.0 뒤 쌓인 일. 실행 취소 토스트 Enter 두 번 실행(#533), 보드 품질 후속 — 권한·칸 루트·경로 파라미터·칸 href 규칙 한 곳으로(#534), 다른 칸 상세가 열리면 이전 칸 상세를 닫음(#535), 빈 화면 안내·좁은 칸 차이 칩 우선·칸 크기(화면 맞춤·경계선·칸 접기·최대화·시트별 저장, #536, [ADR-0060](../docs/adr/0060-analysis-board-pane-sizing-collapse-maximize.md)), 품질 리뷰 후속(#567·#568). SDK 차트 슬라이스(#529: 차트 색 토큰 #544, `AnalysisChart`·ChartSpec #545–#547 ADR-0058, 계층 범례 트리 #539 ADR-0057, 품질 정리 #560 — `sdk-v0.10.0`). MARS 이관 웨이브 1 착수: ADR-0059와 조건 다중축 맵·앱 주입 축 1부(#552), `MultiCombobox`(#541), 조회 바·차트 드릴 사례 조사(#557). 구현 안 함: 보드 후속 Q7–Q9([백로그](backlog.md)). 세부는 [v0.15.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.15.0).

2026-10-05: 문서·작업 규칙 정리와 이 보드 도입(#220). 결정 — 활용률 이벤트는 식별 필드만(#75, ADR-0020), 차트는 Canvas 렌더러(ADR-0021), 운영 조립 주입 승인(ADR-0009), 전역 감사도 room 권한 적용(#91, 구현은 해당 역할이 생길 때). GitHub 정리 — #33·#63 닫음, M5 마일스톤 생성, #81·#84·#85를 M3에, #218을 M2에. #218 Context 바 적용 배지 생략·라벨 먼저 숨김. #156 레이아웃 슬롯 — 관리 화면은 접을 수 있는 왼쪽 필터 레일, 분석 화면은 KPI 띠 + 차트 2열 + 카드별 접기, 생성기 뼈대 반영(ADR-0022).
