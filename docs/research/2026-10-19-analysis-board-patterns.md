# 분석 보드 화면 패턴 조사 (#421 프로토타입 전)

확인일: 2026-10-19. 제품 공식 문서와 디자인 시스템 1차 출처만 사용했다. 인용문은 모두 해당 URL에서 실제로 확인한 원문이고, 문서에서 다루지 않은 항목은 `확인 못 함` 또는 `미기술`로 적는다. 대상: 분석 보드의 세 프로토타입 축(칸 머리 밀도, 칸 사이 조건 차이 강조, 선택된 칸 표시)과 보조로 시트 탭 띠·레이아웃 선택기. `docs/design/analysis-board.md`의 Decided 동작(시트마다 1×1·1×2·2×1·2×2, 칸마다 독립 Context, 칸 머리 조건 요약 + 다른 키 강조, 바닥 시트 탭 띠)을 기준으로 비교했다.

## 요약

- **(축1) 칸 머리에 조건 전부를 항상 보여 주는 직접 선례는 없었다.** 두 극단이 공존한다: Grafana Explore 분할·Bloomberg는 칸 안에 쿼리 에디터·커맨드라인을 통째로 두는 "밀도 최대"이고, Kibana·Power BI·Datadog는 조건 편집을 화면 공용 바(쿼리 바·Filters 창·템플릿 변수)로 올리고 칸 머리는 짧게 유지한다. → 프로토타입 B안(칩 전부)은 Grafana/Bloomberg 계열, A안(다른 키만 칩 + 나머지는 요약 팝오버)은 Kibana/Power BI 계열의 변형이다.
- **(축2) "공용 기본과 다를 때만 칸에 표시"가 확인되는 가장 강한 선례들이다.** Kibana: "When a custom time range is active for a single panel, it is indicated in the panel's header", "Select the badge to view which projects the panel queries"(Custom CPS scope badge). Datadog Notebooks는 글로벌 시간에서 분리된 그래프에 unlink 토글을 두고, Grafana는 패널 헤더에 시간 범위를 보여 주되 "Hide panel time range" 옵션을 둔다. 즉 기본과 같은 칸은 조용하고, 다른 칸만 표시 + 눌러서 상세가 업계 패턴이다.
- **(축2) 칸끼리 서로를 비교해 다른 키를 자동 강조하는 제품 문서는 확인 못 했다.** 이것은 우리 확장이므로 프로토타입에서 "다른 키 칩 강조"의 가독성을 직접 검증해야 한다. 강조 수단으로 문서화된 것은 색상이 아니라 **badge/칩 + 클릭 팝오버**(Kibana CPS badge, Kibana 필터 pill의 편집·임시끔·제외 액션)다.
- **(축3) "하나의 전역 도구가 현재 선택된 대상에 적용된다"는 모델은 네 곳에서 확인했다.** VS Code("make sure that this editor is active … before opening file"), Power BI(캔버스 선택에 Format visual 창 내용이 반응), Bloomberg("The function runs on the active Bloomberg panel"), JetBrains("the active screen is maximized"). 반대 사례는 Kibana·Datadog·Power BI 필터처럼 선택 개념 없이 공용 바가 전체를 바꾸는 쪽인데, 우리는 ADR-0049로 칸 Context를 이미 결정했으므로 전자 계열이 맞다.
- **(축3) 선택 표시의 시각 규격(테두리 색·굵기 등)을 텍스트로 문서화한 1차 출처는 없었다** — VS Code·JetBrains 모두 "active" 개념과 동작만 문서화한다. 선택 칸 표시는 프로토타입에서 2가지(칸 머리 강조 vs 칸 테두리)로 제시해 컨펌받는다.
- **(탭) 바닥 시트 탭 띠는 표준이다.** Excel·Google Sheets·Tableau·Power BI가 모두 바닥 탭(+ 버튼, 더블클릭 이름바꾸기, 끌기 순서 변경)이고 Datadog만 상단 탭(최대 100장)이다. 우리 40px 바닥 띠 + 더블클릭 + 끌기는 이 조합과 정확히 일치한다.
- **(탭) 시트 삭제 되돌리기의 직접 선례는 문서에서 확인 못 했다.** 가장 가까운 것은 Google Sheets의 삭제 확인 대화상자("Click **Delete**. Click **OK**")와 Tableau의 워크북 전역 Undo("click Undo on the toolbar")다. 우리 "되돌리기 제공"은 두 방식 중 하나로 구현 근거를 댈 수 있다.
- **(레이아웃) 1×1·1×2·2×1·2×1 고정 그리드는 VS Code Editor Layout("Grid (2x2)")과 Bloomberg의 "Up to four Bloomberg panels" 선례와 같고, Tableau의 tiled/floating 자유 배치는 1차 범위 밖이다.** Carbon의 "Tabs should not be used if the user needs to compare information in different groups"는 칸 비교를 그리드에 두고 시트 전환만 탭에 둔 우리 구조를 지지한다.

