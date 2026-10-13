# 소개 사이트 콘텐츠 원장

확정 설계 D1(2026-10-13)의 §7을 옮겼다. 아래 원본 코드·문서·이슈를 공개 근거로 연결한다. 실행 통과 수나 운영 연결 완료를 주장하지 않는다.

## 7. 콘텐츠 원장

### 7.1 사실·숫자 (사이트에 들어가는 것 전부)

조사·측정 기준일 2026-10-13. "재측정"은 첫 공개 직전에 같은 방법으로 다시 세서 고친다.

| ID | 주장·숫자 | 출처 | 비고 |
| --- | --- | --- | --- |
| L01 | 릴리스 7개 v0.1.0(2026-10-04) – v0.6.1(2026-10-12), 각 릴리스 내용 | `.planning/README.md` 「끝난 것」, GitHub Releases | 공개 시 새 릴리스가 있으면 갱신 |
| L02 | `@ap/components` 공개 React 컴포넌트 22개: AnalysisChartFrame, EChart, PlatformDataTable, PageFilterBar, SegmentedRadio, DetailDrawer, Field, AuditTimeline, DataTrustIndicator, PlatformPage, Panel, StatCard, QueryView, OutcomeView, StateMessage, LoadingBlock, PartialFailureNote, ManagementLayout, AnalysisLayout, DrillLayout, DrillPath, ReturnLink | `packages/components/src/index.ts` + 각 파일의 `export function [A-Z]…`(D1이 셈) | 재측정. `OutcomeScope`는 공개 export 아님 |
| L03 | `@ap/ui`: 환경 helper isProductionEnv·isMacPlatform·shortcutLabel 포함. Button·buttonVariants, StatusBadge·Dot(Tone 5종), shadcn 13계열(Alert·Badge·Checkbox·Dialog·DropdownMenu·Input·Label·Popover·RadioGroup·Select·Skeleton·Tabs·Tooltip), DetailPanelSlot 3종, cn, prefersReducedMotion | `packages/ui/src/index.ts` | — |
| L04 | `@ap/shell` 7개: AppShell, AppRail, AppSidebar, ScopeSelector, CommandPalette, GlobalContextBar, RouteOutlet | `packages/shell/src/index.ts` | — |
| L05 | Kernel·contracts 공개 API(createRegistry, pathFor, PlatformProvider, usePlatform, PlatformLink, useMenuQuery, useMenuFetch, usePlatformQuery, useEntityQuery, useDrill, I18nProvider, defineEndpoint, PlatformAdapter 메서드 목록) | `packages/kernel/src/index.ts`, `packages/contracts/src/menu-query.ts`, `packages/contracts/src/adapter.ts` | `linkTo`·`can`·`canOpen`은 `usePlatform()` 반환값 |
| L06 | 계약 E2E test() 선언 70개 | `apps/platform-e2e/tests/contracts.spec.ts` | 선언 수, 통과 수 아님. 재측정 |
| L07 | 테스트 파일 105개, it()/test() 계열 선언 968개(`packages/`·`menus/`·`apps/platform-web/`) | 현재 워크트리 재측정 | 선언 수. 매개변수화·skip 포함, 펼친 실행 수 아님 |
| L08 | 공간 3개(생산성 분석·지표관리·운영 콘솔), 그룹 패키지 7개, 홈 런처, 공간별 마지막 화면 복원 | `apps/platform-web/src/menus.ts:21-37`, `.planning` v0.5.0·v0.6.0 | — |
| L09 | Registry가 메뉴·그룹 중복, 부모·경로, pageKeys·contextResetKeys, 드릴 선언을 검증 | `packages/kernel/src/registry.ts` | 새 그룹은 사람이 GroupId·GROUPS 행을 먼저 추가 |
| L10 | 전역 조건과 page key를 버전 URL로 읽고 써 새로고침·Back/Forward·메뉴 전환에서 복원, 지원 안 하는 조건은 지우지 않고 "미사용" 표시, `linkTo`가 현재 전역 조건을 실어 감 | E2E `contracts.spec.ts:456-524`, `platform.tsx` spaceResume 주석 | — |
| L11 | 메뉴·직접 URL 권한 게이트, mock adapter가 조회마다 세션 권한·Scope·room 재검사 | `packages/shell/src/RouteOutlet.tsx:15-40`, `packages/mock-server/src/adapter.ts` | mock 판정. 서버 거부 검증은 별도(`apps/platform-e2e/AGENTS.md:11`) |
| L12 | 링크 복사 알림: "받는 사람의 권한으로 서버가 다시 검증합니다", URL은 권한 증명이 아님 | `packages/shell/src/GlobalContextBar.tsx:42` | — |
| L13 | PlatformDataTable: 서버 페이징·정렬, URL 상태, 가상화, 열 너비·표시·고정, 선택, 행 복사, CSV/XLSX | `packages/components/AGENTS.md` | — |
| L14 | AnalysisChartFrame: 확대·구간 선택·초기화·비교·주석·내보내기, Brush 로컬, 전역 기간은 확인 뒤, 주석 `(chartId, scopeId)`, 같은 데이터 표 보기. 툴바 문구 `확대`·`구간 선택`·`초기화`·`비교`·`주석`·`내보내기`·`분석 구간 적용…` | `packages/components/src/AnalysisChartFrame.tsx:292-348`, 플랫폼 UI 계약 §16 | — |
| L15 | DataTrustIndicator: 이슈·미확인·coverage·갱신 시각·원천·잠정 상태, unknown을 정상·0으로 바꾸지 않음 | 플랫폼 UI 계약 §18 | — |
| L16 | 조회 상태 loading·empty·forbidden·too_large·timeout·error 구분, 위젯별 부분 실패 격리. 데모 DevTools 응답 시나리오 11종(정상·느린 응답·0건·상태 원천 미확인·일부 위젯 실패·권한 거부·조회 과대·시간 초과·서버 오류·응답 형식 오류·Scope 확인 실패) | `packages/components/src/StateView.tsx`, `apps/platform-web/src/dev/DevTools.tsx:14-26`, `docs/integration/in-house-rollout.md` §5-7 | — |
| L17 | ManagementLayout: 자기 폭 960px 이상 260px 필터 레일, 좁으면 팝오버. AnalysisLayout: KPI 띠·차트(960px 이상·펼친 차트 2개 이상이면 2열)·분해 표, 단위별 접기 | 플랫폼 UI 계약 §12.6, ADR-0022 | — |
| L18 | 드릴 단계 공정 → StGroup → 설비, 단계마다 page key, 경로 칩, 복귀 | `menus/analytics/src/index.ts:22-27`, `.planning` v0.4.0 | — |
| L19 | Page Archetype 5종, 전용 레이아웃 컴포넌트는 Management·Analysis 2종, 나머지는 공통 부품 조립 + 생성기 뼈대 | 플랫폼 UI 계약 §12 | 06 절 각주로만 |
| L20 | 셸 치수 레일 52px · 사이드바 240/56px · 머리 50px · 상세 슬롯 440px | FeedbackOps `tokens.css:169-174` | — |
| L21 | `linkTo`/`PlatformLink`가 목적지 객체 ID와 분석 Context 분리, 목적지 권한·공간 확인, `returnTo` 복귀(출발 URL·드릴 단계), 열 수 없는 복귀 대상은 홈으로 보내고 알림(#298) | 플랫폼 UI 계약 §22, `.planning` #298 행 | — |
| L22 | 설비 마스터의 '선택 설비로 분석' 버튼 코드 | `menus/equipment/src/pages/EquipmentMaster.tsx:63` | — |
| L23 | FeedbackOps는 독립 앱, 화면·API·권한·감사를 플랫폼에 합치지 않음, `/voc` 링크는 origin 설정·검증 시 새 탭, 셸의 공간별 링크 슬롯은 미주입 | ADR-0027, `apps/platform-web/src/slots.ts:5-8` | 데모에서는 비활성 |
| L24 | FeedbackOps 링크는 분석 기간·Site·returnTo를 자동 전달하지 않음, 확장은 #81·#251, 개선 실행 공간 #252 | `docs/integration/feedbackops-deeplink.md` | — |
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
| L35 | metrics 메뉴: git 추적 파일 23개·1,966줄, 화면 154줄+257줄, manifest 28줄 | git ls-files 기준 재측정 | 복잡도 사례, 절감량 아님 |
| L36 | gen:menu: 메뉴 패키지 파일 11개 + `.gen-menu.json`, 앱 배선 4곳(menus.ts·dev/mock-assembly.tsx·style.css·package.json), 생성 테스트, 명령 형태 | `tooling/gen-menu/src/{cli,generate,templates}.ts` | — |
| L37 | 의존 방향 lint, 디자인 lint(@shadcn/lint 6규칙), Registry 검증, 계약 E2E 항목별 보고 | `tooling/AGENTS.md` | — |
| L38 | "새 메뉴가 추가될 때 플랫폼 코드를 계속 고쳐야 한다면 플랫폼 설계가 실패한 것이다." | `docs/06_platform_ui_contract.md` §30 | 인용 그대로 |
| L39 | As-Is 구조적 문제(메뉴별 반복 구현, 같은 URL 다른 숫자, 0건 모호, 권한·감사 편차) | 플랫폼 UI 계약 §4–6·§17–19 | 측정값 아님 |
| L40 | VOC 리드타임·신규 메뉴 개발 기간 등 아직 수치화 안 됨 | #233 | 사내 도구 이름은 쓰지 않음 |
| L41 | 정비 슬라이스: #296·#297·#298·#299·#312 완료, #300 닫힘, #301–#307·#314 열림 | `.planning/README.md` 「진행 중」, `gh issue view`(2026-10-13) | 공개 시 실제 상태로 교체 |
| L42 | 데모는 브라우저 안 mock assembly, 합성 데이터, 실제 SSO·권한 서버·mart 미연결 | `README.md:3-5`, `apps/platform-web/README.md:3` | — |
| L43 | MVP 지원 환경은 데스크톱 웹 | `docs/05_roadmap_and_open_questions.md` | — |
| L44 | 다크 모드 Deferred, FeedbackOps 토큰에 다크 블록 없음 | DESIGN.md Open Decisions, FeedbackOps `tokens.css` | 사이트 라이트 전용 근거 |
| L45 | Kernel이 pathname 그대로 매칭·root-relative pushState, `isAppRelativePath`가 `#` 거부, vite `base` 없음 | `packages/kernel/src/platform.tsx:190,284-287,639-646`, `packages/contracts/src/url.ts:213-225`, `apps/platform-web/vite.config.ts` | 사이트 본문에는 안 씀(설계 근거) |
| L46 | 감사: 공통 AuditTimeline·포트·운영 화면 있음, 모든 메뉴 행위 자동 감사 아님, 실서버 저장 미확인 | `packages/contracts/src/adapter.ts`, `packages/components/src/AuditTimeline.tsx` | — |
| L47 | 도입 원칙: 성능·접근성·표 대체 경로·Trust가 나빠지면 도입하지 않음, 현행 무료 경로 우선 | `docs/04_frontend_ui_ux.md` | — |
| L48 | ECharts Canvas 렌더러 결정 | ADR-0021 | — |
| L49 | "플랫폼 쪽 준비는 끝났다" | `docs/integration/in-house-rollout.md` §0, `.planning` 「지금 어디까지」 7단계 | — |
| L50 | UI primitive는 FeedbackOps 원본을 `@ap/ui`로 소비 | ADR-0011, `packages/ui/AGENTS.md`, DESIGN.md Overview | — |
| L51 | 메뉴 라벨·경로: 생산성 개요 `/analytics/productivity`, 사이클타임 상세 `/analytics/cycle-time`, 실행 상세 `/analytics/executions/:equipmentId`, Wafer Journey, 설비 마스터 `/equipment`, 지표 카탈로그 `/metrics`, VOC `/voc`, 운영 콘솔 `/admin/*`(권한/역할 관리·변경 감사·메뉴 활용률·메뉴 레지스트리) | `menus/*/src/index.ts` | 공정·레시피 마스터·`/notices`는 화면이 없으므로 기능으로 소개하지 않음 |

### 7.2 예시(합성) 데이터 — 화면에서 반드시 `예시`로 표시

| ID | 내용 | 표시 위치 |
| --- | --- | --- |
| E01 | 미니어처 값: P50 41.2분, P95 68.5분, 느린 실행 12건, 차트 곡선, 표 4행, `갱신 09:00`, 기간 칩 시각 | 미니어처 틀 배지 `화면 모형 · 예시 데이터` |
| E02 | 설비 ID `ICH-PHOTO-0103` 등 — mock 데이터의 형식을 빌린 합성 값 | 미니어처·06 절 미리보기 |
| E03 | 02 절 "공통 계약이 없을 때" 흐름 — 설명용 예시이지 사내 관찰이 아님 | 패널 머리 `예시` 배지 |
| E04 | 06 절 미리보기의 문구·값(`필터 · 상태 가동 · 제조사 A`, `1–20 / 54`, 감사 이벤트 내용 등) | 갤러리 머리 캡션 |
| E05 | 04 절 주소 막대·D3 링크의 시각 값 — 2026-10-13 로컬 데모로 D1–D10 확인 | 스텝퍼 캡션 "주소의 값은 데모의 합성 데이터 기간" |

### 7.3 "가정: 열린 이슈 해결" 표기

- **기본 계획:** 정비 슬라이스(#301–#307, #314)가 닫히고 그 릴리스가 나온 뒤 첫 공개한다. 이때 가정은 사실이 되므로 가정 문구를 모두 끄고 머리 칩을 `기준 <릴리스 태그> · <날짜>`로 바꾼다. 08 절 정비 노드 상태도 `완료`.
- **그 전에 공개하면** 다음 세 곳에 켠다(같은 문구, `site-config.js`의 `assumption: true`로 토글):
  1. 머리 가운데 칩: `기준 2026-10-13 · 정비 이슈 해결 가정`. 누르면 popover(`surface-popover`):
     "이 페이지는 2026-10-13 기준으로, 진행 중인 정비 슬라이스의 남은 이슈(#301–#307, #314)가 해결된 상태를 가정해 썼습니다. 이 이슈들은 접근성·화면 문구·표와 차트의 세부 동작을 다룹니다(이슈 제목 기준). 실제 상태는 GitHub 이슈에서 확인하세요." + 이슈 목록 링크.
  2. 05 절 리드 아래 중립 콜아웃: 같은 문구의 첫 문장 + "데모는 배포한 ref의 실제 상태를 보여 주므로 이 이슈들의 증상이 보일 수 있습니다."
  3. 바닥글 `출처와 기준`.

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
print(len(files)) # 105
print(sum(len(re.findall(r'^\s*(?:it|test)(?:\.[a-z]+)?\(',
                          p.read_text(), re.M)) for p in files)) # 968
print(len(re.findall(r'^\s*test\(',
    Path('apps/platform-e2e/tests/contracts.spec.ts').read_text(), re.M))) # 70
PYCOUNT
rg '^export function [A-Z]' packages/components/src/{AnalysisChartFrame,AuditTimeline,DataTrustIndicator,DetailDrawer,EChart,PageFilterBar,PlatformDataTable,PlatformPage,RadioGroup,StatCard,StateView,ManagementLayout,AnalysisLayout,DrillLayout}.tsx
```

L02는 index.ts가 공개한 모듈에서 React 컴포넌트 22개를 확인했다. 타입과 helper는 22개에 더하지 않는다. EChart의 token/strokeToken/baseTextStyle, 표의 sortAndPage/parsePageIndex/parseTableSort/encodeTableSort, copyText/useCopyLink도 갤러리에 노출한다. L03은 모든 shadcn 계열 개별 export 및 환경 helper를 실제 index.ts 기준으로 표시한다. L05 PlatformAdapter 메서드는 adapter.ts의 실제 전체 목록을 쓴다.

L01·L41은 2026-10-13 설계 조사값이며 공개 직전 코디네이터 갱신 대상이다. L41은 --assumption으로 명시적으로 표기한다. 데모 주소(E05)는 2026-10-13 로컬 데모에서 D1–D10을 확인했다.

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
files = subprocess.check_output(['git', 'ls-files', 'menus/metrics'], text=True).splitlines()
print(len(files), sum(len(Path(p).read_text().splitlines()) for p in files))
for p in ['menus/metrics/src/pages/MetricCatalog.tsx',
          'menus/metrics/src/pages/MetricDetail.tsx', 'menus/metrics/src/index.ts']:
    print(p, len(Path(p).read_text().splitlines()))
PYMETRICS
```

Pages Action 최신 주 버전은 구현 시 공식 GitHub releases API로 확인했다: [configure-pages v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0), [upload-pages-artifact v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0), [deploy-pages v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1). 워크플로는 각각 v6/v5/v5에 고정한다.
