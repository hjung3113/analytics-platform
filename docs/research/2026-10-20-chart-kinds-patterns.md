# 차트 종류와 상호작용 패턴 조사

- 확인일: 2026-10-20
- 목적: 플랫폼 차트 계약에 추가할 차트 종류, 사용 조건, 상호작용, 시각 토큰 및 API 경계를 제안한다.
- 범위: 제품별 구현을 복제하지 않고 공개된 디자인 시스템·시각화 라이브러리·제품 문서의 공통점과 차이를 비교했다.
- 원칙: 출처에서 직접 확인한 사실과 플랫폼에 대한 설계 추론을 구분한다. 제품 UI는 인터랙티브 프로토타입 컨펌 후 구현한다.

## 요약

1. 기본 검토 차트 세트로 line, bar, scatter, box plot, Pareto, heatmap, donut을 제안한다. 차트는 질문과 데이터 조건이 맞을 때 사용한다.
2. Heatmap은 2차원 셀을 색으로 인코딩한다. 단방향 크기에는 순차형 단일 색조, 기준값을 중심으로 부호나 상태가 갈리면 발산형 팔레트를 사용한다. 축, 단위, 범례, 결측 셀 구분을 제공한다.
3. Donut은 합계가 의미 있는 전체-부분 관계에서만 허용한다. 기본 권고는 Other를 포함해 최대 5개 조각, 별도 범례 또는 직접 레이블, 중앙의 총계/선택 값이다. 정밀한 순위 비교에는 bar를 쓴다.
4. 공통 Frame의 Zoom/Brush/Reset/Compare/Annotate/Export 어휘는 유지하고 실제 지원 여부는 차트별 capabilities로 표현한다. Heatmap의 셀 브러시와 2차원 주석은 현재 1차원 annotation 모델과 맞지 않는다.
5. 임의 라이브러리 옵션 대신 판별 유니온 형태의 ChartSpec을 입력으로 두고, 차트별 renderer가 라이브러리 API로 변환하는 경계를 권고한다.
6. 차트 토큰은 범주·순차·발산·기준선·선택·결측 역할과 테마에서 유도한다. 데이터 의미를 색상 하나로만 구별하지 않는다.

## 출처 범위와 읽는 법

여러 공개 1차 출처를 확인했다. 제품 문서는 해당 제품의 기본값이나 편집기 기능을 설명하므로 플랫폼 규칙으로 그대로 취급하지 않았다. 아래 권고는 출처 근거와 구분한 플랫폼 추론이다.

