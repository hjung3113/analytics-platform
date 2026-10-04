# 04. 프론트엔드 기술 스택 및 UI/UX 설계 (프론트엔드 담당자용)

백엔드 스택은 `03_backend_stack.md`를 본다.

## 제품 제약과 구현 후보

**Decided product constraints**는 `06_platform_ui_contract.md`의 Desktop-first, 메뉴 공통 계약, Context/URL 재현, 서버 권한 재검증, 접근성 및 데이터 상태 근거 규칙이다. 이 제약들은 특정 프레임워크를 요구하지 않는다.

아래 대시보드 편집 후보(react-grid-layout)만 여전히 **implementation candidate**다 — 해당 기능 자체가 Deferred이기 때문이며, 채택 시점에 버전·성능을 재검증한다.

## 프론트엔드 기술 스택 (Decided, 2026-09-25)

**결정 근거**: FeedbackOps(`products/feedbackops/apps/frontend`, `packages/ui`)가 실사용 중인 비-백엔드 스택을 그대로 가져온다 — 이미 검증되고 채택 경험이 있어 마이그레이션 부담이 적다는 것이 사용자 판단이다. 테이블/차트는 FeedbackOps에 선례가 없어, 이 세션에서 Astra↔Opus 교차 검토로 실제 동작을 검증한 것을 그대로 채택한다(Unit B `prototypes/kernel-chart-frame/`, Unit C `prototypes/kernel-platform-table/`, 별도 worktree/브랜치 `hjung3113/kernel-context-url-scope`). FeedbackOps 자체 코드는 이 결정으로 소급 변경하지 않는다(AGENTS.md FeedbackOps 서브모듈 경계).

