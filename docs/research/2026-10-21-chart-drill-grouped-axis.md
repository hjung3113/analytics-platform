# Chart drill and grouped categorical axis — 2026-10-21

이 문서는 #541의 drill 및 EquipmentID grouped axis prototype 결정을 지원한다. vendor 동작은 제품별 사례로, 플랫폼 권고는 현재 `AnalysisChartFrame` / `AnalysisChart` 계약과 연결한 추론으로 표시한다.

## 출처

| 출처 | 확인 범위 |
| --- | --- |
| [Power BI drill mode](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-drill), [Power BI drillthrough](https://learn.microsoft.com/en-us/power-bi/guidance/report-drillthrough) | 계층 drill up/down 및 right-click drillthrough |
| [Tableau hierarchies](https://help.tableau.com/current/pro/desktop/en-us/qs_hierarchies.htm), [Grafana dashboard links](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-dashboard-links/) | 계층 경로와 URL/context를 전달하는 data link |
| [Highcharts drilldown](https://www.highcharts.com/docs/chart-concepts/drill-down-charts), [ECharts event/action](https://echarts.apache.org/handbook/en/concepts/event/), [ECharts bar drilldown example](https://echarts.apache.org/examples/en/editor.html?c=bar-drilldown) | click 기반 drill, drill-up/back과 chart event API |
| [amCharts hierarchy drill down](https://www.amcharts.com/docs/v5/charts/hierarchy/hierarchy-drill-down/), [Looker dashboard interactions](https://docs.cloud.google.com/looker/docs/viewing-dashboards) | 계층 차트 탐색과 결과 지점에서 추가 상세 조회 |
| [W3C UI Events legacy text](https://w3c.github.io/uievents/TR.html#events-mouseevent-event-order), [WAI-ARIA Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [ECharts official issue #20288](https://github.com/apache/echarts/issues/20288), [ECharts official issue #10762](https://github.com/apache/echarts/issues/10762) | click / dblclick 순서, keyboard menu trigger, legend event 범위의 알려진 제한/요청 |
| [ECharts Axis handbook](https://echarts.apache.org/handbook/en/concepts/axis/), [Axis option API](https://echarts.apache.org/en/option.html#yAxis.axisLabel.interval), [markArea option API](https://echarts.apache.org/en/option.html#series-markArea), [Custom series handbook](https://echarts.apache.org/handbook/en/how-to/series/custom/) | category axis, label interval, group band, custom rendering 비용 |
| [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx), [AnalysisChart](../../packages/components/src/AnalysisChart.tsx), [EChart](../../packages/components/src/EChart.tsx), [StateView](../../packages/components/src/StateView.tsx) | chart props, axis model, interactions, toolbar/state integration |

## 질문 1: Drill gesture와 상호작용 우선순위

| 제품 | 확인된 패턴 | 적용 관찰 |
| --- | --- | --- |
| Power BI | Hierarchy가 있는 visual은 toolbar의 drill mode / up / down / next level 조작과 data point의 right-click drillthrough를 제공한다. Drillthrough는 destination page와 기준 필터를 전달하는 별도 흐름이다. [Drill mode](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-drill) · [Drillthrough](https://learn.microsoft.com/en-us/power-bi/guidance/report-drillthrough) | 오른쪽 클릭은 깊이 단계 이동과 목적지 이동 모두 가능하므로 메뉴 label로 동작을 구분한다. |
| Tableau | Dimension hierarchy의 + / − control로 아래/위 계층으로 이동한다. [Hierarchies](https://help.tableau.com/current/pro/desktop/en-us/qs_hierarchies.htm) | 차트별 pointer gesture 외에 눈에 보이는 계층 조작을 제공하는 사례다. |
| Grafana | Data link를 panel/series에서 열어 다른 dashboard/query로 갈 수 있고, URL에 time range와 template variable을 전달할 수 있다. [Dashboard links](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-dashboard-links/) | Drill 목적지 ID와 전달할 analysis Context를 분리해 정의하는 것이 유용하다. |
| Highcharts | drilldown module은 point click으로 추가 series/data를 drill하고, drill-up action으로 돌아간다. [Drilldown charts](https://www.highcharts.com/docs/chart-concepts/drill-down-charts) | 라이브러리 click은 동작을 연결할 수 있지만 Frame 수준의 navigation/권한 계약은 별도다. |
| ECharts | `chart.on('click', ...)`에서 datum을 받고 handler가 새 view로 이동하거나 데이터를 drill할 수 있다. 공식 example은 bar click 뒤 하위 데이터를 표시한다. ECharts는 `click`, `dblclick`, `contextmenu` 등의 event를 노출한다. [Event and Action](https://echarts.apache.org/handbook/en/concepts/event/) · [Bar drilldown](https://echarts.apache.org/examples/en/editor.html?c=bar-drilldown) | Drill은 내장 계층 정책이 아니라 consumer callback/action 구현이다. |
| amCharts | Hierarchy chart node를 눌러 하위 node로 drill하고, chart의 drill-up control로 위 단계로 돌아간다. [Hierarchy drill down](https://www.amcharts.com/docs/v5/charts/hierarchy/hierarchy-drill-down/) | 부모 경로를 다시 고를 수 있는 시각적 복귀 affordance가 built-in drill과 함께 제공된다. |
| Looker | Dashboard chart의 data point는 Explore/detail query를 여는 drill menu를 제공할 수 있고, 구성에 따라 필요한 dimension과 filter를 더 보여 준다. [Viewing dashboards](https://docs.cloud.google.com/looker/docs/viewing-dashboards) | point click 후 즉시 route를 바꾸지 않고 “상세 보기” 선택지를 보여 주는 것도 확인된 제품 패턴이다. |

### click / dblclick 충돌 및 보조 조작

W3C UI Events의 published legacy event sequence 예시는 double click을 `click`, `click`, `dblclick` 순서로 보여 주며, dblclick threshold는 환경 설정에 의존한다고 설명한다. 따라서 동일 datum에서 즉시 실행되는 `click` drill을 두면 double-click drill을 받기 전에 첫 click의 navigation/selection이 실행될 수 있다. ECharts는 두 이벤트 이름을 받을 수 있지만 자체적으로 하나의 우선순위를 정하지 않는다. [W3C UI Events](https://w3c.github.io/uievents/TR.html#events-mouseevent-event-order) · [ECharts Event and Action](https://echarts.apache.org/handbook/en/concepts/event/)

Double-click을 유지한다면 단일 click 동작을 짧은 timer 동안 pending으로 두고, 같은 datum의 dblclick이 오면 취소한 뒤 drill한다. 이렇게 하면 single-click selection에 지연이 생기고, 실제 더블클릭 제한시간은 OS/browser 환경에 따라 달라진다. 더 단순한 계약은 click=select/tooltip, drill=명시 액션으로 나누는 것이다. 현재 `AnalysisChartFrame`의 point click은 이미 explicit drill-down callback이면서 click event에 연결돼 있고 brush 중에는 무시한다. [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx)

Right-click은 메뉴를 빠르게 열어 exclude/back을 둘 수 있지만 유일한 통로로 두지 않는다. Frame header의 visible `Drill down` / `Back`, 현재 경로 breadcrumb, keyboard focus 이동을 제공한다. Context menu가 있으면 `Shift+F10`/Context Menu key로 같은 메뉴를 열도록 하고, 선택한 메뉴 항목을 적용 뒤 focus를 chart heading 또는 breadcrumb로 보낸다. Menu Button pattern은 keyboard activation과 focus 이동 규칙을 정의한다. ECharts 공식 issue #20288은 mouse event를 chart grid 바깥 legend까지 노출해 달라는 open feature request이고, #10762는 2019년 당시 legend double click 전달 범위 문제를 기록한다. 이 이력은 현재 버전 전체의 동작 보증으로 보지 않는다. 따라서 legend double-click을 drill 계약에 의존시키지 말고 plotted data point에 국한한다. [WAI-ARIA Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) · [ECharts issue #20288](https://github.com/apache/echarts/issues/20288) · [ECharts issue #10762](https://github.com/apache/echarts/issues/10762)

Zoom/brush에는 명시적인 mode 우선순위를 둔다. 현재 Frame은 Shift+wheel zoom, 별도 Brush mode, brush 중 point click 차단을 갖는다. Drill은 click 계열이라 brush의 drag gesture와 동시에 처리하지 않으며, brush가 켜졌을 때는 point drill과 context menu shortcut을 잠시 비활성화하거나 명확한 안내를 보여 준다. [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx) · [ECharts event/action](https://echarts.apache.org/handbook/en/concepts/event/)

## 질문 2: ECharts의 grouped categorical Y axis

### 가능한 렌더 방식

| 방식 | ECharts에서 가능한 부분 | 비용/한계 |
| --- | --- | --- |
| 두 번째 category `yAxis`와 label interval/formatter | ECharts axis는 category data 및 `axisLabel`을 지원하고 축 옵션은 배열로 여러 축을 정의할 수 있다. 동일한 row order를 가진 별도 category axis에 EquipmentID와 Maker/Module label을 각각 표시할 수 있다. [Axis handbook](https://echarts.apache.org/handbook/en/concepts/axis/) · [axisLabel interval](https://echarts.apache.org/en/option.html#yAxis.axisLabel.interval) | 두 축의 category 순서·grid 위치·label margin을 같은 row model에서 만들어야 한다. Group heading을 group 시작 행에만 출력하는 formatter, group 경계선을 위한 tick/splitLine 규칙이 필요하다. 확대/가시행 변경 시 두 축이 계속 맞아야 하며, label interval 자체는 group tree/data contract가 아니다. |
| `markArea` group band | Series `markArea`는 axis 좌표 범위를 가진 영역과 이름/label을 그릴 수 있어 maker/module 행 범위를 배경 band로 묶는 표현이 가능하다. [markArea API](https://echarts.apache.org/en/option.html#series-markArea) | plot 영역 안의 시각 band라 축 바깥의 semantic header나 계층 navigation이 생기지는 않는다. group별 start/end row 계산을 수행해야 하며 selection/annotation layer와 겹침을 확인해야 한다. |
| `custom` series 또는 graphic | Custom series의 render function으로 bracket, group label, row별 interval 같은 Gantt glyph를 계산해 그릴 수 있다. [Custom series](https://echarts.apache.org/handbook/en/how-to/series/custom/) | category-to-pixel 좌표, clipping, resize, zoom/scroll, animation과 hit testing을 직접 연결해야 한다. 별도 keyboard/table 표현도 필요해 비용이 가장 크다. |

### 현재 Frame에서 필요한 hook

`AnalysisChartFrameProps`의 `ChartSeries.points`는 `[x, y]`이고, Frame은 x를 `time | category`, y를 항상 numeric `value`로 생성한다. 따라서 현재 Frame에 `yAxis` 설정만 주입해도 EquipmentID가 y row가 되는 Gantt model이 되지 않는다. [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx)

`AnalysisChart`의 Heatmap은 `xLabels`, `yLabels`, `cells`를 갖고 y축이 이미 category지만, `HeatmapSpec`에는 Equipment row의 Maker/Module group metadata가 없다. 게다가 `ChartSpec`에는 Gantt/interval row kind가 없다. [AnalysisChart](../../packages/components/src/AnalysisChart.tsx)

재사용 가능한 hook은 raw `EChartsCoreOption` prop이 아니라 typed category-row metadata다. 예: `rowGroups: { rowId, groupId, groupLabel, order }[]`와 `intervals: { rowId, from, to, value/status }[]`를 받는 `GanttSpec`; renderer가 stable row order, 두 category axis 또는 group band, interval series, drill/selection 이벤트를 Frame option으로 변환한다. Frame은 existing toolbar, capabilities, state, trust 및 selection contract를 계속 감싼다. `AnalysisChart`를 확장하는 경우에는 Heatmap 축을 억지로 공유하지 말고 별도 `gantt` discriminant renderer를 추가한다. [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx) · [AnalysisChart](../../packages/components/src/AnalysisChart.tsx) · [EChart](../../packages/components/src/EChart.tsx)

단기 prototype에서 `EChart`에 raw option을 넘기면 그릴 수는 있지만, EChart는 AnalysisChartFrame의 Zoom/Brush/Reset/Compare/Annotate/Export toolbar, selection summary, trust footer를 포함하지 않는다. `EChart` 단독 사용은 query outcome의 idle/loading/empty/error 상태를 처리하지 않는다. 상위 page에서 `QueryView`로 감싸면 outcome taxonomy를 재사용할 수 있지만, Frame이 연결하는 chart layout과 상태 조립은 consumer 책임이 된다. 따라서 EChart escape는 가능성 스케치에 한정하고 product seam으로 사용하지 않는다. [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx) · [StateView / QueryView](../../packages/components/src/StateView.tsx) · [EChart](../../packages/components/src/EChart.tsx)

## #541 추천 옵션

**A — Drill:** 기본 click은 point selection/tooltip로 둔다. Drill은 header의 visible `Drill down` action으로 실행하고, 현재 경로 breadcrumb와 `Back` action을 함께 유지한다. Double-click은 optional shortcut이며 채택할 때는 click action을 delay/cancel 처리하고, brush mode에서는 drill을 막는다. Right-click/`Shift+F10`은 같은 action menu를 여는 shortcut으로만 추가한다. 사용자가 실행 의도를 구별하고 keyboard/touch 대안을 얻는 대신, 직접 double-click만 제공하는 UI보다 클릭 횟수가 하나 늘어난다. [Power BI drill mode](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-drill) · [Tableau hierarchies](https://help.tableau.com/current/pro/desktop/en-us/qs_hierarchies.htm) · [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx)

**B — Grouped axis:** 새 typed `GanttSpec`/Frame row-group hook에서 EquipmentID와 Maker/Module group metadata를 선언한다. 첫 구현은 stable row order + second category yAxis group labels + `markArea` band로 제한하고, level count가 늘거나 virtual scroll 요구가 확인되면 custom series/renderer를 검토한다. `EChart` raw option은 빠른 visual spike에는 쉽지만 toolbar, annotation, export, selection summary와 state/trust wiring을 다시 구현하게 된다. Typed renderer는 초기 작업이 더 들지만 MARS menu가 chart option 세부사항을 직접 소유하지 않고 공통 Frame 기능을 보존한다. [Axis handbook](https://echarts.apache.org/handbook/en/concepts/axis/) · [markArea API](https://echarts.apache.org/en/option.html#series-markArea) · [Custom series](https://echarts.apache.org/handbook/en/how-to/series/custom/) · [AnalysisChartFrame](../../packages/components/src/AnalysisChartFrame.tsx)
