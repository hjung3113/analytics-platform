# Analysis Toolkit — 개발자용 선택 프레임워크 및 사용자 정의 분석 (Candidate)

- 조사 기준: **2026-10-13**. 이 문서는 **설계·PoC 입력**이며 새 UI·패키지·라이선스 채택 결정이나 구현 완료 기록이 아니다.
- 추적: [설계 Issue #291](https://github.com/hjung3113/analytics-platform/issues/291) · [기존 Perspective #163](https://github.com/hjung3113/analytics-platform/issues/163) · [AG Grid Enterprise #164](https://github.com/hjung3113/analytics-platform/issues/164)
- 상세: [기능 매핑](capability-matrix.md) · [아키텍처·도입 단계](architecture-rollout.md) · [독립 인터랙티브 기능 선택기](feature-explorer.html)
- **계약 원본**: [06 플랫폼 UI 계약](../../06_platform_ui_contract.md) §5·6·12·14·15·16·18·19·21·22·26·27, [04 스택/기존 후보 검토](../../04_frontend_ui_ux.md), [ADR-0006](../../adr/0006-grid-free-first-engine-hidden-from-menus.md), [ADR-0007](../../adr/0007-perspective-browser-engine-only.md), [ADR-0021](../../adr/0021-echarts-canvas-renderer.md).

## 1. 목적과 범위

**지향점:** 사내 메뉴 개발자는 “처리시간 분포를 보여줘”처럼 분석 목적·데이터 의미·상호작용만 선언한다. 플랫폼이 가능한 시각화/엔진/폴백을 제안하며, 사용자는 권한 범위 내에서 축·집계·필터·비교·레이아웃을 재구성한다. 개별 메뉴가 라이브러리와 연결 상태를 재구현하지 않는다.

**과도한 약속 금지:** “최대한 많은 기능을 제공”은 모든 엔진을 기본 번들로 설치한다는 뜻이 아니다. **찾을 수 있는 기능 카탈로그를 넓게 유지하고, 허용된 기능만 주문형으로 로드**한다. 메뉴 1곳 전용 표현은 먼저 도메인 컴포넌트로 검증하고, 플랫폼 공개 API는 06 §14의 2~3개 메뉴 검증 후 승격한다.

프로젝트의 기존 `AnalysisLayout`은 접기/2열 중심의 고정 분석 페이지이고, 자유 위젯 워크스페이스/저장된 뷰는 06 §14/§21에서 **Deferred**다. 이 문서는 채택 요청의 입력이며 해당 Deferred를 자동 변경하지 않는다. UI 구현 전 루트 `AGENTS.md`의 실제 앱 `?variant=` 인터랙티브 프로토타입 컨펌을 거친다. 이 폴더의 HTML은 **문서용 탐색기이지 승인용 제품 시안이 아니다**.

## 2. 코드 실사 — 활용할 기반

| 관심사 | 현재 코드 및 계약 | 제안 |
| --- | --- | --- |
| 차트 | `packages/components/src/AnalysisChartFrame.tsx` — Zoom/Brush/Compare/Annotate/CSV, Legend, 표 보기, 시점별 주석 | Frame/Action 동작 그대로, 플롯 엔진 및 차트 레시피를 내부 어댑터로 추출할지 PoC |
| 그래프 엔진 | `EChart.tsx`, `EChartImpl.tsx` — ECharts 6.1 Canvas, 동적 청크, 포맷/상태 복구 | default 유지. 시계열 전문 엔진은 별도 lazy adapter로 평가 |
| 데이터 표 | `PlatformDataTable.tsx`, `columnDef.ts` — TanStack Table+Virtual; 메뉴에는 `PlatformColumn`만 공개; XLSX/CSV/행 복사 | default 유지. 피벗/범위선택은 별도 capability. 엔진 타입 누출 금지 |
| 분석 레이아웃 | `AnalysisLayout.tsx` — KPI/차트/분해표, 접기/2열, menu별 localStorage | 읽기형 화면 기본 유지. 별도 편집형 workspace는 채택 결정 뒤 추가 |
| 계약 | `packages/contracts/src/menu-query.ts` — `EndpointSpec`, context projection, `limits.maxRows` | 데이터셋 스키마/집계 가능 여부를 선언하는 탐색용 메타데이터 설계 (Candidate) |
| 서버 경계 | `packages/contracts/src/adapter.ts`, `packages/kernel/src/query.ts` — `PlatformAdapter.menuQuery`, outcome/Trust | DB 직결 없음. 모든 데이터는 기존 서버 권한/Scope/한도 통과 |
| 등록 | `packages/kernel/src/registry.ts` — 메뉴 manifest + Context/Features | 시각화 capability는 메뉴 feature에 무작정 추가하지 않고 분리된 후보 Registry 검토 |
| 스타일/경계 | `@ap/ui` FeedbackOps 공유 토큰, `@ap/components` 렌더러, `@ap/shell` 업무공간 | 메뉴는 분석 스펙만 알고 상용/OSS 엔진을 몰라야 함 |

**코드에서 아직 없는 것:** UI로 직접 저작하는 분석 스펙, 데이터셋 필드 의미/집계 규칙 공통 스키마, 차트 타입 추천기, 교차 패널 selection bus, 워크스페이스 저장/공유와 version migration, 여러 차트 엔진을 동일 인터페이스로 쓰는 adapter. 기존 표 컬럼 설정/차트 확대를 “저장된 사용자 워크스페이스”로 혼동하지 않는다.

## 3. 기능 분류 (개발자와 사용자의 두 계층)

1. **데이터 선택**: 선언한 endpoint, grain, dimension/measure, 단위, 데이터 타입, Scope, 최대 행, 버전, Trust.
2. **데이터 처리**: 필터, 정렬, 그룹 집계, distinct, 가중 비율, 분위수, window/trend, rebinning, null 정책, downsampling. 공식 지표의 계산은 **서버에만**.
3. **시각화**: 시계열/막대/분포/상관/비교/고밀도 파형/상태 구간/흐름/트리/그리드/피벗/공정·Wafer 전용.
4. **상호작용**: Zoom, Brush, Point/Range selection, linkTo, Compare, annotations, drill-through, cross-filter (수동 Apply vs 미리보기).
5. **워크스페이스**: 패널 추가/탭/크기/순서, 차트 타입 변환, 개인 필터·계산 초안, 저장/복제/템플릿/복구/권한 있는 공유.
6. **근거·안전**: 업데이트 시각/coverage/partial/stale/too_large, metricVersion, 사용한 필드/집계 표시, 접근성 표 fallback, 워크스페이스 권한 재검증.

## 4. 기본 제공과 선택 도입 (예비 판정)

| 후보 | 역할 | 채택 상태 | 핵심 판단/주의 |
| --- | --- | --- | --- |
| **Apache ECharts** | 기본 차트(라인/막대/히트맵/상자/산점도/Sankey/treemap/parallel) | **Decided/구현 중** | Canvas 유지. 렌더되지 않은 고급 series는 등록+lazy chunk 테스트 필요 |
| **TanStack Table+Virtual** | 기본 데이터 테이블 | **Decided/구현 중** | 플랫폼 `PlatformColumn` API 유지 |
| **Lightweight Charts (TradingView)** | 고빈도·복수 패널 시계열/차트 마커/실시간 | **Candidate PoC** | 초 단위 `UTCTimestamp`, 동일 시점 중복·ms 이벤트·범주 축/Attribution 검사 필수 |
| **uPlot** | 대량 선형 시계열 성능 대조군 | Candidate | 좁은 차트 유형, UI 직접 구현 부담 |
| **Perspective v5** | 자유 피벗·드래그 탐색·다중 패널·Cross-filter | **Deferred #163, 무료 우선** | 현 `menuQuery`의 제한된 데이터만 브라우저 WASM/Worker에; Virtual Server/원격 DB 직결 금지(ADR-0007) |
| **Graphic Walker** | 사용자가 축/집계/색상으로 직접 차트를 만드는 UX 평가 | Candidate | 서버 계산 연결 시 임의 DSL이 `menuQuery` 권한/선언을 우회하지 않도록 설계 필요 |
| **Plotly.js** | Violin/밀도/3D 등 ECharts가 표현비용 높은 연구용 통계 | Candidate | 번들·메모리·접근성, 3D는 06 §24 Decorative 금지의 예외 근거 필요 |
| **Vega-Lite** | JSON spec 기반 재현 가능한 차트 템플릿·규칙형 저작 | Candidate | spec 검증/보안/렌더러 유지비, 기존 ECharts보다 가치 입증 필요 |
| **AntV S2** | 다차원 Pivot/Crosstab 후보 | Candidate | 엔진 중복 방지; Perspective 또는 AG Grid와 비교 |
| **AG Grid Enterprise** | 셀 범위 선택/복붙/채우기/피벗 | **Deferred #164, 상용** | 가격·망분리 라이선스·테마·a11y·읽기/쓰기 계약 구별 |
| **Dockview / React Grid Layout** | IDE형 dock 탭 / 대시보드 카드 drag-resize | Candidate/자유 배치 Deferred | 레이아웃 lib 직렬화 형식은 저장 API에서 숨긴다 |
| **vis-timeline** | 설비 State/Job/Wafer 이벤트 구간 | Candidate (도메인에서 시작) | 수많은 이벤트 virtualization/가상화/확대 테스트 |
| **React Flow** | Robot/Chamber/공정·분석 파이프라인 연결 도식 | Candidate (도메인에서 시작) | 탐색형 그래프와 편집형 프로세스를 구별 |
| **Wafer map 전용 렌더러** | Die·위치·bin·수율 히트맵 | Candidate (데이터 있을 때) | Lot/Wafer 이동만 보유하면 지도처럼 보이는 맵을 발명하지 않는다 |
| **DuckDB-Wasm** | 허용된 샘플/업로드 CSV·Parquet의 브라우저 SQL 분석 | Candidate | 메모리/스레드/내부망 WASM 제약; 운영 DB 직결 금지 |
| **SciChart.js 등 상용 고성능 엔진** | 극단적 고밀도 그래프 대안 | Candidate (성능 Gate + 구매 결정) | 실제 데이터/비용/내부망 라이선스 검증 전 채택 금지 |

OSS/라이선스는 상위 저장소와 **채택하려는 배포 패키지별** `LICENSE`/`NOTICE` 확인이 최종 기준이다. Graphic Walker의 로고 자산 등 별도 조항에 주의한다. Lightweight Charts는 Apache-2.0 외에 공식 문서의 TradingView 제작자 표시·링크 요건을 검토한다.

## 5. 우선 시나리오

- **설비 CT P95 이상** → 서버 공식 지표로 이상 설비 식별 → 분포(Box/Violin) → 이상 실행 목록(표) → 실행·Wafer 타임라인 → 필요 시 분석 범위 명시 적용; 같은 Context로 돌아온다.
- **Robot 동작 시간 간헐적 스파이크** → 서버 min/max 보존 집계 시계열 → 해당 구간만 원시 해상도 조회 → 이벤트 마커 → 로그/모듈 상세; 1초 내부 이벤트 순서를 지키는지 필수 검증.
- **Recipe×Module 편차** → 필터한 모집단 + 행 수/샘플 수 표시 → 히트맵/피벗 → 선택 cell의 실행 목록 → 결과 없음·표본 부족·측정 결측 구별.
- **설비 상태/가동률** → 상태 타임라인 + 누적 시간 표 → 공식 가동률은 기간 내 상태 시간의 합/모집단 정의로 서버 계산(상태별 비율의 평균 금지).
- **Wafer Map** → 실제 die 좌표와 bin/측정값이 등록된 경우만; 없으면 wafer flow timeline/graph.
- **사용자 자유 분석** → 권한 허용된 데이터셋의 차원·측정값만 표시 → 추천 차트 → 축·집계 변경 → (승인된 저장 계약 도입 후) 개인 분석 저장.

## 6. 선택 정책 요약

**선택 우선순위**: (A) 지표의 의미와 데이터가 맞는가 → (B) 범주·시간축·정밀도·샘플 수 → (C) 허용된 상호작용 → (D) 접근성/성능 → (E) 무료·기존 엔진 우선, 승인된 유료 엔진은 마지막 대안. 목적에 맞지 않으면 화려한 차트를 강요하지 않고 **표/설명으로 되돌린다**.

- 단일 양적 값의 시간 추이 → ECharts 기본; 다중 Pane, 자주 갱신, 장기간 탐색 필요할 때 Lightweight Charts PoC.
- 설비 간 비교 → ECharts bar/box; 동일 샘플 분포의 차이는 histogram/box/violin.
- 두 변수의 관계 → scatter. 범주/시간을 두 상관값으로 혼동하지 않고 Lot/Recipe 혼란변수를 표시.
- 연속 공정의 단계·이송 → Sankey/Graph 또는 State Timeline; 방향/가중치가 없으면 Sankey 금지.
- 독립적인 두 차원의 집계 → Heatmap 또는 Crosstab. 누락 데이터와 0값 구별.
- 자유 피벗 → 승인된 샘플 범위 내 Perspective. 과대 행, 권한 없음은 server outcome 그대로.
- 편집형 워크스페이스 → 별도 승인된 Builder. 현재 `AnalysisLayout`의 읽기형 구조를 자동 치환하지 않음.
- 불명확한 분석 목적, 모호한 단위/비율, 표본 부족 → 차트 자동 생성 전 메타데이터/필터 선택 요구.

**정밀 데이터 유의:** Lightweight Charts의 `UTCTimestamp`는 **초**이고 time은 시리즈별 유일·오름차순이어야 한다. 설비 로그에 ms/동일 시각 이벤트가 있으면 값 손실 가능성; 원시 이벤트 뷰를 그 엔진에 그대로 얹지 않고 시간 버킷(집계)이나 ECharts/타임라인 전용 표현을 검증한다.

## 7. 판정과 검증

이 문서가 결정하는 것은 **조사 범위와 추천 순서**뿐이다. 기존 Decided를 바꾸거나 #163/#164를 재개하거나 Server API를 변경하려면 각각 소유 문서·ADR·이슈가 필요하다. 구현 단계/게이트는 [아키텍처·로드맵](architecture-rollout.md)에 기록한다.

**참고 문서(공식, 접근일 2026-10-13):**
- [Apache ECharts 차트 유형](https://echarts.apache.org/en/feature.html), [Lightweight Charts v5](https://tradingview.github.io/lightweight-charts/docs/5.0), [Lightweight Charts v5 API/시간](https://github.com/tradingview/lightweight-charts/blob/master/.github/skills/lightweight-charts/SKILL.md)
- [Perspective v5 소개](https://github.com/perspective-dev/perspective/discussions/3205), [Perspective v5 릴리스](https://github.com/perspective-dev/perspective/releases), [Perspective 상태 저장](https://perspective-dev.github.io/guide/how_to/javascript/save_restore.html)
- [Graphic Walker](https://github.com/Kanaries/graphic-walker), [Graphic Walker 계산 DSL](https://github.com/Kanaries/graphic-walker/blob/main/computation.md)
- [Dockview](https://github.com/dockview/dockview), [React Grid Layout v2](https://github.com/react-grid-layout/react-grid-layout), [DuckDB-Wasm 제약](https://duckdb.org/docs/stable/clients/wasm/overview)
- [AG Grid Community/Enterprise](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/), [React Flow](https://reactflow.dev/), [uPlot](https://github.com/leeoniya/uPlot), [Plotly](https://github.com/plotly/plotly.js)

2026-10-13 기준 **성능 실측·라이선스 법무검토·디자인 컨펌·사내 사용자 요구 검증은 하지 않았다**.