## 사례 표

| 제품 | 칸 머리 조건 표시 | 차이 강조 | 선택 칸 표시 | 시트 탭·레이아웃 | 출처 (확인일 모두 2026-10-19) |
| --- | --- | --- | --- | --- | --- |
| Grafana (Explore 분할) | 칸마다 쿼리 에디터·데이터소스 피커 전체 — "duplicate the current query and split the page into two side-by-side queries"; 콘텐츠 아웃라인도 "a separate outline generated for each pane" | 시간 연결 토글("time-sync buttons")만 문서화; 쿼리 차이 강조 미기술 | 분할 칸에 전역 바 없음 — 칸마다 도구 분리(선택 개념 미기술) | 레이아웃 고정 2분할; URL이 `panes` JSON으로 칸 상태 전체 보관 | [Explore 시작](https://grafana.com/docs/grafana/latest/visualizations/explore/get-started-with-explore/) |
| Grafana (대시보드) | 머리에 제목+설명 툴팁(좌상단)+패널 메뉴(우상단); 조건 칩 표시 미기술 | 패널 시간이 대시보드와 다르면 헤더에 시간 표시("Hide panel time range — Don't show the panel time range in the panel header"); 반복 패널은 "add the variable name to the panel, row, or tab title" | 미기술 (전역 바가 칸을 편집하는 모델 아님) | 반복 패널 horizontal/vertical + max per row | [패널 옵션](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/configure-panel-options/), [패널 개요](https://grafana.com/docs/grafana/latest/panels-visualizations/panel-overview) |
| Kibana (대시보드) | 조건은 화면 공용 쿼리 바·필터 pill·Controls; 칸 머리는 기본 비움 | 칸만 다른 시간이면 "indicated in the panel's header"(눌러서 편집); CPS scope가 다른 칸은 "Custom CPS scope badge … Select the badge to view which projects the panel queries" | 선택 개념 없음 — 공용 바가 대시보드 전체 적용 | 필터 pill 띠는 "Collapse filters"로 접기; 패널 접기 섹션·Maximize | [대시보드 검사·필터](https://www.elastic.co/docs/explore-analyze/dashboards/using) |
| Tableau | 시트(칸) 자체가 독립 화면 — 조건(shelf·카드)을 시트 안에 전부 표시 | 미기술 (비교 강조 기능 문서 없음) | 워크시트 선택·활성 탭 개념은 있으나 표시 규격 미기술 | 바닥 시트 탭: New 버튼, 더블클릭·우클릭 이름바꾸기, 끌기 이동, Ctrl+M, 삭제(최소 1개 유지), Duplicate; 대시보드는 Swap Sheets(여백·테두리·배경 유지); tiled/floating | [워크북과 시트](https://help.tableau.com/current/pro/desktop/en-us/environ_workbooksandsheets.htm), [대시보드 만들기](https://help.tableau.com/current/pro/desktop/en-us/dashboards_create.htm) |
| Power BI | 조건은 오른쪽 Filters 창(비주얼·페이지·보고서 레벨); 비주얼 머리는 Filter 아이콘이 "Shows the filters applied to the visual" | 미기술 (비주얼 간 차이 강조 없음) | 캔버스 선택에 Visualizations·Format 창이 반응("varies by selections you make in the report canvas"); 선택 윤곽 규격은 미기술 | 캔버스 아래 페이지 탭("Each tab at the bottom of the canvas represents a page"); 비주얼 머리 아이콘 토글 | [보고서 에디터](https://learn.microsoft.com/en-us/power-bi/create-reports/service-the-report-editor-take-a-tour), [Format General 탭](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-format-pane-overview) |
| Datadog | 조건은 대시보드 공용 템플릿 변수·시간; 위젯 머리 조건 표시 미기술 | Notebooks에서 그래프별 시간 분리 토글("Individual graphs can be unlinked from the global time") | 선택 개념 없음 — 공용 바가 대시보드 전체 적용 | 상단 탭 최대 100장: `+` 추가, 더블클릭·⋮ 이름바꾸기, 끌기 순서, ⋮ 삭제(되돌리기 미기술); 그리드 최대 폭 12칸 | [대시보드 구성](https://docs.datadoghq.com/dashboards/configure.md), [Notebooks](https://docs.datadoghq.com/notebooks.md), [대시보드](https://docs.datadoghq.com/dashboards.md) |
| Looker Studio | 차트(tile) 조건은 속성 패널; 칸 머리 조건 표시 미기술 | 미기술 | 미기술 | 페이지 관리 패널: Add a page, ⋮로 Rename·Duplicate·Delete·Move·숨기기·아이콘, 끌기 순서; 보기 내비는 Left 드로어(기본)/Tab/드롭다운/숨김 4종, 축소 시 번호·아이콘 | [페이지·내비게이션](https://cloud.google.com/looker/docs/studio/add-pages-and-report-navigation) |
| Excel | 시트마다 조건 표시 개념 없음 | 미기술 | 활성 시트·활성 셀 개념 있으나 표시 규격 미기술 | 바닥 탭: New Sheet `+`, 더블클릭·우클릭 이름바꾸기(이름 규칙: 빈 이름 불가·31자), 끌기 이동, Ctrl+끌기 복사, 우클릭 삭제 | [시트 삽입·삭제](https://support.microsoft.com/en-us/office/insert-or-delete-a-worksheet-d29f9c85-27a6-4571-be40-9ea9f6ac7c13), [이동·복사](https://support.microsoft.com/en-us/excel/get-started/move-or-copy-worksheets-or-worksheet-data) |
| Google Sheets | 시트마다 조건 표시 개념 없음 | 미기술 | 활성 탭 개념 있으나 규격 미기술 | 바닥 탭: `+`? 문서는 탭 ▾ 메뉴로 Duplicate("A duplicate sheet will appear in a new tab next to the original"), 더블클릭 이름바꾸기, 끌기 순서, 삭제 확인(Delete→OK), 탭 색, Shift 다중 탭 일괄 작업 | [시트 보호·숨기기·편집](https://support.google.com/docs/answer/1218656?hl=en&co=GENIE.Platform%3DDesktop) |
| VS Code | 칸=에디터 그룹, 그룹마다 탭 띠+탭 제목(파일명) — 조건 칩 개념 없음 | 미기술 | "the editor that is active will display the content of that file. If you have two editors side by side and you want to open file 'foo.cs' into the right-hand editor, make sure that this editor is active"; 활성 그룹 시각 규격 미기술 | Editor Layout 메뉴(Two Columns, Grid (2x2)), 탭 더블클릭으로 활성 그룹 최대화 토글, Ctrl+1/2/3 그룹 전환 | [UI 개요](https://code.visualstudio.com/docs/editing/getting-started/userinterface.md), [사용자 지정 레이아웃](https://code.visualstudio.com/docs/configure/custom-layout) |
| JetBrains | 칸마다 탭 띠 — 조건 칩 개념 없음 | 미기술 | "You can maximize a split screen as well. In this case the active screen is maximized, and other screens are moved aside"; 활성 분할 시각 규격 미기술 | 탭 우클릭 Split Right/Down, 탭 끌어 분할·해제, Open in Right Split(Shift+Enter) | [에디터 기본](https://www.jetbrains.com/help/idea/using-code-editor.html) |
| Bloomberg Terminal | 칸(패널)마다 툴바+커맨드라인 전체 — "each panel is divided into three main sections: Toolbar, Command line, Function area"; "The mnemonic for the function in your selected window is always displayed in the toolbar" | 미기술 | "The function runs on the active Bloomberg panel"; 전환은 <PANEL> 키·작업 표시줄 클릭; 활성 표시 규격 미기술 | "Up to four Bloomberg panels or windows appear" — 4칸 고정, 자유 레이아웃 미기술 | [시작 가이드 PDF](https://data.bloomberglp.com/professional/sites/10/Getting-Started-Guide-for-Students-English.pdf) |
| Atlassian (디자인 시스템) | 해당 없음(탭 컴포넌트 규정) | 해당 없음 | 탭 선택: "The active tab is blue and underlined", 비선택은 lighter 텍스트, 콘텐츠와의 경계 divider | 탭 키보드(좌우 방향키, Tab은 콘텐츠로), "Use tabs to switch between views within the same context", 모든 탭 공통 정보는 탭 줄 위에 | [Tabs 사용](https://atlassian.design/components/tabs/usage) |
| Carbon (디자인 시스템) | 해당 없음 | 해당 없음 | "selected and unselected" 두 상태, 한 개는 항상 선택, 하나만 선택 가능 | "Tabs should not be used if the user needs to compare information in different groups"; 넘침은 화살표 스크롤 버튼; 높이 32/40/48px | [Tabs 가이드](https://carbondesignsystem.com/components/tabs/usage/) |
| Primer (GitHub) | 해당 없음 | 해당 없음 | 해당 없음 | UnderlineNav(탭=URL 변경) vs UnderlinePanels(탭=같은 페이지 콘텐츠만) 분리, 섞지 않는다; "Tabs go directly above the content they affect"; 필터·보기 전환은 SegmentedControl | [내비게이션 패턴](https://primer.style/product/ui-patterns/navigation) |
| Fluent (Microsoft) | 해당 없음 | 해당 없음 | 해당 없음 | "Tabs are a set of layered sections of content that display one panel of content at a time" — W3C ARIA tabs 패턴 참조 | [Fluent tabs](https://learn.microsoft.com/en-us/fluent-ui/web-components/components/tabs) |
| The Component Gallery | — | — | — | Tabs 80예제("navigating between multiple panels, reducing clutter"), Card/Tile 77예제, Toolbar는 독립 항목 없이 Button group(35예제)의 별칭, Badge 별칭에 Tag·Chip | [Components 색인](https://component.gallery/components/), [Tabs](https://component.gallery/components/tabs/), [Card](https://component.gallery/components/card/) |

## 프로토타입 축별 선택지

### 축 1 — 칸 머리 조건 표시 밀도

- **A안 — 다른 키만 칩, 나머지는 요약 팝오버**: 직접 선례는 없지만 Kibana(CPS badge: 칸이 범위를 다르게 쓰면 badge 하나, 누르면 상세)·Power BI(비주얼 머리 Filter 아이콘이 적용 필터를 요약 표시)가 "칸 머리는 신호만, 상세는 클릭" 패턴이다. 2×2에서 칸 폭이 가장 적게 든다.
- **B안 — 조건 칩 전부 표시**: Grafana Explore 분할(칸마다 쿼리 에디터 전체)·Bloomberg(칸마다 툴바+커맨드라인)가 이 밀도다. 다만 두 제품 모두 칸이 화면의 절반 이상을 차지할 때 성립하는 밀도라, 2×2의 좁은 칸(§4 좁은 뷰포트 점검 대상)에서는 비용이 크다. 1×2에서만 유리할 수 있다.
- **C안 — 칸 머리 최소화, 조건 편집을 전용 창으로 분리**: Power BI(오른쪽 Filters 창)·Kibana(공용 쿼리 바) 방식. 다만 우리 계약(ADR-0049: 칸이 자기 Context를 통째로 소유)과 결(칸 안 편집 + 선택 칸 Context 바 48px)이 이미 있으므로, 이 안은 "Context 바를 통한 편집 + 칸 머리는 요약" 형태로만 변형 가능하다.

### 축 2 — 칸 사이 조건 차이 강조

- **기준선(선례 있는 방식) — 공용 기본과 다를 때만 표시**: Kibana 칸 머리 시간 표시("indicated in the panel's header"), Kibana CPS scope badge, Datadog Notebooks unlink 토글, Grafana 패널 헤더 시간 범위. 기본 조건과 같은 칸은 표시 없음. 우리의 "같은 시트의 다른 칸과 다른 키 강조"는 여기에 상호 비교만 추가한 형태로 구현 가능.
- **칩 강조 + 눌러서 상세**: 강조 수단의 문서화된 규격은 badge/칩이다(Kibana badge는 누르면 팝오버로 대상 목록 표시, Kibana 필터 pill은 편집·임시끔·제외 액션 메뉴). 색상만으로 차이를 강조한다는 규격은 확인 못 함.
- **칸 제목에 다른 값을 넣기**: Grafana 반복 패널 지침 — "add the variable name to the panel, row, or tab title". 칩 대신 다른 키=값을 칸 머리 텍스트에 반영하는 가장 값싼 방법.

### 축 3 — 선택된 칸 표시(전역 Context 바가 선택 칸만 편집)

- **칸 테두리/윤곽 강조**: VS Code·Power BI·Bloomberg·JetBrains 모두 "active" 대상에 전역 동작이 적용되는 모델이지만, 테두리 규격을 텍스트로 문서화한 곳은 없다. 문서에 근거는 없고 관례에 의존한다.
- **칸 머리 상태 강조(선택 칸의 머리만 활성색)**: Atlassian 탭의 선택 규정("The active tab is blue and underlined", 비선택은 lighter)을 칸 머리에 이식하는 형태. 텍스트로 규정된 선택 표시를 원하면 이쪽이 근거가 있다.
- **키보드·전환 보조**: VS Code Ctrl+1/2/3 그룹 전환, Bloomberg <PANEL> 키, JetBrains "active screen is maximized"(활성 칸 최대화). 우리 사양은 클릭으로만 선택을 옮기므로, 칸 전환 단축키는 프로토타입에서 확인해 볼 확장이다.

### 보조 — 시트 탭 띠와 레이아웃 선택기

- 탭 띠: Excel·Google Sheets·Tableau·Power BI가 바닥 탭(+·더블클릭·끌기), Datadog는 상단 탭, Looker Studio는 보기에서 4종(Left/Tab/드롭다운/숨김) 중 선택. 우리 "바닥 40px + `+` + 더블클릭 + 끌기"는 주류 조합과 일치. 삭제는 Google Sheets처럼 확인 대화상자를 두거나 Tableau처럼 전역 Undo에 의존하는 두 가지 선례가 있다(전용 되돌리기 선례는 확인 못 함).
- 레이아웃 선택기: VS Code Editor Layout의 사전 정의 그리드(Two Columns, Grid (2x2))가 우리 1×1·1×2·2×1·2×2와 같은 "몇 가지 정해진 배치를 고르는" 방식이다. Tableau tiled/floating 자유 배치는 1차 범위 밖.

## 확인 못 함

- 칸끼리(같은 화면의 나란한 칸 사이) 서로 다른 조건 키를 자동 비교·강조하는 기능의 1차 문서 사례: 없음.
- 선택된 칸(활성 에디터 그룹·활성 분할·활성 비주얼)의 시각 표시 규격(테두리 색·굵기 등)을 텍스트로 기술한 문서: VS Code·JetBrains·Power BI 모두 미기술.
- 시트/탭 삭제 전용 "되돌리기(toast undo)"를 문서화한 사례: Excel·Google Sheets·Tableau·Datadog 어디도 없음(가장 가까운 것은 삭제 확인 대화상자와 워크북 전역 Undo).
- Kibana Discover의 세션 분할 비교(split screen): 현재 Discover 문서에서 확인 못 함 — 문서에는 "compare multiple documents side by side"(문서 단위)만 있다.
- Bloomberg Terminal의 패널 내 조건 칩·차이 강조·레이아웃 편집(4패널 재배치): 공개 문서에서 미기술. 공식 시작 가이드는 "up to four panels"와 각 패널의 툴바 구조까지만 적는다.
- Grafana·Kibana·Power BI의 팝오버/플라이아웃 크기·여백 수치: 어느 출처도 숫자로 미기술.
- component.gallery의 Toolbar: 독립 등재 항목이 없다(2026-10-19 색인에서 Button group의 별칭으로만 존재 확인).

<!-- RESEARCH-421-DONE -->