| 계층 | 채택(2026-09-25 결정) | 근거 | 현재 코드(2026-10-05) |
| --- | --- | --- | --- |
| Frontend 기반 | React + TypeScript + Vite | FeedbackOps `apps/frontend`와 동일 | 사용 중(Vite 7) |
| 스타일링 | **Tailwind CSS v4** | Tailwind CSS v4(CSS-first `@theme`). FeedbackOps도 v4다(FeedbackOps#743, ADR-0058). 플랫폼은 `@ap/ui/styles.css`에서 `@fops/ui/styles/*`를 import한다([ADR-0010](adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md)·[0011](adr/0011-design-direction-feedbackops-shell.md)) | 사용 중(Tailwind 4.3, `@theme`) |
| UI 컴포넌트 | **shadcn/ui + Radix**(`@fops/ui`가 소유한 프리미티브를 소비) + 자체 확장 컴포넌트(`ChipPicker`/`AnalyticsAreaPicker` 등 패턴 참고) | shadcn/Radix 프리미티브는 `@fops/ui` 원본을 `@ap/ui`가 다시 내보낸다(복사하지 않음, [ADR-0010](adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md)·[0011](adr/0011-design-direction-feedbackops-shell.md)). 플랫폼 자체: `StatusBadge`·`DetailPanelSlot` | 사용 중 — `@ap/ui`가 `@fops/ui` 프리미티브를 재수출하고 플랫폼 자체 컴포넌트를 더한다 |
| 라우팅 | TanStack Router | FeedbackOps와 동일. 타입 있는 검색 파라미터로 06 §6.4 URL 계약을 타입 안전하게 관리하되, 버전·폐기 필드·미지원 필터 처리는 이 문서 §6.4 메커니즘을 별도로 구현해야 한다 | **미도입** — Kernel 자체 History + URL codec이 06 §6.4를 소유(Unit A부터 알려진 divergence). 도입·미채택 확정은 Open(05) |
| 서버 상태 | TanStack Query | FeedbackOps와 동일 | **미도입** — Kernel `usePlatformQuery`·`useMenuQuery`가 조회 수명주기 소유. 5분 폴링·계산 세대 재검증(#165)을 만들 때 Kernel 내부 구현 후보(메뉴 비노출) |
| UI 상태 | Zustand | FeedbackOps와 동일 | **미도입** — 전역 상태는 Kernel Context + URL로 충분 |
| Form | react-hook-form + zod (+ `@hookform/resolvers`) | FeedbackOps와 동일 | **미도입** — 쓰기 폼(권한 부여 등, #98 뒤)이 생길 때 |
| 아이콘 | lucide-react | FeedbackOps와 동일(버전은 다르다: 플랫폼 ^1.48 / FeedbackOps 0.469, 정렬은 후속). 2026-09-22 grilling에서 이미 Candidate→Decided로 확정된 것과 일치 | 사용 중 |
| Toast | sonner | FeedbackOps와 동일 | **라이브러리 미도입** — 현재 Kernel 자체 구현(sonner 미사용): `usePlatform().toast`·`dismissToast`를 셸이 렌더하고 메뉴가 사용 중. 전환은 필요해질 때 검토 |
| Command Palette | cmdk | FeedbackOps와 동일. §4 Kernel 책임의 Command Palette를 이 라이브러리로 구현 | **자체 구현**(`packages/shell/src/CommandPalette.tsx`, 메뉴 이동만). 실검색(Entity Search)을 넣을 때 cmdk 재검토 |
| 테이블/가상화 | TanStack Table + TanStack Virtual | FeedbackOps에 선례 없음. 이 세션 Unit C(`prototypes/kernel-platform-table/`)에서 서버사이드 sort/filter·virtualization·column 선호 저장·multi-select를 Playwright/Chromium으로 실검증(23 tests) | 사용 중. 메뉴는 엔진 타입이 아니라 플랫폼 열 타입 `PlatformColumn`만 쓴다(#160, 메뉴가 표 엔진 패키지 `@tanstack/react-table`·`react-virtual`·`table-core`·`virtual-core`를 import하면 lint 에러) — 엔진 교체가 `@ap/components` 안에서 끝난다 |
| 차트 | Apache ECharts(코드는 Canvas 렌더러 — SVG/Canvas 선택은 결정 대기) | FeedbackOps에 선례 없음. 이 세션 Unit B(`prototypes/kernel-chart-frame/`)에서 실제 SVG SSR 렌더링·4층 상태 분리·Toolbar 7종을 검증(23 tests) | 사용 중(ECharts 6.1, 별도 지연 청크 #48). 렌더러는 현재 canvas(`EChartImpl.tsx`)이며 프로토타입이 검증한 SVG와 다르다 |
| 테스트 | Playwright(e2e/visual) + Vitest(unit) | FeedbackOps와 동일, 이 세션 프로토타입도 동일 조합 사용 | 사용 중(Playwright 1.63, Vitest 3.2) |
| 조회 레이아웃 | CSS Grid | 고정 화면은 react-grid-layout보다 단순·안정적 | 사용 중 |

**기타 의존:** 스타일 유틸 `class-variance-authority`·`clsx`·`tailwind-merge`, 폰트 `@fontsource-variable/inter`·`@fontsource-variable/jetbrains-mono`·`pretendard`, 테스트 보조 `@testing-library/*`·`jsdom`. 목록의 원본은 각 `package.json`이다.

**아직 Candidate로 남는 것**: 대시보드 편집(react-grid-layout, Deferred 기능이라 채택 보류), 정확한 라이브러리 버전 고정(실제 구현 착수 시 재검증), FeedbackOps 컴포넌트/토큰 이식의 세부 매핑(실제 포팅 작업에서 확정).

**결정과 코드의 차이(2026-10-05 확인):** 위 표의 "현재 코드" 열이 실제 의존(`package.json`)과 구현이다. 결정 자체는 바꾸지 않았다. 라우팅·UI 상태처럼 Kernel이 자체 구현으로 대신하는 항목을 "미채택"으로 확정할지는(서버 상태 TanStack Query는 미채택 후보가 아니라 #165의 Kernel 내부 후보) [05 Open](05_roadmap_and_open_questions.md)에 올렸다. 새 라이브러리는 그것이 필요한 기능을 만들 때 Kernel·공통 컴포넌트 **안**에 넣고, 메뉴에 노출하지 않는다.

Node/NestJS는 프론트와의 언어 통일·SQL-first 관점에서 비교했던 대안이다. 현재 백엔드는 FastAPI 방향이 Decided이며 세부 버전·구성은 Candidate다([05 결정 상태](05_roadmap_and_open_questions.md), [03 백엔드 스택](03_backend_stack.md)).

## 그리드·차트·데이터 도구 검토 (2026-10-02)

사내 리서치 문서 "반도체 생산성 분석 웹 시스템: 스킬·그리드·차트 조사"(2026-10-02, 조사 기준일 2026-10-01)의 후보를 이 플랫폼 계약(06 §15 표, §16 차트, §19 응답, §24 승격 기준, §26 접근성, [실서버 연결 체크리스트](integration/real-server-checklist.md) §3)에 비춰 검토했다. 라이선스·기능 경계는 리서치 문서와 아래 출처를 따랐고 성능은 측정하지 않았다. **상태:** 판정 표의 후보 순위·유료 후보는 Candidate(채택·구매 결정이 아니다). 무료 우선·엔진 은닉·2026-10-02 범위는 [ADR-0006](adr/0006-grid-free-first-engine-hidden-from-menus.md), Perspective 경계는 [ADR-0007](adr/0007-perspective-browser-engine-only.md)(Decided).

**방침:** 무료로 시작하고 필요성이 확인되면 유료로 전환한다 — [ADR-0006](adr/0006-grid-free-first-engine-hidden-from-menus.md), [05 결정 상태](05_roadmap_and_open_questions.md)(2026-10-02, 사용자).

### 판정

| 후보 | 라이선스 | 판정 | 이유 |
| --- | --- | --- | --- |
| TanStack Table + Virtual(현재) | MIT | **유지** | 06 §15 기본 기능(서버 정렬, 열 크기·숨김·고정, 열 설정 저장, 다중 선택, 가상화)을 이미 갖췄다(`PlatformDataTable`) |
| AG Grid Community | MIT | 보류 | §15 기능은 이미 있어 바꿔 얻는 것이 적다. 모양이 바뀌므로 바꾼다면 M2 프로토타입 컨펌 |
| AG Grid Enterprise | 상용 | **유료 전환 1순위** | 셀 범위 선택·여러 셀 복붙·채우기·피벗·XLSX가 여기서만 된다. Community와 API가 같아 모듈 + 라이선스 키로 확장 |
| Glide Data Grid | MIT | 비추천 | 캔버스 렌더링 — 06 §26 접근성, CSS 디자인 토큰, 한글 입력 편집을 따로 검증해야 하고 저장·집계는 직접 구현 |
| Handsontable | 업무용 상용 | 제외 | 무료는 비상업·평가 조건. 워크북 편집은 플랫폼 다섯 갈래 밖 |
| SpreadJS | 상용 | 제외 | XLSX 워크북 요구가 없다 |
| Univer | 코어 Apache-2.0 / Pro 상용 | 제외 | 여러 시트 작업 공간 요구가 없고 XLSX 입출력은 Pro |
| HyperFormula | GPLv3 / 상용 | 제외 | 셀 수식 요구가 없다. 쓰려면 사내 법무 검토가 먼저 |
| **Perspective** | Apache-2.0 | 보류 — 자유 피벗의 무료 1순위 | 아래 "Perspective 사용 방식". 요구 확인 뒤 POC(#163) |
| Apache ECharts | Apache-2.0 | **유지** | 이미 채택·구현(지연 청크 #48). 설비 상태 타임라인(custom range-bar)·히트맵·박스플롯도 ECharts로. 단 메뉴 2–3곳에서 반복되기 전까지 각 메뉴의 도메인 컴포넌트(06 §24) |
| Plotly.js · uPlot | MIT | 보류 | 통계 trace·고빈도 파형 요구가 생길 때. 엔진을 미리 늘리지 않는다 |
| TanStack Query | MIT | Kernel 내부 후보 | 위 스택 표 "서버 상태" 행, #165 |
| Polars · Pandera | MIT | 보류 | [03](03_backend_stack.md) SQL-first — API 요청 경로에서 데이터프레임 금지. mart는 지금 pg_cron SQL이라 쓸 곳이 없다. 원천 처리 검증은 파서 저장소 책임이라 Pandera를 플랫폼에 들이면 역할이 겹친다 |
| DuckDB + Parquet | MIT | 보류 | 병목이 입증될 때 비교(리서치 [SYNTHESIS](research/platform-build-2026-09-22/SYNTHESIS.md)) |

### 무료 경로와 유료 전환

그리드 선택은 "엑셀 수준 편의성"이 구체적으로 무엇인지에 달려 있다. 2026-10-02 결정(#159, [ADR-0006](adr/0006-grid-free-first-engine-hidden-from-menus.md)): 행 복사(#174)·전체 결과 XLSX(#173)를 무료 경로로 먼저 적용하고, 자유 피벗(#163)·셀 범위 복붙·채우기(#164)는 보류한다.

| 요구 | 무료 경로 | 유료 경로 |
| --- | --- | --- |
| 보이는 행을 엑셀로 복사 | 선택 행을 탭 구분 텍스트로 복사(표 공통 부품) | — |
| 전체 결과 XLSX | (a, 채택 — #173 구현: `PlatformDataTable` [내보내기 ▾] → Excel(.xlsx), `write-excel-file` 지연 로드) 지금 패턴 그대로: 내보내기 엔드포인트(예: `analytics.cycle.export`)가 필터된 전체 행을 envelope로 돌려주고 클라이언트가 직렬화한다 — CSV 대신 무료 XLSX 라이브러리로 쓰면 `PlatformAdapter` 변경 없음. (b) 서버 파일 생성(openpyxl·XlsxWriter): 대용량에 유리하지만 파일 다운로드 경로가 `PlatformAdapter` 밖이라 #149·Kernel 포트 결정이 필요 | AG Grid Enterprise Excel 내보내기(그리드에 렌더된 데이터 기준 — 서버 행 모델에서 안 불러온 행을 내보내는지는 공식 문서 미확인, #164에서 확인) |
| 사용자 자유 피벗·즉석 차트 | Perspective 탐색 탭 | AG Grid Enterprise 피벗 |
| 셀 범위 선택·여러 셀 복사·채우기(읽기) | 사실상 없음 | AG Grid Enterprise |
| 붙여넣기 대량 편집(쓰기) | 없음 | AG Grid Enterprise + **쓰기 계약**(아래 4) |

공식 지표는 언제나 서버 계산이다. 그리드의 SUM·AVERAGE는 공식 지표의 집계 방식을 정하지 않는다 — 비율을 행별로 평균하면 분자·분모를 합한 값과 다르다. 셀 수식(AG Grid Enterprise)은 서버 행 모델·피벗과 함께 쓸 수 없다고 공식 문서가 밝히므로 공식 지표 화면에 결합하지 않는다.

**유료 전환 계획**

1. 지금: 메뉴가 표 엔진 타입을 직접 쓰지 않게 한다(#160) — 엔진 교체가 `@ap/components` 안에서 끝나도록.
2. 트리거: 셀 범위 복붙·채우기(또는 쓰기 계약을 갖춘 붙여넣기 편집)가 업무 필수로 확인될 때(실제 사내 메뉴 2–3곳 근거). 2026-10-02에는 확인되지 않아 #164로 보류.
3. 평가: AG Grid Enterprise 평가판 POC(#164) — 리서치 문서 §7의 8개 항목 + `urlState` 연동, 디자인 토큰 테마, 06 §26 접근성, 지연 청크, **망분리에서 라이선스 키가 외부 통신 없이 동작하는지**, 라이선스 조건·비용.
4. 전환: 읽기 기능(셀 범위 선택·복사·채우기 표시·피벗)은 `PlatformDataTable` 내부만 교체하고 메뉴 코드는 그대로다. 붙여넣기 대량 편집은 그리드 교체만으로 안 된다 — 지금 표 API는 `loadPage`·`onExport`뿐이고 메뉴 엔드포인트도 읽기 전용이라, 편집을 저장하려면 메뉴가 선언하는 쓰기(mutation) 엔드포인트·서버 검증·권한·감사·부분 실패 처리 계약이 먼저 필요하다. 별도 플랫폼 작업이고, 권한 쓰기 원천(#98) 같은 결정에 걸린다.

### Perspective 사용 방식

Perspective(조사 시점 최신 5.x — v5.5.1, 2026-09-18)는 C++ 엔진을 WASM으로 돌리고, 표·WebGL 차트·그룹·분할(피벗)·필터·수식 열을 웹 컴포넌트 하나로 준다. 같은 클라이언트 API로 Web Worker 안 엔진과 원격 서버(WebSocket)를 모두 쓸 수 있고, Virtual Server로 DuckDB·ClickHouse·PostgreSQL(Python, 16 이상)에 피벗 설정을 SQL로 보낸다.

- **경계는 [ADR-0007](adr/0007-perspective-browser-engine-only.md)**: 브라우저 엔진만, Virtual Server·원격 모드로 DB·서버 엔진에 직접 붙지 않는다(이유와 대안은 ADR).
- 데이터는 메뉴가 선언한 엔드포인트의 `menuQuery` 결과다. 지금 엔드포인트는 화면용으로 집계·비율화된 값을 주므로 대개 탐색용 원 값 엔드포인트를 새로 선언해야 한다. 브라우저 적재량의 상한은 아직 계약에 없다(선언 `limits`는 `maxHours`뿐) — 탐색용 엔드포인트에 행 상한 선언이 필요하다(06 §15 "대규모 데이터에서는 브라우저에 전체 데이터를 전달하지 않는다" — 선언 상한의 계약은 #175, 탐색 엔드포인트의 값은 #163).
- 탐색 탭에는 더할 수 있는 원 값(건수·시간·분자·분모)만 넣고 "공식 지표 아님"과 결과 집합의 `DataTrustIndicator`를 함께 보인다.
- Perspective 차트(WebGL)는 탐색 탭 안에서만. 06 §16 Chart Frame 계약 화면은 ECharts. WebGL 차트는 스크린 리더로 읽히지 않으므로 같은 데이터의 표 경로를 남긴다(06 §26).
- 피벗 설정은 화면 로컬 상태(시각화 층). URL 공유는 page key 또는 저장된 뷰(Deferred) 결정 뒤. 셀 클릭은 `linkTo`로 상세 이동, 전역 Context를 조용히 바꾸지 않는다(06 §22).
- WASM 엔진이 무거우므로 탭에서만 지연 로드하고, 망분리 환경이라 WASM 파일을 자체 호스팅한다.

### 개발 에이전트 스킬

FastAPI 공식·Postgres Best Practices·React Best Practices를 `.agents/skills`로 들인다(#162). AG Grid 스킬은 유료 전환 때, shadcn 스킬은 필요해질 때, TanStack Intent는 Query 도입 때, Polars 스킬은 채택 때. webapp-testing은 Playwright E2E·ego-browser가 이미 있어 넣지 않는다. 외부 스킬은 제품 계약을 덮어쓰지 않는다.

출처: [AG Grid Community vs Enterprise](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/), [AG Grid Fill Handle(Enterprise)](https://www.ag-grid.com/react-data-grid/cell-selection-fill-handle/), [AG Grid Excel Export](https://www.ag-grid.com/react-data-grid/excel-export/), [AG Grid 수식·호환성](https://www.ag-grid.com/react-data-grid/formulas/), [Glide Data Grid](https://github.com/glideapps/glide-data-grid), [Handsontable 라이선스](https://handsontable.com/docs/react-data-grid/license-key/), [HyperFormula 라이선스](https://hyperformula.handsontable.com/docs/guide/license-key.html), [Univer](https://github.com/dream-num/univer), [SpreadJS 라이선스](https://developer.mescius.com/spreadjs/licensing), [Perspective](https://github.com/perspective-dev/perspective), [Perspective Virtual Servers](https://perspective-dev.github.io/guide/explanation/virtual_servers.html), [Apache ECharts](https://github.com/apache/echarts), [Plotly.js](https://github.com/plotly/plotly.js), [uPlot](https://github.com/leeoniya/uPlot), [Polars](https://github.com/pola-rs/polars), [Pandera](https://github.com/unionai-oss/pandera), [DuckDB 동시성](https://duckdb.org/docs/current/connect/concurrency).

## 정보구조·Context·딥링크 계약의 소유권

플랫폼 전역 계약은 `06_platform_ui_contract.md`가 소유한다: §6은 occurrence 식별자와 목적지 객체 ID 분리, URL 상태, Scope/서버 권한 검증, 시간 의미와 Open 결정; §9는 navigation IA; §11은 Context 변경과 이전 데이터 차단 규칙이다. 이 문서에서 별도 규칙을 재정의하지 않는다.

TanStack Router는 계약의 구현 후보다. URL 직렬화·집합/단일값 키의 중복 규칙은 [06 전역 계약](06_platform_ui_contract.md) §6.1, 세션 우선순위·버전 `v` 수명주기·잘못된 값·뒤로가기/미지원 Context 복원 메커니즘은 §6.4에서 Decided다. 공개 필드명·enum 문자열 및 공유 산출물 형식(OpenAPI/JSON Schema/codegen)은 Candidate이며, 구현·라이브러리 채택·완성된 URL API를 이 결정만으로 주장하지 않는다. 구체 셸 배치는 [07 App Shell](07_app_shell_wireframe.md)을 참조한다.

## 페이지별 UI 패턴

### 설비·기준정보 CRUD

필터바+테이블+선택 액션바, 행 클릭 시 상세 Drawer/Split View, 삭제보다 비활성화/유효기간 종료 우선, 설비 유효구간은 타임라인+구간 테이블 함께, 겹치는 구간은 저장 전 차단/경고, Audit Trail은 숨은 메뉴가 아니라 상세 화면의 탭/우측 패널로 노출.

### 생산성 분석

KPI 카드 수 제한 후 핵심 지표 하나를 가장 크게, 주 차트-상세 테이블 연결, 차트 클릭 시 필터 칩 생성, "현재 범위/기준선/이벤트/주석" 시각적 구분, 차트 도구(확대/초기화/Brush/주석/비교/내보내기) 일관화, 차트마다 로컬 상태와 페이지 전역 필터를 분리.

### 지표 카탈로그

지표카드/상세에 계산식, 단위·grain, 데이터 원천, 담당 조직, 버전·유효기간, 승인상태(워크플로가 아니라 초안/발행/폐기 같은 상태 필드 — YAGNI로 뺀 승인 워크플로와는 별개), 적용 가능 설비/공정 범위, 데이터 품질상태, 사용 중인 대시보드, 이전 버전과의 차이를 함께 표시. 대시보드는 "현재 최신 지표"를 암묵적으로 쓰지 않고 게시 시점의 지표 버전을 고정(예: "점유율 지표 v3로 계산됨 · 현재 승인 버전은 v4").

### 공지·VOC

VOC는 분석 화면과 시각 언어를 일부 공유하되 접수/담당자/상태전이/댓글은 VOC 자체 도메인 모델(Audit Trail이 대체하지 않음) — 접수/담당/상태/우선순위 필터, 설비·Lot·지표로부터 VOC 생성, VOC에서 원본 분석 화면으로 돌아가는 링크, 분석 화면에는 열람 권한 범위 내의 관련 VOC 수만 표시(VOC 열람 권한이 원본 분석 권한을 자동 부여하지 않음). 상세는 `02_domain_menus.md`.

## 로딩·빈 상태·오류

"데이터가 없음"의 의미가 여러 가지라 상태를 세분화해야 한다: 아직 수집안됨 / 파서 처리 지연 / 필터 결과 0건 / 권한으로 인해 비노출 / 데이터 품질 경고 / 쿼리 결과 과대 / 실제 서버 오류. 각 상태는 화면 밖의 근거(어느 서비스가 그 사실을 확정하는지)가 필요하다 — 근거 없이는 "원인 미확인"(`06_platform_ui_contract.md` §19가 표시 근거 규칙을 소유하며 원천 제약은 `03_backend_stack.md` 참조).

권장 동작:

- 로딩 중에는 표의 행/차트 축 형태를 유지하는 Skeleton
- 새로고침 중에도 이전 데이터 유지 + "갱신중" 표시(단, 설비·기간 등 컨텍스트가 바뀐 뒤에는 이전 값을 새 필터 결과처럼 보이게 하지 않는다 — 동일 컨텍스트 재조회에만 적용, 권한 스코프 전환 시에는 이전 결과를 유지하지 않음)
- 위젯별 재시도, 실패한 위젯만 오류 처리(대시보드 전체 아님)
- 마지막 갱신 시각/원천 기준 시각/데이터 완전성 표시
- 장시간 쿼리는 취소/집계수준 변경/기간 축소 제안
- 오류 화면에는 Query ID/Correlation ID 제공

## 차트/도식 자유도 요구사항

요구사항: 확대/축소, 특정 구간 확대, 차트 위에 그리기(주석/영역 표시) 등 차트 기반 커스텀 기능.

차트 상태는 4층으로 분리:

1. 전역 필터(기간·설비·Lot)
2. 차트 로컬 상태(확대 범위·Brush·표시 시리즈)
3. 영속 주석(작성자·시간구간·설명·분류·권한·Audit이 있는 도메인 객체) — 플랫폼이 소유하는 도메인 모델이며, 공통 위젯 프레임워크(Deferred)는 이를 편집·표시하는 기능만 재사용한다
4. 이벤트/알람(주석과 별개의 운영 이벤트)

DataZoom만으로 대용량 문제를 해결하지 말고 백엔드에서 화면 픽셀 폭에 맞는 해상도·집계 수준을 선택할 것(원본 로그 전체를 브라우저로 보내지 않음). Canvas 차트의 접근성 보완으로 차트 제목/단위, 선택 구간 텍스트 요약, 동일 데이터의 상세 표, 키보드 구간선택 컨트롤, 색 외 선 형태/아이콘 표시를 갖춘다.

### 주석 저장 모델 (진짜 설계 과제)

라이브러리 선택보다 중요한 것은 **주석 저장 모델**이다. 그린 영역/필기를 화면 픽셀이 아니라 시간구간·데이터 좌표·대상 occurrence 기준으로 저장하고, 자유 필기 메모와 분석 필터용 선택 영역을 구분한다. 대표 화면 하나로 줌/팬/영역선택 동기화, 주석 이동·수정·삭제, 리사이즈·줌 후 위치 유지, 저장 후 복원까지 검증한 뒤 라이브러리 선택을 고정한다. 영역 주석 최소형과 자유 필기·고급 편집기는 서로 다른 범위 후보다. 구현 순서와 배치 시점은 Deferred이며 `05_roadmap_and_open_questions.md`의 과거 Phase 표는 확정 계획이 아니다.
