# Analysis Toolkit — 기존 플랫폼에 반영하는 아키텍처와 구현 계획

상태 **Candidate (2026-10-13)** · [기능 목록](capability-matrix.md) · [개요](README.md) · [Issue #291](https://github.com/hjung3113/analytics-platform/issues/291).

## 0. 결정/미결 경계

| 항목 | 상태 | 적용 원칙 |
| --- | --- | --- |
| ECharts Canvas, 기존 `AnalysisChartFrame` | **Decided / implemented** | 교체 아닌 확장, 현재 action/주석/Trust/CSV 회귀 보장 |
| TanStack 표/열 정의 엔진 은닉 | **Decided / implemented** | `PlatformColumn` 유지, 메뉴가 엔진 타입을 import하지 않음 |
| 공식 지표는 서버 계산, EndpointSpec/PlatformAdapter | **Decided / implemented** | 브라우저 자유 계산은 항상 '탐색(비공식)' 구분 |
| Perspective 사용 경계(브라우저 WASM only) | **Decided ADR-0007; 도입 Deferred #163** | 추가 서버/DB/WebSocket 접속 만들지 않음 |
| AG Grid Enterprise POC | **Deferred #164** | 기능 필수 확인 + 비용/사내 구매 검증 후 |
| 자유 위젯 배치/대시보드 Builder | **Deferred 06 §14** | 2–3개 재사용 및 승인된 실앱 시안 필요 |
| Saved View | **Deferred 06 §21** | 보존·공유·복원·서버 권한 재검증 계약 먼저 |
| LWC/uPlot/Plotly/Graphic Walker, 기타 엔진 | **Candidate** | 이 문서만으로 설치·고정하지 않음 |
| 새 분석 Registry/Spec 타입 이름·경계 | **Candidate** | 설계 PoC와 기존 계약 소유 문서 합의 뒤 ADR/타입 승격 |

이 문서는 *기능 설계 범위*를 추가하지만 06의 Decided를 재정의하지 않는다. UI와 데이터 포트 변경은 별도 PR.

## 1. 바람직한 기술 구조

```text
apps/platform-web (생산 조립: 메뉴 Registry / PlatformAdapter 주입)
  ├─ packages/shell : Space + RouteOutlet (분석 워크스페이스도 하나의 메뉴)
  ├─ menus/analytics : 데이터셋/엔드포인트 선언과 분석 질문·차트 Recipe만
  └─ packages/components
       ├─ AnalysisChartFrame (기존 UX: Brush/Compare/Annotate/Export/Trust)
       ├─ PlatformDataTable (기본, 엔진 비공개)
       ├─ AnalysisLayout (기본 읽기형)
       └─ (Candidate) analysis/ 내부 구현
            ├─ RecipeRegistry / CapabilityResolver / reasons & fallbacks
            ├─ DatasetDescriptor / Semantic Aggregation Guard
            ├─ VizHost / EngineAdapter (Lazy loaders & error boundary)
            ├─ LinkedSelectionBus (page-local)
            ├─ ChartBuilder (data-safe authoring; 제품 승인 뒤)
            └─ WorkspaceRenderer/Store (편집·저장 채택 뒤)
  ├─ packages/kernel : GlobalContext, menu query, authorization, linkTo 유지
  ├─ packages/contracts : EndpointSpec / ApiResponse / PageSort / Trust 유지
  └─ packages/ui : FeedbackOps 토큰/공용 primitive 소비
                             │
                             ▼
                    PlatformAdapter.menuQuery
                             │
                             ▼
             FastAPI/Platform backend (권한·Scope·행 제한·공식 지표)
                             │
                             ▼
                    PostgreSQL view/mart
```

**경계 기준:** 초기 PoC는 `packages/components/src/analysis/` **비공개 모듈** 또는 소비 메뉴의 도메인 코드에서 구현한다. `@ap/components` 공개 export와 `@ap/contracts`의 런타임 요청 형식은 실제 두세 메뉴 재사용/설계결정 뒤에만 변경한다. 신설 `packages/analysis-*` 패키지를 미리 만들지 않는다. `@ap/ui` primitive를 복제하지 않고 `@ap/shell`은 차트 엔진을 import하지 않는다.

## 2. 개발자가 보는 계약안: 의도를 선언하고 엔진은 숨긴다

아래는 **개념적 TS pseudo API**이고 현행 소스에 존재하는 export가 아니다.

```ts
type SemanticField = {
  id: string;
  label: string;
  role: 'dimension' | 'measure' | 'time' | 'entity-id';
  valueType: 'string' | 'number' | 'instant' | 'wall-clock' | 'interval' | 'boolean';
  unit?: string;
  nullable?: boolean;
  cardinality?: 'low' | 'medium' | 'high';
  // 공식 지표의 임의 브라우저 재집계는 금지
  measureKind?: 'additive' | 'non-additive-rate' | 'official-metric';
  allowedAggregates?: readonly ('sum' | 'count' | 'min' | 'max' | 'mean' | 'p95')[];
};

type AnalysisDataset = {
  datasetId: string;            // 서버에 등록된 의미론적 데이터셋 id
  endpointId: string;           // 서버의 EndpointSpec.id
  grain: 'equipment-hour' | 'execution' | 'wafer-step' | 'event' | string;
  fields: readonly SemanticField[];
  scopeRequired: boolean;
  maxRows: number;              // 서버 EndpointSpec.limits.maxRows와 일치해야 함
  timePrecision?: 's' | 'ms' | 'us'; // 서버 계약과 실제 필드를 검증하는 Candidate
};

type VisualizationIntent =
  | 'trend' | 'distribution' | 'comparison' | 'relationship'
  | 'heatmap' | 'timeline' | 'flow' | 'hierarchy' | 'pivot'
  | 'raw-table' | 'control-chart' | 'wafer-map';

type AnalysisVizSpecV1 = {
  schemaVersion: 1;
  id: string;                    // 저장/이벤트용 안정적인 고유 panel id
  datasetRef: { datasetId: string; endpointId: string };
  intent: VisualizationIntent;
  axes: { x?: string; y?: string; group?: string; color?: string };
  // 허용된 field/aggregate만 사용; 임의 JS 함수/SQL 삽입 불가
  aggregations: readonly { field: string; operation: string }[];
  view: { preferredRecipe?: string; title: string; unit?: string };
  metric?: { metricId: string; version: string }; // 공식 분석 값의 정의 버전 고정
  interactions: { select: boolean; range: boolean; compare: boolean };
};

// 계획된 사용 예시. 패키지 공개 API는 승격 전 미확정.
const chart = {
  datasetRef: { datasetId: 'cycle-execution', endpointId: 'analytics.cycle.explore' },
  intent: 'distribution',
  axes: { x: 'equipmentId', y: 'cycleTimeMs', color: 'recipeId' },
  aggregations: [{ field: 'cycleTimeMs', operation: 'p95' }],
  view: { title: '설비별 Cycle Time P95' }
};
```

메뉴는 `preferredRecipe`를 *힌트*로 줄 수 있지만 선택기는 의미·권한·라이선스 게이트를 통과한 레시피만 허용한다. `EChartsCoreOption`, `ISeriesApi`, Plotly Trace, TanStack ColumnDef, Dockview Layout을 **공개 분석 Spec에 직렬화하지 않는다**. 전문 엔진 교체에도 저장된 분석을 열 수 있어야 하기 때문이다.

## 3. Capability Registry와 자동 추천기의 역할

플랫폼 소유 **Recipe** = 렌더러 구현이 아니라 **조건/지원 UX/위험/폴백을 선언**하는 메타데이터.

```ts
type CapabilityRecipe = {
  id: string;                     // 'trend.multi-pane'처럼 플랫폼 소유 stable id
  intent: VisualizationIntent;
  needs: { roles: string[]; minObservations?: number; exactTime?: boolean };
  supports: { brush: boolean; compare: boolean; crossFilter: boolean; tableFallback: true };
  cost: { codeSizeBand: 'low' | 'medium' | 'high'; dataBand: 'low' | 'medium' | 'high' };
  tier: 'built-in' | 'optional-oss' | 'licensed';
  engineId: string;               // 내부 구현 이름, 메뉴와 Saved View에서 숨김
  rejectionReasons: readonly string[];
};

type Recommendation = {
  recipeId: string;
  supported: boolean;
  rank: number;
  why: readonly string[];        // 사용자에게 '추천 이유'
  blockers: readonly string[];   // 타입 불일치, 데이터 부족, 구매 미승인 등
  fallback?: 'table' | 'summary' | 'aggregation-required';
};
```

선택 순서:
1. **데이터 의미 검증**: 필드 type·grain·unit·time precision·null·공식 비율 계산법, 가능한 시각화 후보만 추린다.
2. **보안/계약 검증**: 서버 EndpointSpec/Scope/permission/maxRows, 메뉴 manifest feature·allowed context, 제공된 데이터만 소비.
3. **기법 적합성**: 시간→trend/timeline, 두 수치→scatter, 집계 2축→heatmap, 관측치→distribution, 흐름 엣지→Sankey.
4. **사용성 검증**: 관심 분석 질문, 축 변경/필터/Brush/Compare 가능 여부, 일치하는 표와 텍스트 대안.
5. **기술·비용 비교**: 이미 지원하는 ECharts/TanStack 선호. LWC/Perspective/Plotly는 명확한 가치를 증명한 이후 lazy; Enterprise는 설치·구매 승인 후.
6. **결과 반환**: 추천 1~3개 + 이유 + 비호환 기능의 **거부 사유** + 표/요약 폴백. 임의 사용자가 `engineId`를 강제해 보안 게이트를 넘어설 수 없다.

의사결정은 확정된 DSL/규칙으로 테스트해야 한다. AI/LLM의 자유형 설명은 부가 도움일 뿐, 메트릭 정의·권한·서버 계약의 판정자가 아니다.

## 4. 데이터·집계 책임

### 공식값과 탐색 계산 분리
- **공식**: `metricId + metricVersion`, numerator/denominator/grain/time domain/coverage를 서버의 게시된 지표 계약으로 계산. 표시 단위, 정의, 업데이트 시각을 유지. 브라우저가 지표의 공식을 재작성하지 않는다.
- **탐색**: 서버가 승인해 반환한 `maxRows` 이하의 **additive raw quantity**에 한해 Pivot/ChartBuilder에서 ad-hoc 집계. '공식 지표 아님', 결과 집합의 부분/시간 범위/Trust를 고정 표시.
- **계산 거절**: 평균 비율의 평균, 서로 다른 metricVersion 합산, 모호한 단위 변환, 데이터 부족 Box/관리도, 관측되지 않은 Event 사이의 임의 보간.
- **정렬 및 포함 범위**: server result와 UI summary/table/chart가 같은 FilterSpec·시간역·분모를 사용. 대용량일 때 partial rows를 전체처럼 나타내지 않음.
- **다운샘플**: 이벤트 피크가 중요한 시계열에는 min/max 보존 혹은 anomaly-preserving 알고리즘을 써야 한다. 확대 시 특정 구간을 재조회. 목적 없는 전체 원본 클라이언트 적재 금지.
- **타임스탬프**: 기존 `formatInstant`/wall-clock 계약을 따르고, 브라우저 라이브러리 입력용 seconds 또는 epoch-ms 변환은 어댑터 내부에서만. 동일 시간 이벤트는 stable ID/sequence가 있는 timeline/table에서 다룬다.

### 데이터 전송 (ADR-0007)
```text
메뉴 manifest + typed endpoint 선언
   → useMenuQuery(...) / PlatformAdapter.menuQuery(...)
   → server scope/access/limits/assessments/trust
   → ApiResponse<T> (ok | empty | forbidden | too_large | error …)
   → Validated DatasetSnapshot (bounded; no direct DB credentials)
   → optional Worker/WASM: Perspective, DuckDB-Wasm
   → Visualization recipe / Table / Trust + fallback
```

Browser Worker는 데이터셋을 추가 획득할 권한이 없다. Graphic Walker computation DSL이나 Perspective Virtual Server로 DB에 새 경로를 열지 않는다. 서버에서 자유 계산이 필수가 되면 **새로운 서버 검증 포트**에 대한 별도 ADR/백엔드 계약을 만든다. 임의 DSL→SQL 직접 실행 금지. WASM·Worker·폰트/리소스는 사내 내부망 번들에 포함하고 egress 테스트.

## 5. 사용자 커스터마이징의 단계와 저장 계약

| 단계 | 사용자 기능 | 상태 / 기술 책임 |
| --- | --- | --- |
| U0 읽기 | 차트 legend on/off, brush/zoom, 표 열 순서/가시성, 기간 Compare | 기존 기능; Chart Local vs Page Filter vs Global 분리 유지 |
| U1 탐색 | 허용된 축/집계/차트 유형 변경, 컬럼으로 필터·group, personal scratchpad | Candidate. `maxRows`/field semantics/Trust 유효 |
| U2 패널 | 표·차트를 동일 데이터/Context의 cross-filter로 연동, 사용자가 여러 화면을 한 공간에 | Deferred UI, 06 §14 결정/실앱 `?variant=` 컨펌 필요 |
| U3 저장 | 개인 분석 정의 저장/복제/템플릿/복원/스키마 마이그레이션 | Saved View Deferred 06 §21; 서버 메타데이터 포트 결정 필요 |
| U4 공유 | 팀·역할과 Analysis Definition 공유, 게시·버전/감사/회수 | 서버 RBAC/Scope 재검증 후; 실서버·IdP(#150) 결정을 기다림 |

저장하면 안 되는 것: **조회 결과 전체 행/시크릿/원시 토큰/일시적 hover/단순 zoom/임의 JS·SQL/엔진 내부 상태 JSON**. 저장 후보는 플랫폼 소유 `AnalysisDefinition` schemaVersion, 제목·owner·spaceId·datasetRef·semantic field bindings·metric version·page-local filter definition·panel positions·display preferences·migration info다. Scope/대상 ID가 포함된 개인 설정을 타인과 공유할 경우 열람 권한을 **공유 시점과 복원/조회 시점에 각각** 재판정한다.

필터 상태의 세 종류를 명시:
1. **Global Context(URL)**: Kernel만 변경, 기존 API 사용. 브러시/차트 셀 클릭으로 몰래 쓰지 않는다.
2. **Page/Workspace Filter**: 로컬 분석 패널 간 공유되는 임시 필터. 다른 메뉴로 나갈 때는 explicit `linkTo`로만 운반.
3. **Chart Local State**: zoom, hover, 범례 표시, 임시 selection; 소유 차트의 로컬 상태. 서버 annotation은 독립 4번째 층.

### 교차 필터 이벤트(개념)
```ts
type LocalAnalysisSelection = {
  sourcePanelId: string;
  datasetId: string;
  grain: string;
  fieldId: string;
  operator: 'eq' | 'in' | 'range';
  values: readonly (string | number)[];
  originToken: string;            // 중복 전파 루프 차단
};

// preview/clear는 local state만 변경; 'Apply globally'를 눌렀을 때만
// Kernel.setGlobal이 승인된 transferable Context를 적용하도록 연결.
```

교차 필터는 합성 가능한 필드만 적용한다. 한 dataset의 Recipe ID가 다른 dataset의 불연속 grain에서 단순 문자열 일치만으로 같은 대상을 뜻한다고 가정하지 않는다. 권한/Scope 변경·URL Back/Forward·재조회 중 뒤늦은 결과는 기존 Kernel query invalidation/abort 생명주기를 따르고 stale selection을 제거한다.

### 비공식 workspace와 공식 보고서의 차이
- 임시 차트/피벗은 **탐색 결과**. 사용자의 저장된 분석이나 개인 공식 보고서로 자동 승격하지 않는다.
- 공유·공식 보고서는 게시된 `metricVersion`, 정의·기준 시각/Trust·재계산 결과·권한을 검증한다. `SavedViewToken` 포맷이 아직 미확정이므로 URL 공유를 바로 구현하지 않는다.

## 6. Lightweight Charts 특수 PoC

공식 [v5 소개](https://tradingview.github.io/lightweight-charts/docs/5.0), [v5 release note](https://tradingview.github.io/lightweight-charts/docs/release-notes), [현재 타임 타입/uniqueness 안내](https://github.com/tradingview/lightweight-charts/blob/master/.github/skills/lightweight-charts/SKILL.md)를 검증 참고.

- 검증 입력 A: 장비별 초 단위 CT/P95 추세 1·10·50 series, **샘플 수/차트 동시 수** 증분.
- 입력 B: 동일 초에 수십 건 발생하되 epoch-ms는 다른 데이터 + epoch-ms까지 완전히 같은 데이터. `epochMs / 1000` 소수 초를 **절삭하지 않고** 변환하는 경로의 순서/정밀도·축 label·hover를 확인한다. 동일한 time key가 겹치는 원본 이벤트는 stable eventId/sequence가 있는 timeline/표로 폴백.
- 입력 C: 복수 Pane/동기화 hover, 줌/브러시 UX를 06 §16 Chart Frame 액션과 정합; 캔버스 외 표/텍스트 요약.
- 입력 D: wall-clock vs instant, time zone format, gap과 null 표시, compare 기간 정렬.
- 입력 E: 라이선스 **NOTICE와 TradingView attribution link**를 사내 화면에서 충족하는지, 외부 네트워크 호출 없는 번들인지.
- **합격 정의:** ECharts보다 명확한 업무 효용(탐색/렌더링/다중 Pane)이 실측으로 입증되고 기존 API/표/a11y/Trust가 후퇴하지 않을 때에만 옵션 등록. 이득 없으면 ECharts 유지.

## 7. 도입 로드맵 (순서가 의존성)

| Wave | 작업 | 기준 산출물 | 선행·검증 |
| --- | --- | --- | --- |
| **M0** | Repo 소스/계약 점검, 기능 카탈로그, 4가지 핵심 시나리오, 데이터 의미론 및 거부 이유 타입 PoC | [본 조사](README.md), [매핑](capability-matrix.md), [#291](https://github.com/hjung3113/analytics-platform/issues/291), decision tests 초안 | 문서만 작성; 채택·구매 아님 |
| **M1** | 현재 ECharts/TanStack을 Wrapper/Recipe로 규격화한 내부 PoC. 비교/brush/table/annotation regression. 신규 Box/Heatmap/Scatter 중 실제 데이터 있는 2종 | `@ap/components` 내부 adapter test, 메뉴 2개 소비 예 | 기존 `AnalysisChartFrame` 회귀; renderer/engine 타입 외부 누출 X |
| **M2** | LWC vs ECharts vs uPlot 시계열 PoC, event timeline 별도, 통계 Plotly는 추가 가치 있을 때만 | 실제 fixture 성능/정밀성/UX 보고, 선택·기각 이유 | 커버리지/동일 초 중복/NOTICE, 라이브러리 지연 로딩 |
| **M3** | 사용자 자유 탐색 PoC: `menuQuery` 원 값 엔드포인트, #163 Perspective 브라우저 worker/WASM, Graphic Walker UX 비교 | 제한된 Pivot 및 탐색 화면, Trust/too_large 검증 | #163 보류 해제 결정, EndpointSpec 선언·서버 견고성, UI variant 컨펌 |
| **M4** | Builder/Workspace/교차 필터/개인 저장·복원, 공유 범위 설계 | AnalysisDefinition v1, migration, permission-aware save/load, e2e | 06 §14/§21 Deferred 해제, 디자인 컨펌, 사용 요구 2–3곳 |
| **M5** | 셀 편집·고급 엑셀 편의, 또는 WebGL 고밀도 전용 상용 도입 | #164 평가/구매판정과 비교 보고 | 실업무 사용 빈도·가격·라이선스 승인, 쓰기/감사 계약 |

기존 1차 후속: [M1 내부 Recipe Adapter #292](https://github.com/hjung3113/analytics-platform/issues/292), [M2 Lightweight Charts 시계열 PoC #293](https://github.com/hjung3113/analytics-platform/issues/293), [M4 사용자 정의 Workspace 결정 #294](https://github.com/hjung3113/analytics-platform/issues/294). M3는 기존 [Perspective #163](https://github.com/hjung3113/analytics-platform/issues/163), M5는 기존 [AG Grid #164](https://github.com/hjung3113/analytics-platform/issues/164)를 재사용한다. 보류가 해제되기 전에는 구현하지 않는다.

M1–M5 각 Wave는 **별도 구현 Issue/PR**로 분리한다. 먼저 M0 검토·실제 데이터 fixture와 사용자 업무 시나리오를 확정한 다음 #163/#164 보류 변경을 요청한다. 이전 단계에서 성능/의미/권한 Gate 불합격이면 다음 엔진 도입을 진행하지 않는다. UI 변경은 루트 `AGENTS.md`의 `?variant=` 앱 실행 시안 2~3개 비교 → 사용자 승인 이후 코드 반영.

## 8. 릴리스 게이트 / 자동 계약 테스트

### 단위·계약
- 엔진 타입 노출을 import lint로 차단한다(`@ap/menus` → `echarts`·`lightweight-charts`·`ag-grid` 등 우회 금지).
- Recommender: 시간/범주/교차/원시/관측치 분포/공식 지표/관리도/wafer map에 대한 지원·거부 이유·폴백 snapshot.
- sample count, null vs zero, timezone, dtype, rounding, numerical precision, cardinality validation.
- `ApiResponse`의 outcome `ok/empty/error/forbidden/too_large`와 assessments/trust를 widget까지 정확히 전달; partial/stale 표시 값이 있을 때 상태 억제 금지.
- 같은 `metricId+metricVersion` + 동일 Scope/기간/필터에서 차트와 표 집계/내보내기 수치 일치. 공식값/탐색값 구분 테스트.
- 이벤트 중복 타임스탬프, out-of-order, open interval, module overlap, 실시간 갱신 충돌 테스트.
- scope/logout/context 변경, 응답 지연/취소, 권한 변경 후 캐시 탈락, 다른 workspace 공유 링크 접근 거절.
- 사용자가 저장한 spec에 임의 JS, URL, SQL, unknown engine, mis-specified dataset, 악성 필드·DOM 문자열, 설계 바깥 option 주입 불가.
- Browser storage에는 user preference 등 최소 정보만; 기업 측 데이터 보존/개인 설정 저장 정책은 메타 DB 합의 뒤.

### E2E/접근성/디자인
- Platform UI 기존 기능: keyboard range, visible focus, 단위/제목, 텍스트 요약, 같은 데이터 table fallback, failure recovery, CSV/XLSX 동일 조건.
- 1440px 데스크톱 기준 `?variant=` prototype 리뷰 기록 + 최종 승인된 variant만 구현.
- Tailwind/FeedbackOps semantic token 상속, 패키지 CSS source, contrast/line dash, aria/스크린리더 시험.
- 바뀐 코드는 AGENTS의 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 필요한 E2E 추가. 문서만이면 `pnpm docs:links`.

### 성능 시험 행렬(목표 숫자는 측정 이후 설정)
- H/W·브라우저·CPU·RAM·네트워크 RTT 조건 고정. 1/5/20개 차트 동시, 1/10/50 series, 1k/50k/250k 시각 포인트, 초당 갱신 0/1/10 이벤트 시나리오로 p50/p95 렌더·pointer 지연·탭 메모리·청크 다운로드를 기록.
- 모든 브라우저 엔진에서 테스트 규모는 서버가 허용한 `maxRows`/샘플 이하여야 한다. 결과가 과대면 추가 데이터 로딩 대신 aggregation/time filter 경로를 제공.
- 다중 chart mount/unmount/re-render 시 memory leak, worker dispose, WAsm chunk cache/네트워크 차단 시험.
- 비교 결과에서 **이점이 객관적으로 큰 엔진만 활성화**. 교체 자체가 목표가 아님.

## 9. 열린 제품 결정과 연결 이슈

- [#163 Perspective](https://github.com/hjung3113/analytics-platform/issues/163): v5 `<perspective-viewer>` 내 workspace·cross-filter 추가. **기존 ADR-0007 브라우저 범위는 유지**; 도입 보류 변경은 별도 결정.
- [#164 AG Grid](https://github.com/hjung3113/analytics-platform/issues/164): 유료 기능/망분리/쓰기 분리를 사내 필수 확인 뒤 다시 평가.
- [#159 기존 그리드 요구 결정](https://github.com/hjung3113/analytics-platform/issues/159): 무료 우선 방침.
- [06 §14](../../06_platform_ui_contract.md#14-platform-component-promotion-rule)와 [§21](../../06_platform_ui_contract.md#21-saved-view-contract): 자유 위젯/저장형 워크스페이스 구현 전 별도 결정.
- [#150 SSO](https://github.com/hjung3113/analytics-platform/issues/150), [#149 HTTP 전송](https://github.com/hjung3113/analytics-platform/issues/149), [#155 백엔드](https://github.com/hjung3113/analytics-platform/issues/155): 저장/공유/데이터 전송 계약 확장은 대기 중인 사내 합의가 선행.
- 비공식 탐색 수치를 팀 KPI와 같은 경로로 '게시'하게 할지, 개인 보기 및 공유 권한을 누가 승인할지는 **Open**. 현재는 어떠한 쓰기 포트도 임의로 추가하지 않는다.

## 10. 인수인계 체크리스트

- [ ] 목적별 기능 매핑과 추천/기각 이유 UI의 근거 확정
- [ ] 현행 메뉴로 최소 두 가지 fixture 제공(공식 P95/분포 + 로봇 이벤트 시간축) 및 동일 결과 test
- [ ] M1 소유자, 후보 이슈, code owner/중복 제거 전략 등록
- [ ] 자유 탐색/워크스페이스 Deferred 변경이 필요한지 사람 결정
- [ ] 초기 라이브러리 버전·라이선스 파일·WASM 자산·통신 로그 확인
- [ ] 시안 2–3종 실앱 `?variant=` 승인, 화면별 최소 UX 규칙 확정
- [ ] 각 단계 acceptance / regression / docs/ADR 승격/미채택 결과 추적

**범위 제외:** 다른 제품(FeedbackOps)의 파일 직접 변경, 기존 차트/표를 통째로 교체, 고객/사내 데이터 공개, 임의 DB 자격 증명 연결, 백엔드 FastAPI 즉시 구축, 구현됐다고 주장할 기능 표시.