| 출처 | 조사에 사용한 내용 |
| --- | --- |
| [Carbon 데이터 시각화 개요](https://www.carbondesignsystem.com/building-blocks/data-visualization/overview), [간단한 차트](https://www.carbondesignsystem.com/building-blocks/data-visualization/simple-charts), [복합 차트 아카이브](https://v10.carbondesignsystem.com/data-visualization/complex-charts/) | 차트 선택과 차트 계열 |
| [Carbon 공간 차트](https://www.carbondesignsystem.com/building-blocks/data-visualization/spatial-charts), [색상 팔레트 아카이브](https://v10.carbondesignsystem.com/data-visualization/color-palettes/) | Heatmap과 순차/발산 팔레트 |
| [Carbon 차트 구성요소](https://www.carbondesignsystem.com/building-blocks/data-visualization/chart-anatomy), [범례](https://www.carbondesignsystem.com/building-blocks/data-visualization/legends), [대시보드](https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards) | Donut, 범례, 색 의미의 일관성 |
| [Microsoft Power BI 차트 선택](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-types-for-reports-and-q-and-a), [대시보드 설계](https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips) | 차트 목적 및 pie/donut 권고 |
| [Tableau 차트 예시](https://help.tableau.com/current/pro/desktop/en-us/dataview_examples.htm), [pie chart 작성](https://help.tableau.com/current/pro/desktop/en-us/buildexamples_pie.htm) | 차트 종류 및 pie 범주 수 |
| [SAP Fiori Analytical Card](https://experience.sap.com/fiori-design-web/analytical-card/) | 카드 크기, 비교·추세 사례 |
| [Elastic 차트 유형](https://www.elastic.co/docs/explore-analyze/visualize/supported-chart-types), [Heatmap spec](https://elastic.github.io/elastic-charts/api/specs/Heatmap/) | 제품군과 Heatmap API |
| [Grafana heatmap 기초](https://grafana.com/docs/grafana/latest/fundamentals/intro-histograms/), [Heatmap 패널](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/heatmap/) | 시간/히스토그램 버킷과 데이터 변환 |
| [Datadog 대시보드 위젯](https://docs.datadoghq.com/dashboards/widgets/types/), [Heatmap](https://docs.datadoghq.com/dashboards/widgets/heatmap/), [Heatgrid](https://docs.datadoghq.com/dashboards/widgets/heatgrid/), [Pie](https://docs.datadoghq.com/dashboards/widgets/pie_chart/) | 운영 대시보드의 셀·분포·pie |
| [ECharts feature](https://echarts.apache.org/en/feature.html), [접근성](https://echarts.apache.org/handbook/en/best-practices/aria/), [donut](https://echarts.apache.org/handbook/en/how-to/chart-types/pie/doughnut/) | zoom, brush, doughnut, 접근성 처리 |
| [Power BI 접근성](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-creating-reports), [Tableau 접근성](https://help.tableau.com/current/pro/desktop/en-us/accessibility_overview.htm) | 키보드·대체 설명·색상 외 표현 |
| [Salesforce 차트 색상](https://www.lightningdesignsystem.com/2e1ef8501/v/60694/p/7139a1-charts), [Office 데이터 시각화 지침](https://learn.microsoft.com/en-us/office/dev/add-ins/design/data-visualization-guidelines) | 의미가 고정된 색, 축·grid·tooltip |

## 질문 1: 어떤 차트 종류가 기본 세트에 적합한가?

### 출처 비교

| 출처 | 확인한 종류/사용 목적 | 관찰 |
| --- | --- | --- |
| Carbon | line, bar, area, scatter, pie/donut, heatmap 등 | 선은 시간 추세, 막대는 범주 비교, 산점도는 두 수치의 관계로 설명한다. 공간 차트는 좌표·구역에 값을 놓는다. |
| Power BI | bar/column, line, area, pie/donut, scatter, treemap, gauge 등 | 비교, 추세, 분포, 구성 등 질문 중심으로 선택한다. Gauge는 목표 대비 현재 상태 사례다. |
| Tableau | bar, line, pie, scatter, box plot, histogram, density heatmap 등 | 같은 제품에서도 분석 질문별 차트 계열이 다르다. Pie는 부분-전체 관계다. |
| SAP Fiori | line, column, stacked column, bullet, donut 등 | 작은 Analytical Card의 추세·비교·목표 상태 사례를 제공한다. 카드의 데이터 양은 제한한다. |
| Elastic / Datadog / Grafana | line, bar, area, pie, heatmap, gauge, table 등 | 탐색/운영 제품은 시계열과 집계 분포/셀을 함께 제공한다. Heatmap은 데이터 집계 방식에 영향을 받는다. |

### 플랫폼 권고

다음 일곱 유형을 차트 계약의 검토 대상으로 제안한다. 기본 세트는 모든 화면에 전부 노출한다는 뜻이 아니라 공통 Frame과 계약이 이해할 핵심 유형이다.

| kind | 맞는 질문 | 입력 최소값 | 주요 제한/대안 |
| --- | --- | --- | --- |
| line | 시간이 흐르며 값이 어떻게 변했는가? | 정렬 가능한 시간/순서 축, 수치 값 | 범주 간 정밀 비교에는 bar를 고려한다. 결측 기간을 실제 값처럼 연결하지 않는다. |
| bar | 범주 간 값의 크기/순위가 어떻게 다른가? | 범주, 수치 값, 단위 | 값 비교가 목적이면 기본선 0을 표시한다. 범주가 많으면 정렬·필터·표를 제공한다. |
| scatter | 두 수치 변수 사이에 어떤 관계/군집이 있는가? | x/y 수치, 점 ID 또는 선택 키 | 점 중첩은 밀도/투명도나 집계로 드러내고, 관계만으로 인과를 암시하지 않는다. |
| boxPlot | 그룹별 분포와 중앙값/사분위가 어떻게 다른가? | 그룹, 분포 표본 또는 요약 통계 | 요약 통계만 있으면 수염/이상치 정의를 명시한다. |
| pareto | 누적 기여를 큰 항목부터 보면 어디서 대부분이 설명되는가? | 내림차순 범주 값, 누적 비율 계산 | bar와 cumulative line의 조합이며 별도 원시 데이터 타입을 강요하지 않는다. |
| heatmap | 두 축의 교차점에서 값의 크기/상태가 어떻게 분포하는가? | x 범주/구간, y 범주/구간, 셀 값 | 축 순서, 색 스케일, 결측을 표시한다. 정밀 비교가 중요하면 표/bar로 보완한다. |
| donut | 알려진 총계 중 각 범주의 몫은 얼마인가? | 서로 겹치지 않는 부분, 분모/총계 | 5개 이하 조각 권고. 미세 차이와 다수 항목 비교에는 bar/table이 낫다. |

### 범위 밖 후보

| 후보 | 권고 |
| --- | --- |
| stacked bar/area | 전체와 부분 의미가 있는 경우 조합 옵션으로 둔다. 부분끼리의 정확한 비교에는 공통 기준선이 없어 어려울 수 있다. |
| gauge / bullet | 현재값과 명시적 목표·허용 구간이 있는 목적에 한정한다. gauge는 기본 목록에 넣지 않고 목표 비교는 bullet/숫자+범위를 우선 검토한다. |
| treemap | 계층형 부분-전체의 면적 탐색이 필요하고 키보드·표 대안이 확인된 실제 소비자가 생기면 검토한다. |
| calendar heatmap | 일 단위 시간 패턴이라는 구체적 소비자가 확인되기 전에는 일반 2D heatmap의 변형으로 둔다. |
| histogram/density | 분포 질문은 box plot만으로 부족할 수 있다. 표본 수, bin 정책, density 정의가 정해진 소비자가 생기면 추가한다. |

## 질문 2: Heatmap 설계와 조작

### 출처에서 확인한 패턴

| 질문 | 출처 근거 | 플랫폼 적용 추론 |
| --- | --- | --- |
| 무엇을 나타내는가? | Carbon spatial chart는 matrix 안의 색을 수치에 대응시킨다. Elastic Heatmap spec은 x/y accessor, label, sorting, scale을 분리한다. | Heatmap은 좌표 쌍과 값의 셀 집합이다. tooltip에서 x, y, 값, 단위, 집계/기간을 함께 보여준다. |
| 색 스케일은 어떤가? | Carbon은 단방향 크기에 sequential ramp, 중립/pivot 기준으로 부호가 나뉘면 diverging ramp를 안내한다. Carbon 팔레트는 단색 ramp와 발산 팔레트를 구분한다. Datadog은 연속 gradient와 조건별 범위를 제공한다. | 0을 무조건 중심으로 삼지 않는다. 도메인의 중립값이 명시된 경우만 pivot으로 쓴다. 자동 재척도가 기간 비교를 왜곡할 수 있어 고정 범위/범위 표시를 검토한다. |
| 셀 경계는 필요한가? | Carbon은 매우 작은 셀에서 흰 테두리가 시각 품질을 해칠 수 있다고 경고한다. | 구획이 의미 있을 때만 얇은 경계를 쓴다. 조밀한 격자에서 간격/선을 과도하게 쓰지 않는다. |
| 데이터 변환은 어떤 위험이 있는가? | Grafana는 이미 집계/평균된 시계열을 Heatmap용 버킷으로 바꾸면 분포 의미가 부정확해질 수 있다고 설명한다. | 원본 집계 상태와 버킷 규칙을 계약에 포함하거나 데이터가 불충분하면 heatmap으로 표시하지 않는다. |
| 조작은 무엇이 있는가? | ECharts는 dataZoom, pan, brush를 제공한다. Elastic Heatmap brush 이벤트는 선택 셀 또는 x/y 범위를 돌려준다. | 셀/축 brush는 차트 내부 선택이다. 전역 기간/Context 변경은 명시적 Apply/이동 액션으로 분리한다. |
| 접근성은 어떻게 보완하는가? | ECharts ARIA는 설명문과 decal pattern을 제공하지만 자동 활성화되지 않는다. Carbon은 대체 설명·표를 권고하고 Tableau는 View Data와 키보드 탐색을 설명한다. | 색에만 의존하지 않고 선택 셀의 텍스트 요약 및 접근 가능한 표를 연결한다. 키보드로 셀/축을 탐색하고 null과 0을 다르게 표기한다. |

### 계약 제안

- 데이터 예시: x축 범주/구간, y축 범주/구간, value가 숫자 또는 null인 셀 목록. 중복 좌표, 셀 없음과 null의 의미, 집계 방식은 API 계약 전에 결정한다.
- 축: 각 축은 category 또는 interval 타입과 순서를 선언한다. 순서 없는 문자열에는 의미 있는 정렬을 제공하거나 원본 순서를 고정한다.
- 색상: scale 역할을 sequential, diverging, threshold 중 선언한다. domain, 선택적 pivot, stops/breaks 및 no-data 표현을 둔다. 색 값은 ThemeColorToken을 resolve한다.
- tooltip: 축 레이블 + 값 + 단위 + 집계/기간을 노출한다. data trust/coverage가 있으면 근거 정보와 연결한다.
- 상호작용: x/y brush, 셀 선택, 확대, 초기화는 capabilities로 선언한다. 드릴 목적지 ID와 분석 Context를 혼동하지 않는다.
- 주석: 기존 annotation은 chartId, scopeId, from, to, text의 1차원 범위다. 2D 영역/셀 주석은 저장 모델 확장 전 Annotate를 비활성화한다.
- 대안: 대비가 낮거나 색각 차이가 있을 때를 위해 표/CSV, 키보드 탐색, 상세 요약을 제공한다.

## 질문 3: Donut 가이드와 API 패턴

### 사용 지침

| 주제 | 출처 근거 | 플랫폼 권고 |
| --- | --- | --- |
| 목적 | ECharts와 Carbon은 pie/doughnut을 부분-전체 관계로 설명한다. | 알려진 분모 안에서 배타적 범주가 합을 이루는 경우에만 사용한다. 독립 지표를 조각으로 넣지 않는다. |
| 조각 수 | Power BI는 pie/donut을 8개 미만 범주로 제한하라고 권고한다. Tableau는 고유 값 5개 이하를 안내한다. | 보수적 기본값은 Other 포함 최대 5개다. 6개 이상이면 bar/table로 전환하거나 명시적으로 펼치게 한다. |
| 중심 | ECharts는 중앙 공간에 정적 정보 또는 강조된 slice 정보를 둘 수 있다. Datadog은 총계 표시를 지원한다. | 기본은 단위가 포함된 총계 또는 선택 값. 선택으로 중앙 값이 바뀌면 레이블과 상태를 분명히 한다. |
| 레이블/범례 | Carbon은 공간이 있으면 직접 레이블, 아니면 범례를 권고한다. ECharts legend는 클릭으로 항목을 숨기거나 보일 수 있다. | 표준 항목은 색 견본+이름+값+비율이다. 좁은 카드에서는 아래 범례/행 목록을 쓴다. slice 토글로 합계 기준이 바뀌면 이를 드러낸다. |
| 아주 작은 조각 | Carbon chart anatomy는 각도가 매우 작으면 callout, 렌더링, 키보드/tooltip 제공이 제한될 수 있다고 설명한다. | 미세 조각은 Other로 묶거나 table에서 접근 가능하게 한다. 시각적으로만 버리지 않는다. |
| 비교/정렬 | 제품별 pie 예시는 부분-전체를 강조하지만 정밀 순위 읽기에는 막대가 더 직접적이다. | 기간/조직 간 Donut 비교는 기본 지원하지 않는다. 비교가 필요하면 bar 또는 100% stacked bar를 우선한다. |
| 빈 값/합계 | 출처는 분모를 강조하지만 0 총계, 알 수 없는 분모, 불일치 합계의 공통 UI 규칙은 제시하지 않는다. | 이 의미 규칙은 미기술이다. 제품 API 전에 결정한다. |

### API 설계 사례

| 라이브러리 | 공개 API 모양 | 플랫폼 적용 관찰 |
| --- | --- | --- |
| Carbon Charts | 차트별 options 인터페이스, 예: DonutChartOptions | 유형별 옵션 모델은 가능하나 라이브러리 타입을 공용 계약에 직접 노출하지 않는다. |
| Elastic Charts | Chart 컨테이너 + chart별 spec; Heatmap은 x/y accessor, scale, label을 정의 | 공통 frame과 차트별 데이터/scale 스펙의 분리가 유용하다. |
| Ant Design Charts | Line/Pie/Heatmap 개별 플롯 컴포넌트와 타입별 config | 컴포넌트별 config 경계다. Pie 정적 API는 열렸지만 일부 interactive example chunk는 로드되지 않았다. |
| Nivo | Heatmap, Line, Pie 등 개별 컴포넌트 | 타입별 입력 분리 API 사례다. |
| Recharts | ComposedChart 등 container 내부에 축·series/mark를 children으로 조합 | 복합 차트에 유연하지만 공용 계약에 라이브러리 JSX tree를 노출하지 않는다. |
| Tremor | BarChart/DonutChart 등 컴포넌트별 props와 chart utilities | 제한된 차트 기능을 컴포넌트 단위로 보여준다. |
| Observable Plot | Plot.plot에 marks를 배열로 전달하고 channels로 조합 | mark 중심 API다. 플랫폼에서 허용 kind/interaction을 별도로 검증한다. |
| Apache ECharts | option 모델, series.type 및 별도 component/interaction option | raw option은 프레임워크 내부에 가둔다. tree-shaking 가능한 import는 번들 경계에서 적용한다. |
| Shopify Polaris Viz | Donut API 예시에는 inner value/maxSeries가 있으나 저장소는 deprecated/decommissioned 상태를 밝힌다. | 구현 추천이 아닌 API 형태 사례로만 분류한다. |

### 플랫폼 타입 경계 권고

현재 ChartSeries.kind는 line/bar 두 값이다. 필드를 계속 optional로 늘리는 단일 구조체보다 상위 kind 판별자를 가진 ChartSpec 유니온을 권고한다.

- 공통 영역: id, title, description, unit, dataState, capabilities, source, updatedAt, theme 역할.
- Line/Bar: series, x축, y축, 단위, 데이터 점.
- Scatter: 독립 x/y 수치, 선택 key, 선택적 크기/그룹.
- Box plot: 원시 표본 또는 분포 요약 모드의 명시.
- Pareto: 정렬 범주 값과 누적 비율 계산/검증 규칙.
- Heatmap: 두 축, 셀 값, scale 선언.
- Donut: 분모, 배타적 slice, label, total/percent 계산 기준.
- Renderer는 ChartSpec을 ECharts 등 라이브러리 옵션으로 변환한다. capabilities로 프레임 컨트롤 활성 상태를 정한다.

필드 optionality, partial data, empty/no-data semantics는 실제 소비자 계약과 함께 정한다. 위 필드명은 외부 API 표준을 복제하는 명세가 아니라 검토 가능한 모델 예시다.

## 질문 4: 차트별 상호작용 매트릭스

범례: ● 기본 지원 권고, △ 의미/저장 모델/소비자에 따라 선택, — 기본 지원 안 함. 출처에서 확인되지 않은 항목은 보편 기능이라고 추정하지 않았다.

| kind | Zoom | Brush/select | Reset | Compare | Annotate | Export | Drill |
| --- | --- | --- | --- | --- | --- | --- | --- |
| line | ● 시간/값 범위 | ● 시간 구간 | ● | △ 두 기간/series 정책 필요 | ● 1D from/to | ● 데이터+범위 명시 | △ 목적지 ID 필요 |
| bar | △ 많은 범주의 영역 | ● 범주 선택 | ● | △ 비교 기준 선언 | △ 범주/기간 저장 모델 필요 | ● | △ 메뉴 목적지 계약 필요 |
| scatter | ● x/y 영역 | ● 사각 영역/점 | ● | △ 그룹/집단 비교 | △ 점/2D 영역 모델 필요 | ● | △ |
| boxPlot | △ 분포 축 범위 | ● 그룹/표본 선택 | ● | ● 그룹 비교 의미가 명시된 경우 | △ 분포 구간 모델 필요 | ● | △ |
| pareto | △ | ● 범주 묶음 | ● | △ 동일 분모·기간 조건 필요 | △ 1D 범위는 제한적 | ● | △ |
| heatmap | ● 축/범위 | ● 셀 및 x/y brush | ● | △ 동일 scale·기간 고정 필요 | — 현재 1D 모델과 불일치 | ● 셀 표/CSV | △ |
| donut | — | ● slice 선택 | ● 선택 해제 | — 정밀 비교에 부적합 | — 위치/각도 주석의 실익 불명 | ● 표/CSV | △ 범주 목적지 필요 |

ECharts feature list에서 zoom/pan/filter, dataZoom 및 brush를 확인할 수 있다. 이는 ECharts 기능이지 모든 차트에 같은 동작이 있다는 뜻은 아니다. Elastic은 Heatmap brush 이벤트로 선택 셀/축 범위를 돌려준다. chart+library 조합을 검증하고 capabilities로 공개한다.

현재 플랫폼 Frame 계약은 Zoom, Brush, Reset, Compare, Annotate, Export 어휘를 제공하지만 실제 지원은 manifest feature flags로 제어한다. 시간/축 selection을 전역 기간에 조용히 반영하지 않고 명시적으로 적용한다. 공통 버튼을 모든 차트에서 켜기보다 동작의 상태 의미와 초기화 범위를 통일한다.

## 질문 5: 테마와 토큰 도출

### 시각 역할

| 역할 | 토큰 후보 | 기준 |
| --- | --- | --- |
| 범주 계열 | chart.category.1..n | 도메인 의미가 같은 범주는 차트가 달라도 색을 유지한다. 값이 늘어도 색만으로 구별하지 않는다. |
| 순차형 크기 | chart.sequential.0..10 | 작은 값부터 큰 값까지 명도/채도가 일관되게 이동한다. Heatmap 값 scale에 쓴다. |
| 발산형 값 | chart.diverging.negative, neutral, positive + ramp | 실제 기준점/부호가 있을 때만 쓴다. 도메인의 0이 중립인지 확인한다. |
| 기준/목표 | chart.reference, chart.target | 데이터 계열 색과 의미를 혼동하지 않는다. |
| 선택/hover | chart.selection, chart.focus, chart.hover | 강조는 색상 외 outline/shape/두께도 사용한다. |
| grid/axis | 현재 chart-grid, chart-stroke-thin 등 | gridline은 배경 역할, 라벨 대비는 읽을 수 있게 둔다. 축 범위 변경이 해석을 바꾸면 표시한다. |
| null/no data | chart.no-data + text/texture | null, 미관측, 0을 시각과 텍스트에서 구별한다. |
| sentiment | chart.positive, chart.warning, chart.negative | 업무 상태 토큰을 수치 크기 순차 ramp와 섞지 않는다. 빨강/초록만으로 뜻을 구별하지 않는다. |

Carbon은 색 의미의 일관성과 순차/발산 팔레트를 제공한다. Salesforce는 같은 의미에 같은 색조, 최소한의 색 사용과 접근 가능한 팔레트를 권고한다. Power BI는 Data/Structural/Sentiment/Divergent 역할을 설명한다. Material color-system은 일반 색 역할을 설명하지만 chart palette의 개수/순서는 정하지 않는다.

### 이 레포에 대한 연결

- DESIGN.md의 chart-blue/teal/green/purple 및 remainder는 현재 자산이다. 새 kind 색을 임의 hex로 더하지 않고 semantic ThemeColorToken으로 정리한다.
- ADR-0055의 CSS token source → 생성 DTCG JSON/typed TS 경로를 따른다. 라이브러리 palette 배열을 제품 코드에 고정하지 않는다.
- 상태/선택은 Frame의 전역 Context와 구분된 local selection으로 관리한다. 표/요약/키보드/패턴 대안을 함께 제공한다.
- Dark mode는 조사 범위 밖이다. 다크 토큰/대비값은 테마 방향 결정과 실제 화면 검토 뒤 정한다.

## 추천 차트 세트와 3가지 A/B/C 프로토타입 아이디어

아래 안은 같은 실제 데이터와 Frame 크기로 비교할 검토안이며 승인된 디자인이 아니다.

| 안 | Heatmap | Donut | 시각/상호작용 방향 |
| --- | --- | --- | --- |
| A — 분석 기본 | Sequential 단일 색조, 고정 domain 범례, 행/열 brush, 축과 셀 표 | 총계 중앙, 최대 5조각, 아래에 이름·값·비율 목록 | 선택 영역은 local 상태, 전역 Context는 Apply 후에만 변경. |
| B — 편차 탐지 | 명시적 기준값 중심 diverging scale, 기준 숫자/중립 구간 표시 | slice 선택 시 중앙에 선택값과 총계, 범례 항목 유지 | 업무상 대칭인 양/음 편차에 한정. 색각 접근성과 정확도 비교 검증. |
| C — 조밀한 운영 | threshold 상태 구간, 축 라벨 축소, hover/키보드 상세 및 표 전환 | 중앙 수치 + 오른쪽/아래 접근 가능한 범례 표 | 작은 화면, 긴 범주명, 상태색 충돌을 검증. |

공통 검토 항목: 셀 밀도와 장문 축 레이블, null과 0, tooltip 방향/충돌, keyboard focus, legend scroll, 작은 donut slice, export, Reset 범위, Context 적용 경계. 구현 전 선택 안과 변경 이유를 사용자 컨펌/결정 기록에 남긴다.

## 열린 질문과 확인 못 한 항목

1. 소비 데이터에서 Heatmap 축은 범주×범주, 시간×범주, 공간 좌표 중 무엇인가? 범용 타입을 정하기 전에 소비자 사례가 필요하다.
2. 결측 셀, 관측 0, 집계 0, 오류/마스킹 값을 현재 data trust/coverage 의미와 어떻게 나눌지 결정되지 않았다.
3. annotation 저장 모델이 범주, 점, 셀, 2D 영역을 지원할지 확인하지 못했다. 확인한 모델은 from/to 기반 1차원 범위다.
4. Donut의 0 총계, 음수 값, 합계와 서버 분모 불일치의 UI/검증 규칙은 출처에서 공통 규칙을 확인하지 못했다.
5. 실제 차트 소비 메뉴, 대표 화면 크기, 라이브러리 번들/렌더링 제약은 이번 조사에서 확인하지 않았다. 선택안은 contract 검토용이다.
6. Power BI의 8개 미만 권고와 Tableau의 5개 이하 권고는 다르다. 최대 5조각은 보수적인 플랫폼 추론이다.
7. ECharts ARIA 설명과 decal의 기본 활성 여부는 확인되지 않았다. 출처는 지원 기능을 말하지만 앱마다 초기 설정이 같다는 것은 확인되지 않는다.
8. Ant Design Charts 일부 interactive example의 JS chunk를 로드하지 못했다. 정적 overview/config는 열렸으나 해당 예제 동작은 확인 못 함.
9. Material 공식 color-system 출처에서는 chart-specific palette 규칙을 확인하지 못했다.
10. Library API는 바뀔 수 있다. 구현 시 사용 버전의 공식 API를 다시 확인한다.

## 부록: 원 출처 목록

차트 목적/유형:
- https://www.carbondesignsystem.com/building-blocks/data-visualization/simple-charts
- https://www.carbondesignsystem.com/building-blocks/data-visualization/overview
- https://v10.carbondesignsystem.com/data-visualization/complex-charts/
- https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-types-for-reports-and-q-and-a
- https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips
- https://help.tableau.com/current/pro/desktop/en-us/dataview_examples.htm
- https://help.tableau.com/current/pro/desktop/en-us/buildexamples_pie.htm
- https://experience.sap.com/fiori-design-web/analytical-card/
- https://www.elastic.co/docs/explore-analyze/visualize/supported-chart-types
- https://grafana.com/docs/grafana/latest/fundamentals/intro-histograms/
- https://docs.datadoghq.com/dashboards/widgets/types/

Heatmap, access, palette:
- https://www.carbondesignsystem.com/building-blocks/data-visualization/spatial-charts
- https://v10.carbondesignsystem.com/data-visualization/color-palettes/
- https://docs.datadoghq.com/dashboards/widgets/heatmap/
- https://docs.datadoghq.com/dashboards/widgets/heatgrid/
- https://elastic.github.io/elastic-charts/api/specs/Heatmap/
- https://elastic.github.io/elastic-charts/all-types/interfaces/HeatmapBrushEvent/
- https://elastic.github.io/elastic-charts/all-types/type-aliases/BrushEndListener/
- https://echarts.apache.org/en/feature.html
- https://echarts.apache.org/handbook/en/best-practices/aria/
- https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/developers
- https://help.tableau.com/current/pro/desktop/en-us/accessibility_overview.htm

Donut, theme and API:
- https://echarts.apache.org/handbook/en/how-to/chart-types/pie/doughnut/
- https://echarts.apache.org/handbook/en/how-to/chart-types/pie/basic-pie/
- https://echarts.apache.org/handbook/en/concepts/legend/
- https://www.carbondesignsystem.com/building-blocks/data-visualization/chart-anatomy
- https://www.carbondesignsystem.com/building-blocks/data-visualization/legends
- https://docs.datadoghq.com/dashboards/widgets/pie_chart/
- https://www.lightningdesignsystem.com/2e1ef8501/v/60694/p/7139a1-charts
- https://learn.microsoft.com/en-us/office/dev/add-ins/design/data-visualization-guidelines
- https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-visual-defaults
- https://m3.material.io/styles/color/the-color-system
- https://charts.carbondesignsystem.com/api/interfaces/donutchartoptions
- https://elastic.github.io/elastic-charts/api/Chart/
- https://charts.ant.design/en/components/overview/
- https://charts.ant.design/en/components/plots/pie/
- https://nivo.rocks/components/
- https://nivo.rocks/heatmap/
- https://nivo.rocks/line/
- https://nivo.rocks/pie/
- https://recharts.github.io/en-US/api/ComposedChart/
- https://recharts.github.io/en-US/api/
- https://www.tremor.so/docs/visualizations/bar-chart
- https://www.tremor.so/docs/visualizations/donut-chart
- https://www.tremor.so/docs/utilities/chartUtils
- https://observablehq.github.io/plot/features/plots
- https://observablehq.github.io/plot/features/marks
- https://echarts.apache.org/en/basics/import/
- https://github.com/Shopify/polaris-viz
- https://polaris-viz.shopify.dev/iframe.html?id=polaris-viz-charts-donutchart--custom-inner-value-content&viewMode=docs
