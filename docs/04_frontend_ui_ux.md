# 04. 프론트엔드 기술 스택 및 UI/UX 설계 (프론트엔드 담당자용)

백엔드 스택은 `03_backend_stack.md`를 본다.

## 제품 제약과 구현 후보

**Decided product constraints**는 `06_platform_ui_contract.md`의 Desktop-first, 메뉴 공통 계약, Context/URL 재현, 서버 권한 재검증, 접근성 및 데이터 상태 근거 규칙이다. 이 제약들은 특정 프레임워크를 요구하지 않는다.

아래 대시보드 편집 후보(react-grid-layout)만 여전히 **implementation candidate**다 — 해당 기능 자체가 Deferred이기 때문이며, 채택 시점에 버전·성능을 재검증한다.

## 프론트엔드 기술 스택 (Decided, 2026-09-25)

**결정 근거**: FeedbackOps(`products/feedbackops/apps/frontend`, `packages/ui`)가 실사용 중인 비-백엔드 스택을 그대로 가져온다 — 이미 검증되고 채택 경험이 있어 마이그레이션 부담이 적다는 것이 사용자 판단이다. 테이블/차트는 FeedbackOps에 선례가 없어, 이 세션에서 Astra↔Opus 교차 검토로 실제 동작을 검증한 것을 그대로 채택한다(Unit B `prototypes/kernel-chart-frame/`, Unit C `prototypes/kernel-platform-table/`, 별도 worktree/브랜치 `hjung3113/kernel-context-url-scope`). FeedbackOps 자체 코드는 이 결정으로 소급 변경하지 않는다(AGENTS.md FeedbackOps 서브모듈 경계).

