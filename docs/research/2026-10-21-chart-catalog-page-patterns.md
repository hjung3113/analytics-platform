# 차트 카탈로그 페이지 표현 패턴 조사

> 2차 D/E/F 비교와 최종 결정은 [ADR-0062](../adr/0062-chart-catalog-focus-layout.md)에 있다.

- 확인일: 2026-10-21
- 목적: 차트 종류마다 공통 상호작용(Zoom/Brush/Reset/Compare/Annotate/Export/Drill) 중 무엇이 되는지 보여 주는 "차트 카탈로그" 견본 메뉴의 `?variant=` 프로토타입 3안을 설계할 근거를 모은다.
- 범위: **페이지 수준 표현**(레이아웃, 지원/미지원 표시, 상호작용을 직접 해 보는 방식, 코드·spec 노출, 밀도, 상태, 키보드). 종류별 지원 여부 자체는 `docs/research/2026-10-20-chart-kinds-patterns.md` §질문 4와 계약 원본 `docs/contract/platform-ui-contract.md` §16 「종류별 상호작용」 표를 따르며 여기서 반복하지 않는다.
- 원칙: 출처에서 직접 확인한 사실과 플랫폼 추론을 구분한다. 아래 A/B/C는 컨펌 전 검토안이다.

## 요약

1. 성숙한 차트 문서는 거의 모두 **두 축 내비게이션**을 쓴다. 차트 종류별 페이지(Components)와 기능별 페이지(Zoom, Brush, Toolbar, Export, Accessibility)를 나란히 둔다(MUI X, AG Charts, AntV G2, Vega-Lite). 종류×기능을 한 화면 행렬로 보여 주는 공개 갤러리는 찾지 못했다.
2. 지원 범위는 **문장으로 적거나**("line, bar, scatter, heatmap에서 zoom 가능" — MUI X) **해당 없는 버튼을 숨긴다**("가능한 동작이 있을 때만 toolbar 표시" — MUI X, Carbon `controls` 배열). 비활성 버튼에 이유를 붙이는 사례는 확인하지 못했다. 우리 계약은 미지원 이유를 보여 줄 필요가 있으므로 이 부분은 플랫폼이 새로 정해야 한다.
3. 상호작용을 "해 보는" 방식은 **실제 차트 + 바로 옆 상태 출력**이 가장 강하다. MUI X는 zoom 상태를 JSON으로, Reset 버튼과 함께 보여 준다. 이 패턴이 E2E의 "그려짐 + 상호작용 1회" 검증과 그대로 맞는다.
4. 키보드 대안은 기능 페이지에 표로 둔다(MUI X: `+`/`-` zoom, `0` reset, Shift+화살표 pan; AG Charts: 화살표로 데이터 이동, Enter/Space로 클릭). Toolbar는 WAI-ARIA toolbar + roving tabindex(MUI X).
5. Carbon은 toolbar 안에 **"Show as data-table"** 컨트롤을 둔다. 우리 §16의 "표로 보기"와 같은 발상이며, 카탈로그에서 표 경로를 상호작용의 키보드 대안으로 보여 주는 근거가 된다.
6. 제안: A안은 **행렬 표 + DetailDrawer**(PlatformDataTable 중심), B안은 **목록 + 단일 상세 작업대**(Analysis Workspace archetype), C안은 **카드 그리드 + 카드별 실행 기록**(Overview archetype). 세 안 모두 `?kind=`를 페이지 키로 쓴다.

## 출처 범위와 읽는 법

10개 출처를 확인했다. ECharts examples·Carbon Charts 데모·Observable Plot 갤러리·Elastic Charts Storybook은 클라이언트 렌더링이거나 요청이 거절되어 본문을 읽지 못했다(부록에 표시). 이 경우 API 문서나 기능 문서로 대신했고, 읽지 못한 레이아웃은 사실로 적지 않았다.

