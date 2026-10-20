# 소개 사이트 콘텐츠 원장

소개 사이트의 사실·숫자를 공개 근거에 연결한다. 실행 통과 수나 운영 연결 완료를 주장하지 않는다.

## 7. 콘텐츠 원장

### 7.1 사실·숫자 (사이트에 들어가는 것 전부)

조사·측정 기준일 2026-10-20. "재측정"은 첫 공개 직전에 같은 방법으로 다시 세서 고친다.

| ID | 주장·숫자 | 출처 | 비고 |
| --- | --- | --- | --- |
| L01 | 최신 완료 상태 v0.13.0(2026-10-19)와 정비 슬라이스 15의 내용 | `.planning/README.md` 「끝난 것」 | 릴리스 개수는 표기하지 않음 |
| L02 | `@ap/components` 공개 React 컴포넌트 21개: AnalysisChartFrame, EChart, PlatformDataTable, PageFilterBar, SegmentedRadio, DetailDrawer, Field, AuditTimeline, DataTrustIndicator, PlatformPage, Panel, StatCard, QueryView, OutcomeView, StateMessage, LoadingBlock, ManagementLayout, AnalysisLayout, DrillLayout, DrillPath, ReturnLink | `packages/components/src/index.ts` + 각 파일의 `export function [A-Z]…`(D1이 셈) | 재측정. `OutcomeScope`는 공개 export 아님 |
| L03 | `@ap/ui`: 환경 helper isProductionEnv·isMacPlatform·shortcutLabel 포함. Button·buttonVariants, StatusBadge·Dot(Tone 5종), shadcn 13계열(Alert·Badge·Checkbox·Dialog·DropdownMenu·Input·Label·Popover·RadioGroup·Select·Skeleton·Tabs·Tooltip), DetailPanelSlot 3종, cn, prefersReducedMotion | `packages/ui/src/index.ts` | — |
| L04 | `@ap/shell` 7개: AppShell, AppRail, AppSidebar, ScopeSelector, CommandPalette, GlobalContextBar, RouteOutlet | `packages/shell/src/index.ts` | — |
| L05 | Kernel·contracts 공개 API(createRegistry, pathFor, PlatformProvider, usePlatform, PlatformLink, useMenuQuery, useMenuFetch, usePlatformQuery, useEntityQuery, useDrill, I18nProvider, defineEndpoint, PlatformAdapter 메서드 목록) | `packages/kernel/src/index.ts`, `packages/contracts/src/menu-query.ts`, `packages/contracts/src/adapter.ts` | `linkTo`·`can`·`canOpen`은 `usePlatform()` 반환값 |
| L06 | 계약 E2E test() 선언 107개 | `apps/platform-e2e/tests/contracts.spec.ts` | 선언 수, 통과 수 아님. 2026-10-20 아래 스크립트로 다시 셈(이전 70은 오래된 값). 영역별 `test.describe` 묶음 |
| L07 | 테스트 파일 210개, it()/test() 계열 선언 1950개(`packages/`·`menus/`·`apps/platform-web/`) | 현재 워크트리 재측정 | 선언 수. 매개변수화·skip 포함, 펼친 실행 수 아님. 2026-10-20 다시 셈(이전 105·968은 오래된 값) |
| L08 | 공간 3개(MARS·BRAVO·운영 콘솔), 그룹 패키지 7개, 홈 런처, 공간별 마지막 화면 복원 | `apps/platform-web/src/menus.ts:21-37`, `.planning` v0.5.0·v0.6.0 | — |
| L09 | Registry가 메뉴·그룹 중복, 부모·경로, pageKeys·contextResetKeys, 드릴 선언을 검증 | `packages/kernel/src/registry.ts` | 새 그룹은 사람이 GroupId·GROUPS 행을 먼저 추가 |
| L10 | 전역 조건과 page key를 버전 URL로 읽고 써 새로고침·Back/Forward·메뉴 전환에서 복원, 지원 안 하는 조건은 지우지 않고 "미사용" 표시, `linkTo`가 현재 전역 조건을 실어 감 | E2E `contracts.spec.ts:456-524`, `platform.tsx` spaceResume 주석 | — |
| L11 | 메뉴·직접 URL 권한 게이트, mock adapter가 조회마다 세션 권한·Scope·room 재검사 | `packages/shell/src/RouteOutlet.tsx:15-40`, `packages/mock-server/src/adapter.ts` | mock 판정. 서버 거부 검증은 별도(`apps/platform-e2e/AGENTS.md:11`) |
| L12 | 링크 복사 알림: "받는 사람의 권한으로 서버가 다시 검증합니다", URL은 권한 증명이 아님 | `packages/shell/src/GlobalContextBar.tsx:42` | — |
| L13 | PlatformDataTable: 서버 페이징·정렬, URL 상태, 가상화, 열 너비·표시·고정, 선택, 행 복사, CSV/XLSX | `packages/components/AGENTS.md` | — |
| L14 | AnalysisChartFrame: 확대·구간 선택·초기화·비교·주석·내보내기, Brush 로컬, 전역 기간은 확인 뒤, 주석 `(chartId, scopeId)`, 같은 데이터 표 보기. 툴바 문구 `확대`·`구간 선택`·`초기화`·`비교`·`주석`·`내보내기`·`분석 구간 적용…` | `packages/components/src/AnalysisChartFrame.tsx:292-348`, 플랫폼 UI 계약 §16 | — |
| L15 | DataTrustIndicator: 이슈·미확인·coverage·갱신 시각·원천·잠정 상태, unknown을 정상·0으로 바꾸지 않음 | 플랫폼 UI 계약 §18 | — |
| L16 | 조회 상태 loading·empty·forbidden·too_large·timeout·error 구분, 위젯별 부분 실패 격리. 데모 DevTools 응답 시나리오 11종(정상·느린 응답·0건·상태 원천 미확인·일부 위젯 실패·권한 거부·조회 과대·시간 초과·서버 오류·응답 형식 오류·Scope 확인 실패) | `packages/components/src/StateView.tsx`, `apps/platform-web/src/dev/DevTools.tsx:14-26`, `docs/integration/in-house-rollout.md` §5-7 | — |
| L17 | ManagementLayout: 자기 폭 960px 이상 260px 필터 레일, 좁으면 팝오버. AnalysisLayout: KPI 띠·차트(960px 이상·펼친 차트 2개 이상이면 2열)·분해 표, 단위별 접기 | 플랫폼 UI 계약 §12.6, ADR-0022 | — |
| L18 | 드릴 단계 공정 → StGroup → 설비, 단계마다 page key, 경로 칩, 복귀 | `menus/analytics/analytics/src/index.ts:22-27`, `.planning` v0.4.0 | — |
| L19 | Page Archetype 5종, 전용 레이아웃 컴포넌트는 Management·Analysis 2종, 나머지는 공통 부품 조립 + 생성기 뼈대 | 플랫폼 UI 계약 §12 | 06 절 각주로만 |
| L20 | 셸 치수 레일 52px · 사이드바 240/56px · 머리 50px · 상세 슬롯 440px | FeedbackOps `tokens.css:169-174` | — |
| L21 | `linkTo`/`PlatformLink`가 목적지 객체 ID와 분석 Context 분리, 목적지 권한·공간 확인, `returnTo` 복귀(출발 URL·드릴 단계), 열 수 없는 복귀 대상은 열 수 있는 상위 메뉴나 홈으로 돌아감(#298) | 플랫폼 UI 계약 §22, `.planning` #298 행 | — |
| L22 | (사이트에서 뺌, 2026-10-20 FIX4) 설비 마스터의 '선택 설비로 분석' 버튼 코드 — 메뉴 특화 코드 발췌라서 부록 C에서 뺐다. 본문·부록 어디에서도 이 주장을 쓰지 않는다 | `menus/analytics/equipment/src/pages/EquipmentMaster.tsx:63` | — |
| L23 | FeedbackOps는 독립 앱, 화면·API·권한·감사를 플랫폼에 합치지 않음, `/voc` 링크는 origin 설정·검증 시 새 탭, 셸의 공간별 링크 슬롯은 미주입 | ADR-0027, `apps/platform-web/src/slots.ts:5-8` | 데모에서는 비활성 |
| L24 | 플랫폼 링크는 업무 시스템 범위로 좁혀 FeedbackOps를 열고 기간·Site·returnTo는 FeedbackOps 주소의 키로 따로 보내지 않는다. 복귀 키 `platformReturn` 하나에 링크를 그린 플랫폼 화면의 URL이 실린다(contract 2). 확장 #251·#448, 개선 실행 공간 #252 | `docs/integration/feedbackops-deeplink.md`, `.planning/README.md` 3a행, ADR-0045 | 낡은 문장("자동 전달 없음")을 고침 |
| L25 | 업무 시스템별 백엔드·DB는 합치지 않음 | `docs/15_multi_workspace_ui.md` | — |
| L26 | 사내 적용 = `#platform-assembly` 조립 모듈을 실어댑터로 교체, Kernel·셸·공통 컴포넌트·메뉴 화면은 고치지 않음 | `docs/integration/in-house-rollout.md` §0·§1 | — |
| L27 | 서버 적합성 묶음이 어떤 어댑터든 같은 잣대로 판정, 지금 mock으로 모든 메뉴 엔드포인트 통과(oversize 표본 없는 `maxRows` 검사 3개는 건너뜀) | `docs/integration/in-house-rollout.md` §0 | 문서 기재, D1 미실행 |
| L28 | M4 막힌 입력 #150·#151·#148·#149 → #154·#155·#165, #37. 완료 기준(적합성 통과, SSO 두 계정 범위 차이, 세션 만료 시 이전 결과 미노출, Correlation ID, unknown/null, 개발·E2E mock 유지) | `docs/integration/in-house-rollout.md` §2·§6, `.planning` 「사내·외부 답 대기」 | — |
| L29 | #233: 후보 지표, 기준선·목표 없음, 1개 팀·1 Site/Line 파일럿과 지난 6개월 기준선 담당 결정 대기 | #233 | "제안"으로만 표기 |
| L30 | 활용률 이벤트는 식별 필드만(메뉴·공간·경로 패턴·시각·세션·체류), 조회 조건 값은 수집 안 함 | ADR-0020 | — |
| L31 | MVP 다음: 멀티 워크스페이스 v2(#249, #252), FeedbackOps 2단계 M5(#213: #81 → #251 → 셸 연결, #150 전 재로그인 가능), 계획된 흐름(#163, #37 → #51) | `.planning` | M5 마일스톤 설명의 구식 문구(ADR-0018) 대신 ADR-0027 기준 |
| L32 | 기술 표(사용 중 3, 후보·보류·상용 10행)와 라이선스·조건 | `docs/04_frontend_ui_ux.md` | 라이선스 미확정 항목은 "미확정·확인 필요" 그대로 |
| L33 | 분석 도구 확장 M0–M5와 게이트, PR #295 미채택 조사 문서 | PR #295(공개) | 2026-10-13 PR 열림 |
| L34 | 위험 8개와 대응 | `docs/integration/in-house-rollout.md` | — |
| L35 | (사이트에서 뺌, 2026-10-20 FIX4) metrics 메뉴: git 추적 파일 23개·1,966줄, 화면 154줄+257줄, manifest 28줄 — 메뉴 특화 사례라서 부록 C에서 뺐다. 본문·부록 어디에서도 이 숫자를 쓰지 않는다 | git ls-files 기준 재측정 | 복잡도 사례, 절감량 아님 |
| L36 | gen:menu: 메뉴 패키지 파일 11개 + `.gen-menu.json`, 앱 배선 4곳(menus.ts·dev/mock-assembly.tsx·style.css·package.json), 생성 테스트, 명령 형태 | `tooling/gen-menu/src/{cli,generate,templates}.ts` | — |
| L37 | 의존 방향 lint, 디자인 lint(@shadcn/lint 6규칙), Registry 검증, 계약 E2E 항목별 보고 | `tooling/AGENTS.md` | — |
| L38 | "새 메뉴가 추가될 때 플랫폼 코드를 계속 고쳐야 한다면 플랫폼 설계가 실패한 것이다." | `docs/06_platform_ui_contract.md` §30 | 인용 그대로 |
| L39 | As-Is 구조적 문제(메뉴별 반복 구현, 같은 URL 다른 숫자, 0건 모호, 권한·감사 편차) | 플랫폼 UI 계약 §4–6·§17–19 | 측정값 아님 |
| L40 | VOC 리드타임·신규 메뉴 개발 기간 등 아직 수치화 안 됨 | #233 | 사내 도구 이름은 쓰지 않음 |
| L41 | 정비 슬라이스의 2026-10-13 상태 기록 | `.planning/README.md` 「진행 중」, `gh issue view`(2026-10-13) | 과거 스냅샷. 현재 상태로 인용하지 않음 |
| L42 | 데모는 브라우저 안 mock assembly, 합성 데이터, 실제 SSO·권한 서버·mart 미연결 | `README.md:3-5`, `apps/platform-web/README.md:3` | — |
| L43 | MVP 지원 환경은 데스크톱 웹 | `docs/05_roadmap_and_open_questions.md` | — |
| L44 | 다크 모드 Deferred, FeedbackOps 토큰에 다크 블록 없음 | DESIGN.md Open Decisions, FeedbackOps `tokens.css` | 사이트 라이트 전용 근거 |
| L45 | Kernel이 pathname 그대로 매칭·root-relative pushState, `isAppRelativePath`가 `#` 거부, vite `base` 없음 | `packages/kernel/src/platform.tsx:190,284-287,639-646`, `packages/contracts/src/url.ts:213-225`, `apps/platform-web/vite.config.ts` | 사이트 본문에는 안 씀(설계 근거) |
| L46 | 감사: 공통 AuditTimeline·포트·운영 화면 있음, 모든 메뉴 행위 자동 감사 아님, 실서버 저장 미확인 | `packages/contracts/src/adapter.ts`, `packages/components/src/AuditTimeline.tsx` | — |
| L47 | 도입 원칙: 성능·접근성·표 대체 경로·Trust가 나빠지면 도입하지 않음, 현행 무료 경로 우선 | `docs/04_frontend_ui_ux.md` | — |
| L48 | ECharts Canvas 렌더러 결정 | ADR-0021 | — |
| L49 | 원문 "플랫폼 쪽 준비는 끝났다" — 사이트는 "mock 기준으로 끝났고, 실서버 연결은 사내 답 대기"로 한정해 쓴다 | `docs/integration/in-house-rollout.md` §0, `.planning` 「지금 어디까지」 7단계 | 한정은 사이트의 해석 |
| L50 | UI 디자인 시스템의 원본은 플랫폼 `@ap/ui`다(FeedbackOps `@fops/ui` 전체를 옮겨 옴). FeedbackOps가 이를 git 태그로 받아 쓴다 | ADR-0046, ADR-0043, ADR-0044, `packages/ui/AGENTS.md` | ADR-0011의 "FeedbackOps 원본을 소비"는 ADR-0046으로 대체됨 |
| L51 | 메뉴 라벨·경로: 생산성 개요 `/analytics/productivity`, 사이클타임 상세 `/analytics/cycle-time`, 실행 상세 `/analytics/executions/:equipmentId`, Wafer Journey, 설비 마스터 `/equipment`, 지표 카탈로그 `/metrics`, VOC `/voc`, 운영 콘솔 `/admin/*`(권한/역할 관리·변경 감사·메뉴 활용률·메뉴 레지스트리) | `menus/*/*/src/index.ts` | 공정·레시피 마스터·`/notices`는 화면이 없으므로 기능으로 소개하지 않음 |

| L52 | 처음부터 범용 빌더를 만들지 않고 메뉴 2–3곳의 반복 수요 확인 뒤 공통 기능으로 승격한다 | docs/06_platform_ui_contract.md §1 | 확정 원칙 |
| L53 | 자유 배치 Widget Framework·Dashboard Builder는 반복 수요 검증 전 Deferred다 | docs/06_platform_ui_contract.md §14 | 구현 완료 아님 |
| L54 | Saved View 제공 순서는 Deferred이며 복원 시 서버 Scope 재검증 계약을 따른다 | docs/06_platform_ui_contract.md §21 | 저장 기능 구현 완료 아님 |
| L55 | 지표 Context는 metricId·metricVersion 쌍이며 서버 검증 실패 시 최신 버전으로 대체하지 않는다 | docs/06_platform_ui_contract.md §5 | 확정 계약, 실서버 연결 별도 |
| L56 | 서버가 limits.maxRows로 행 상한을 판정하고 한도를 넘으면 too_large로 구분한다 | docs/06_platform_ui_contract.md §15·§19 | 확정 계약, 실서버 연결 별도 |
| L57 | 분석 기능 선택·시각화 어댑터·사용자 조합 분석 설계와 M0–M5 순서, 탐색 집계와 공식 지표 구분 제안 | GitHub #291 | 2026-10-14 OPEN, Candidate·미채택 |
| L58 | Capability Registry·Recipe Adapter M1 PoC: 데이터셋·질문·필드 역할 선언, 후보 타입 실험, 공개 export 금지, 기존 화면 일괄 교체 없음 | GitHub #292 | 2026-10-14 OPEN, 일정 미정 제안 |
| L59 | M2 PoC는 기본 ECharts를 유지하고 Lightweight Charts·uPlot의 고밀도 시계열 성능·정밀도를 비교한다 | GitHub #293 | 2026-10-14 OPEN, 실증 이점이 있을 때만 |
| L60 | 축·필터·패널 조합과 저장·공유는 #294의 미결 계약·UX 결정이며 실제 앱 variant 시안 승인 뒤 별도 구현한다 | GitHub #294 | 2026-10-14 OPEN, 결정 대기 |
| L61 | 기술 후보 단계 연결: 현행 공통 부품 ①, 선언형 선택 ②, 자유 탐색·배치 ③, 고밀도 시계열 성능 평가 | GitHub #291–#294, site 소개 구성 | 설명용 분류, 채택 결정 아님. 띠 순서는 조사 문서(PR #295)의 M0–M5 단계 순서 |

| L62 | 실제 화면 갤러리는 Pages 경로의 mock 데모 빌드를 UI 상호작용으로 캡처한다. DPR2로 저장하고 shots.json의 width·height는 CSS px이다. 차트·표는 구성요소 영역만, 상태 화면은 설비 목록 패널만, 세로·가로로 긴 것은 위쪽 중심 영역을 찍고 타일에서 cover-top으로 잘라 보여 준다. 합성 데이터이며 운영 데이터가 아니다 | `apps/platform-web/dist` (`AP_BASE_PATH=/analytics-platform/demo/`), `site/scripts/shots.mjs`, `apps/platform-web/README.md` | 배포 시 자동 캡처, 실패 시 배포 중단 |
| L63 | ECharts 등록 유형은 선·막대·파이·산점도이고 Brush·DataZoom·MarkArea·MarkLine·Toolbox·Tooltip을 등록한다. 메뉴는 선·막대를 사용한다 | `packages/components/src/EChartImpl.tsx`, `menus/analytics/analytics/src/pages/ProductivityOverview.tsx` | 파이·산점도는 메뉴 미사용, 화면을 생성하지 않음 |
| L64 | 플랫폼 기능 9묶음과 요구 R1.1–R9.7의 상태 | `docs/17_platform_requirements.md` §1.1·§3.1–§3.9 | 요구 ID와 상태를 소개 사이트의 기능 지도·상태 보드에서 그대로 사용 |
| L65 | 분석 대표 장면 7단계: 이상 확인 → 원인 추적 → 비교·주석 → VOC → 개선 Task 복귀 → 개선 확인 → 변경 감사 | `docs/17_platform_requirements.md` §2 | 각 단계의 동작·상태는 원문 기준 |
| L66 | 플랫폼의 업무 맥락·화면 간 조건·숫자 신뢰·VOC·개선 연결·자유도 한계 | `docs/17_platform_requirements.md` §1·§4·§6 | 효과 수치·실데이터·사용자 조합 분석을 주장하지 않음 |
| L67 | 업무 시스템은 MARS·BRAVO·CLAS(준비 중)·운영 콘솔이고, mock 사이트는 MEM·FDRY | `docs/17_platform_requirements.md` §0·§3.7 | 표준 로그 개발·개선 실행은 계획 |
| L68 | 기존 시스템 이전 경계와 두 경로(저장소 안 화면 동작, SDK 모듈은 고정 모듈로 검증되어 동작, 첫 외부 앱 연결 대기) | `docs/17_platform_requirements.md` §5 | 팀의 화면 내용·업무 규칙·도메인 API는 계속 팀 소유 |
| L69 | SDK의 보장·이득·상태와 의존 방향 | `docs/17_platform_requirements.md` §3.9, ADR-0043, ADR-0044, ADR-0053 | SDK는 플랫폼 소유 계약·프레임워크이며 독립 실행은 제품 책임 |
| L70 | 분석 보드 시안의 칸·조건·레이아웃·선택 표시 | `docs/16_analysis_board.md` §4–5, ADR-0051, `docs/17_platform_requirements.md` R4.1 | 진행 중(칸 조건 Kernel #496 병합, 보드 화면 #497·메뉴 지원 선언 #498 남음)·시안·예시 데이터 |
| L71 | 도입 근거로 보일 수 있는 범위와 아직 없는 것 | `docs/17_platform_requirements.md` §6–7 | 효과 숫자·실데이터·사용자 조합 분석은 아직 없음 |
| L72 | 요구 ID R1.1–R10.8의 개별 상태 표기와 §0의 여섯 상태 이름 | `docs/17_platform_requirements.md` §0·§3.1–§3.9·§7 | 표에 적힌 동작·설계·계획·결정 대기·보류·사내 답 대기·조직 요구값 표기를 보존 |
| L73 | 히어로 h1 "화면을 옮겨도 조건은 그대로, 숫자는 믿을 수 있게."는 R1.1·R1.2·R2.1·R2.2의 요약이고, 부제의 '화면 사이에서 생기는 일'은 02의 여덟 장면(L91–L98)으로 이어지고, 부제의 세 문장 순서(숫자 → 맥락 → 새 화면)는 핵심 장면 1·2·3의 순서다. 부제 끝은 '이 저장소 안 화면이 공통 부품과 조건 선언을 쓰면'으로 한정한다(장면 1·2가 따라오는 범위, L93). '어떤 메뉴를 만들든'은 이 단서 없이 사이트에서 쓰지 않는다(SDK 모듈은 아직 공통 표·차트·신뢰 표시 부품을 받지 못하고 조건은 읽기만, L101). eyebrow '사내망·사내 서버 위에서'는 R10.4(요구)·R9.5(서버는 계약만)의 요약이며 L101. "플랫폼은 고치지 않습니다"는 쓰지 않는다: 저장소 안 화면은 `packages/contracts/src/menu.ts`의 GroupId·SpaceId·PERMISSIONS 목록에 한 줄을 더하고, SDK 모듈만 `<모듈>:` 접두사로 플랫폼 파일을 고치지 않는다(ADR-0053). 히어로 한 줄 "예시 데이터로 끝까지 동작, 실서버 연결 전"은 L72의 상태와 같다 | `docs/06_platform_ui_contract.md` §30, `docs/17_platform_requirements.md` §1·§3.1–§3.2·§3.6 | 사이트의 해석 문장 |
| L74 | 도식 A(장면 3의 접힌 보기이자 캡처 없는 조립의 히어로 대체 그림)의 세 층: 플랫폼 안이라서 되는 장면 여덟 가지(L91–L98, 장면 5는 진행 중이라 점선), 그것을 지키는 장치 4가지(등록할 때 거부 R9.3, 계약 E2E R8.4, 경계·디자인 검사 R8.5, 서버 적합성 검사 R8.4·R9.5 — 지금은 mock 어댑터를 판정), 화면을 올리는 길(SDK UI는 태그로 버전 고정 R9.6, 다른 저장소 앱은 같은 선언으로 · 고정 모듈로 검증 · 외부 앱 연결 대기 #332, 도식 안에 'SDK 모듈은 아직 공통 표·차트·신뢰 표시 부품을 못 받고 조건은 읽기만 — 12 대조표'를 적는다, L101). 맨 아래에 서버 약속과 사내 서버. 표·차트·상세 패널 띠에서 분석 보드는 뺀다(진행 중, 화면 구현 전) | `docs/17_platform_requirements.md` §1.1·§3.8–§3.9, `tooling/AGENTS.md`, `docs/integration/sdk-git-tag-consumption.md` | 설명용 도식 |
| L75 | 장면 각각의 '플랫폼 안에서는' 문장 근거는 L91–L98에 있고 아래는 그 요약이다(이전 L89 약속 칸을 이어받음): 조건은 사이트·공정·설비 그룹·설비·Lot·Recipe가 처음부터 조건이고 설비 시각과 보는 사람 시각을 구분(R1.1·R1.6, §4), 링크는 권한이 아니라 받는 사람 권한으로 다시 확인(R1.2·R1.4, L12), 모르는 값을 0으로 바꾸지 않고 지표는 정의와 버전으로 고정(R2.2·R2.4·R2.6, L55), 권한은 시스템·화면·조회 범위(사이트·공정)를 한 규칙으로 판정(R6.1), 감사는 공용 감사 저장소 하나(R6.2, ADR-0048)이고 활용률은 조회 조건 값을 남기지 않음(R6.3, ADR-0020). 지키는 장치는 L85 | `docs/17_platform_requirements.md` §3·§4 | 효과 숫자 없음. 상태 단서는 R2.4(발행 쓰기는 사내 서버 뒤)·R6.1(예시 데이터 세션) |
| L76 | FeedbackOps가 이 SDK의 `@ap/ui`를 git 태그 `sdk-v0.2.0`부터 받아 쓴다. 전환 기록 FeedbackOps#1289·#1291·#1295·#1304·#1307(1~3번 묶음). 이 저장소의 FeedbackOps 서브모듈 포인터는 전환 전 시점을 가리킨다 | `docs/integration/sdk-git-tag-consumption.md`, `.planning/README.md`, https://github.com/hjung3113/FeedbackOps/pull/<n> | 네트워크 없이 작성: 번호가 PR인지 이슈인지(GitHub은 두 주소를 서로 넘긴다)와 묶음별 태그는 확인하지 못했고 태그 범위는 조정 지시를 따랐다. 로컬 태그 sdk-v0.1.0–v0.6.0 존재만 확인 |
| L77 | 이전 체크리스트: 버리는 것(자체 화면 틀·전역 필터·권한 노출 판정·공통 표·차트·상태 화면·감사 기록), 바꾸는 것(조회 선언 R8.3, 공통 차트 ADR-0021, 공통 표, React 19 — `@ap/ui` peer `^19.0.0`, Kernel·셸·공통 컴포넌트 `^19.3.0`(각 `packages/*/package.json`) #470), 그대로(§5). 공존 방법은 SSO(#150) 결정 뒤, 화면 이전 비용은 미측정. 잃는 것은 L88. 버전 고정 정정: 태그로 받는 것은 SDK UI(`@ap/ui`)이고 계약·Kernel·셸 패키지는 아직 저장소 밖 배포 모양이 아니다. 범주: 빌드할 때 조립하는 모듈 셸(06 §5 Deferred·탑재 설계) | `docs/17_platform_requirements.md` §5·§3.8, `docs/integration/sdk-git-tag-consumption.md`, `packages/*/package.json` | 공존·비용은 근거 문서 없음 |
| L78 | 도입 판단: 요청 5(시범 1개 팀·1 Site/Line #233 제안, 기준선 담당 #233, SSO #150, 배포 #151, 플랫폼 API #155·#149), 인력·기간·비용 미산정, 위험 5와 완화(근거 L26·L27·L28·L68·L70) | `docs/17_platform_requirements.md` §6·§7·§9, `docs/integration/in-house-rollout.md` | 미산정 항목은 숫자 없음 |
| L79 | 히어로 오른쪽 그림은 캡처된 견본 화면 세 장 — MARS 공간의 `cycle-time-full`, BRAVO 공간의 `catalog`, 운영 콘솔 공간의 `change-audit` — 을 한 바탕에 겹치고, 공통 조건 띠(조건·링크·숫자 상태·권한·감사)가 셋을 가로지르게 CSS로 합성한 것이다(L100). 캡션에 '견본 화면 — 실제 메뉴는 사내에서 설계'를 한 번 표기하고, MARS·BRAVO·운영 콘솔이 견본 업무 시스템임을 첫 등장에서 밝힌다. 번호·범례는 히어로에 두지 않고 02에만 둔다. 확대 조각 `inset-context`(전역 조건 바)·`inset-trust`(데이터 신뢰 패널)·`menu-registry`는 02의 핵심 장면 카드에 쓴다 | `site/scripts/shots.mjs`, `docs/17_platform_requirements.md` §3 | 합성 데이터 |
| L80 | 히어로 한 줄 "지금: 예시 데이터로 끝까지 동작, 실서버 연결 전 · 요청: 시범 1팀·1라인과 사내 담당 지정"은 L72의 상태와 L78의 요청 요약이다. 히어로 합성 그림은 L100 | `docs/17_platform_requirements.md` §6·§7, L72, L78, L79 | 사이트의 요약 문장 |
| L81 | 상태 큰 숫자 "단서 없이 동작 30 · 단서 붙은 동작 16 · 실서버 연결 0 · 실사용자 0"(동작 46을 L87의 기준으로 둘로 나눈 값): 요구 63행을 상태별로 다시 센 값(동작 46·진행 중 1·계획 6·결정 대기 5·보류 3·요구 1·결정됨 1, 설계 확정 0; 17의 R4.1이 설계 확정에서 진행 중으로 바뀐 것을 2026-10-20에 다시 셌다). 동작은 예시 데이터 서버 위에서 처음부터 끝까지 동작하고 테스트가 있다는 뜻이며, 실서버 연결과 실사용자는 아직 없다. 동작 46 중 단서가 붙은 행은 16, 단서 없는 행은 30(L87) | `docs/17_platform_requirements.md` §3.1–§3.9·§6·§7 | 17 문서 갱신 때 다시 센다 |
| L82 | 옛 04 분석 흐름의 다섯 단계 나열은 FIX5에서 없앴다. 대표 장면 7단계(L65)는 메뉴를 차례로 따라가는 서술이 아니라 장면의 그림 속에 흡수했다: 내려가기·조건 복원은 장면 2(설명용 도식 + 조건 바 확대 캡처), 링크로 알리기는 장면 6, VOC 진입·Task 복귀·전후 비교는 장면 4, 전·후를 나란히는 장면 5, 변경 감사는 장면 8. 본문에 그 단계 나열은 남아 있지 않다. 캡처는 견본 화면이며 합성 데이터이고 권장 설계가 아니다 | `docs/17_platform_requirements.md` §2, `site/scripts/shots.mjs` | 합성 데이터, 운영 사례 아님 |
| L83 | 도입 판단의 단계형 승인(시범 승인 → 시범에서 잴 것 → 확장 결정)과 CLAS 화면 하나 시범 이전은 코디네이터 제안이다. 시범에서 잴 후보 지표(제안, #233 본문): 첫 응답 리드타임(VOC 등록 → 첫 공개 업데이트), VOC → Task 연결률, 새 화면 개발 기간과 그동안의 플랫폼 코드 수정 건수, CLAS 화면 하나 시범 이전의 화면당 이전 비용. 판정선은 시범 시작 때 기준선과 함께 정한다. 현업 참여: 시범 팀은 기존 화면과 병행해 쓰고(공존 방식은 SSO 결정 뒤) 현업 부담은 시범 범위 산정 때 정한다(미산정). 위험 표의 개발·유지 인력 의존은 미산정(크기 칸은 근거가 없어 두지 않는다), 보안·망분리 심사는 #151(본문에는 번호 없이 ‘사내 답을 기다림’), FeedbackOps 의존은 별도 제품(ADR-0027·ADR-0045) | `docs/17_platform_requirements.md` §6·§7·§9, GitHub #233, ADR-0027, ADR-0045 | 숫자는 만들지 않음, 제안은 제안으로 표시. #233 본문은 이 라운드 작업 지시문의 인용이며 이 환경에서 다시 읽지 못함 |
| L84 | SDK 상태: R9.2 동작(등록 검사·화면 렌더·호스트 포트를 고정 모듈로 검증, 다른 저장소 앱 연결은 #332), R9.3 동작(모듈 권한 선언 #492), R9.4 다른 저장소 앱은 #332 뒤, R10.4 요구. 플랫폼 앱(`apps/platform-web`)에 탑재된 모듈은 아직 없다(`mountModule` 호출처가 `packages/kernel` 안뿐). 그래서 길 ②의 상태 표시는 '고정 모듈로만 검증 · 외부 앱 연결 대기'이고, SDK 모듈은 Kernel·셸 코드는 고치지 않되 조립 쪽에 모듈 연결 한 줄과 재배포가 필요하다. 호스트 계약 발췌는 `packages/contracts/src/host.ts`의 `ModuleHost`. 올리는 길 ①의 ‘그룹·권한 목록’은 `packages/contracts/src/menu.ts`의 GroupId·SpaceId·PERMISSIONS이며 새 업무 시스템이면 계약 패키지 수정이 필요하다(L73) | `docs/17_platform_requirements.md` §3.9, ADR-0053, `docs/integration/platform-hosting-design.md`, `packages/kernel/src/module.ts` | 17 문서와 같은 상태 |
| L85 | 장면 3 '새 화면도 첫날부터 같은 품질'의 지키는 장치: 등록할 때 거부(계약 버전·필요 기능·권한 이름) R9.3, 계약 E2E(영역별 테스트가 같은 기준을 걸고 항목별로 보고, 새 화면마다 자동 생성되는 것은 아님) R8.4, 경계·디자인 검사(lint) R8.5, 서버 적합성 검사(지금은 mock 어댑터 판정, 실서버는 연결 때 같은 검사) R8.4·R9.5, 앱은 외부 네트워크를 부르지 않음 R10.4(요구, 사내 환경과 함께 검증). 설계 기준 인용은 L38(달성 주장이 아니다). '무엇이 아닌가' 3줄: 대시보드 빌더가 아님(06 §1·§14, L53), 운영 중 내려받는 플러그인이 아님(06 §5·§14, 탑재 설계 범위 밖), 데이터 저장소가 아님(파서가 적재한 데이터를 계약대로 소비, `docs/00_overview.md`) | `docs/17_platform_requirements.md` §3.8–§3.10, `docs/06_platform_ui_contract.md` §1·§5·§14·§30, `docs/00_overview.md` | 비교 대상 이름은 쓰지 않음(사용자 결정) |
| L86 | 엑셀과 같이 쓰는 길: 표는 CSV·XLSX로, 차트는 내보내기로 내보내고(L13·L14) 같은 조건의 링크가 같은 화면을 연다(R1.2). 자유 피벗은 보류(R4.4), 사용자가 조합하는 분석은 결정 대기(R4.3). 처리량 막대 캡처 `chart-bar`는 본문에서 빼고 부록 G에만 둔다(합성 데이터라 모든 막대 값이 같음) | `docs/17_platform_requirements.md` §3.3·§3.4, `packages/components/AGENTS.md` | mock 데이터는 고치지 않음(제품 코드 범위 밖) |
| L87 | 상태 표의 '동작 · 단서' 16행 = '단서 붙은 동작 16', 나머지 30행 = '단서 없이 동작 30'(합 46 = 동작). 기준: 17 문서의 상태 칸이 '동작' 뒤에 동작 범위를 줄이는 한정을 붙인 행. R1.5(즐겨찾기·최근은 이 브라우저에만), R2.1(값 계산은 서버), R2.3(재집계는 사내 서버), R2.4(발행 쓰기는 사내 서버 뒤), R5.2·R5.3(실연결은 SSO 뒤), R5.5(기준선은 결정 대기), R6.1(mock 세션), R6.5(조회만), R8.3(mock 서버), R9.2·R9.3·R9.4(고정 모듈·플랫폼 안 화면만), R9.5(전송 형식 합의 대기, mock 어댑터 판정), R9.6(태그로 받는 것은 `@ap/ui`뿐), R10.6(일부 검사). 상태 칸의 괄호가 범위 설명인 R5.1(링크)·R7.1(MARS·BRAVO·운영 콘솔)·R9.1(FeedbackOps가 받아 씀)은 세지 않는다. 이전 13은 R1.5·R6.1·R8.3을 센 뒤 16이 됐다. 상태 단어 정의 두 문단은 본문 ‘상태 단어 정의’ 접힘 안에 둔다. 범례 풀이: 요구 = 지켜야 할 조건, 결정됨 = 조직 요구값(R10.5) | `docs/17_platform_requirements.md` §0·§3.1–§3.9·§7 | 단서의 기준은 사이트의 해석. 17 문서 갱신 때 다시 센다 |
| L88 | 확장 섹션: 호스트는 받아들일 계약 버전을 명시하고(`HOST_CONTRACTS`) 모르는 버전은 등록에서 거부하며 1판 이후 바꾸면 계약 정수를 올린다(ADR-0053). 백엔드는 도메인 로직·데이터는 그대로 두고 조회 응답을 플랫폼 형식(신뢰 정보·상태 판정·조회 한도)에 맞춘다(`real-server-checklist.md`, 전송 형식 초안 `http-adapter-contract.md`는 사내 합의 대기). 잃는 것: 모듈 화면은 전역 조건을 읽기만 하고 쓰지 못함(`ModuleHost`에 쓰기 없음, 탑재 설계 §2.2), 이 저장소 안 화면은 저장소 소유·리뷰·lint 규칙·릴리스 주기를 플랫폼에 맞춤, 디자인 lint가 기존 모양을 공통 모양으로 바꾸게 함(R8.5), `GlobalContext`에 없는 필터는 그 화면 안에서만. 다른 제품(FeedbackOps)의 SDK UI 사용은 L76 | `packages/contracts/src/host.ts`, `docs/adr/0053-host-module-contract-v1.md`, `docs/integration/real-server-checklist.md`, `docs/integration/http-adapter-contract.md`, `docs/integration/platform-hosting-design.md` | 새 화면이 받는 것 체크리스트(L36·L37)는 같은 섹션으로 합침 |
| L89 | (FIX4의 '플랫폼이라서만 되는 것' 다섯 칸 — FIX5에서 장면 8개(L91–L98)로 대체, FIX6에서 핵심 3·이어짐 2·기본기 3으로 재배열) 다섯 칸과 장면의 대응: 화면 사이의 조건과 링크 → 장면 2·6, 숫자는 상태와 함께 → 장면 1, 권한과 감사는 한 곳 → 장면 8, 새 화면도 첫날부터 같은 품질 → 장면 3, 반도체 업무 조건이 기본 → 장면 1·2의 바탕. 근거 R·L 번호는 L91–L98로 옮겼다. 설계 기준 L38은 목표이지 달성 주장이 아니다 | `docs/17_platform_requirements.md` §1.1·§3, `docs/06_platform_ui_contract.md` §4–§6·§15·§18·§19·§30, `tooling/AGENTS.md` | 대체됨. 사용자 방향 2026-10-20 (장면 중심) |
| L90 | 견본 메뉴 표기 규칙(FIX4): 데모 메뉴는 견본 화면으로만 등장하고 메뉴 이름·지표·드릴 단계·사례 숫자를 본문에 싣지 않는다. 장면 2·4·5의 그림과 분석 보드 시안은 '화면 A/B'·'견본 화면' 수준으로 일반화했고, 장면 7의 시스템 목록(그림)은 시스템 이름과 상태만, 부록 B는 컴포넌트당 한 줄(받는 것 / 화면이 할 일), 부록 C는 manifest 예시 하나만 둔다. 메뉴 이름 등장 횟수 전/후는 FIX4 보고서 | `site/scripts/shots.mjs`, `docs/06_platform_ui_contract.md` §1·§24 | 사이트의 편집 규칙, 사실 주장 아님. 사용자 방향 2026-10-20 |
| L91 | 장면 1 '숫자가 어디서나 같은 말을 한다'(동작, 핵심): R2.1·R2.2·R2.4·R2.6(L15·L16·L55·L56). 단서: 값 계산과 발행 쓰기는 사내 서버 뒤(L87), 5분 간격 자동 갱신은 계획(R2.7). 상태 4종 캡처는 견본이며 나머지 상태는 부록 G. 응답 상태 다섯 가지와 신뢰 표시의 '미확인'은 따로 쓴다, 숫자 옆 근거(기준 시각·채움·지표 버전)는 서버가 내 줘야 보이며 실서버 연결 때 백엔드 일이다(L103). 견본 신뢰 표시의 지표 이름·원천(occupancy v3·mart.productivity_hourly 등)은 견본이며 실제 지표·원천이 아니다. 엑셀과의 역할(본문): 엑셀로 계속 하는 것은 자유 피벗·개인 계산(R4.4 보류·R4.3 결정 대기), 플랫폼이 맡는 것은 같은 조건·같은 숫자·같은 링크이며 표·차트는 CSV·엑셀로 내보내고 같은 조건 링크로 다시 연다(L86) | `docs/17_platform_requirements.md` §3.2, `docs/06_platform_ui_contract.md` §15·§18·§19 | 합성 데이터 |
| L92 | 장면 2 '맥락이 저절로 이어진다 — 반도체 조건 그대로'(동작, 핵심): R1.1·R1.3·R1.4·R1.6. Registry가 조건·경로·pageKeys·드릴 선언을 검증(L09), 전역 조건과 page key를 버전 URL로 읽고 써 화면 전환에서 복원하고 지원 안 하는 조건은 지우지 않고 '이 화면에서 미사용'(`packages/kernel/src/i18n.tsx`의 `notUsed`)으로 표시(L10), 설비 상세는 목적지 객체 ID와 분석 Context를 따로 받고 `returnTo`로 출발 화면·조건을 되살림(L21), 사이트·공정·설비 그룹·설비·Lot·Recipe·지표 버전(`metricId`·`metricVersion` 쌍, L55)이 조건 어휘이며 설비 시각과 보는 사람 시각을 구분(R1.6). 그림은 설명용 도식과 조건 바 확대 캡처 `inset-context` | `docs/17_platform_requirements.md` §3.1, `docs/06_platform_ui_contract.md` §6·§22 | 합성 데이터, 효과 수치 없음 |
| L93 | 장면 3 '새 화면도 첫날부터 같은 품질'(동작, 핵심, 이 저장소 안 화면 기준): R8.1–R8.5·R9.3. 등록 검증(계약 버전·필요 기능·권한 이름)과 경계·디자인 검사(lint)는 기계가 자동으로 막는다. 계약 E2E는 `apps/platform-e2e/tests/contracts.spec.ts`의 영역별 `test.describe` 묶음이 새 화면도 같은 기준으로 거는 것이며 새 화면마다 테스트가 자동 생성되는 것은 아니다. 서버 적합성 검사는 지금 mock 어댑터를 판정한다. 숫자 상태(장면 1)와 맥락 유지(장면 2)는 공통 부품과 조건 선언을 쓰는 화면에 생기며, 그것을 쓰지 않는 화면에는 자동으로 생기지 않는다(L36·L37·L85). 06 §30 기준 문장은 달성 주장이 아니라 목표(L38). 02 카드 3의 그림은 캡처가 아니라 등록 → 검사 → 통과/거부 도식이다 — 데모에는 검증 결과를 보여 주는 화면이 없고 메뉴 레지스트리는 등록된 화면 목록(등록 현황)이다 | `docs/17_platform_requirements.md` §3.8, `docs/06_platform_ui_contract.md` §30, `tooling/AGENTS.md`, `apps/platform-e2e/tests/contracts.spec.ts` | 효과 수치 없음. 새 화면에 자동으로 따라오는 범위는 공통 부품·조건 선언을 쓰는 화면 |
| L94 | 장면 4 '본 자리에서 알리고, 같은 자리로 돌아온다'(링크 동작): R5.1(그 업무 시스템으로 좁힌 VOC 링크, 지금 화면 주소는 복귀 키 `platformReturn` 하나, L24), R5.2(복귀 주소로 같은 화면·조건을 여는 쪽은 FeedbackOps이고 그 지원은 이 저장소가 가리키는 FeedbackOps 시점에는 없음 — L102. 플랫폼 쪽에서 열 수 없는 복귀 대상은 열 수 있는 상위 메뉴로, L21), R3.2·R3.4(이전 기간 비교·주석, L14). VOC 처리 화면은 FeedbackOps(별도 제품, L23, ADR-0027)이고 실제 연결은 사내 SSO 뒤(#150). 개선 전·후를 보드에 나란히 두는 것은 장면 5(진행 중) | `docs/17_platform_requirements.md` §2·§3.5, `docs/integration/` FeedbackOps 링크 계약 | 플랫폼 쪽 링크 계약까지만 동작 |
| L95 | 장면 5 '한 화면에서 여러 분석을 나란히'(**진행 중**): R4.1. 칸마다 조건을 갖는 Kernel 기반(#496)은 병합, 보드 화면(#497)과 메뉴 지원 선언(#498)이 남음. 저장은 이 브라우저에만이고 서버 저장·공유는 보류(R4.5는 결정 대기), 저장된 뷰는 보류(R4.2), 사용자 조합 분석은 결정 대기(R4.3), 자유 피벗은 보류(R4.4). 사이트의 보드는 설계(16 §4–5)를 보여 주는 인터랙티브 시안이고 값은 예시이며 실제 화면 구현이 아니다 | `docs/17_platform_requirements.md` R4.1, `docs/16_analysis_board.md` §4–5, ADR-0049, ADR-0051 | 진행 중이므로 '동작'으로 쓰지 않음 |
| L96 | 장면 6 '링크 하나로 같은 화면을'(동작, 기본기): R1.2. 조건·정렬·쪽·탭·드릴 단계가 주소에 있어 링크 복사·새로고침·뒤로/앞으로에 같은 화면(L10), 링크 복사 알림 '받는 사람의 권한으로 서버가 다시 검증합니다'(L12, 본문은 ‘지금은 mock 서버에서 확인’을 덧붙여 쓴다), 권한 게이트가 메뉴 진입과 직접 URL을 막고 mock 어댑터가 조회마다 재검사(L11). 도식은 설명용 | `docs/17_platform_requirements.md` §3.1, `docs/06_platform_ui_contract.md` §6.4 | mock 판정, 실서버 연결 전 |
| L97 | 장면 7 '업무 시스템을 건너도 같은 조건, 같은 손버릇'(동작, 기본기): R1.5(시스템 전환기·Ctrl+K·시스템별 마지막 화면 복원, 즐겨찾기·최근은 이 브라우저에만 저장), R3.1–R3.3(공통 표·차트·상세 패널, L13·L14), R7.1(MARS·BRAVO·운영 콘솔 동작, L08·L67), CLAS는 자리만 마련(R7.2 계획) — 이전 방식은 CLAS 팀과 정한다, 표준 로그 개발·개선 실행은 계획, 설비 Top View는 계획(R3.6). 엑셀과 같이 쓰는 길은 L86. MARS·BRAVO·운영 콘솔은 견본 업무 시스템이다(L67) | `docs/17_platform_requirements.md` §3.1·§3.3·§3.7, ADR-0042 | 예시 데이터 |
| L98 | 장면 8 '운영은 한 곳'(동작, 기본기, 예시 데이터 세션): R6.1·R6.2·R6.3·R6.4. 권한은 시스템·화면·조회 범위(사이트·공정)를 한 규칙으로 판정하고 서버가 조회마다 재확인(L11·L27), 설비·지표·차트 주석 변경이 공용 감사 저장소 하나에 남는다(R6.2, L46 — 모든 메뉴 행위가 자동 감사되는 것은 아님), 활용률은 식별 필드만 남기고 조회 조건 값은 수집하지 않음(L30). 권한·역할 조회는 동작이고 부여·회수 쓰기(R6.5)는 결정 대기, 적재 상태(R6.6)는 계획이며, '화면을 더해도 따로 만들 곳이 없다'는 것은 설계 성질이지 운영 비용을 잰 값이 아니다 | `docs/17_platform_requirements.md` §3.6, ADR-0020, ADR-0048 | 효과 수치 없음 |
| L99 | 만드는 분 12 '다른 제품도 같은 바탕으로'(장면 번호 없음): R9.1·R9.2. FeedbackOps가 `@ap/ui`를 git 태그 `sdk-v0.2.0`부터 받아 씀(L76), 다른 저장소 앱 올리기는 고정 모듈로 검증했고 외부 앱 연결은 대기(#332, L84), 호스트 계약 설명은 L88 | `docs/17_platform_requirements.md` §3.9, ADR-0043, ADR-0053 | 고정 모듈 검증까지 |
| L100 | 히어로 합성 그림: 견본 화면 세 장을 겹치고, 그 아래 전체 폭 한 층 '플랫폼 · 공통 바탕'(조건·링크·숫자 상태·권한·감사 칩)에서 세 화면으로 짧은 연결선을 이어 CSS로 합성했다. 띠는 화면 위를 덮지 않는다. 세 화면은 `apps/platform-web/src/menus.ts`의 SPACES 기준으로 MARS(analytics) 공간의 사이클타임 분석 `cycle-time-full`, BRAVO(metrics) 공간의 지표 카탈로그 `catalog`, 운영 콘솔(operations) 공간의 변경 감사 `change-audit`이다 — 작업 지시의 ‘management’(설비 관리)는 MARS 공간 화면이라 운영 콘솔 자리에는 `change-audit`을 썼다. 띠 위 다섯 칩은 장면 2(조건)·6(링크)·1(숫자 상태)·8(권한·감사)의 대상이며 새 기능 주장이 아니다. 캡처가 없는 조립에서는 도식 A로 대신한다. MARS·BRAVO·운영 콘솔은 견본 업무 시스템이다(L67) | `site/scripts/shots.mjs`, `apps/platform-web/src/menus.ts` | 합성 데이터, 실제 메뉴는 사내 설계 |
| L101 | '왜 이 바탕인가' 3줄: ① 업무 시스템을 하나로 합치지 않는다 — 업무 내용·데이터는 각 팀에 남고(L68, 이전 체크리스트의 '그대로 두는 것') 화면은 같은 바탕 위로 옮겨 와 그 사이가 이어진다(자체 화면 틀·필터·표·차트는 '버리는 것'), ② 사내망·사내 서버 위에서 돌고 서버는 계약만 지키면 바꿀 수 있다 — R9.5는 동작·단서(전송 형식은 사내 합의 대기), R10.4는 요구(외부 네트워크 호출 없음, 사내 환경과 함께 검증, #151), ③ 반도체 조건과 숫자 상태가 처음부터 계약(06 §5–6·§15·§18·§19, L55). SDK로 오는 앱의 대조표(만드는 분 12): 받는 것 = `@ap/ui` 디자인 시스템(git 태그로 고정, R9.1·R9.6, L76), 호스트 포트(`ModuleHost`의 session·context 읽기·href/navigate·notify·reportError·query(선택)·detail(선택)), 등록 검사(R9.3). 아직 못 받는 것 = `@ap/components`·`@ap/contracts`·`@ap/kernel`·`@ap/shell`은 각 `packages/*/package.json`이 `private: true`이고 저장소 밖 배포 모양이 아님(R9.6 비고. `@ap/ui`도 package.json은 private이지만 FeedbackOps가 git 태그로 받음), 전역 조건 쓰기는 `ModuleHost`에 없음(`setPage`는 화면 자기 page key만, L88) | `docs/17_platform_requirements.md` §3.9·§3.10, `packages/contracts/src/host.ts`, `packages/*/package.json`, `docs/integration/platform-hosting-design.md` §2.2 | 상태 단어는 17과 같음 |
| L102 | 장면 4의 FeedbackOps 쪽 복귀 지원: 플랫폼 쪽은 현재 화면 URL을 복귀 키 `platformReturn`에 실어 보낸다(`packages/contracts/src/feedbackops-link.ts`, #448). 받는 쪽 처리는 FeedbackOps 저장소의 FeedbackOps#1278 → 그쪽 ADR-0071이며(작업 지도 3a행) 이 저장소의 서브모듈 포인터 `dc7638f`의 `products/feedbackops`에는 ADR-0071이 없고(ADR은 0070까지) `platformReturn`을 처리하는 코드도 없다(2026-10-20 `grep -r platformReturn products/feedbackops` 0건). 그래서 본문은 ‘플랫폼 쪽 링크는 동작, FeedbackOps 쪽 복귀 지원은 FeedbackOps 저장소의 일이고 이 저장소가 가리키는 시점에는 없음, 실연결은 SSO 뒤(#150)’로 쓴다 | `.planning/README.md` 3a행, `packages/contracts/src/feedbackops-link.ts`, `products/feedbackops/docs/adr/` | 서브모듈 포인터 시점 기준. 포인터를 올리면 다시 확인 |
| L103 | 정밀화(2026-10-20): ① 응답 상태 다섯 가지(0건·권한 없음·조회 과대·시간 초과·오류)는 `packages/contracts/src/response.ts`의 `Outcome`(`ok`를 뺀 `empty`·`forbidden`·`too_large`·`timeout`·`error`), '미확인'은 신뢰 표시의 상태 `unknown`(`packages/components/src/DataTrustIndicator.tsx`)이라 둘을 나눠 쓴다. ② 17 R2.6은 '차트의 데이터 표 보기와 내보내기가 차트와 같은 응답을 쓴다'이며 다른 화면의 표와 같은 숫자라는 뜻이 아니다. ③ 신뢰 표시의 값(기준 시각·채움·지표 버전)은 서버가 내야 보인다(`docs/integration/real-server-checklist.md`, L87). ④ React 하한: `@ap/ui`는 `^19.0.0`, kernel·shell·components는 `^19.3.0`(각 `package.json`)이고 자체 차트 라이브러리는 공통 차트 틀로 다시 쓴다(비용 미측정, 비교 L68). ⑤ 도입 판단의 인력 행: 저장소에 개발·유지 인력 구성의 근거가 없어(L78 '인력·기간·비용 미산정') 구성은 적지 않는다. ⑥ 메뉴 등록은 새 그룹·권한이면 `packages/contracts/src/menu.ts` 목록에 한 줄을 더한다(L73). ⑦ 02 카드 1·06·07 캡처의 크기와 자르는 위치는 `site/scripts/shots.mjs`의 열·행 경계 크롭이다 | `packages/contracts/src/response.ts`, `packages/components/src/DataTrustIndicator.tsx`, `docs/17_platform_requirements.md` §3.2, `packages/*/package.json`, `docs/integration/real-server-checklist.md` | 사이트의 문구 정밀화 |

### 7.2 예시(합성) 데이터 — 화면에서 반드시 `예시`로 표시

| ID | 내용 | 표시 위치 |
| --- | --- | --- |
| E01 | 미니어처 값: P50 41.2분, P95 68.5분, 느린 실행 12건, 차트 곡선, 표 4행, `갱신 09:00`, 기간 칩 시각 | 미니어처 틀 배지 `화면 모형 · 예시 데이터` |
| E02 | 설비 ID `MEM-PHOTO-0103` 등 — mock 데이터의 형식을 빌린 합성 값 | 미니어처·06 절 미리보기 |
| E03 | 02 절 "공통 계약이 없을 때" 흐름 — 설명용 예시이지 사내 관찰이 아님 | 패널 머리 `예시` 배지 |
| E04 | 06 절 미리보기의 문구·값(`필터 · 상태 가동 · 제조사 A`, `1–20 / 54`, 감사 이벤트 내용 등) | 갤러리 머리 캡션 |
| E06 | 08 절 사용자 조합 분석 모형: 필드·축·필터·차트 종류(선 선택)·패널·저장·공유 문구, 선 추이와 설비별 표의 예시 값(38.4·41.2·47.9 분) | 모형 배지 `화면 모형 · 예시 데이터`, `구상 · 결정 대기 (#294)` |
| E07 | 08 절 선언형 데이터셋·필드 역할 코드 | `구상 · 타입 미정 (#292)`, 코드 주석 `예시 형태` |
| E05 | 04 절 주소 막대·D3 링크의 시각 값 — 2026-10-13 로컬 데모로 D1–D10 확인 | 스텝퍼 캡션 "주소의 값은 데모의 합성 데이터 기간" |

### 7.3 기준일과 정비 상태 표기

- 기준일은 `2026-10-20`이다. `--assumption` 토글은 유지하며, 켜면 머리 칩·14 상태 보드 안내·출처에 "정비 이슈는 해결된 상태를 반영했습니다"를 표시한다.

---


## 현재 워크트리 재측정

다음 명령은 저장소 루트에서 실행했다. 테스트의 매개변수별 실행 수가 아니라 선언 수이다. it.each/it.skip 등도 한 선언으로 센다.

```sh
python3 - <<'PYCOUNT'
from pathlib import Path
import re
files = sorted(p for root in ['packages', 'menus', 'apps/platform-web']
               for p in Path(root).rglob('*') if p.is_file()
               and re.search(r'\.(test|spec)\.[^/]+$', p.name)
               and 'node_modules' not in p.parts)
print(len(files)) # 210
print(sum(len(re.findall(r'^\s*(?:it|test)(?:\.[a-z]+)?\(',
                          p.read_text(), re.M)) for p in files)) # 1950
print(len(re.findall(r'^\s*test\(',
    Path('apps/platform-e2e/tests/contracts.spec.ts').read_text(), re.M))) # 107
PYCOUNT
rg '^export function [A-Z]' packages/components/src/{AnalysisChartFrame,AuditTimeline,DataTrustIndicator,DetailDrawer,EChart,PageFilterBar,PlatformDataTable,PlatformPage,RadioGroup,StatCard,StateView,ManagementLayout,AnalysisLayout,DrillLayout}.tsx
```

L02는 index.ts가 공개한 모듈에서 React 컴포넌트 21개를 확인했다. 타입과 helper는 21개에 더하지 않는다. EChart의 token, 표의 sortAndPage/parsePageIndex/parseTableSort/encodeTableSort, copyText/useCopyLink도 갤러리에 노출한다(EChart의 strokeToken·baseTextStyle은 패키지 내부로 좁혀졌다). L03은 모든 shadcn 계열 개별 export 및 환경 helper를 실제 index.ts 기준으로 표시한다. L05 PlatformAdapter 메서드는 adapter.ts의 실제 전체 목록을 쓴다.

L01은 2026-10-20 기준 `.planning/README.md`의 최신 완료 상태다. L41은 2026-10-13 상태 스냅샷으로, 현재 상태로 인용하지 않는다. 데모 주소(E05)는 2026-10-13 로컬 데모에서 D1–D10을 확인한 기록이다.

## 공개 원본

- [플랫폼 계약](../docs/06_platform_ui_contract.md)
- [공개 components](../packages/components/src/index.ts)
- [공개 UI](../packages/ui/src/index.ts)
- [셸](../packages/shell/src/index.ts)
- [Kernel](../packages/kernel/src/index.ts)
- [사내 적용 지도](../docs/integration/in-house-rollout.md)
- [현재 작업 지도](../.planning/README.md)

L35도 현재 git 추적 파일 기준으로 재측정했다: 23개·1,966줄, MetricCatalog 154줄·MetricDetail 257줄·manifest 28줄.

```sh
python3 - <<'PYMETRICS'
from pathlib import Path
import subprocess
files = subprocess.check_output(['git', 'ls-files', 'menus/metrics/metrics'], text=True).splitlines()
print(len(files), sum(len(Path(p).read_text().splitlines()) for p in files))
for p in ['menus/metrics/metrics/src/pages/MetricCatalog.tsx',
          'menus/metrics/metrics/src/pages/MetricDetail.tsx', 'menus/metrics/metrics/src/index.ts']:
    print(p, len(Path(p).read_text().splitlines()))
PYMETRICS
```

Pages Action 최신 주 버전은 구현 시 공식 GitHub releases API로 확인했다: [configure-pages v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0), [upload-pages-artifact v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0), [deploy-pages v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1). 워크플로는 각각 v6/v5/v5에 고정한다.
