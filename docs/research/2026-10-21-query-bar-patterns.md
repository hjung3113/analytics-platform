# Query Bar pattern research — 2026-10-21

이 문서는 MARS / HWTime3의 query-bar prototype 전에 공개 제품 문서와 현재 플랫폼 코드를 비교한 조사다. 제품별 UI는 해당 제품의 선택일 뿐 플랫폼 규칙으로 복사하지 않는다. 아래에서 출처에 적힌 동작과 우리 플랫폼에 대한 설계 추론을 나눈다.

## 출처

| 출처 | 확인 범위 |
| --- | --- |
| [WAI-ARIA APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/), [Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) | Combobox의 기본 단일 선택, 다중 Listbox의 selected/focus 구분과 키보드 모델 |
| [shadcn/ui Combobox](https://ui.shadcn.com/docs/components/radix/combobox), [sersavan shadcn Multi Select](https://github.com/sersavan/shadcn-multi-select-component), [Radix Select](https://www.radix-ui.com/primitives/docs/components/select) | shadcn의 조합 패턴과 community 구현, Radix 단일 선택 primitive |
| [Atlassian Select](https://atlassian.design/components/select/code/), [Carbon MultiSelect (v10)](https://v10.carbondesignsystem.com/components/dropdown/usage/), [Carbon Filtering](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering) | Multi/Async select props, 선택 표시, filter 후 Apply 패턴 |
| [Ant Design Select](https://ant.design/components/select/), [MUI Autocomplete](https://mui.com/material-ui/react-autocomplete/), [Primer SelectPanel](https://primer.style/product/components/select-panel/) | Controlled multi-value, 원격 검색, 선택 개수 요약, 적용 시점 |
| [Adobe Spectrum ComboBox](https://react-spectrum.adobe.com/ComboBox), [TagGroup](https://react-spectrum.adobe.com/TagGroup), [ListBox](https://react-spectrum.adobe.com/v3/ListBox.html), [Polaris Select](https://shopify.dev/docs/api/admin-extensions/latest/web-components/forms/select), [Polaris Choice list](https://shopify.dev/docs/api/admin-extensions/2026-01/web-components/forms/choice-list) | 단일 ComboBox와 다중 선택 조합, 제거 가능한 tag, 비동기 목록, Polaris 선택 제한 |
| [Grafana variables](https://grafana.com/docs/learning-paths/interactive-dashboards/use-variables-queries/), [Grafana Explore](https://grafana.com/docs/grafana/latest/visualizations/explore/get-started-with-explore/), [Kibana filtering](https://www.elastic.co/docs/explore-analyze/query-filter/filtering), [Looker Explore filters](https://docs.cloud.google.com/looker/docs/filtering-and-limiting-new-explore-experience) | 대시보드 변수와 실행형 Explore/필터 편집 흐름 |
| [Power BI filter pane](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-report-filter), [Tableau filters](https://help.tableau.com/current/pro/desktop/en-us/filtering.htm), [Metabase dashboard filters](https://www.metabase.com/docs/latest/dashboards/filters), [Superset dashboard filters](https://superset.apache.org/docs/using-superset/creating-your-first-dashboard/) | Apply/auto-apply와 다중 값 필터 사례 |
| [Datadog template variables](https://docs.datadoghq.com/dashboards/template_variables/), [Carbon filtering](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering), [Atlassian filters](https://atlassian.design/components/filter/) | 대시보드 변수, batch filter와 직접 적용 사례 |
| [Grafana query history](https://grafana.com/docs/grafana/latest/visualizations/explore/query-management/), [Looker user history](https://docs.cloud.google.com/looker/docs/user-history), [Kibana saved search](https://www.elastic.co/guide/en/kibana/current/save-open-search.html) | 최근 조회 내역과 저장된 검색의 복원 범위 |
| [Grafana dashboard time range](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/), [Power BI relative date slicer](https://learn.microsoft.com/en-us/power-bi/visuals/desktop-slicer-filter-date-range), [Tableau relative dates](https://help.tableau.com/current/pro/desktop/en-gb/qs_relative_dates.htm) | 오늘/상대 기간의 기준 시점과 날짜 필터 |
| [PageFilterBar](../../packages/sdk/components/src/filters/PageFilterBar.tsx), [GlobalContextBar](../../packages/sdk/shell/src/context/GlobalContextBar.tsx), [Combobox](../../packages/sdk/ui/src/components/shadcn/combobox.tsx), [시간 계약](../contract/platform-ui-contract.md) | 현재 공개된 플랫폼 API와 시간 범위 경계 |

## 질문 1: 검색·원격 옵션을 갖춘 Multi-select Combobox는 어떻게 만드는가?

### 출처 비교

| 제품/패턴 | 관찰 |
| --- | --- |
| WAI-ARIA APG | APG의 표준 Combobox + listbox 예시는 focus를 따라가는 단일 선택이다. 여러 항목을 고르는 Listbox는 `aria-multiselectable`, 옵션별 선택 상태, focus와 selection의 분리를 사용하며, Space로 현재 옵션 선택을 토글하는 모델을 안내한다. “combobox에 다중 선택을 붙이는 완성 패턴” 하나를 그대로 복사할 수 있는 구조는 아니다. [Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) · [Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) |
| shadcn / Radix | 현재 shadcn 문서는 여러 선택값과 chips를 조합하는 Combobox 변형을 제공하지만, 레포의 `Combobox`는 `value: string | null` / `onChange(value)`의 단일값 API다. Radix `Select`도 단일 `value` primitive다. community Multi Select는 `string[]`, 검색, chips, popup을 열어 둔 채 선택 및 `maxCount` 요약을 구현한 참고 코드이며, paging 표준을 제공하지는 않는다. [shadcn Combobox](https://ui.shadcn.com/docs/components/radix/combobox) · [Radix Select](https://www.radix-ui.com/primitives/docs/components/select) · [community 구현](https://github.com/sersavan/shadcn-multi-select-component) |
| Atlassian | Select는 `isMulti`와 controlled `value`를 지원하고, 검색 입력 상태를 선택값과 분리한다. AsyncSelect/load-options 패턴은 원격 검색에서 결과를 갱신하는 방법을 제공한다. [Select API](https://atlassian.design/components/select/code/) |
| Carbon | MultiSelect는 checkbox 목록을 열어 둔 채 여러 항목을 고르게 하고, 선택값을 tag 또는 선택 수로 요약하는 패턴을 설명한다. 여기 인용한 컴포넌트 설명은 Carbon v10 문서다. Carbon filtering guidance에는 변경분을 모았다가 Apply하는 적용 방식도 있다. [MultiSelect](https://v10.carbondesignsystem.com/components/dropdown/usage/) · [Filtering](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering) |
| Ant Design | `mode="multiple"`의 controlled 배열값을 사용한다. 공식 “Search and Select Users” 예시는 remote fetch에 debounce, 요청 ID로 늦게 도착한 응답 무시, loading 표시, server-side filter 비활성화를 결합한다. 이 예시는 검색 결과 갱신을 다루며 cursor/page 계약을 정의하지는 않는다. [Select](https://ant.design/components/select/) |
| MUI | `multiple` 선택값과 검색 input을 별도 controlled state로 둔다. `limitTags`로 입력 영역에 보이는 chip 수를 제한하고 남은 수를 요약할 수 있다. async “load on open” / “search as you type”와 server-side filtering 시 기본 client filter를 끄는 설명도 있다. 긴 결과는 virtualization/infinite-loading 예시를 별도로 제공한다. [Autocomplete](https://mui.com/material-ui/react-autocomplete/) |
| GitHub Primer | SelectPanel은 여러 `selected` 값을 지원하고 항목 필터링·그룹화를 제공한다. 일반 anchored panel은 닫을 때 변경을 적용하며, modal/fullscreen 구성은 Save에서 확정할 수 있어 취소 가능한 draft가 필요한 상황에 대응한다. 좁은 화면에서는 full-screen 변형을 안내한다. [SelectPanel](https://primer.style/product/components/select-panel/) |
| Adobe Spectrum | Spectrum ComboBox는 단일 선택이므로, 선택 다중화는 ComboBox에 직접 얹기보다 multi-select `ListBox` 또는 선택값을 표현하는 `TagGroup`과 조합하는 방식이 맞다. ListBox에는 다중 선택 및 비동기 추가 로딩 상태/`onLoadMore`가 있다. [ComboBox](https://react-spectrum.adobe.com/ComboBox) · [ListBox](https://react-spectrum.adobe.com/v3/ListBox.html) · [TagGroup](https://react-spectrum.adobe.com/TagGroup) |
| Shopify Polaris | 현재 Admin extension `s-select`는 검색/필터 기능과 다중 선택이 없고, `s-choice-list`는 checkbox 다중 선택을 지원하지만 검색과 lazy loading은 제공하지 않는다. 그래서 Polaris 예시는 기본 다중 체크 선택에는 유용하지만, 큰 설비 목록의 searchable paged combobox와는 다른 크기다. [Select](https://shopify.dev/docs/api/admin-extensions/latest/web-components/forms/select) · [Choice list](https://shopify.dev/docs/api/admin-extensions/2026-01/web-components/forms/choice-list) |

### 우리 플랫폼에 맞는 형태

현재 primitive를 여러 번 호출해도 API 자체는 단일값이다. MARS용 선택 컨트롤은 `selectedIds: string[]`와 `searchText`를 따로 소유하고, 선택할 때 popup은 열린 채 유지하며, 선택된 값은 현재 검색 결과 페이지가 바뀌어도 유지해야 한다. 원격 옵션은 debounce, 늦은 응답 폐기, loading/error/empty 상태, 다음 페이지 로딩 상태를 포함한다. 이 구성은 Ant의 순서 제어와 Spectrum의 `onLoadMore`를 참고하되, 플랫폼 계약으로 새로 정해야 할 부분이다. [Ant Design Select](https://ant.design/components/select/) · [Spectrum ListBox](https://react-spectrum.adobe.com/v3/ListBox.html) · [현재 Combobox](../../packages/sdk/ui/src/components/shadcn/combobox.tsx)

선택이 적을 때는 chips를 모두 보여 주고, 많을 때는 처음 일부와 `+N` 또는 `N개 선택`을 표시한다. 전체 선택을 바꾸지 않고 선택된 chip 각각을 제거할 수 있어야 하며, 요약 상태에서도 선택값을 잃지 않아야 한다. 검색 결과의 옵션은 focus 이동과 실제 선택 상태를 구별하고, 다중 listbox의 선택 상태를 보조기기에 노출해야 한다. 제거 버튼의 accessible name에는 제거할 항목명이 포함되어야 한다. [Carbon MultiSelect](https://v10.carbondesignsystem.com/components/dropdown/usage/) · [MUI Autocomplete](https://mui.com/material-ui/react-autocomplete/) · [WAI-ARIA Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)

## 질문 2: Draft → Apply는 어떤 패턴으로 구분되는가?

### 제품 동작

| 제품 | 관찰된 실행 방식 |
| --- | --- |
| Grafana | Dashboard variable 변경은 선택값을 사용해 dashboard 데이터를 동적으로 필터링한다. Explore는 query를 작성한 뒤 Run query를 눌러 실행한다. 같은 제품 안에서도 대시보드 필터와 탐색 query의 적용 방식이 다르다. [Variables](https://grafana.com/docs/learning-paths/interactive-dashboards/use-variables-queries/) · [Explore](https://grafana.com/docs/grafana/latest/visualizations/explore/get-started-with-explore/) |
| Kibana / Elastic | Discover의 검색 query·filter와 time filter를 검색 막대에서 조합하고, 저장된 search는 query 및 filter 구성의 재사용에 쓰인다. 이 저장 search는 “최근 조건만 draft로 가져오기”와 같지 않으므로 reopen 시 실행 여부를 플랫폼이 명시해야 한다. [Filtering](https://www.elastic.co/docs/explore-analyze/query-filter/filtering) · [Save and open search](https://www.elastic.co/guide/en/kibana/current/save-open-search.html) |
| Looker | Explore에서 필터·측정값을 편집한 뒤 Run으로 실행하는 명시적 단계가 있다. [Explore filters](https://docs.cloud.google.com/looker/docs/filtering-and-limiting-new-explore-experience) |
| Power BI | Filter pane에는 Apply filter changes 토글이 있어 변경분을 모아 한 번에 반영할 수 있다. 기본값은 즉시 적용이며, Apply 방식은 사용자가 명시적으로 켠다. [Filter pane](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-report-filter) |
| Tableau | 다중값 list/dropdown filter에 Show Apply Button을 켜면 수정 중 값이 pending으로 표시되고 Apply에서 반영된다. 여러 선택을 쿼리마다 실행하지 않고 batch하는 성능 이점도 설명한다. [Filters](https://help.tableau.com/current/pro/desktop/en-us/filtering.htm) · [Performance checklist](https://help.tableau.com/current/pro/desktop/en-us/perf_checklist.htm) |
| Metabase | Dashboard filter는 기본 자동 적용이다. 필요하면 자동 적용을 꺼서 Apply를 요구할 수 있으며, required filter와 기본값도 설정할 수 있다. [Dashboard filters](https://www.metabase.com/docs/latest/dashboards/filters) |
| Superset | Dashboard native filters는 대시보드에서 차트의 공통 필터로 쓰고, Explore는 쿼리/차트 변경 뒤 Run으로 새 결과를 요청한다. 두 영역의 filter 목적이 다르다. [Dashboard quickstart](https://superset.apache.org/docs/using-superset/creating-your-first-dashboard/) · [Explore data](https://superset.apache.org/docs/using-superset/exploring-data/) |
| Datadog | Template variable은 현재 대시보드의 widget query를 scope/filter하는 대시보드 조작이다. 명시적 query builder Run 버튼과는 다르다. [Template variables](https://docs.datadoghq.com/dashboards/template_variables/) |
| Carbon / Atlassian | Carbon은 즉시 적용과 Apply로 변경분을 모으는 filter 방식 모두를 설명한다. Atlassian filter component는 필터 조건을 표시·조합하는 형태를 제공하므로 적용을 한 번에 확정하는 것은 상위 화면이 결정한다. [Carbon filtering](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering) · [Atlassian filter](https://atlassian.design/components/filter/) |

### 우리 플랫폼에 맞는 형태

모든 조건은 page-owned `draft`로 편집하고, Apply 한 번에 query를 한 번만 보낸다. Reset은 draft를 기본 조건으로 돌리고, Revert/취소는 마지막으로 실제 적용된 조건으로 되돌린다. 변경 상태는 collapsed summary에도 남긴다. Tableau, Carbon, Power BI는 pending 상태 또는 deferred Apply 사례를 제공하고, Metabase는 자동 Apply도 허용하므로, MARS의 한 번 실행은 issue 요구에 맞춘 플랫폼 선택이다. [Tableau](https://help.tableau.com/current/pro/desktop/en-us/filtering.htm) · [Carbon](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering) · [PageFilterBar](../../packages/sdk/components/src/filters/PageFilterBar.tsx)

`PageFilterBar`는 consumer가 fields/actions를 주고 `onApply`를 전달하면 submit form을 만든다. `custom` field는 arbitrary control 슬롯이다. 접힌 summary에는 모든 조건과 `hasPendingChanges` 표시도 consumer가 공급한다. 따라서 현재 shared part를 조합해 query owner를 소비자에 둘 수 있으나, Multi-select와 validation/disabled-reason UI를 primitive API로 제공하지는 않는다. [PageFilterBar](../../packages/sdk/components/src/filters/PageFilterBar.tsx)

필수 조건이 빠졌으면 Apply는 disabled이고, 버튼 가까이에 누락된 조건의 구체적 이유를 보여 주며, 각 입력도 오류와 보조 설명으로 연결한다. 누락 사유를 hover tooltip에만 두면 키보드/터치 사용자에게 원인이 감춰진다. 조회 상태는 “아직 조회하지 않음”, “조회 중”, “결과 없음”, “권한/오류/timeout”을 구분한다. 첫 상태를 loading이나 empty로 재사용하면 요청 전과 요청 후 결과가 같아 보인다. `QueryView`는 서버 응답의 loading과 empty/error 같은 outcome을 구분하므로 query page는 여기에 pre-run idle 상태 하나를 추가하는 편이 맞다. [StateView / QueryView](../../packages/sdk/components/src/StateView.tsx) · [PageFilterBar](../../packages/sdk/components/src/filters/PageFilterBar.tsx)

날짜가 Global Context인지 page query 조건인지는 적용 경계를 정해야 한다. 현재 `GlobalContextBar`는 변경을 Apply할 때 `setGlobal()`로 URL/global context를 즉시 바꾸고, 조건 편집기는 한 axis와 한 value를 다룬다. MARS draft 편집 도중 이를 수정하면 query 실행 전부터 다른 메뉴의 Context가 바뀔 수 있다. MARS 날짜가 Global Context의 공유 기간이라면 Apply 시점에만 승격하고, 아니면 page-local query로 유지한다. [GlobalContextBar](../../packages/sdk/shell/src/context/GlobalContextBar.tsx) · [시간 및 Context 계약](../contract/platform-ui-contract.md)

## 질문 3: 최근 Query History와 복귀 동작

Grafana Explore query history는 최근 2주 이력을 최신 순으로 보여 주고 query를 다시 실행할 수 있게 한다. Looker User History는 최근 query 내역과 실행 시간, Explore/query 구성을 표시한다. 이 두 사례는 시간순 이력을 보여 주지만, frequency로 정렬하는 것이 모든 제품에 공통인 패턴은 아니다. Kibana saved search는 query, filters와 결과 구성 등을 저장해 다시 열 수 있으므로, “최근 조건을 draft로 복사”보다 더 넓은 복원 범위다. [Grafana Query History](https://grafana.com/docs/grafana/latest/visualizations/explore/query-management/) · [Looker User History](https://docs.cloud.google.com/looker/docs/user-history) · [Kibana Save search](https://www.elastic.co/guide/en/kibana/current/save-open-search.html)

Issue #554의 결정사항에 맞춰 저장량은 20개, 노출은 최근 10개로 제한하고, history 선택은 조건만 draft로 채운 뒤 자동 실행하지 않는다. 재방문 시 마지막 실제 Apply 조건을 editable draft로 복구하지만 이전 result payload는 복구하지 않는다. 이는 같은 제품의 보편 규칙이 아니라 이 MARS 작업의 요구다. 빈도가 실제 조회 event로 검증 가능할 때만 보조 정보로 보여 주고, 기본 정렬은 시간순으로 유지한다. [#554 정책 코멘트](https://github.com/hjung3113/analytics-platform/issues/554) · [Grafana Query History](https://grafana.com/docs/grafana/latest/visualizations/explore/query-management/) · [Looker User History](https://docs.cloud.google.com/looker/docs/user-history)

## 질문 4: Date preset과 end-exclusive 범위

Grafana는 “Last 7 days”, “Today so far” 같은 상대 범위와 absolute range를 제공한다. Power BI Relative date slicer는 Today, Last N days 등의 선택을 제공하며 현재 날짜를 기준으로 상대 범위를 계산한다. Tableau는 상대 기간의 기간 단위 경계가 달라질 수 있음을 설명한다. 그러므로 “지난 7일”이 오늘 포함인지, 완료된 7개 달력일인지 label만으로 추론하게 두면 안 된다. [Grafana time range](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/) · [Power BI relative date](https://learn.microsoft.com/en-us/power-bi/visuals/desktop-slicer-filter-date-range) · [Tableau relative date](https://help.tableau.com/current/pro/desktop/en-gb/qs_relative_dates.htm)

우리 계약에서 공통 조회 구간은 naive 설비 wall-clock 기준의 half-open `[from, to)`다. 이 경계에서는 끝 시각과 같은 값은 제외되어 연속된 구간끼리 중복되지 않는다. “오늘”은 사업장 날짜의 시작부터 다음 날 시작 직전까지, 단일 기준일도 `[D 00:00, D+1 00:00)`로 요청한다. “최근 N일”은 prototype에서 기준을 명확히 표시한다. 예를 들어 오늘 포함 N개 달력일이면 `[today−(N−1) at 00:00, tomorrow at 00:00)`이다. 실제 MARS wall-clock domain이 다중 사업장으로 확대되면 같은 날짜의 의미는 open domain decision이므로 단일 고정 timezone으로 추정하지 않는다. [시간 계약](../contract/platform-ui-contract.md) · [Grafana time range](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/)

## Prototype 후보

**A — 한 줄 필터 + 단일 Apply:** 기간 preset, 기준일/직접 기간, 다중 Equipment 검색, Maker/Module 조건과 Query History를 한 filter bar에 둔다. 필요한 조건이 빠지면 disabled Apply 바로 옆에 이유를 표시하고, bar 하단 summary에 draft 변경 상태를 노출한다. 화면 공간을 덜 쓰고 상태가 한 곳에 모이지만, 넓은 Multi-select와 많은 조건이 한 줄에서 경쟁한다. [PageFilterBar](../../packages/sdk/components/src/filters/PageFilterBar.tsx) · [Carbon filtering](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering)

**B — 날짜/Context 줄 + 분석 조건 줄:** 날짜를 Global Context 또는 page query 중 하나로 결정해 첫 줄에 두고, Equipment/Maker/Module, History, Reset을 두 번째 줄에 둔다. 두 줄 모두 같은 draft 소유자와 Apply에 연결한다. 조건 의미가 계층화되고 긴 다중 선택이 넓어지지만, 날짜를 page draft에서 전역 Context로 승격하는 시점을 명시해야 한다. [GlobalContextBar](../../packages/sdk/shell/src/context/GlobalContextBar.tsx) · [Looker Explore filters](https://docs.cloud.google.com/looker/docs/filtering-and-limiting-new-explore-experience)

**C — 요약형 bar + full-screen 고급 조건:** 기본 화면에서는 적용 조건을 chips/`N개 선택`과 dirty 상태로 요약하고, 고급 편집 panel에서 검색·paging·조건별 validation을 보여 준다. Save/Apply가 조건 draft를 확정하고, 취소는 마지막 Apply로 되돌린다. 긴 목록과 작은 화면에서 여유가 있지만 요약을 열고 닫는 단계가 추가되고, selection summary가 모든 조건을 빠짐없이 담아야 한다. [Primer SelectPanel](https://primer.style/product/components/select-panel/) · [MUI Autocomplete](https://mui.com/material-ui/react-autocomplete/)