| 출처 | 조사에 사용한 내용 |
| --- | --- |
| MUI X Charts 개요·Zoom and pan·Toolbar | 종류/기능 두 축 내비, 지원 종류 문장, 상태 JSON + Reset 데모, 키보드 표, toolbar a11y |
| AG Charts 갤러리·Zoom·Toolbar·Accessibility | 종류별 텍스트 목록, 기능 페이지 구성(예제·옵션 표), 키보드 이동 |
| Carbon Charts API(ToolbarControlTypes, ToolbarOptions, ZoomBarOptions) | toolbar 컨트롤 어휘, 표로 보기, overflow, zoom bar loading/locked |
| AntV G2 examples | 갤러리 안의 Interaction 범주와 하위 그룹(Brush, Element select, Reset Brush) |
| Vega-Lite examples | Interactive 절(Brush, Pan & Zoom, Crossfilter) |
| Grafana 시각화 목록·Panel overview | 범주별 목록, 패널 메뉴(Inspect Data), drag zoom 지원 종류 명시, 패널 단축키 |
| Highcharts demo | 범주 내비, 태그·제품 필터 검색, Accessibility 범주 |
| shadcn/ui charts | 종류별 탭 + 변형 카드 그리드, 카드별 Copy/View Code |
| ECharts feature | dataZoom/brush/ARIA 자동 설명(종류별 제한은 문서에 없음) |

## 사례별 관찰

**MUI X Charts** — 사이드바가 *Components*(Bars, Lines, Pie, Scatter, Heatmap …)와 *Main features*(Accessibility, Brush, Toolbar, Tooltip, Highlighting, Export, Zoom and pan)로 나뉘고, 기능 페이지는 종류 아래에 중첩되지 않는다. Zoom 페이지 서두에 "line, bar, scatter, heatmap에서 zoom 가능"이라고 지원 종류를 한 문장으로 적고, pie 같은 나머지는 언급하지 않는다(침묵 = 미지원). 데모마다 실제 차트 + "Edit code" 토글, 옵션 플레이그라운드(minSpan, step 등), 외부 제어 데모는 zoom 상태 JSON과 "Reset zoom" 버튼을 함께 보여 준다. Toolbar는 "가능한 동작이 있을 때만 표시"되고 zoom이 꺼진 축에선 zoom 버튼이 숨는다. 키보드는 표로 정리(`+`/`=`, `-`, `0` reset, Shift+화살표 pan). 화살표만 쓰지 않는 이유는 화살표가 데이터 항목 포커스 이동에 쓰이기 때문이다. 범위가 바뀌면 스크린리더에 알린다. Pro 배지로 플랜 제약을 표시한다.

**AG Charts** — 갤러리는 종류별 섹션의 텍스트 링크 목록(썸네일·필터 없음), "(Enterprise)" 표기. Zoom 기능 페이지는 기능 하위 절(Scrolling, Panning, Selecting, Double-Click to Reset, Navigator, Context Menu, Buttons, Save & Restore)마다 예제·코드·라이브 예제 링크, 끝에 옵션 표. 지원 series 목록은 없다. 접근성: Tab으로 series·legend·toolbar·navigator 사이 이동, 좌우 화살표로 데이터 항목, 상하로 series, Enter/Space로 클릭 리스너 실행, Windows Shift+F10으로 컨텍스트 메뉴.

**Carbon Charts** — `ToolbarControlTypes`에 Zoom in/out, Reset zoom, Export CSV/JPG/PNG, Fullscreen, **Show as data-table**, Custom. `ToolbarOptions.controls` 배열 순서대로 표시, `numberOfIcons`를 넘으면 overflow 메뉴. `ZoomBarOptions`에 `loading`·`locked` 상태가 따로 있다. 데모 사이트 레이아웃은 클라이언트 렌더링이라 확인 못 함.

**AntV G2** — 갤러리 사이드바 최상위에 차트 범주와 나란히 **Interaction**(26개) 범주가 있고 하위가 Element(Select, Highlight, Slider), Events(Legend Click, Auto Tooltip), Brush(Reset Brush 포함), Multi View 등. 즉 "상호작용"이 차트 종류와 같은 급의 탐색 축이다. 썸네일 카드 + 제목.