| 계층 | 채택(2026-09-25 결정) | 근거 | 현재 코드(2026-10-02) |
| --- | --- | --- | --- |
| Frontend 기반 | React + TypeScript + Vite | FeedbackOps `apps/frontend`와 동일 | 사용 중(Vite 7) |
| 스타일링 | **Tailwind CSS v4** | FeedbackOps는 v3(`packages/ui/tailwind.preset.ts`, "Tailwind 3 syntax only. No `@theme` v4 blocks" 명시, ADR-0021 semantic token 방식). 이 플랫폼은 v4로 가고 FeedbackOps의 시맨틱 토큰 네이밍(ADR-0021)만 이식한다 — 문법을 `@theme` 블록으로 옮기는 건 이 플랫폼 쪽 마이그레이션 작업이며, FeedbackOps 자체를 v4로 올리는 것은 별도 과제(강제하지 않음) | 사용 중(Tailwind 4.3, `@theme`) |
| UI 컴포넌트 | **shadcn/ui + Radix**(FeedbackOps `packages/ui/src/components/shadcn/`의 22개 컴포넌트 소스를 이식) + 자체 확장 컴포넌트(`ChipPicker`/`AnalyticsAreaPicker` 등 패턴 참고) | shadcn은 설치형 패키지가 아니라 소스 복사 방식이라 FeedbackOps가 이미 커스터마이즈해 둔 실제 파일을 그대로 가져올 수 있다. `cn()` 헬퍼(clsx+tailwind-merge)도 동일하게 이식 | 사용 중 — Radix 프리미티브 + 자체 `@ap/ui`(shadcn 소스 이식은 M2 디자인 재개 때, #52) |
| 라우팅 | TanStack Router | FeedbackOps와 동일. 타입 있는 검색 파라미터로 06 §6.4 URL 계약을 타입 안전하게 관리하되, 버전·폐기 필드·미지원 필터 처리는 이 문서 §6.4 메커니즘을 별도로 구현해야 한다 | **미도입** — Kernel 자체 History + URL codec이 06 §6.4를 소유(Unit A부터 알려진 divergence, `.agents/reports/kernel-work-order-app-shell-menu-registry-draft.md` #5). 도입·미채택 확정은 Open(05) |
| 서버 상태 | TanStack Query | FeedbackOps와 동일 | **미도입** — Kernel `usePlatformQuery`·`useMenuQuery`가 조회 수명주기 소유. 5분 폴링·계산 세대 재검증(#165)을 만들 때 Kernel 내부 구현 후보(메뉴 비노출) |
| UI 상태 | Zustand | FeedbackOps와 동일 | **미도입** — 전역 상태는 Kernel Context + URL로 충분 |
| Form | react-hook-form + zod (+ `@hookform/resolvers`) | FeedbackOps와 동일 | **미도입** — 쓰기 폼(권한 부여 등, #98 뒤)이 생길 때 |
| 아이콘 | lucide-react | FeedbackOps와 동일. 2026-09-22 grilling에서 이미 Candidate→Decided([PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) 아이콘 항목)로 확정된 것과 일치 | 사용 중 |
| Toast | sonner | FeedbackOps와 동일 | **라이브러리 미도입** — Toast 기능은 Kernel 자체 구현(`usePlatform().toast`·`dismissToast`, 셸이 렌더, 메뉴가 사용 중). sonner로 바꿀지는 M2 디자인 재개 때 판단 |
| Command Palette | cmdk | FeedbackOps와 동일. §4 Kernel 책임의 Command Palette를 이 라이브러리로 구현 | **자체 구현**(`packages/shell/src/CommandPalette.tsx`, 메뉴 이동만). 실검색(Entity Search)을 넣을 때 cmdk 재검토 |
| 테이블/가상화 | TanStack Table + TanStack Virtual | FeedbackOps에 선례 없음. 이 세션 Unit C(`prototypes/kernel-platform-table/`)에서 서버사이드 sort/filter·virtualization·column 선호 저장·multi-select를 Playwright/Chromium으로 실검증(23 tests) | 사용 중. 메뉴는 엔진 타입이 아니라 플랫폼 열 타입만 쓰도록 정리 중(#160) |
| 차트 | Apache ECharts (SVG 렌더러) | FeedbackOps에 선례 없음. 이 세션 Unit B(`prototypes/kernel-chart-frame/`)에서 실제 SVG SSR 렌더링·4층 상태 분리·Toolbar 7종을 검증(23 tests) | 사용 중(ECharts 6.1, 별도 지연 청크 #48). **렌더러는 현재 canvas**(`EChartImpl.tsx`) — SVG 채택 근거와 다르므로 확인 필요 |
| 테스트 | Playwright(e2e/visual) + Vitest(unit) | FeedbackOps와 동일, 이 세션 프로토타입도 동일 조합 사용 | 사용 중(Playwright 1.63, Vitest 3.2) |
| 조회 레이아웃 | CSS Grid | 고정 화면은 react-grid-layout보다 단순·안정적 | 사용 중 |

**아직 Candidate로 남는 것**: 대시보드 편집(react-grid-layout, Deferred 기능이라 채택 보류), 정확한 라이브러리 버전 고정(실제 구현 착수 시 재검증), FeedbackOps 컴포넌트/토큰 이식의 세부 매핑(실제 포팅 작업에서 확정).

**결정과 코드의 차이(2026-10-02 확인):** 위 표의 "현재 코드" 열이 실제 의존(`package.json`)과 구현이다. 결정 자체는 바꾸지 않았다. 라우팅·UI 상태처럼 Kernel이 자체 구현으로 대신하는 항목을 "미채택"으로 확정할지는(서버 상태 TanStack Query는 미채택 후보가 아니라 #165의 Kernel 내부 후보) [05 Open](05_roadmap_and_open_questions.md)에 올렸다. 새 라이브러리는 그것이 필요한 기능을 만들 때 Kernel·공통 컴포넌트 **안**에 넣고, 메뉴에 노출하지 않는다.

Node/NestJS는 프론트와의 언어 통일·SQL-first 관점에서 비교했던 대안이다. 현재 백엔드는 FastAPI 방향이 Decided이며 세부 버전·구성은 Candidate다([05 결정 상태](05_roadmap_and_open_questions.md), [03 백엔드 스택](03_backend_stack.md)).

## 그리드·차트·데이터 도구 검토 (2026-10-02)

사내 리서치 문서 "반도체 생산성 분석 웹 시스템: 스킬·그리드·차트 조사"(2026-10-02, 조사 기준일 2026-10-01)의 후보를 이 플랫폼 계약(06 §15 표, §16 차트, §19 응답, §24 승격 기준, §26 접근성, [실서버 연결 체크리스트](integration/real-server-checklist.md) §3)에 비춰 검토했다. 라이선스·기능 경계는 리서치 문서와 아래 출처를 따랐고 성능은 측정하지 않았다. **상태: Candidate** — 채택·구매 결정이 아니다.

**방침:** 무료로 시작하고 필요성이 확인되면 유료로 전환한다 — 원본은 [05 결정 상태](05_roadmap_and_open_questions.md)(2026-10-02, 사용자).

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

그리드 선택은 "엑셀 수준 편의성"이 구체적으로 무엇인지에 달려 있다 — 결정 [#159](https://github.com/hjung3113/analytics-platform/issues/159).

| 요구 | 무료 경로 | 유료 경로 |
| --- | --- | --- |
| 보이는 행을 엑셀로 복사 | 선택 행을 탭 구분 텍스트로 복사(표 공통 부품) | — |
| 전체 결과 XLSX | (a) 지금 패턴 그대로: 내보내기 엔드포인트(예: `analytics.cycle.export`)가 필터된 전체 행을 envelope로 돌려주고 클라이언트가 직렬화한다 — CSV 대신 무료 XLSX 라이브러리로 쓰면 `PlatformAdapter` 변경 없음. (b) 서버 파일 생성(openpyxl·XlsxWriter): 대용량에 유리하지만 파일 다운로드 경로가 `PlatformAdapter` 밖이라 #149·Kernel 포트 결정이 필요 | AG Grid Enterprise Excel 내보내기(그리드에 렌더된 데이터 기준 — 서버 행 모델에서 안 불러온 행을 내보내는지는 공식 문서 미확인, #164에서 확인) |
| 사용자 자유 피벗·즉석 차트 | Perspective 탐색 탭 | AG Grid Enterprise 피벗 |
| 셀 범위 선택·여러 셀 복사·채우기(읽기) | 사실상 없음 | AG Grid Enterprise |
| 붙여넣기 대량 편집(쓰기) | 없음 | AG Grid Enterprise + **쓰기 계약**(아래 4) |

공식 지표는 언제나 서버 계산이다. 그리드의 SUM·AVERAGE는 공식 지표의 집계 방식을 정하지 않는다 — 비율을 행별로 평균하면 분자·분모를 합한 값과 다르다. 셀 수식(AG Grid Enterprise)은 서버 행 모델·피벗과 함께 쓸 수 없다고 공식 문서가 밝히므로 공식 지표 화면에 결합하지 않는다.

**유료 전환 계획**

1. 지금: 메뉴가 표 엔진 타입을 직접 쓰지 않게 한다(#160) — 엔진 교체가 `@ap/components` 안에서 끝나도록.
2. 트리거: #159에서 셀 범위 복붙·채우기·붙여넣기 편집이 업무 필수로 확인될 때(실제 사내 메뉴 2–3곳 근거).
3. 평가: AG Grid Enterprise 평가판 POC(#164) — 리서치 문서 §7의 8개 항목 + `urlState` 연동, 디자인 토큰 테마, 06 §26 접근성, 지연 청크, **망분리에서 라이선스 키가 외부 통신 없이 동작하는지**, 라이선스 조건·비용.
4. 전환: 읽기 기능(셀 범위 선택·복사·채우기 표시·피벗)은 `PlatformDataTable` 내부만 교체하고 메뉴 코드는 그대로다. 붙여넣기 대량 편집은 그리드 교체만으로 안 된다 — 지금 표 API는 `loadPage`·`onExport`뿐이고 메뉴 엔드포인트도 읽기 전용이라, 편집을 저장하려면 메뉴가 선언하는 쓰기(mutation) 엔드포인트·서버 검증·권한·감사·부분 실패 처리 계약이 먼저 필요하다. 별도 플랫폼 작업이고, 권한 쓰기 원천(#98) 같은 결정에 걸린다.

### Perspective 사용 방식

Perspective(조사 시점 최신 5.x — v5.5.1, 2026-09-18)는 C++ 엔진을 WASM으로 돌리고, 표·WebGL 차트·그룹·분할(피벗)·필터·수식 열을 웹 컴포넌트 하나로 준다. 같은 클라이언트 API로 Web Worker 안 엔진과 원격 서버(WebSocket)를 모두 쓸 수 있고, Virtual Server로 DuckDB·ClickHouse·PostgreSQL(Python, 16 이상)에 피벗 설정을 SQL로 보낸다.

- **허용: 브라우저 엔진만.** 메뉴가 선언한 엔드포인트의 `menuQuery` 결과 — 서버가 권한·Scope·한도를 판정한 결과 집합 — 를 Worker 엔진에 넣고 사용자가 다시 집계한다. 지금 엔드포인트는 화면용으로 집계·비율화된 값을 주므로 대개 탐색용 원 값 엔드포인트를 새로 선언해야 한다. 브라우저 적재량은 선언 `limits`(`too_large`)와 행 상한으로 묶는다 — 06 §15 "대규모 데이터에서는 브라우저에 전체 데이터를 전달하지 않는다".
- **금지: Virtual Server·원격 모드로 DB나 서버 엔진에 직접 붙기.** 브라우저가 보낸 임의 피벗 설정이 쿼리가 되고, 공식 문서에 권한·행 단위 보안 장치에 대한 언급이 없다. `menuQuery` 판정 순서(체크리스트 §3)를 우회한다. 데이터가 브라우저에 다 안 들어갈 만큼 커지면, FastAPI 안 Perspective 서버가 세션별로 권한 필터를 적용한 테이블만 만들어 보내는 방식을 검토할 수 있지만 `PlatformAdapter` 밖 통신 경로라 Kernel 포트 변경 — 플랫폼 결정이다.
- 탐색 탭에는 더할 수 있는 원 값(건수·시간·분자·분모)만 넣고 "공식 지표 아님"과 결과 집합의 `DataTrustIndicator`를 함께 보인다.
- Perspective 차트(WebGL)는 탐색 탭 안에서만. 06 §16 Chart Frame 계약 화면은 ECharts. WebGL 차트는 스크린 리더로 읽히지 않으므로 같은 데이터의 표 경로를 남긴다(06 §26).
- 피벗 설정은 화면 로컬 상태(시각화 층). URL 공유는 page key 또는 저장된 뷰(Deferred) 결정 뒤. 셀 클릭은 `linkTo`로 상세 이동, 전역 Context를 조용히 바꾸지 않는다(06 §22).
- WASM 엔진이 무거우므로 탭에서만 지연 로드하고, 망분리 환경이라 WASM 파일을 자체 호스팅한다.

### 개발 에이전트 스킬

FastAPI 공식·Postgres Best Practices·React Best Practices를 `.agents/skills`로 들인다(#162). AG Grid 스킬은 유료 전환 때, shadcn 스킬은 M2 재개 때, TanStack Intent는 Query 도입 때, Polars 스킬은 채택 때. webapp-testing은 Playwright E2E·ego-browser가 이미 있어 넣지 않는다. 외부 스킬은 제품 계약을 덮어쓰지 않는다.

출처: [AG Grid Community vs Enterprise](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/), [AG Grid Fill Handle(Enterprise)](https://www.ag-grid.com/react-data-grid/cell-selection-fill-handle/), [AG Grid Excel Export](https://www.ag-grid.com/react-data-grid/excel-export/), [AG Grid 수식·호환성](https://www.ag-grid.com/react-data-grid/formulas/), [Glide Data Grid](https://github.com/glideapps/glide-data-grid), [Handsontable 라이선스](https://handsontable.com/docs/react-data-grid/license-key/), [HyperFormula 라이선스](https://hyperformula.handsontable.com/docs/guide/license-key.html), [Univer](https://github.com/dream-num/univer), [SpreadJS 라이선스](https://developer.mescius.com/spreadjs/licensing), [Perspective](https://github.com/perspective-dev/perspective), [Perspective Virtual Servers](https://perspective-dev.github.io/guide/explanation/virtual_servers.html), [Apache ECharts](https://github.com/apache/echarts), [Plotly.js](https://github.com/plotly/plotly.js), [uPlot](https://github.com/leeoniya/uPlot), [Polars](https://github.com/pola-rs/polars), [Pandera](https://github.com/unionai-oss/pandera), [DuckDB 동시성](https://duckdb.org/docs/current/connect/concurrency).

## UI/UX 리서치 (codex gpt-5.6-luna, 실제 웹 검색 기반, 2026-09-17 확인)

이 플랫폼과 정확히 같은 단일 상용 제품은 없다. 가장 현실적인 참고 조합:

| 영역 | 참고 제품 |
| --- | --- |
| 운영 앱 셸·CRUD | Retool |
| 지표 거버넌스·드릴스루·필터 전달 | Looker, Power BI |
| 고밀도 시계열·주석·컨텍스트 링크 | Grafana, Datadog, New Relic |
| 대시보드·필터·권한·버전이력 단일 참고 | Apache Superset |
| 제조 도메인 참고 | AVEVA PI Vision, Seeq |

- **Grafana**: 대시보드 링크/패널 링크/데이터 링크를 구분하고 현재 시간범위·변수까지 링크에 포함 — "설비 점유율 차트 → 이송분포 화면" 이동에 특히 적합. ([공식 문서](https://grafana.com/docs/grafana-cloud/learn-and-build/visualizations/dashboards/build-dashboards/manage-dashboard-links/))
- **Datadog**: Template Variable/저장된 View/시간범위·필터·기간을 포함하는 Context Link 제공. 단 클릭한 데이터 포인트의 시간 버킷을 전달할 수 있어 "현재 페이지 전체 기간"과는 구분해야 함. ([공식 문서](https://docs.datadoghq.com/dashboards/guide/context-links/))
- **Metabase**: 전역/카드 필터 범위를 명시적으로 구분하는 게 장점. ([공식 문서](https://www.metabase.com/docs/latest/dashboards/filters))
- **Power BI**: 드릴스루는 맥락(설비·Lot·기간)을 유지한 채 상세 페이지로 이동하는 좋은 참고. "URL 필터는 보안 경계가 아니다"는 Microsoft 공식 입장. ([공식 문서](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-drillthrough))
- **PI Vision / Seeq**: 제조 특화 제품 중 가장 유용 — PI Vision은 자산 중심 화면·실시간 트렌드, Seeq는 신호 검색→구간 표시→계산→공유 분석 흐름. 다만 파서의 완료된 occurrence 데이터에 적용할 때 실시간 센서 분석과 같은 데이터 가용성을 전제하면 안 됨.
- **Superset**: 필터바·대시보드 탭·레이아웃 편집·권한·버전이력을 한 제품에서 제공하는 가장 가까운 단일 참고. 단 확인된 공식 문서는 "Version: Next" 표기였고, 과거 대시보드 미리보기에도 현재 차트 정의가 쓰이며 권한 변경은 버전이력에 포함되지 않음 — 이 플랫폼의 완전한 감사·재현성 모델과 동일시하지 말 것.

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

| 라이브러리 | 줌/팬 | 영역 선택 | 그리기(주석) | 비고 |
| --- | --- | --- | --- | --- |
| Apache ECharts | 기본 제공(dataZoom) | 기본 제공(brush) | graphic 커스텀 레이어 — 완성된 주석 편집기는 아니며 드래그·좌표변환·리사이즈 갱신을 직접 연결해야 함 | 대용량 시계열 캔버스 렌더(large, sampling:'lttb')에 강함, React 래퍼 존재 |
| Plotly.js | 기본 제공 | 사각형·lasso 선택 기본 제공 | 선·사각형·원·경로 그리기 및 삭제 도구 기본 제공 | 통계 차트 풍부, 대용량·다중 차트 브러시 동기화는 ECharts가 더 유리하다는 것은 확정 사실이 아니라 POC로 검증할 가설 |
| visx/D3 (React) | 직접 구현 | 직접 구현 | 자유도 최고 | 구현 비용 큼 |
| Recharts/Nivo | 약함 | 약함 | 약함 | 선언적이라 쉽지만 커스텀 인터랙션엔 부적합 |

**추천: Apache ECharts 유지.** 대용량 시계열·다중 차트 브러시 동기화에서 우위가 있을 것이라는 가설로 최종 추천은 유지하되, 대표 화면 POC에서 검증한다.

ECharts 6.x(2026-05-19 기준 6.1.0)는 대용량 시계열·Canvas/SVG·progressive rendering·DataZoom·Brush·MarkArea·Graphic을 지원한다. ([릴리스 노트](https://echarts.apache.org/en/changelog.html))

차트 상태는 4층으로 분리:

1. 전역 필터(기간·설비·Lot)
2. 차트 로컬 상태(확대 범위·Brush·표시 시리즈)
3. 영속 주석(작성자·시간구간·설명·분류·권한·Audit이 있는 도메인 객체) — 플랫폼이 소유하는 도메인 모델이며, 공통 위젯 프레임워크(Deferred)는 이를 편집·표시하는 기능만 재사용한다
4. 이벤트/알람(주석과 별개의 운영 이벤트)

DataZoom만으로 대용량 문제를 해결하지 말고 백엔드에서 화면 픽셀 폭에 맞는 해상도·집계 수준을 선택할 것(원본 로그 전체를 브라우저로 보내지 않음). Canvas 차트의 접근성 보완으로 차트 제목/단위, 선택 구간 텍스트 요약, 동일 데이터의 상세 표, 키보드 구간선택 컨트롤, 색 외 선 형태/아이콘 표시를 갖춘다.

### 주석 저장 모델 (진짜 설계 과제)

라이브러리 선택보다 중요한 것은 **주석 저장 모델**이다. 그린 영역/필기를 화면 픽셀이 아니라 시간구간·데이터 좌표·대상 occurrence 기준으로 저장하고, 자유 필기 메모와 분석 필터용 선택 영역을 구분한다. 대표 화면 하나로 줌/팬/영역선택 동기화, 주석 이동·수정·삭제, 리사이즈·줌 후 위치 유지, 저장 후 복원까지 검증한 뒤 라이브러리 선택을 고정한다. 영역 주석 최소형과 자유 필기·고급 편집기는 서로 다른 범위 후보다. 구현 순서와 배치 시점은 Deferred이며 `05_roadmap_and_open_questions.md`의 과거 Phase 표는 확정 계획이 아니다.

## 최종 권장안

1. 앱 셸은 운영 시스템처럼(사이드바·Breadcrumb·전역 필터바·권한별 메뉴), 분석 화면은 BI처럼(지표 인증·데이터 기준시각·교차필터·드릴스루·저장된 보기), 차트는 옵스 도구처럼(시간범위·Brush·주석·컨텍스트 링크), 마스터데이터는 CRUD 도구처럼(테이블·Drawer·유효기간·diff·Audit) 설계한다.
2. URL은 필터 공유 계약으로 쓰지만 보안 경계로 쓰지 않는다.
3. 기본 테이블은 TanStack 계열로 시작하고 초대형 분석 그리드만 AG Grid(Enterprise 필요 여부 먼저 확인)를 검토한다. 2026-10-02 검토 결과와 무료→유료 전환 계획은 위 "그리드·차트·데이터 도구 검토".
4. 대시보드 저장 모델은 레이아웃 라이브러리와 분리한다.

## 확인 한계

제품 공식 문서 중심으로 2026-09-17 기준 상태를 확인했으나, 각 SaaS의 실제 로그인 화면 UI, 한국어/CJK 데이터에서의 그리드 성능, 실제 파서 산출물 규모에 대한 독립 벤치마크는 확인하지 못했다. AG Grid·Glide·Retool의 성능 수치는 공급자 설명으로 취급하고, 도입 전 실제 로그 cardinality와 CJK 데이터로 짧은 POC가 필요하다(향후 검증 후보로 기록, `05_roadmap_and_open_questions.md`).
