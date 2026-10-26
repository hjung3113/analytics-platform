# 깊은 드릴·고밀도 작업공간 패턴 조사 — 2026-10-23

#690 slice 0(prototype 전 패턴 조사)이다. 2026-10-21 query-bar 조사([같은 폴더 문서](2026-10-21-query-bar-patterns.md))와 같은 형식을 따른다. 아래 출처 표에 적은 페이지를 2026-10-23에 직접 열어 확인했고, 열지 않은 것은 `미확인`으로 표시한다. 제품별 UI는 해당 제품의 선택일 뿐 플랫폼 규칙으로 복사하지 않는다.

## 출처

| 출처 | 확인 범위 |
| --- | --- |
| [WAI-ARIA APG Accordion](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) | header=button+heading 구조, `aria-expanded`/`aria-controls`, Enter/Space, single-open 변형, `region` role 남용 경고 |
| [Dockview Paneview overview](https://dockview.dev/docs/other/paneview/overview/), [options](https://dockview.dev/docs/api/paneview/options) | "collapsible·resizable pane의 수직 스택" 정의 문장. options/API 페이지는 렌더러 이후 채워지는 타입 문서라 본문이 비어 보임 — 세부 옵션 `미확인` |
| [Dockview Splitview overview](https://dockview.dev/docs/other/splitview/overview/) | Splitview가 Dockview의 기본 분할 컨테이너이고 Dockview가 nested splitview의 집합이라는 정의 문장 |
| [Dockview Gridview overview](https://dockview.dev/docs/other/gridview/overview/) | "탭·드래그 없는 resizable grid"라는 Gridview 정의 문장 |
| [Dockview Licensing](https://dockview.dev/docs/overview/licence/) | 무료/Enterprise 기능 표 전체(아래 질문 4에서 인용) |
| [VS Code User interface](https://code.visualstudio.com/docs/getstarted/userinterface) | Side Bar/Panel/Activity Bar 구조, view 열기·숨기기·재정렬, Quick Open, 트리 find/filter, 탭 목록 넘침 처리 |
| [VS Code Custom layout](https://code.visualstudio.com/docs/configure/custom-layout) | Move View/Move Focused View 키보드 이동, Reset View Locations, pinned tabs, locked editor group, 그룹 최대화 |
| [JetBrains Tool windows](https://www.jetbrains.com/help/idea/tool-windows.html) | tool window 바·아이콘, 창별 단축키(Alt+1…), 숨김/전환 키, 머리 옵션 메뉴, 탭 묶음 |
| [JetBrains Tool window layouts](https://www.jetbrains.com/help/idea/tool-window-layouts.html) | 이름 있는 layout 저장·적용, 편집 불가 Default, Shift+F12 복원, Ctrl+` 빠른 전환 |
| [JetBrains Viewing modes](https://www.jetbrains.com/help/idea/viewing-modes.html) | Dock Pinned / Dock Unpinned / Undock / Float / Window 5모드 |
| [Grafana Panel editor](https://grafana.com/docs/grafana/latest/panels-visualizations/panel-editor-overview/) | 오른쪽 display options 탭 구성, 미리보기+Back/Discard/Save, Data 탭 |
| [Grafana Panel overview](https://grafana.com/docs/grafana/next/visualizations/panels-visualizations/panel-overview) | panel menu(View/Edit/Inspect), View panel 사이드바(quick toggle, fan-out, `fanout` URL), `v`/`e` 단축키, 패널 시간 pan/zoom |
| [Grafana Modify dashboard settings](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/modify-dashboard-settings) | 대시보드 전체 graphTooltip 3단계(Default/Shared crosshair/Shared tooltip) |
| [Grafana Version history](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-version-history/) | 저장 시점 버전 보존(기본 20), 버전 diff 비교, restore |
| [Carbon Accordion](https://carbondesignsystem.com/components/accordion/usage/) | 다중 열림 기본, 전체 스크롤 원칙(패널 내부 스크롤 금지), side panel flush 정렬, 트리뷰 구분 |
| [Adobe Spectrum Accordion](https://react-spectrum.adobe.com/react-spectrum/Accordion.html) | 기본 single-expanded, `allowsMultipleExpanded`, controlled `expandedKeys` Set |
| [Figma 오른쪽 properties panel](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar) | 선택 기반 속성 그룹, Design/Prototype 탭, 보기 전용 Properties 탭 |
| [Atlassian Accordion](https://atlassian.design/components/accordion/usage) | 404 — 공개 컴포넌트에 Accordion 없음(이 URL 확인 기준, 컴포넌트 목록 전체 대조는 `미확인`) |
| [Kibana 대시보드 사용](https://www.elastic.co/docs/explore-analyze/dashboards/using) | 차트 클릭→필터 pill이 대시보드 전체 적용, legend filter, 패널별 시간 범위, full screen·Maximize, 링크에 최대화 상태 보존 |
| [Tableau 계층](https://help.tableau.com/current/pro/desktop/en-us/qs_hierarchies.htm) | viz 안 `+`/`-` 아이콘으로 계층 레벨 추가·제거 |
| [Power BI Drill mode](https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-drill) | 4개 drill 아이콘, expand(문맥 유지) vs next level(교체), drill 모드 off 시 클릭=cross-filter, drill vs drillthrough 구분 |
| [Power BI 보기/focus mode](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-focus) | focus mode가 visual을 캔버스에 채우며 Filters pane 유지, 필터 자동 저장·Reset, full screen과 구분 |
| [Looker Viewing dashboards](https://docs.cloud.google.com/looker/docs/viewing-dashboards) | drill overlay·drill menu 동작, overlay에 적용 필터 표시, tile Expanded overlay(이전/다음 순환), cross-filter 존재 |
| [Excel Freeze panes](https://support.microsoft.com/en-us/office/freeze-panes-to-lock-rows-and-columns-dab2ffc9-020d-4026-8121-67dd25f2508f) | 선택 셀 기준 위 행·왼쪽 열 고정, Split은 같은 시트의 별개 창 |
| [Datadog Widget configuration](https://docs.datadoghq.com/dashboards/widgets/configuration.md) | widget full screen, global time selector(위젯 시간 동기화), split graph, widget 내보내기 |
| [Superset 첫 대시보드](https://superset.apache.org/docs/using-superset/creating-your-first-dashboard/) | 편집 모드 격자 스냅 리사이즈, `standalone`/`show_filters`/`expand_filters` URL 파라미터 |
| [Metabase 대시보드](https://www.metabase.com/docs/latest/dashboards/introduction) | 격자 위 카드 배치, 탭, 여러 question에 같은 필터 위젯 적용 |
| 이 레포: [PanelWorkspace](../../packages/components/src/workspace/PanelWorkspace.tsx), [workspaceState](../../packages/components/src/workspace/workspaceState.ts), [workspaceRows](../../packages/components/src/workspace/workspaceRows.ts) | panels/presets/compact·숨김·기본 배치·fit/stack 모델, primary 보호 |
| 이 레포: [AnalysisLayout](../../packages/components/src/AnalysisLayout.tsx), [PageFilterBar](../../packages/components/src/PageFilterBar.tsx), [LegendTree](../../packages/components/src/chart/LegendTree.tsx), [DrillLayout](../../packages/components/src/DrillLayout.tsx) | 섹션 접기·칩 복원·밀도 열수, 접힘 요약·draft apply, 계층 체크/선택/정렬, 드릴 경로 바·형제 메뉴·4단계 칩 축약 |
| 이 레포: [dock/dockTypes](../../packages/components/src/dock/dockTypes.ts), [dock/schema·commands](../../packages/components/src/dock/schema.ts) | 스키마 v1 트리, separator 키보드, 그룹 액션 슬롯, stackBelow, DockRows |
| 이 레포: [ADR-0063](../../docs/adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md), [ADR-0067](../../docs/adr/0067-dockview-layout-engine-board-v2.md), [ADR-0075](../../docs/adr/0075-page-head-one-line-fold-thin-outcome-strip.md), [ADR-0077](../../docs/adr/0077-workspace-stack-mode-rows-keep-own-height.md) | 상한 없는 드릴+차트 조각, 무료 Dockview 엔진·명령·저장 계약, fill 머리 접기, 쌓기 줄 모델 |

## 질문 1: 다수 보조 섹션의 Inspector/Accordion 스택

### 출처 비교

| 제품/패턴 | 관찰 |
| --- | --- |
| WAI-ARIA APG | 헤더는 `role=heading` 안의 버튼 하나이고 `aria-expanded`·`aria-controls`를 요구한다. single-open 구현은 다른 패널을 자동으로 접을 수 있고, 항상 보이는 보조 요소(섹션 동작 menubutton, 숨은 내용 요약)는 헤더 바로 옆에 둘 수 있다. 동시에 펼칠 수 있는 패널이 약 6개를 넘으면 `region` role을 쓰지 말라고 한다(landmark 남용). [APG Accordion](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) |
| Dockview Paneview | Paneview는 "머리와 접히는 본문을 가진 pane의 수직 스택"으로, Splitview의 특수형이다. 문서 페이지 자체는 정의 문장 하나뿐이고 옵션 표는 이 환경에서 비어 보여 세부 API는 확인하지 못했다. [Paneview overview](https://dockview.dev/docs/other/paneview/overview/) |
| VS Code | Side Bar의 view들은 Activity Bar 아이콘으로 전환하고, 오른쪽 클릭으로 숨기기·재정렬을 하며, **View: Open View** 명령으로 이름 검색으로 열 수 있다. 트리 view에는 `list.find` 필터(강조/필터 2모드 + fuzzy)가 공통 제공된다. [User interface](https://code.visualstudio.com/docs/getstarted/userinterface) |
| JetBrains | tool window 머리의 옵션 메뉴에서 view mode·위치를 바꾸고, 하나의 tool window가 탭 또는 드롭다운으로 여러 view를 담는다(Group Tabs). 창마다 Alt+1…9 단축키가 있고 F12로 마지막 tool window로 돌아온다. [Tool windows](https://www.jetbrains.com/help/idea/tool-windows.html) |
| Grafana 패널 편집기 | 오른쪽 pane이 display options 영역이고, 시각화 선택 후 탭 구성으로 옵션을 쌓는다. 패널 스타일은 live preview 카드로 선택하며, 미리보기 위에 Back/Discard/Save가 있다. [Panel editor](https://grafana.com/docs/grafana/latest/panels-visualizations/panel-editor-overview/) |
| Figma | 오른쪽 properties panel은 선택된 레이어에 따라 속성 그룹(alignment, fill, stroke, export 등)을 보여 주고 Design/Prototype 탭으로 나뉜다. 속성 라벨 표시는 옵션이다. [Figma Help](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar) |
| Carbon | 기본은 모두 접힘이고 섹션을 독립적으로 여러 개 열 수 있다(다중 열림 기본). **본문이 길면 아코디언 전체가 스크롤하고 개별 패널 안에서는 스크롤하지 않는다.** side panel 안에서는 flush 정렬을 권하고, 중첩 정보는 트리뷰로 보낸다. [Carbon Accordion](https://carbondesignsystem.com/components/accordion/usage/) |
| Adobe Spectrum | 기본 single-expanded이고 `allowsMultipleExpanded`로 다중 열림으로 바꾼다. 확장 상태는 `expandedKeys: Set` + `onExpandedChange`로 항목 id 기준 controlled이다. [Spectrum Accordion](https://react-spectrum.adobe.com/react-spectrum/Accordion.html) |
| Atlassian | `atlassian.design/components/accordion/usage`는 404였다. 이 URL 기준 공개 Accordion 컴포넌트가 없다(컴포넌트 목록 전체 대조는 미확인). [404 확인](https://atlassian.design/components/accordion/usage) |
| GitHub Primer | 일반 용도의 Accordion은 검색에서 확인되지 않았고(페이지 미열람, `미확인`), brand 패키지의 마케팅용 River accordion만 검색된다. [검색 결과](https://github.com/primer/react) |

### 이 레포의 현재 위치

`PageFilterBar` 접힘 요약(ADR-0029)과 `AnalysisLayout` 섹션 접기·칩 복원·메뉴별 기억이 "접힌 머리에 상태 요약"을 이미 커버한다 — 없는 것은 섹션별 높이 조절·내부 스크롤·multiple/single 정책·`오류 N/미적용 N` 요약을 한 부품으로 묶은 스택이다.

### 플랫폼 추론

관찰(사실): 다중 열림이 기본인 제품(Carbon)과 single-open 기본인 제품(Spectrum)이 공존하고, 둘 다 controlled Set/id 기반 확장 상태를 쓴다. APG는 확장 상태 표기(`aria-expanded`)와 보조 요소의 헤더 병치를 요구하고, 섹션 수가 많으면 `region`을 줄인다. Carbon은 패널 내부 스크롤을 금지한다.

추론(우리 설계 후보): `multiple-open` 기본 + `single-open` 선택은 양쪽 근거가 있으므로 prop 정책이 맞다. 접혀도 `선택 N/오류 N/미적용 N` 요약은 APG가 허용하는 "헤더 옆 항상 보이는 snippet"이다. Carbon 원칙을 따르면 섹션별 내부 스크롤보다 스택 전체 스크롤이 기본이고, 섹션 높이 고정(Paneview식 resize)은 예외 경로가 된다. 계층 데이터는 LegendTree를 유지한다(Carbon도 중첩은 트리뷰로 보낸다).

## 질문 2: 문맥+상세 동시 비교(드릴 중 상위 차트 유지)

### 출처 비교

| 제품 | 관찰 |
| --- | --- |
| Dockview Splitview | Splitview는 Dockview를 이루는 기본 분할 컨테이너이고 Dockview는 nested splitview의 집합이다. 즉 "나란히 고정 + 경계 리사이즈"는 엔진 기본 능력이다. [Splitview overview](https://dockview.dev/docs/other/splitview/overview/) |
| Grafana | 대시보드 설정의 graphTooltip 3단계: Default / **Shared crosshair**(모든 그래프 패널에 십자선 동시 표시) / **Shared tooltip**(십자선+툴팁 동시 표시). 대시보드 전역 선택이다. [Modify dashboard settings](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/modify-dashboard-settings) |
| Kibana | 차트 요소 클릭은 필터 pill을 만들어 **대시보드 전체**에 적용한다("주변 패널도 같이 반영"). legend에서 Filter for/out, pill은 앱 가로 pinned 가능, 패널별 사용자 지정 시간 범위는 패널 머리에 표시된다. [Inspect and filter a dashboard](https://www.elastic.co/docs/explore-analyze/dashboards/using) |
| Tableau | 계층 필드의 `+`/`-` 아이콘으로 viz 안에서 레벨을 추가·제거한다. 같은 viz를 다음 레벨로 교체하는 모델이고 나란히 두는 것은 별도 기능이 아니다. [Create Hierarchies](https://help.tableau.com/current/pro/desktop/en-us/qs_hierarchies.htm) |
| Power BI | drill 모드: 한 점 drill down / 전체 next level(교체) / **expand all(현재 레벨을 문맥으로 유지하며 다음 레벨 추가)**. drill 모드 off 상태의 클릭은 다른 visual을 cross-filter한다. drill은 같은 visual 내부, drillthrough는 다른 페이지다. drill은 기본적으로 다른 visual을 바꾸지 않는다. [Drill mode](https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-drill) |
| Looker | 데이터 점 클릭 → drill overlay가 자동으로 열리거나 drill menu가 열리고, overlay에는 원래 쿼리 필터와 클릭에서 생긴 필터가 모두 표시된다. overlay 안에서 추가 drill이 가능하다. tile의 Expanded는 대시보드 위 overlay로 이전/다음 화살표로 tile들을 순환한다. [Viewing dashboards](https://docs.cloud.google.com/looker/docs/viewing-dashboards) |
| Excel | Freeze Panes는 선택 셀 기준 위 행·왼쪽 열을 고정해 스크롤과 무관한 문맥을 만들고, Split은 같은 시트의 별개 스크롤 창을 만든다. [Freeze panes](https://support.microsoft.com/en-us/office/freeze-panes-to-lock-rows-and-columns-dab2ffc9-020d-4026-8121-67dd25f2508f) |
| Datadog | global time selector가 `Global Time` 위젯들의 시간을 동기화하고, split graph로 하나의 그래프를 태그 값별로 쪼갠다. [Widget configuration](https://docs.datadoghq.com/dashboards/widgets/configuration.md) |

### 이 레포의 현재 위치

`useDrill`/`DrillPath`(ADR-0063, 단계 상한 없음)와 `ReturnLink`가 "문맥을 잃지 않는" URL 축을 소유하고 `DetailDrawer`가 단일 상세 슬롯(ADR-0047/0049)을 준다 — 없는 것은 상위 차트를 옆에 고정한 pair와 두 view 사이 stable rowId 동기화 계약이다.

### 플랫폼 추론

관찰(사실): 업계의 "동기화"는 세 종류로 갈린다 — ① 표시 동기화(Grafana shared crosshair, 대시보드 전역 설정), ② 선택 전파(Kibana pill·Power BI cross-filter, 클릭이 다른 패널의 필터가 됨), ③ 문맥 고정(Excel freeze, Power BI expand, Looker overlay의 필터 표시). Tableau처럼 레벨 교체만 하는 제품은 나란히 비교를 기능으로 제공하지 않는다.

추론(우리 설계 후보): ② 선택 전파가 MARS 드릴의 핵심이다(부모 선택이 상세를 결정). 이때 전파 대상은 화면이 아니라 `syncGroupId`로 묶인 선언적 pair여야 하고, ① crosshair 동기화는 차트 프레임 레벨의 opt-in으로 남는다. Grafana가 전역 토글로 한 것을 메뉴 선언으로 내리는 이유는 보드 칸마다 pair가 따로 존재할 수 있기 때문이다(ADR-0049 칸 소유 Context). Looker처럼 overlay에 적용 필터를 명시하는 것은 조회 revision 계약(#690 §6)과 직결된다.

## 질문 3: 항상 보이는 고밀도 개요 그리드(6–12 패널)

### 출처 비교

| 제품 | 관찰 |
| --- | --- |
| Dockview Gridview | Gridview는 "탭과 드래그 앤 드롭 없는 resizable grid"로 정의된다. 즉 탭 없는 동시 표시는 Dockview 안의 별도 컴포넌트 경로다. [Gridview overview](https://dockview.dev/docs/other/gridview/overview/) |
| Grafana | 패널은 격자 위에서 drag·drop·resize된다. panel menu의 **View**는 패널을 전체 화면으로 보고 View panel 사이드바(quick toggle, **fan-out: 시리즈/라벨별로 한 그래프를 여러 패널로 분리**, `fanout` URL 파라미터 공유)를 제공하며, 편집 권한 없이 쓰고 저장된 대시보드를 바꾸지 않는다. `v`로 전환. [Panel overview](https://grafana.com/docs/grafana/next/visualizations/panels-visualizations/panel-overview) |
| Kibana | 대시보드 full screen 모드와 패널 menu의 **Maximize**가 있고, 최대화 상태에서 만든 공유 링크는 같은 최대화 상태로 열린다. [Inspect and filter a dashboard](https://www.elastic.co/docs/explore-analyze/dashboards/using) |
| Power BI | focus mode는 visual을 캔버스에 채우되 **Filters pane은 접근 가능하게 유지**하고, 필터 변경은 자동 저장되며 Reset to default로 버린다. full screen과 별개다. [보기/focus mode](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-focus) |
| Datadog | 위젯 full screen에서 시간 이동·내보내기가 되고, split graph로 태그 값별 분할 비교를 격자 안에서 제공한다. [Widget configuration](https://docs.datadoghq.com/dashboards/widgets/configuration.md) |
| Superset | 편집 모드에서 차트 모서리를 끌어 격자에 스냅 리사이즈한다. `standalone`, `show_filters`, `expand_filters` URL 파라미터로 표시를 조정한다. [첫 대시보드](https://superset.apache.org/docs/using-superset/creating-your-first-dashboard/) |
| Metabase | 대시보드는 격자 위 카드 집합이고 탭을 가지며, 하나의 필터 위젯이 여러 question에 동일 적용된다. [대시보드](https://www.metabase.com/docs/latest/dashboards/introduction) |

### 이 레포의 현재 위치

`AnalysisLayout` compact 밀도(컨테이너 폭 1–4열 CSS grid)와 `PanelWorkspace` 프리셋·`숨긴 패널 n` 표시·ADR-0077 쌓기가 상시 다중 패널을 부분 커버한다 — 없는 것은 탭 없이 늘 보이는 그리드의 패널별 focus→원위치(Grafana View식)와 숨은 패널의 상태 알림(오류·이상 표식)이다.

### 플랫폼 추론

관찰(사실): 모든 제품의 격자는 "항상 보임"이 기본이고 집중은 임시 상태다. Grafana/Kibana/Power BI 모두 집중 모드의 변경이 저장된 레이아웃을 바꾸지 않으며(저장은 명시), Power BI는 집중 중에도 필터 pane을 남겨 문맥 유지를 강제한다. Grafana fan-out은 하나의 쿼리를 격자 확장으로 비교하는 패턴이다.

추론(우리 설계 후보): `dense` 모드의 집중은 "보드 칸 최대화"와 달리 **복귀가 보장된 임시 오버레이/확장**이어야 하고 최소 차트 높이(320px, 06 §12.8과 일치)를 격자가 지킨다. 숨은 탭 상태 알림은 이미 있는 `숨긴 패널 n` 카운트를 오류/이상 표식으로 확장하는 방향이고, fan-out은 새 기능이 아니라 추세 차트 `size: fill` 위 recipe로 검증할 가치가 있다.

## 질문 4: 패널 급증 작업공간의 고급 UX(peek·검색·undo·보호·키보드)

### 출처 비교

| 제품 | 관찰 |
| --- | --- |
| Dockview 라이선스 표 | **Enterprise 전용**: advanced overflow(검색+최근 사용 정렬), multi-row tabs, pinned tabs, DnD compass, smart guides, auto-hide edge groups, dock-to-edge groups, layout history, spatial keyboard navigation, keyboard docking. **무료**: locked groups/panels, edge groups, custom drop overlay, tab overflow menu, maximize, popout windows, save/restore, ARIA·스크린리더·포커스 표시. [Licensing](https://dockview.dev/docs/overview/licence/) |
| VS Code | **View: Move View / Move Focused View** 명령으로 대상과 목적지를 드롭다운에서 골라 마우스 없이 view를 옮긴다. **View: Reset View Locations**로 기본 위치 복원. pinned tab은 항상 앞에 있고 넘침으로 밀려나지 않으며 Close All에도 닫히지 않는다(shrink/compact 표시, 별도 행 옵션). **locked editor group**은 새 편집기가 그 그룹에 열리지 않게 막고 상태를 복원한다. [Custom layout](https://code.visualstudio.com/docs/configure/custom-layout) |
| VS Code view 전환 | Activity Bar 우클릭으로 view 표시/숨김·재정렬, **View: Open View** 명령 검색, 트리 `list.find` 필터가 view 탐색의 검색 경로다. [User interface](https://code.visualstudio.com/docs/getstarted/userinterface) |
| JetBrains | view mode 5종 — Dock Pinned(항상 보임) / **Dock Unpinned(활성일 때만 보임)** / Undock(활성일 때 편집기를 덮음) / Float / Window. layout은 이름 붙여 저장·적용하고, 편집 불가인 **Default layout이 Shift+F12 한 번의 복원점**이며 Ctrl+` 빠른 전환에 Layout이 있다. [Viewing modes](https://www.jetbrains.com/help/idea/viewing-modes.html) · [Layouts](https://www.jetbrains.com/help/idea/tool-window-layouts.html) |
| JetBrains 패널 이동 | 창별 단축키(Alt+1…), Shift+Escape 숨김, F12 마지막 tool window, Ctrl+Shift+F12 전체 숨김/복원, Stretch to Left/Right/Top/Bottom 크기 조절 단축키. [Tool windows](https://www.jetbrains.com/help/idea/tool-windows.html) |
| Grafana | 레이아웃 undo는 없고 **저장 시점 버전 히스토리**(기본 20, diff 비교, restore는 새 버전 생성)가 복구 수단이다. [Version history](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-version-history/) |

### 이 레포의 현재 위치

`DockLayout` 스키마·명령·`기본 배치`(resetLayout)·separator 키보드(ADR-0067 결정 8)·칸 `⋯` 메뉴(Shift+F10)가 무료 엔진 위의 대체 토대다 — 없는 것은 bounded undo/redo, 검색형 패널 전환기, peek/auto-hide rail, primary 외 패널 보호(`hidePanel`은 primary만 보호)다.

### 플랫폼 추론

관찰(사실): Dockview 기준 필요한 고급 UX의 상당 부분(pinned tabs, 검색 overflow, auto-hide, layout history, keyboard docking)이 유료 기능으로 분리되어 있고, 무료로 남은 것은 locked groups·custom drop overlay·overflow menu·프로그래밍 이동이다. 두 IDE는 키보드 이동을 "명령 + 목적지 선택"으로 풀고(드래그의 키보드 사본), 복원은 "편집 불가 Default 하나"(JetBrains) 또는 "위치 초기화 명령"(VS Code)으로 단순화한다. peek에 해당하는 것은 JetBrains Dock Unpinned(활성일 때만 보임)다.

추론(우리 설계 후보): 라이선스 표의 Enterprise 기능 이름을 그대로 SDK에 옮기지 않고, ① undo는 bounded 명령 히스토리(데이터 조회 undo와 분리 — Grafana가 저장 시점 히스토리로만 푼 것과 달리 세션 내 편집 undo는 IDE의 몫), ② 보호는 무료 `locked groups` 성격을 `primary` 확장으로, ③ peek는 Dock Unpinned 모델의 단일 rail로, ④ 패널 검색은 이미 있는 `WorkspaceCommandsHost`+registry로 각각 무료로 만드는 경로가 이슈 표의 P1과 맞는다. 이 네 가지는 모두 "명령+선언" 조합이라 엔진 fork 없이 가능하다는 것이 관찰의 요지다.

## Prototype 후보

각 질문에서 실제 앱 위 `?variant=`로 검증할 후보. 컨펌은 아티팩트 링크로 받는다(AGENTS.md UI 절차).

**질문 1 — InspectorStack:**
- **A `inspector-multi`**: 다중 열림 기본 스택, 접힌 머리에 `선택 N/오류 N/미적용 N` 요약 상시, 스택 전체 스크롤(Carbon 원칙). 사이클타임 조회 조건+대상+계층 트리를 섹션으로.
- **B `inspector-single`**: 같은 데이터를 single-open + 머리 요약으로. A와 화면 점유·탐색 클릭 수 비교.
- **C `inspector-rail`**: 접으면 섹션 요약만 남는 좁은 rail(1440×900에서 작업 영역 폭 변화 측정).

**질문 2 — ContextDetailPair:**
- **A `pair-split`**: 상위 문맥 차트와 하위 상세를 고정 split으로, 클릭 rowId가 양쪽 하이라이트·스크롤 앵커에 전파.
- **B `pair-frozen`**: 문맥은 접힌 요약 행(Excel freeze식) + 상세만 넓게. A와 문맥 유지감 비교.
- **C `pair-overlay`**: 상위 전체를 남기고 상세를 overlay로 열기(Looker drill overlay식, 뒤로가기=닫기). URL 복귀 계약(ADR-0063)과의 충돌 확인.

**질문 3 — OverviewGrid:**
- **A `dense-six`**: 6패널 탭 없는 격자, 최소 차트 높이 320px 유지, 패널 메뉴 `집중`→원위치(저장 안 함).
- **B `dense-stack`**: 같은 6패널을 ADR-0077 쌓기로. 스크롤 대비 동시 관찰성 비교.
- **C `dense-fanout`**: 추세 1개를 fan-out으로 시리즈별 격자 확장(Grafana식). 기존 `AnalysisChart` 재사용 범위 확인.

**질문 4 — AdvancedWorkspaceActions:**
- **A `peek-rail`**: 좌측 rail 접기 + hover peek(JetBrains Dock Unpinned 모델). 펼침/숨김이 조회를 일으키지 않음을 확인.
- **B `panel-search`**: 명령 팔레트형 패널 전환기(최근 사용 순, 접근 가능 패널만). `숨긴 패널 n`과의 통합 위치 확인.
- **C `layout-undo`**: bounded 편집 undo/redo + `기본 배치` 복원 공존. resize coalesce와 재조회 0(ADR-0067 수용 기준) 확인.