**Vega-Lite** — 예제 목차에 Interactive 절이 따로 있고 "Rectangular Brush", "Scatterplot Pan & Zoom", "Crossfilter" 등 기능 이름으로 예제를 부른다. 텍스트 링크 목록.

**Grafana** — 시각화를 범주별(Graphs & charts, Stats & numbers, Misc, Widgets) 목록 + 한 줄 용도로 소개. Panel 문서는 drag zoom/더블클릭 zoom out이 **candlestick, heatmap, state timeline, status history, time series 패널에서만** 된다고 명시(지원 목록을 기능 쪽에 적는 방식). 패널 메뉴의 Inspect → Data/Query/Panel JSON이 "spec 보기"에 해당. hover 후 `v`(보기), `e`(편집), `i`(Inspect) 단축키.

**Highcharts** — 범주 내비 + 검색 오버레이(TAGS·PRODUCTS 필터, 키보드 이동 힌트). Accessibility·Dynamic charts가 독립 범주. 상세 페이지는 확인 못 함.

**shadcn/ui charts** — 종류별 탭(Area, Bar, Line, Pie, Radar, Radial, Tooltips) 아래 같은 종류의 변형 카드 그리드, 카드마다 Copy/View Code. 상호작용 지원 표시는 없다(시각 변형 카탈로그).

## 패턴 비교 표

| 패턴 | 사례 | 지원/미지원 표시 | 직접 해 보기 | spec/코드 | 우리 계약과의 맞음 |
| --- | --- | --- | --- | --- | --- |
| 종류 × 기능 두 축 내비 | MUI X, AG Charts, G2, Vega-Lite | 기능 페이지 서두 문장 | 기능 페이지의 라이브 데모 | Edit code 토글, 옵션 표 | 두 축이 한 화면에 없음 → 행렬로 합칠 여지 |
| 해당 없으면 숨김 | MUI X toolbar, Carbon controls | 버튼 부재 | — | — | 이유가 사라짐. 카탈로그에선 숨김 대신 이유 노출 필요 |
| 상태 출력 + Reset | MUI X zoom 외부 제어 | — | 조작 → JSON 갱신 | JSON | E2E 단언 지점으로 적합 |
| 표로 보기 컨트롤 | Carbon SHOW_AS_DATATABLE, Grafana Inspect Data | — | 키보드 대안 | — | §16 "표로 보기"와 일치 |
| 키보드 표 | MUI X, AG Charts | — | 단축키 | — | §26 접근성 계약 근거 |
| 썸네일 카드 그리드 | G2, shadcn | 없음 | 카드 클릭 → 상세 | View Code | 밀도 높지만 상호작용 검증 약함 |
| 패널 메뉴 + Inspect | Grafana | 기능별 지원 패널 명시 | 패널 위 drag | Panel JSON | Chart Frame More 메뉴와 대응 |

공통 공백: **미지원 동작에 이유를 붙여 보여 주는 공개 사례는 확인하지 못했다.** 모두 숨기거나 문서 문장으로만 처리한다. 카탈로그 견본은 이 공백을 플랫폼 계약(manifest feature flag + 종류별 capability)으로 채우는 곳이다.

## A·B·C 안

공통 전제(추론): 페이지 키 `?kind=line|bar|scatter|boxPlot|pareto|heatmap|donut`, 선택 사항 `&action=zoom|brush|…`. 지원 여부는 §16 표와 manifest `features.*`에서 파생하고 페이지가 따로 하드코딩하지 않는다. 미지원은 "숨김"이 아니라 `—` 칸 + 이유 문구로 보이되, Chart Frame 안의 toolbar 자체는 계약대로 해당 버튼을 렌더하지 않는다(카탈로그 표는 계약을 설명하고, Frame은 계약을 실행한다). E2E 단언은 각 안의 "결과 출력" 영역(Selection Summary 또는 실행 기록)으로 한다.

### A안 — 지원 행렬 표 + 상세 Drawer (Catalog/Management archetype)

```
┌ Context bar ─────────────────────────────────────────────┐
│ 차트 카탈로그            [종류 필터▾] [동작 필터▾]           │
├──────────┬─────┬─────┬─────┬───────┬──────┬──────┬──────┤
│ 종류      │Zoom │Brush│Reset│Compare│Annot.│Export│Drill │ ← PlatformDataTable
│ line     │ ●   │ ●   │ ●   │ ●     │ ●    │ ●    │ —ⓘ  │
│ heatmap  │ —ⓘ │ ●   │ ●   │ —ⓘ    │ —ⓘ   │ ●    │ ●    │
│ donut ▶  │ —ⓘ │ ●   │ ●   │ —ⓘ    │ —ⓘ   │ ●    │ ●    │──┐
└──────────┴─────┴─────┴─────┴───────┴──────┴──────┴──────┘  │
                                   DetailDrawer(?kind=donut) ◀┘
                                   ┌ AnalysisChart(donut) ────┐
                                   │ [Brush][Reset][Export]   │
                                   │  (차트)                   │
                                   │ Selection Summary        │
                                   │ 미지원: Zoom — 각도 축에   │
                                   │  범위 개념 없음 (§16)      │
                                   │ ▸ ChartSpec JSON (접힘)   │
                                   └──────────────────────────┘
```

- 주 행동: 행 선택 → Drawer에서 그 종류를 실제로 조작. 칸(셀) 선택 시 `&action=`까지 딥링크.
- 지원 표시: 셀 기호 ●/△/— + 글자(색만으로 구분 금지). `—`에는 이유를 Tooltip과 Drawer 본문 양쪽에.
- 상호작용 1회(E2E): Drawer 안 차트에서 지원 동작 하나(예: donut slice 클릭) → Selection Summary 문구 변화 단언. 미지원 동작은 toolbar에 버튼이 없음을 단언.
- 1280px: 표 8열은 들어가지만 Drawer가 열리면 표가 좁아짐 → Drawer 폭 고정·표 가로 스크롤 또는 Drawer를 overlay로. 차트가 Drawer 폭(~560px)에 갇혀 heatmap·pareto 판독성이 낮다.
- a11y: 표는 행/셀 키보드 이동이 PlatformDataTable 계약 그대로, Drawer 진입·복귀 포커스(§13). 셀의 이유 Tooltip은 포커스로도 열려야 한다.
- 검증하는 플랫폼 부품: PlatformDataTable, DetailDrawer, 딥링크(`?kind=&action=`), Registry 메타.
- 약점: 차트가 "곁가지"로 보임. 7개 종류를 한눈에 그려 보지 못한다.

### B안 — 종류 목록 + 단일 작업대 (Analysis Workspace archetype)

```
┌ Context bar ─────────────────────────────────────────────┐
├─────────────┬────────────────────────────────────────────┤
│ 종류         │ Chart Frame (span: full)                    │
│ ● line      │ Title  ·  [Zoom][Brush][Reset][Compare]…   │
│   bar       │ ┌──────────────────────────────────────┐  │
│   scatter   │ │  (line 차트)                          │  │
│   boxPlot   │ └──────────────────────────────────────┘  │
│   pareto    │ Selection Summary: 3/1–3/7 선택됨           │
│   heatmap   ├────────────────────────────────────────────┤
│   donut     │ 이 종류의 동작        [표로 보기] [spec]     │
│             │ Zoom   ● 끌기·+/-·0      [해 보기]          │
│ 밀도         │ Brush  ● 구간 끌기·표 체크 [해 보기]         │
│ ○기본 ○compact│ Drill  — 목적지 ID 미정(§22)               │
└─────────────┴────────────────────────────────────────────┘
```

- 주 행동: 왼쪽 목록에서 종류를 고르면 오른쪽에 큰 차트 한 개(MUI X 기능 페이지 + Grafana 패널 View를 합친 형태). 아래 "동작" 목록이 그 종류의 지원/미지원과 키보드 대안을 나열하고, `[해 보기]`는 toolbar 버튼에 포커스를 주거나 표 경로를 연다(대신 실행하지 않는다).
- 지원 표시: 종류 하나에 대해 세로 목록 → 이유 문장을 길게 써도 된다. 밀도·size 토글로 `density: compact`, `span: full` 계약도 같은 차트로 검증.
- 상호작용 1회(E2E): `?kind=line` 진입 → 그려짐 → Brush 끌기 또는 키보드 → Selection Summary 단언. 7종 반복은 목록 클릭만 바꾸면 된다.
- 1280px: 목록 ~200px + 차트 ~1000px로 가장 넉넉. 차트 판독성 최고.
- a11y: 목록은 listbox/링크 목록(현재 항목 `aria-current`), 차트 → 동작 목록 → 표로 보기의 Tab 순서가 자연스럽다. 키보드 표(MUI X식)를 동작 목록에 그대로 넣을 수 있다.
- 검증하는 플랫폼 부품: Chart Frame 전체, Selection Summary, 표로 보기, size/density, 딥링크. PlatformDataTable은 "표로 보기"로만 쓰인다.
- 약점: 종류 간 비교(무엇이 어디서 안 되나)를 한눈에 못 본다. 목록에 요약 기호를 붙이면 일부 보완.

### C안 — 카드 그리드 + 카드별 실행 기록 (Overview archetype)

```
┌ Context bar ─────────────────────────────────────────────┐
│ 차트 카탈로그   [동작: 전체▾ Brush만]   [기본|compact]      │
├───────────────────┬───────────────────┬──────────────────┤
│ line  [Z][B][R]…  │ bar   [B][R][E]   │ scatter [B][R][E]│
│ (compact 차트)     │ (compact 차트)     │ (compact 차트)    │
│ ●Z ●B ●R —Drill   │ —Z ●B ●R          │ —Z ●B ●R         │
│ 마지막 동작: —     │ 마지막 동작: 막대 2 │ …                │
├───────────────────┼───────────────────┼──────────────────┤
│ boxPlot …         │ pareto …          │ heatmap …        │
├───────────────────┴───────────────────┴──────────────────┤
│ donut …                               (?kind= → 카드 포커스)│
└──────────────────────────────────────────────────────────┘
```

- 주 행동: 7종을 동시에 그려 두고(G2·shadcn식 그리드) 각 카드에서 바로 조작. 상단 "동작" 필터를 고르면 그 동작이 없는 카드는 흐리게 + 이유 문구(AntV G2의 Interaction 축을 필터로 옮긴 형태). `?kind=`는 해당 카드로 스크롤·포커스하고 카드 펼치기로 span: full 전환.
- 지원 표시: 카드 하단 칩(● 지원, — 미지원 + Tooltip 이유). 실행 기록 줄 "마지막 동작"이 결과 출력.
- 상호작용 1회(E2E): 한 페이지에서 7개 차트 그려짐 단언 + 카드별 동작 1회 → 각 카드 기록 줄 단언. 가장 적은 페이지 이동.
- 1280px: 3열이면 카드당 ~400px, compact(200px) 차트. heatmap 축 라벨·pareto 누적선·boxPlot 이상치가 빽빽함. 2열로 떨어뜨리면 스크롤 길어짐. 7개 ECharts 인스턴스 동시 마운트 비용.
- a11y: 카드 7개 × toolbar 버튼으로 Tab 정지점이 많다 → 카드 단위 roving 또는 "카드로 건너뛰기" 필요. compact의 설명 Tooltip 계약(§12/§16) 검증에 유리.
- 검증하는 플랫폼 부품: compact density, 여러 Chart Frame 동시 상태 분리(Chart Local State가 카드끼리 섞이지 않음), Overview archetype. PlatformDataTable·DetailDrawer는 거의 안 씀.
- 약점: 견본 메뉴가 "대시보드 꾸미기"로 흐를 위험, 공통 부품 사용이 가장 적음.

### 비교와 추천(추론)

| 기준 | A 행렬+Drawer | B 목록+작업대 | C 카드 그리드 |
| --- | --- | --- | --- |
| 종류×동작 한눈 비교 | 최상 | 하 | 중 |
| 차트 판독성 @1280 | 중(Drawer 폭) | 최상 | 하(compact) |
| 미지원 이유 노출 | 셀 Tooltip + Drawer | 목록 문장 | 칩 Tooltip |
| E2E 단순성 | 중(행→Drawer→조작) | 상(딥링크→조작) | 상(한 페이지) |
| 공통 부품 검증 | PlatformDataTable·DetailDrawer·딥링크 | Chart Frame·size·표로 보기 | compact·다중 Frame 상태 분리 |
| bespoke 위젯 위험 | 낮음 | 낮음 | 중(필터 흐림·카드 기록) |

견본 메뉴 목적("계약 검증, 화면 다듬기 아님")에는 A 또는 B가 맞다. A는 Catalog archetype과 공통 부품을, B는 Chart Frame 계약 자체를 더 깊게 검증한다. A의 Drawer 폭 문제가 커지면 "A 표 + 행 선택 시 B식 하단 작업대"가 절충안이 될 수 있으나 4번째 안으로 늘리지 않고 컨펌 때 질문으로 남긴다.

## 열린 질문

1. 미지원 표시를 Chart Frame toolbar에서도 "비활성 + 이유"로 보일지, 계약대로 숨기고 카탈로그 표에서만 설명할지. 공개 사례는 모두 숨김이었다. 바꾸면 §16 계약 변경이므로 사용자 결정.
2. 지원 행렬의 원천을 무엇으로 할지: §16 문서 표를 복제하면 어긋날 수 있다. ChartSpec kind별 capability를 코드에서 읽어 쓰는 공개 API가 있는지(없으면 Kernel/components 쪽 추가가 필요, 별도 이슈 후보).
3. `?kind=` 외에 `&action=` 딥링크까지 계약에 넣을지(A·C에서 필요, B는 불필요).
4. Compare·Annotate는 §16 표에서 새 5종 모두 `—`이고 line/bar `AnalysisChartFrame`만 해당한다. 카탈로그에서 line/bar를 같은 `AnalysisChart` 경로로 보일지, 기존 Frame 경로로 보일지.
5. C안의 7개 인스턴스 동시 마운트 성능은 측정하지 않았다.

## 부록: 원 출처

- MUI X Charts 개요: https://mui.com/x/react-charts/
- MUI X Zoom and pan: https://mui.com/x/react-charts/zoom-and-pan/
- MUI X Toolbar: https://mui.com/x/react-charts/toolbar/
- AG Charts 갤러리: https://www.ag-grid.com/charts/gallery/
- AG Charts Zoom: https://www.ag-grid.com/charts/javascript/zoom/
- AG Charts Toolbar(Financial): https://www.ag-grid.com/charts/javascript/toolbar/
- AG Charts Accessibility: https://www.ag-grid.com/charts/javascript/accessibility/
- Carbon Charts ToolbarControlTypes: https://charts.carbondesignsystem.com/api/enums/ToolbarControlTypes.html
- Carbon Charts ToolbarOptions: https://charts.carbondesignsystem.com/api/interfaces/toolbaroptions
- Carbon Charts ZoomBarOptions: https://charts.carbondesignsystem.com/api/interfaces/zoombaroptions
- AntV G2 examples: https://g2.antv.antgroup.com/en/examples
- Vega-Lite examples: https://vega.github.io/vega-lite/examples/
- Grafana 시각화 목록: https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/
- Grafana Panel overview: https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/panel-overview/
- Highcharts demo: https://www.highcharts.com/demo
- shadcn/ui charts: https://ui.shadcn.com/charts
- ECharts features: https://echarts.apache.org/en/feature.html
- 본문을 읽지 못함(클라이언트 렌더링·429·404): https://charts.carbondesignsystem.com/ (데모 홈), https://echarts.apache.org/examples/en/index.html, https://observablehq.com/@observablehq/plot-gallery, https://elastic.github.io/elastic-charts/storybook/, PatternFly charts 개요(404)
