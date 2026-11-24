# 차트 계약

> Scope: Chart Frame과 Zoom/Brush/Compare/Annotate 공통 Interaction 계약.  
> 포함 절: §16  
> 색인과 「절 → 문서」 대응표: [06. Platform UI Contract](platform-ui-contract.md)  
> 상태 표기(Decided / Candidate / Open / Deferred): [문서 소유권과 결정 상태](platform-ui-contract.md#문서-소유권과-결정-상태)

## 16. Analysis Chart Contract

**선택 요약 표시(Decided, #2430).** `AnalysisChartFrame`의 `summary?: 'standard' | 'quiet'`는 기본 `standard`로 기존 출력을 유지한다. `quiet`는 `standard`·`minimal` 크롬에서 적용하고 `full`에서는 무시한다. 구간 선택과 진행 중인 작업이 없으면 차트 아래 요약 영역을 시각적으로 숨긴다. 시간축에 빠른 구간이 있으면 버튼 행은 계속 보인다. 안내·활성 행·선택 지점·현재 경계 문구는 `sr-only`로 남기고 요약 영역의 `aria-live="polite"`를 유지한다. 선택 후에는 구간·시리즈별 n/avg/max·기존 조치·지우기를 한 줄로 배치하며 좁으면 줄바꿈한다. 시작/끝 입력은 Brush 모드에서만 표시한다. 기간 적용 미리보기·주석 편집과 목록·잘림 안내·주석 오류·키보드 구간 선택은 계속 표시한다. 활성 행은 차트 안에서도 강조한다. `AnalysisChart`는 별도의 종류별 선택 요약을 쓰므로 이 옵션을 받지 않는다. HW Time의 현재·앞 단계·Module Motion 막대와 일 평균 추세가 선택 적용하며, 막대의 규모 문구는 합성 데이터 설명 다음에 둔다.

**차트 도구 줄(Decided, #2538).** `AnalysisChartFrame`은 가능한 도구를 확대 → 구간 선택 → 초기화 → 비교 → 주석 순으로 배치하고 오른쪽에 표로 보기 → 내보내기 → 더보기를 묶는다. `full`은 아이콘과 글자의 테두리 버튼(`secondary`, 켜고 끄는 도구는 `toggle`), 표준·최소 크롬은 접근 이름과 툴팁이 있는 `ghost` 아이콘을 쓰고 켜진 도구만 `toggle`로 표시한다(#2720). `AnalysisChart`의 모든 종류도 같은 도구 줄을 쓴다: 표로 보기·내보내기는 크롬 수준과 관계없이 도구 줄에 있고, 내보내기 팝오버에 CSV와 이미지 복사·인쇄를 모은다(#2736). 더보기는 구간 선택 중에도 열리며 메뉴 추가 동작과 보조 읽기·조작을 담는다. 패널에 차트가 하나면 `headingInToolbar`로 제목을 도구와 한 줄에 보이게 할 수 있다. `toolbarStart`는 도구 앞에 패널 설정 등을 놓는다(#2459). `full`은 설정에 필요한 폭을 확보하고, 한 줄에 다 들어가지 않으면 다음 줄로 넘긴다(#2737). `extraActions`는 `full`을 포함한 모든 크롬의 더보기에 놓인다.

**조작 안내.** Chart Frame과 Top N은 차트 아래에 가능한 조작만 한 줄로 표시한다. 클릭은 지점을 선택하고 ⌘/Shift+클릭은 지점을 추가한다. 드릴 동작이 있으면 더블클릭 또는 차트에 포커스한 상태에서 Enter로 실행한다. 구간 선택을 켜기 전에는 «구간 선택을 켠 뒤 끌기», 켠 동안은 «끌어서 구간 선택»을 보인다. `pointClickHint`는 소스 호환용으로 남아 있으며 안내는 SDK가 만든다.

**시리즈 단위.** `ChartSeries.unit`을 시리즈마다 선언하면 범례와 툴팁·선택 값 라벨에서 단위를 확인할 수 있다. 생략한 시리즈는 프레임 또는 해당 값 축의 단위를 사용한다. 단위 누락 경고는 개발 환경에서만 출력한다.

**차트 크롬 수준(Decided, #2372).** `AnalysisChartFrame`·`AnalysisChart`의 선택 prop `chrome?: 'full' | 'standard' | 'minimal'`은 명시하면 위치에 관계없이 우선한다. 생략하면 카드와 보드 `EmbeddedPane`은 `full`, `PanelWorkspace` 패널은 `standard`다. `full`은 기존 제목·설명·텍스트 도구줄·범례·선택 요약을 유지한다. `standard`는 제목을 접근 이름으로 남기고 설명은 정보 툴팁, 기본 동작은 접근 이름과 툴팁이 있는 한 줄 아이콘 도구줄로 보인다. 차트를 읽는 데 범례가 필요하다는 소유자 결정에 따라 시리즈·상태·경계·색상 범례와 선택 요약은 더보기 밖에 유지하며, 가로 범례와 선택 요약은 폭이 모자라면 다음 줄로 넘기고, 높이 상한을 넘을 때만 세로로 스크롤한다(키보드로 도달 가능). `standard` 전용 선택 prop은 `legendPlacement?: 'top' | 'bottom' | 'side'`(기본 `bottom`), `toolsReveal?: 'always' | 'hover'`(기본 `always`), `legendCaption?: ReactNode`(기본 없음)다. `top`·`bottom`은 가로 줄 끝에 캡션을 붙이고 폭이 모자라면 가로 스크롤 대신 다음 줄로 넘긴다(최대 80px, 넘치면 세로 스크롤; 선택 요약 줄도 같은 방식으로 최대 64px), `side`는 오른쪽 세로 목록 아래에 붙인다. `hover` 도구는 차트 hover 또는 focus-within 때 보이며 키보드 순서와 접근성 트리에 남고 더보기가 열린 동안에도 보인다. Frame에 `headingInToolbar`를 켜거나 `toolbarStart`를 주면 합쳐진 도구 줄은 상시 표시한다. 세 옵션은 `full`·`minimal`에서는 무시한다. 소유자가 패널마다 배치를 골랐으므로 메뉴가 선언하고 SDK가 적용하며, URL은 SDK가 읽지 않는다. 표준 fill 플롯은 요약·구간·주석 행을 제외한 남은 높이에 맞춰 줄어들고 해당 행과 겹치지 않는다. Frame의 지점 선택기는 더보기에서 키보드로 조작한다. `full`에서 드릴·지점 동작·상태·세로 경계를 제공하면 도구 줄 아래에 둔다. `minimal`은 같은 아이콘 도구줄과 선택 요약을 쓰되 범례도 더보기 안에 둔다. 종류별 데이터 요약은 접근 설명으로 유지한다.

`AnalysisChartFrame.zoomOnly`(#2497)는 표준 플롯 크기를 사용하며 제목 아래에 `legendCaption`을 둔다. 오른쪽 도구줄에는 조작 방법·확대·축소·확대 초기화만 표시한다. `rowPitch`로 확대가 꺼진 차트에는 조작 방법과 초기화만 표시한다. 일반 범례는 `legendPlacement`를 따르며, 생략 시 기존 크롬을 유지한다.

**Transient bar emphasis (Decided, #1141; default changed by #2342).** `AnalysisChartFrame.emphasisFocus?: 'series' | 'none'` defaults to `none` at the owner's request: hovering one series must not fade the others, which hid the values being compared. `series` is the opt-in for the old hover dimming. `none` avoids blur dimming of other series; native axis-tooltip emphasis on the hovered category is retained, and the hovered series itself is marked (a wider line or a series-coloured bar edge, #2736). With `series`, the other series fade to opacity 0.3 (`CHART_MARKS.blurOpacity`, #2736) instead of ECharts' 0.1. This is independent of persistent `activeCategory` selection (2px row outline and bold label, with the existing 3px Min/Max exception). Tooltip, point activation, Brush, Min/Max, nulls and total labels retain their semantics. The pure option builder receives the declaration without inspecting chart IDs or consumers. HWT StackPanel and TrendPanel still pass `none` explicitly (now the default). `AnalysisChart` (scatter, heatmap and the other `ChartSpec` frames) already did not dim. See [ADR-0103](../adr/0103-compact-analysis-and-snap-dock.md).


Primary candidate는 `../architecture/frontend-ui-ux.md`에 따라 Apache ECharts다.

플랫폼은 Chart의 비즈니스 정의가 아니라 **Chart Frame과 Interaction Contract**를 소유한다.

`AnalysisChartFrame`의 그림 위에서 수정키 없는 휠은 가장 가까운 스크롤 컨테이너를 그대로 스크롤하고(프레임이 막지 않는다), Shift+휠이 확대이며 키보드·포인터 대안은 툴바 `확대`·`축소`·`왼쪽으로 이동`·`오른쪽으로 이동` 버튼이다(#700, #2065). 이동은 현재 창 너비의 절반이며 양 끝에서 멈춘다. 축소는 창 너비를 두 배로 넓히고 전체 구간에서 멈춘다. 이 조작은 선택 구간·비교·시리즈 표시·주석 초안을 유지한다.

**`markLines`.** `{ y: number; label: string; unit?: string; metricVersion?: string }[]`를 받아 값 축의 `y` 위치에 라벨이 붙은 기준선을 그린다(세로 차트는 가로선, 가로 막대는 세로선). `startAlign`에서는 x가 더는 한 값 축이 아니므로 무시하고 아래 단위 안내도 하지 않는다. 그릴 선에 `unit`이나 `metricVersion`이 있고 Frame의 `unit`·`metricVersion`과 다르면 그 선만 그리지 않고, 차트 동작 도구줄 밖(범례 아래 안내 줄)에 `<라벨> 기준선은 단위가 달라 표시하지 않음`을 `text-text-secondary`로 선마다 한 줄 보인다. 두 필드를 생략한 선은 그대로 그린다.

**가로 막대의 범주별 수치 표식 (Decided, #2496).** `AnalysisChartFrame.categoryValueMarks?: { label: string; byCategory: ReadonlyMap<string, number | null> }`는 가로 범주 막대(누적 포함)의 공통 값 축에 행마다 마름모를 하나 그린다. 값은 Frame과 같은 단위로 전달한다. 막대 합과 표식 값은 독립이며, 표식은 범주 키로 행 순서와 확대에 맞춰 이동한다. 적어도 하나를 그릴 때 범례에 마름모와 선언한 라벨을 표시하고, 행 툴팁과 표·CSV에도 별도 라벨로 표시한다. 없는 키·null·비유한 값은 표식이 없으며, 축에 없는 범주는 무시한다. 생략 또는 `startAlign`이 실제 적용될 때 표식을 그리지 않는다.

**가로 막대의 빈 범주 라벨 (Decided, #2700).** `AnalysisChartFrame.emptyCategoryLabel?: string`은 표시 중인 시리즈가 하나 이상이고 그 행의 값이 모두 null 또는 누락일 때 값 축 시작점에 흐린 글자로 표시한다. 누적 여부와 `startAlign`에 관계없이 행 순서와 확대를 따르며, 값 축 범위·지점 선택·차트 요약·범례에 영향을 주지 않는다. 행 툴팁과 접근 가능한 표의 값 셀, CSV의 값 셀에도 같은 문구를 쓴다. 생략하거나 세로 차트에 전달하면 기존 표시를 유지한다.

**범주 차트 도구 문구 (Decided, #2700).** 범주 차트의 툴바는 Chart Frame과 같은 `구간 선택`·`초기화` 버튼을 같은 순서로 쓴다. 전체형은 아이콘과 글자, 간소형은 같은 접근 이름의 아이콘 버튼이다.

**히트맵 null 라벨과 셀 강조 (Decided, #2496, #2773).** `HeatmapSpec.nullLabel?: string`은 값이 null인 셀의 범례, 툴팁, 표·CSV, 접근 가능한 요약과 선택 항목에 쓰인다. 기본값은 현재 언어의 «미확인»/“Unknown”이다. 비어 있는 좌표와 범주 id 라벨의 의미는 별도다. `selectedCell?: { x: string; y: string; label?: string } | null`은 두 축의 라벨로 셀 테두리와 선택 요약·동작의 기본 대상을 정한다. 선택 요약에는 제어 셀의 기본 라벨 또는 `label`을 표시한다. `cellActivation`을 선언한 히트맵에서 표 체크박스로 로컬 선택을 갱신해 값이 있는 셀 하나만 남으면, 그 셀을 요약과 동작에 우선 사용한다. 캔버스 클릭이나 Brush로 로컬 선택을 갱신하면 제어값을 따른다. 제어값이 null이면 테두리 강조가 사라지고, 실행할 표 선택도 없으면 «선택 없음»을 표시하며 셀 동작을 비활성화한다. `selectedCell`을 생략하면 차트의 로컬 선택 테두리와 선택 요약·동작을 쓴다.

**히트맵 기준점 라벨 (Decided, #2700).** 발산형 `scale.pivotLabel?: string`은 메뉴가 정한 기준점 범례 문구이며, 생략하면 기존 `{pivot} 목표`를 표시한다.

**가로 막대의 행 포커스와 `rowPitch`([ADR-0079](../adr/0079-chart-row-focus-row-pitch.md), #690).** `orientation="horizontal"` 범주 차트만 받는다(그 밖에서는 무시하고 개발 중 경고).
`activeCategory`가 있으면(`null` = 행 없음) 프레임은 그 행만 강조하고 스스로 강조 상태를 바꾸지 않는다 — 막대 클릭은 `onActiveCategoryChange(category, 'pointer')`, 지점 선택기의 이동은 `(category, 'keyboard')`만 부르며 소유자는 메뉴 하나다.
강조는 색만이 아니라 그 행 막대의 테두리와 굵은 범주 라벨이고, 선택 요약이 `활성 행`을 적는다.
`activeCategory`가 없으면 강조는 없고 기존 동작 그대로이며, 콜백만 주면 강조 없이 클릭·이동만 알린다.
행 포커스와 `pointActivation`은 별개다. 클릭은 지점을 선택하고 행 콜백을 부른다. 더블클릭과 Enter, 또는 `선택 지점 실행`이 활성화를 실행한다.
`rowPitch`(px, 최소 24 — WCAG 2.2 2.5.8 대상 크기, 미만은 24로 올리고 개발 중 경고)는 차트 높이를 `행 수 × pitch + 축 여백`으로 만들고(`rowPitch`에서는 `containLabel` 없이 고정 격자 — 왼쪽 라벨 여백 140px, 행 영역이 정확히 `행 수 × pitch`라서 행 i의 윗변이 격자 위 여백 + i × pitch다) 플롯 상자가 주어진 `height`/`size`(`fill` 포함)만큼의 창으로 안에서 세로 스크롤한다. 메뉴가 패널 높이를 맞출 때는 같은 계산을 공개한 `rowPitchChartHeight(rows, pitch)`를 쓴다(#2755; 패널 머리·범례 제외).
수정키 없는 휠은 가장 가까운 스크롤 컨테이너, 곧 이 안쪽 상자를 스크롤하고 끝에서 바깥으로 넘어간다(위 #700 규칙 그대로).
**`rowPitch`에서는 범주 `dataZoom`(Shift+휠, `확대` 버튼)이 꺼지고 Brush는 유지한다** — viewport 모델이 둘이면 선택 요약·Brush 범위·내보내기가 어느 창 기준인지 모호해진다.
`revealActive`는 `activeCategory`가 밖에서 바뀔 때 그 행이 창 밖이면 `격자 위 여백 + 인덱스 × pitch`로 스크롤하며(순수 `revealScrollTop`) 포커스는 옮기지 않고, 프레임 자신의 클릭에서 온 변경은 스크롤하지 않는다.
`rowPitch`가 없다가 `revealActive`·`activeCategory`가 있는 채로 생기면 그 행을 다시 드러낸다(새 스크롤 상자는 맨 위에서 시작한다).
`activeCategory`가 밖에서 바뀌면(프레임 자신의 보고가 아닌 변경) 선택 지점, 곧 지점 선택기와 `지점 동작`의 대상도 그 행으로 옮긴다: 지금 선택한 시리즈의 그 행 지점이 `isPointSelectable`이면 그것, 아니면 그 행의 첫 선택 가능 지점이다.
포커스는 옮기지 않고, `null`은 선택을 그대로 두며, 프레임 자신이 이미 그 행을 선택한 변경은 다시 옮기지 않는다.
`rowPitch`가 **없는** 가로 범주축은 행이 읽을 만한 라벨 높이보다 낮으면 범주 라벨을 자동으로 솎는다(ECharts `axisLabel.interval: 'auto'`, 충분히 높으면 모두 보임).
`rowPitch`가 있으면 모든 라벨을 그린다.
프레임은 행 수 상한을 두지 않는다: 메뉴가 엔드포인트의 `limits.maxRows`로 자르고(§15 행 상한, §19 `too_large`) 전체 데이터를 프런트로 보내지 않는다(§27).

**행 이름 여백 `rowLabelWidth`(#2416, 옵트인).** `rowPitch`이고 `rowGroups`가 없는 행에서만 왼쪽 라벨 여백을 바꾼다: 없음 = 140px(기존 차트 전부 그대로), 숫자 = 그 px(최소 32), `'auto'` = 가장 긴 행 이름 폭(상한 140px, 그보다 긴 이름은 지금처럼 `…`로 자름). 기본값을 바꾸지 않는 이유: 모든 메뉴의 가로 막대 배치가 함께 바뀐다. 좁은 패널(앞 단계 차트 등)이 `'auto'`로 켠다.

**오른쪽 값 축(`ChartSeries.axis`·`rightAxis`, #1657).** 선택 옵션이며 쓰지 않으면 옵션 출력과 버튼이 지금과 같다. `ChartSeries.axis?: 'left' | 'right'`(없음 = 왼쪽)와 Frame의 `rightAxis?: { unit: string; valueFormat?: (v: number) => string }`로 시간 단위와 비율처럼 단위가 다른 시리즈를 한 차트에 겹친다. 두 축의 척도는 서로 독립이고(각각 0부터), 오른쪽 축은 격자선을 그리지 않고 단위를 축 이름으로 쓴다. `compareSeries`도 자기 `axis` 필드를 따른다. 툴팁 값·지점 선택기·표·선택 요약(n·avg·max)은 **시리즈마다 자기 축의 단위와 `valueFormat`**(`rightAxis.valueFormat`, 없으면 Frame의 `valueFormat`)을 쓰고, 표로 보기와 CSV의 값 열 머리는 `rightAxis`가 켜져 있을 때만 `이름 (단위)`로 쓴다(꺼져 있으면 머리는 그대로). 서로 다른 축의 값은 어디서도 더하지 않는다. `markLines`는 왼쪽 축에 남고 기존 단위 걸러내기도 그대로다. Brush·Zoom은 x만 대상이라 영향이 없다. **세로(시간·범주) 비누적 차트에만 적용한다:** `orientation="horizontal"`은 범주가 y축이라 값 축이 하나이고, 누적은 서로 다른 척도의 값을 한 막대에 더할 수 없기 때문이다. 이 두 조합에서는 `axis`와 `rightAxis`를 무시하고 모든 시리즈를 왼쪽에 그리며 개발 중 경고한다. `axis: 'right'`인 시리즈가 있는데 `rightAxis`가 없을 때도 왼쪽에 그리고 개발 중 경고한다.

**차트 이미지 복사(`imageCopy`, #1657).** `AnalysisChartFrame`·`AnalysisChart`·`LaneTimeline`의 선택 prop `imageCopy`가 true이고 현재 메뉴 manifest `features.export`가 켜져 있을 때만 `이미지 복사` 버튼(en `Copy image`)을 그린다(아래 "Compare·Annotate·Export는 manifest `features`를 따른다"와 같은 게이트). Frame과 `AnalysisChart`의 모든 종류, `LaneTimeline`은 내보내기 팝오버의 CSV 뒤에 배치한다(#2736, #2792). 보안 컨텍스트에 `navigator.clipboard.write`와 `ClipboardItem`이 있으면 클릭 제스처 안에서 약속(promise)된 PNG blob으로 클립보드에 쓰고(표 복사와 같은 기능 감지), 아니거나 쓰기가 거절되면 `<chartId 또는 aria-label 기반 이름>.png`를 내려받는다. 결과는 Export와 같은 `toast`로 `이미지를 복사했습니다`·`이미지를 내려받았습니다`, 둘 다 안 되면 실패 문구를 알린다. ECharts 차트는 `getDataURL`(PNG, 2배, 툴박스 제외)을 현재 테마의 `surface-card` 배경 위에 그리고, `data:` URL은 CSP가 `fetch`를 막을 수 있어 `fetch` 없이 blob으로 바꾼다. `LaneTimeline`은 축 canvas, 본문(데이터) canvas, 그 위의 오버레이 canvas(선택 윤곽, 보이는 구간, 백킹 스토어 픽셀)를 이 순서로 `surface-card` 배경의 새 canvas에 합쳐 `toBlob`하며(일시적인 hover 표시는 PNG에 넣지 않는다), DOM으로 그려진 레인 이름은 왼쪽 여백에 글자로 다시 그린다. `LaneTimeline`은 `PlatformProvider` 없이도 그려지며, 버튼은 켰을 때만 마운트되는 작은 자식 컴포넌트가 `usePlatformOptional`로 게이트를 고른다: 플랫폼 안이면 메뉴 manifest `features.export`, 밖이면 아래 `exportActions.exportAllowed`.

**캔버스 차트의 표로 보기·내보내기(#2792).** `LaneTimeline`과 `OrderedIntervalTrack`도 위 도구 줄의 `표로 보기`(`toggle`)와 `내보내기` 팝오버를 같은 부품(`ChartTableToggle`·`ChartExportMenu`)으로 쓴다. 두 표 모두 `@ap/ui` `Table`(compact)이고 선택한 행은 `TableRow current`(강조 표면과 `aria-current`)에 `aria-selected`를 더한다. `LaneTimeline`의 표는 캔버스 아래에 구간 하나를 행 하나로, 모든 구간을 모델 순서로 20행씩 보인다. 열은 줄·시작·끝·상태·길이다. 시작·끝은 `formatTick`(없으면 UTC 눈금 글자), 상태는 선택 `formatState(segment, lane)` 글자(없으면 rank)에 시작 미확인·종료 미확인을 더하고, 길이는 `1시간 5분` 같은 시간 단위 글자(1ms 미만 양수는 `<1ms`)다. 시각·길이 칸은 줄바꿈하지 않고 좁은 패널에서는 표가 가로로 스크롤한다. `lanes`가 바뀌면 표는 첫 쪽부터 보인다. `내보내기 CSV`는 모든 구간을 줄·시작·끝·상태·길이(ms)로 내보내며, 시각은 시간대 접미사 없는 wall-clock(`YYYY-MM-DDTHH:mm:ss.SSS`, 확장 연도 포함, ADR-0064)이다. 게이트는 다른 차트와 같다: 플랫폼 안이면 메뉴 manifest `features.export`, 밖이면 `exportActions.exportAllowed`. CSV 첫 줄 맥락은 `AnalysisChart`와 같고 단위 칸은 없다. 파일 이름은 `aria-label`에서 파일 이름 금지 문자(`\ / : * ? " < > |`, 제어 문자)를 `-`로 바꾸고 앞뒤 공백을 지운 것이며(한글 유지), 비면 `timeline`이다. 결과 문구도 같은 이름을 쓴다. 플랫폼 밖 결과 줄은 `lanes`·`aria-label`·`exportAllowed`가 바뀌면 지운다. 소비자 `formatState`가 예외를 던지면 CSV 실패로 알린다. `OrderedIntervalTrack`의 표는 플롯 자리를 대신해 현재 가로 범위의 항목만 보이고, 열은 줄·항목(선택 버튼)·시작·끝·상태·길이다. 길이는 소비자 순서 단위의 수이며 양수 길이는 0으로 보이지 않는다(소수 여섯째 자리 아래는 지수 표기). CSV는 그 항목을 소비자 순서 값 그대로(열린 구간·점 이벤트의 끝·길이는 빈칸) 내보내고 파일 이름이 비면 `track`이다. 범위 요청을 쓰는 트랙은 현재 요청의 성공 응답이 있을 때만 `내보내기`를 보인다(불러오는 중·실패·이전 요청의 응답에는 없음). 범위·도메인·재시도 회차가 바뀌거나 제한 상태가 풀리면 새 요청이고, 제한 상태로 들어가면 진행 중인 요청을 취소하고 제한 중에는 요청하지 않는다. 플랫폼 밖 게이트로 선택 `exportActions`를 받으며, 플랫폼 밖 결과 줄은 항목·줄·범위·`aria-label`·`exportAllowed`가 바뀌면 지우고 제한 상태에서는 보이지 않는다(`partial` 같은 안내만 바뀌면 유지).

**플랫폼 밖의 이미지·내보내기 동작(`LaneTimeline`·`AnalysisChart`, Candidate, #1953 슬라이스 A·B):** `LaneTimeline`은 `PlatformProvider` 없이(`I18nProvider`만으로) 그려지고, 선택 prop `exportActions?: { exportAllowed: boolean; notify?(text, tone?) }`가 있을 때만 `imageCopy`·`imagePrint` 버튼이 보인다. `exportAllowed`의 기본은 꺼짐(prop이 없거나 false면 버튼 없음)이고, 결과 문구는 주입한 `notify`로, 없으면 버튼 옆의 `role=status` 한 줄로 전한다. `PlatformProvider` 안에서는 이 prop을 읽지 않는다 — 메뉴 manifest `features.export`가 유일한 게이트이고 토스트가 결과를 전하므로, 소비자 prop으로 메뉴의 권한을 넓힐 수 없다. **슬라이스 B:** `AnalysisChart`(모든 종류 — topNBar·donut·scatter·pareto·heatmap·boxPlot)도 같은 prop `exportActions`로 `PlatformProvider` 없이 그려지고, `exportAllowed: true`일 때만 `내보내기`(CSV)·`imageCopy`·`imagePrint`가 보인다. 이 CSV의 맥락(`scopeId`·`from`·`to`)은 플랫폼이 없으므로 비어 있고, 다운로드가 실패하면 `notify`에 `warning`으로 전한다. 플랫폼 안의 동작·게이트는 그대로다. `AnalysisChartFrame`은 아래 슬라이스 C가 다룬다.

**플랫폼 밖의 Chart Frame(`AnalysisChartFrame`, Candidate, #1953 슬라이스 C):** `AnalysisChartFrame`은 `PlatformProvider` 없이(`I18nProvider`만으로) 그려진다. 순수 차트 동작(Zoom·Brush·로컬 선택·지점 선택과 `pointActivation`·`pointActions`·툴팁·같은 데이터 표·`selectionActions`·초기화)은 플랫폼 안과 같다. Compare는 숨긴다. Annotate와 `분석 구간으로 적용`은 비활성화하고 이 화면에서 쓸 수 없다는 이유를 표시한다. 내보내기(보이는 CSV)와 `imageCopy`·`imagePrint`는 슬라이스 A와 같은 `exportActions?: { exportAllowed; notify? }`가 `exportAllowed: true`일 때만 보이고(기본 꺼짐), 결과는 `notify` 또는 버튼 옆 상태 줄로 전한다. 선택 prop `period?: { from?; to? }`(점과 같은 `YYYY-MM-DDTHH:mm:ss` wall-clock 문자열, 변환 없음 — ADR-0064; 다른 형식은 쓰지 않고 개발 경고)는 시간축 키보드 구간 선택·1h/4h 빠른 구간의 끝을 준다(플랫폼 안의 전역 기간 끝과 같은 역할). 두 prop 모두 `PlatformProvider` 안에서는 읽지 않는다 — 메뉴 `features`와 전역 기간이 결정하고, 소비자 prop으로 권한을 넓힐 수 없다.

**차트 단위 인쇄(`imagePrint`, #1665).** `AnalysisChartFrame`·`AnalysisChart`·`LaneTimeline`의 선택 prop `imagePrint`가 true이고 현재 메뉴 manifest `features.export`가 켜져 있을 때만 `인쇄` 버튼(en `Print`)을 이미지 복사 바로 뒤에 그린다. 이미지 복사와 같은 PNG를 차트 제목과 함께 숨은 iframe에서 인쇄하며, 차트 PNG는 화면 테마의 표면색을 배경으로 쓴다. 이미지는 `data:` URL로 넣는다. 운영 CSP의 `img-src`가 `blob:`을 허용하지 않기 때문이다. 화면 전체 인쇄는 제공하지 않는다(소유자 결정 #557, 2026-11-10).

**값 라벨과 합계(`valueLabels`·`reaggregation`·`serverTotals`, 가로 누적 막대만, #580 노드 580d, ADR-0082).** `valueLabels`는 `'segment'`·`'total'`·`'both'`이고 없으면 출력은 지금과 같다(가로 누적이 아니면 무시하고 개발 중 경고).
**조각 라벨**은 조각 안쪽에 자릿수 구분 수를 그리고(압축 표기 없음: ko·en 모두 `1,234`·`12.3`, 소수 자리는 |값| ≥ 100이면 0, 아니면 최대 1 — 옆의 `valueFormat` 합계와 같은 모양으로 읽힌다) 정확한 값은 툴팁에 남긴다.
보이는 시리즈가 **정확히 하나**이면 `segment`·`both` 모두 조각 라벨을 그리지 않고(`startAlign` 포함, 조각이 곧 합계) 합계만 남는다.
ECharts가 해석한 라벨 상자가 조각 상자의 폭이나 높이에 들어가지 않으면 그 라벨만 숨기고(추정이 아니라 `labelLayout`의 실제 기하 — `LabelLayout` 기능을 `EChartImpl`이 등록하고, 폭이 0인 `0` 조각도 같은 규칙이라 숨는다), `null` 조각에는 라벨이 없다.
`minMax`가 켜져(강조할 시리즈가 있어) 있으면 조각 라벨은 하나도 그리지 않고 `최소`/`최대` 칩과 합계만 남는다 — 칩과 숫자가 같은 행에서 자리를 다투므로 칩이 강조를 맡는다.
실제 그려진 결과는 `chartValueLabels.render.test.ts`가 ECharts 서버 SVG 렌더러로 고정한다.
글자색은 지원하는 막대 채움(`chart-blue·teal·green`, `cat-amber·teal·purple`, `chart-series-1…4`, `chart-status-good·warn·critical`, `chart-remainder`)마다 `text-primary`(밝은 채움)와 `text-on-accent`(어두운 채움: `chart-series-1…4`·`cat-purple`·`chart-status-warn`·`chart-status-critical`) 중 하나이며 이 채움에서는 4.5:1 이상이고 `chartValueLabels.test.ts`가 CSS 토큰을 읽어 쌍마다 고정한다.
이 집합 밖의 채움(`ChartSeries.color`는 어떤 토큰이든 받는다)은 표면색 칩 위의 `text-primary`로 그려 읽힌다.
**합계**는 `reaggregation`이 `canClientSum`일 때만 클라이언트가 보이는 조각을 더한다(`reaggregation` 없음 = 더하지 않음).
더하지 않는 측정은 `serverTotals`(범주별)로만 그리며, 서버 합계는 숨긴 시리즈까지 포함하므로 **모든 시리즈가 보일 때만** 쓴다.
숨긴 시리즈(Compare를 켰다면 이전 기간 시리즈 포함)가 있고 더할 수 있으면 보이는 조각의 합이며 이름은 `표시 합계`다.
`null` 조각이 하나라도 있는 행은(서버 합계도 같다) **부분 합계**라 굵은 숫자가 아니라 `≥ n` 기울임과 속 빈 마름모 표식으로 그리고 툴팁은 `PM3 미측정`처럼 빠진 시리즈를 말한다(전부 `null`인 행은 합계가 없다).
시리즈가 보이는데 합계가 하나도 없으면 행마다 아무것도 그리지 않고 차트마다 한 줄 `합계 없음 — 이 측정은 더하지 않습니다`만 범례 아래 안내 줄에 둔다(시리즈를 모두 끈 상태에서는 이 줄이 없다 — 상태 문장이 이유를 말한다.
`표시 합계 — …`, 부분 합계 설명 `◇ ≥ 합계: 미측정 계열이 있는 행의 합계`도 같은 줄 묶음에 한 번이며, 페이지가 이미 설명하면 선택 `partialTotalNote={false}`로 끈다).
접근 가능한 표는 같은 이름(`합계`/`표시 합계`)의 마지막 열에 `≥ n (PM3 미측정)`으로 같은 말을 쓴다.
`startAlign`(보이는 시리즈 2개 이상)에서는 조각 라벨이 레인 조각 안에 남고 합계는 레인 끝의 고정 오른쪽 열에 서며, 평범한 누적 막대는 합계가 막대 끝에 서되 마지막 쌓인 시리즈의 조각이 그 행의 최소나 최대라 `minMax` 칩이 막대 끝에 놓인 행만 칩 폭만큼 비켜서고(다른 행은 비키지 않고, `startAlign`은 비키지 않는다) 오른쪽 grid 여백은 가장 긴 합계(5자리 + 표식)를 담도록 늘어난다.
값·합계는 `startAlign`으로 바뀌지 않는다.
`stacked`에 `canClientSum`이 거절하는 `reaggregation`을 주면 개발 중 경고한다(누적은 더할 수 없는 측정의 합을 그린다).

**쌓기와 선 면 채움 (#2737).** `stackMode?: 'none' | 'stack' | 'percent'`를 주면 `stacked`보다 우선한다. `none`은 쌓지 않고, `stack`은 `canClientSum`이 허용하는 측정(`reaggregation: 'sum'`)의 막대끼리, 선끼리 원래 단위로 쌓는다. 집계 선언이 없거나 더할 수 없으면 쌓지 않고 개발 중 경고한다. `stackMode` 생략 시 기존 `stacked` 막대 동작을 유지한다.
시간축에서 명시적으로 쌓을 때는 시리즈별 wall-clock 시각을 정렬하고, 중복 시각은 개발 경고 후 첫 관측을 사용한다. 보이는 같은 종류의 시리즈끼리 시각이 다르면 계열을 따로 그리고 차트 안내 줄에 사유를 표시한다. 개발 중에는 경고도 출력한다. 선 상태 기호와 막대 윤곽은 쌓인 위치에 그린다. 원래 값으로 쌓을 때 표와 CSV의 시리즈 열에 원래 값임을 표시한다. 지점 콜백은 두 모드에서 모두 원래 값을 사용한다. 가로 누적 막대는 기존 레인·값 라벨·최소/최대 옵션을 지원한다.
`percent`는 각 x에서 보이는 실측값의 합(비교 시리즈 포함)을 분모로 사용한다. 결측값은 그대로 두고 합이 0인 x에는 비율을 표시하지 않는다. 음수가 있으면 부호 있는 값 축에 원래 값으로 쌓고 `startAlign`을 적용하지 않는다. 개발 경고와 차트 안내를 표시하며, 쌓기 안내가 바뀌면 스크린 리더에 알린다. 비율은 0–100 값 축, 툴팁, 조각 라벨, 표 및 CSV가 공유하고 표와 CSV 시리즈 열에는 `%` 단위를 붙인다. 비율을 표시할 때 합계, 경계, 기준선, 범주 값 표식, 최소·최대 강조 및 `startAlign`은 적용하지 않는다. 지점 선택기와 선택 요약은 원래 값과 단위를 유지한다.
`areaFill?: boolean`은 `true`일 때 모든 선의 면을 채우고, `false`일 때 채우지 않는다. 생략하면 기존대로 선 하나가 실선일 때만 채운다.

**`startAlign`과 `minMax`(가로 막대, #690 노드 690o).** `startAlign`(가로 누적 막대만, 그 밖에서는 무시하고 개발 중 경고)은 **시각 배치일 뿐**이다 — 값·합계·접근 가능한 표·선택 요약·내보내기는 바뀌지 않는다.
보이는 시리즈마다 레인을 하나 두고, 레인 폭은 그려진 행 전체에서 그 시리즈의 최댓값(`null`·0 이하·비유한 값은 0)이며, 모든 행의 k번째 조각은 레인 k의 왼쪽 끝에서 시작하고 레인 사이에는 레인 폭 합의 2%인 고정 간격이 있다.
행의 값이 짧으면 빈 칸이 남는다.
구현은 조각 앞에 같은 `stack`의 투명 spacer 시리즈(값 = `레인 폭(k−1) + 간격 − 그 행의 직전 시리즈 값`)를 끼우는 것이며 spacer는 `silent`·`tooltip.show: false`·강조 없음이고 범례·지점 선택기·키보드·`pointActivation`·`pointActions`·행 강조·표에 나타나지 않는다.
숨긴 시리즈는 레인을 잃는다.
값축은 더 이상 0부터의 값 척도가 아니므로 숫자 눈금과 단위 이름을 감추고 레인 시작마다 구분선과 시리즈 이름을 그리며(`markLines`는 무시), **Brush는 꺼진다** — x가 하나의 값 척도가 아니라 끌어 고른 구간이 값을 뜻하지 않기 때문이다.
이것이 위 "`rowPitch`는 Brush를 유지한다" 규칙의 예외이며, 버튼은 이유를 `title`로 밝히고 선택 요약은 구간 선택을 안내하지 않는다.
`rowPitch`·행 강조·`visibleSeriesIds`·`legend={false}`는 그대로 동작한다.
`minMax`(가로 범주 막대)는 **시리즈마다** 가장 작은 값의 행과 가장 큰 값의 행을 계산해 그 막대 조각에 굵은 윤곽(채움 변경 없음, 최소·최대는 서로 다른 두 토큰)과 `최소`/`최대` 라벨을 붙이며 `startAlign` 여부와 같게 그린다.
`null`, `isPointSelectable`이 거절한 지점, 숨긴 시리즈는 제외하고, **측정 행이 2개 미만인 시리즈와 측정 값이 모두 같은 시리즈는 강조하지 않는다**(구분할 것이 없다).
값이 모두 같은 시리즈는 침묵하지 않고 선택 요약과 키보드 지점 선택기가 선택 시리즈에 대해 `<시리즈>: 모든 값이 같음`(en `all values equal`)이라고 밝힌다.
라벨은 표면색 배경·작은 패딩·강조색 테두리의 칩이라 어떤 채움 위에서도 읽히고(굵은 윤곽은 조각에 그대로), `startAlign`이 없으면 조각 오른쪽 바깥에 두며, `startAlign`에서는 최대 조각이 레인을 꽉 채우므로 `최대`는 조각 안쪽 오른쪽 끝(`insideRight`), `최소`는 레인의 빈 곳 오른쪽 바깥에 둔다.
강조할 시리즈가 있으면 마지막 조각의 라벨이 잘리지 않도록 오른쪽 grid 여백을 확보한다.
`startAlign`에서 최댓값이 0인 레인도 이름을 잃지 않고(이름 최소 폭 보장), 보이는 레인이 모두 0이면 명목 폭으로 레인 시작을 떼어 이름을 유지한다.
보이는 시리즈가 2개 미만이면 `startAlign`은 아무것도 하지 않는다 — 일반 값축·눈금·단위가 남고 Brush도 쓸 수 있으며, 시리즈 숨기기는 일반 사용자 동작이므로 개발 경고도 없다.
행 강조와 겹치면 두 단서(윤곽 + 번짐)가 모두 보이고, 키보드 지점 선택기 항목에 `· 최소`/`· 최대`가, 선택 요약에 선택 지점 시리즈의 최소·최대가 글로 나온다.

공통 Toolbar vocabulary:

```text
Zoom
Brush
Reset
Compare
Annotate
Export
More
```

Chart Frame:

```text
Title                         Actions
Description / Metric Version
Legend
Plot
Selection Summary
Source · Updated · Coverage
```

꼬리말 `Source · Updated · Coverage`는 네 차트 틀(`AnalysisChartFrame`·`AnalysisChart`·`LaneTimeline`·`OrderedIntervalTrack`)의 `trust` prop이 그린다(#2009, #2044). `trust`는 응답의 `Trust | null`을 그대로 받는다. SDK가 `DataTrustIndicator`와 같은 함수로 글자를 만든다: 갱신은 `formatInstant`로 보는 사람의 시간대에 맞춘 `MM-DD HH:mm`, 커버리지는 `NN.N%`, 커버리지 없음은 「미확인」(en `Not confirmed`), 오프셋 없는 등 잘못된 시각은 「—」. `null`이면 꼬리말을 그리지 않는다. 메뉴는 Trust를 손으로 글자로 바꾸지 않는다. 이미 만든 글자 세 값 `{ source, updated, coverage }`도 그대로 받아 보인다. 응답 Trust가 아닌 합성 견본 표기에만 쓴다.

### 메뉴가 조립하는 차트 조각 (Decided, #541·#580 S4)

`AnalysisChartFrame`의 선택 API는 메뉴가 의미를 정하고 프레임은 지점·행·시리즈 표시만 제공한다([ADR-0063](../adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md)). 메뉴는 지점 드릴과 보조 동작을 선택해 연결한다.

- `pointActivation?: { on: 'click' | 'dblclick'; onActivate(point) }`, `pointActions?: readonly { id; label; onSelect(point); disabled? }[]`의 `point: ChartPoint`는 `{ x: string; seriesId: string; value: number | null }`이다. 시간 x는 원래 wall-clock 문자열, 범주는 소비자 문자열 그대로다. 프레임은 단계·목적지를 알지 못하며 URL·Global Context를 쓰지 않는다. 메뉴가 콜백에서 `useDrill` 등 자신의 이동을 실행한다.
- 클릭은 지점을 선택하고 ⌘/Shift+클릭은 지점을 추가한다. 네이티브 더블클릭과 포커스한 차트의 Enter는 `pointActivation.onActivate`를 실행한다. `pointActivation`이 없으면 기존 `onPointClick(x, seriesId)`를 같은 제스처로 호출한다. `on`은 소스 호환을 위해 받는다.
- 선택기에서 보이는 시리즈의 지점을 고른 뒤 `이 지점만 선택`으로 선택을 바꾸거나 `선택에 지점 추가`로 기존 선택에 더한다. `선택 지점 실행`은 고른 지점의 활성화를 실행한다. `지점 동작`은 선택 지점의 메뉴를 열며 오른쪽 클릭은 해당 지점을 선택한 뒤 같은 메뉴를 연다. 포커스된 차트에서 Shift+F10·ContextMenu 키도 같은 메뉴를 연다. 선택 전에는 첫 지점을 기본으로 사용한다. 메뉴를 이동 없이 닫으면 실제로 연 차트 또는 툴바 버튼으로 포커스가 돌아가며, 동작이 이동을 실행하면 목적지 포커스를 유지한다. `pointActions`는 목록 또는 선택 지점을 받는 함수 `(point) => readonly ChartPointAction[]`이고, 함수는 메뉴를 열 때 선택 지점으로 평가한다(지점마다 맞는 동작만 보이게 한다 — 키보드 순서·포커스 규칙·`keepsFocus`는 그대로). 선택 지점의 목록이 비면 `지점 동작`을 끄고 오른쪽 클릭·Shift+F10도 메뉴를 열지 않는다. 선택 `isPointSelectable(point)`가 false인 지점(예: 보조 행)은 지점 선택기 `<select>`에 나오지 않고 키보드로 닿지 않으며 클릭·더블클릭·오른쪽 클릭의 `pointActivation`·`onPointClick`·`onActiveCategoryChange`도 받지 않는다(함수는 `series`처럼 안정된 참조로 준다). 선택 `legend={false}`는 프레임 자체 범례와 체크박스를 그리지 않는다 — 표시를 `visibleSeriesIds`로 소유하는 페이지용이며, 없이 쓰면 사용자가 시리즈를 끌 수 없어 개발 중 경고한다(접근 가능한 표와 선택 요약은 그대로). 선택 `fillMin`(`size="fill"`, §12.8 높이 채움): `full`·`minimal`에서는 그림 상자의 바닥을 기본 320px에서 낮추며, 160px 아래는 160으로 올린다. `standard`에서는 이 값을 최초 측정 전 높이로 사용하고, 측정 뒤에는 요약·주석 행을 제외한 남은 높이에 맞춘다. Brush 모드에서는 지점 선택·실행·동작 메뉴를 끄고 이유를 표시한다. 경로 바의 이전 단계 칩·가운데 단계 메뉴·전체 버튼은 차트 없이도 키보드로 이동할 수 있다(§12.7).
- `orientation?: 'vertical' | 'horizontal'`은 기본 vertical이다. horizontal은 `xType='category'`에서만 적용하며(time에서는 무시), 범주를 입력 순서대로 위→아래 행, 값을 가로축, 시리즈를 막대로 그린다. 라벨은 소비자가 준 문자열이다. 메뉴는 선택 `rowGroups: { header; byCategory: ReadonlyMap<string, { group; label? }> }`로 읽기용 그룹 라벨을 선언할 수 있다. 연속한 같은 그룹의 행에 라벨을 한 번 걸쳐 그리며 구간 사이에 구분선을 둔다. 계층·접기·그룹 값은 없고 범주 문자열은 콜백·선택·활성 행의 식별자로 유지한다. 행에는 `label ?? category`를 보이며, 선언하지 않은 범주의 그룹은 빈 칸이다. `rowPitch` 유무와 관계없이 그룹·행 라벨의 왼쪽 여백을 확보한다. 키보드 표·지점 선택기·선택 요약·CSV도 `header` 이름의 그룹 열/부분과 짧은 행 라벨을 쓴다. horizontal 범주 차트 외에서는 무시하고 개발 중 한 번 경고한다. 범주축은 첫 입력 시리즈의 서로 다른 범주를 첫 등장 순서대로 사용하며, 각 시리즈의 중복 범주 값은 첫 값을 쓴다. 축에 없는 범주는 지점 선택기·콜백·표·내보내기에서도 제외하며 누락 값은 null이다. `stacked`는 한 행에 여러 시리즈의 세그먼트를 쌓는다. Zoom·Brush는 세로 범주축을 대상으로 하며 선택 요약·주석·표·내보내기·Trust는 같은 데이터를 사용한다. `rowGroups`가 있으면 행 라벨 칸은 가장 긴 행 라벨 폭에 맞춘다(#2356). 묶음 없는 차트의 여백은 그대로다.
- **행 순서 조각 `orderRows` (Decided, #2394, #2391):** 두 단계 범주 행(예: 설비 › Module)의 순서는 Frame이 아니라 순수 함수 `orderRows(rows, { sort, swap, sortWithinGroups, levelLabels })`가 정한다. 정렬은 `original`(기본) · `total-desc` · `total-asc`이다. `original`이고 `swap`이 없으면 입력 순서 그대로다(떨어진 같은 그룹 행도 그대로). 그 밖에는 그룹이 붙어 있다(`swap`+`original`은 그룹 첫 등장 순, 정렬이면 그룹 순서 = 그룹 안 측정된 행 합, 기본으로 그룹 안 행도 행 합 순; 측정값 없음·유한하지 않은 값은 양방향 모두 끝, 동점은 입력 순서). `swap`은 두 단계를 바꿔 안쪽 키로 묶는다. `levelLabels`를 주면 결과의 `groups`를 그대로 `rowGroups`에 넘긴다. 정렬·바꾸기 상태와 그 저장은 메뉴 몫이다.
- 선택 `bounds?: ChartBounds`는 세로 시간·범주 차트에서 x별 하한·상한을 그린다(#2333). `ChartBounds = ReadonlyMap<string, { lower?: number; upper?: number }>`이며 키는 지점의 원래 wall-clock·범주 문자열이다. 시간은 `toMs` 순서, 범주는 축 순서로 정렬하고, 각 항목을 다음 항목의 x까지 유지한다. 마지막 항목은 현재 기간의 마지막 데이터 x까지 유지한다. 항목에서 빠진 쪽은 그 구간에서 비워 두며 보간하지 않는다. 상한은 긴 파선, 하한은 짧은 파선이고 양쪽이 있는 구간만 낮은 불투명도로 채운다. 값 축은 기준 범위를 포함한다. `boundLabels?: ChartBoundLabels`(`{ upper?; lower?; band? }`)는 범례·읽기 보조의 라벨이며 기본은 `상한`·`하한`·`기준 범위`다. 실제 존재하는 부분만 시리즈 뒤 범례에 보이고, 키보드 표·CSV에 하한·상한 열, 툴팁·지점 선택기·선택 요약에 같은 값을 보인다. 없는 값은 빈 칸이다. 툴팁·지점 선택기·선택 요약의 경계 문구는 값이 있는 쪽만 표시하고 양쪽 모두 없으면 경계 안내 줄을 생략한다(#2426). 기준은 현재 기간에만 속하며 비교 지점에는 붙이지 않는다. 가로 차트에서는 무시하고 개발 중 한 번 경고한다. `markLines`와 함께 쓸 수 있으며 Zoom·Brush·주석의 동작은 유지한다. 두 타입은 공개 API이며 scatter의 `xCategories.bounds`·`boundLabels`도 같은 타입을 쓴다. scatter와 Frame은 기준선(referenceLine) 색·기본 라벨·경계 정규화를 공유하며, 비유한 쪽은 비우고 하한이 상한보다 큰 쌍은 개발 진단 후 그 구간의 양쪽을 비운다(#2362).
- 선택 `pointStatus(point): ChartStatus | undefined`는 보이는 막대 조각(누적 포함)과 선 지점의 소비자 판정을 표시한다. `ChartStatus`는 `{ tone: 'danger' | 'warning' | 'neutral'; label; reason?; marker? }`이고 SDK는 값으로 판정하지 않는다. 톤별 기호는 방향 없이 심각도만 뜻한다: danger `■`, warning `◆`, neutral `○`(#2363; danger는 범례의 일반 점 ●과 모양으로도 갈리도록 사각형, #2383). 판정에 방향이 있으면(예: 하한 미달 `▼`) 메뉴가 선택 필드 `marker`에 한 글자를 선언하고, 그 기호가 차트·범례·툴팁·표·CSV에서 톤 기호를 대신한다. 한 글자가 아니거나 `{`·`}`·`|`(차트 서식 문법)이면 톤 기호를 쓴다. 같은 `(tone, label)`에는 같은 `marker`를 준다. 시리즈 채움색은 유지하며 상태 테두리와 톤별 기호를 함께 그린다. 막대 조각과 히트맵 칸의 상태 테두리(2px)와, 테두리가 채움과 3:1 대비를 못 낼 때 더하는 중립 받침(2px)은 모두 그 조각·칸 **안쪽**에 그리고, 둘을 합친 두께는 조각·칸의 짧은 변의 1/4을 넘지 않게 줄인다(받침이 0.5px 미만이면 생략). 그래서 얇은 칸도 채움이 대부분 남고, 이웃 조각·칸이나 그림 영역 밖을 덮지 않는다(#2351). 두 고리는 실제 조각·칸 크기로 정하는 한 층이 그린다. 막대의 기본 테두리는 상태 조각에서 0이고, 한 변이 0px인 히트맵 칸(조밀한 격자·측정 전)에는 고리도 그리지 않는다. 히트맵 테두리는 픽셀 단위 사각형이라 가로로 긴 칸에서도 네 변 두께가 같다. 선 지점은 상태색 테두리의 원과 표면색 바깥 고리·톤 기호로 표시하며, 선의 일반 기호가 꺼져 있어도 상태가 있는 지점만 기호를 그린다(#2333). 숨긴 시리즈와 null·비유한 값에는 상태 기호를 그리지 않는다. `AnalysisChart`의 히트맵 `HeatmapCell.status?: ChartStatus`도 같은 표시를 쓰며 `scale`과 독립이다. threshold 색도 유지하고 null 칸에도 주어진 상태를 표시한다. 범례는 실제 표시한 상태의 서로 다른 `(tone, label)`을 시리즈/값 범례 뒤에 한 번씩 보이며, 툴팁·선택 요약·키보드 표의 상태 열·CSV의 상태/사유 열은 `label`·`reason`을 전달한다. 색만으로 상태를 구분하지 않는다(06 §26). 옵션이 없으면 옵션 객체·DOM·표·CSV·요약의 기본 출력은 그대로다.
- `visibleSeriesIds?: readonly string[]`이 있으면 현재·비교 시리즈의 표시는 이 prop만 따른다. 범례는 `onVisibleSeriesChange?(ids: string[])`로 다음 표시 집합을 요청하고 자체 표시를 바꾸지 않는다. 없으면 기존 로컬 표시 상태를 쓰며 콜백은 변경을 알린다. Reset은 현재 범례의 모든 ID를 요청하고, controlled 소비자는 수락 여부를 정한다. 모든 시리즈를 끈 상태는 `표시할 시리즈를 모두 껐습니다`로 표시하며 데이터 없음으로 취급하지 않는다. 이 상태의 문장 옆에 `모두 보이기` 버튼을 둔다: controlled이면 `onVisibleSeriesChange`로 현재(비교가 켜졌을 때만 비교 포함) 시리즈의 모든 ID를 요청하고, `visibleSeriesIds`가 없으면 로컬 표시를 모두 되살린 뒤 콜백이 있으면 알린다. `LegendTree`는 `onDrill`이 있고 모든 보이기 잎이 꺼졌을 때 트리 머리에 같은 이름의 버튼(일반 Tab 정지점)을 그려, 입력 집합에 모든 잎을 더해 `onVisibleChange`로 보낸다(그 밖의 ID는 유지). 트리 제스처: 시리즈 행의 체크박스·이름 클릭·Space는 보이기이고, `onDrill`이 있으면 Enter는 드릴 가능한 행에서 드릴(펼침·`onSelect` 아님)이다. 드릴 가능한 행은 `drillOnly` 노드, 선택 `canDrill(id)`가 true인 행, `canDrill`이 없으면 자식 있는 행이며(`drillOnly`가 `canDrill=false`보다 앞서고, `onDrill`이 없으면 `canDrill`은 효과가 없다), 그 밖의 행의 Enter는 자식이 있으면 펼침 토글, 잎이면 무동작이다. 드릴 가능한 현재가 아닌 시리즈 행은 hover/focus 때 보이는 `<이름> 단계로 이동` 버튼(`tabIndex=-1`)을 갖고, `drillOnly` 노드는 체크박스·`aria-checked`·보이기 잎이 없고 행 클릭이 드릴이다. 현재 단계는 `aria-current`(`aria-selected` 아님)이며 드릴은 보이기를 바꾸지 않는다([ADR-0084](../adr/0084-legend-tree-drill.md)). 선택 prop(#2395, 기본 동작 불변): `hint`는 트리 머리에 사용법 한 줄(예: `이름: 단계 이동 · 체크: 포함/제외`)을 그리고 트리의 `aria-describedby`가 된다. `currentLabel`은 `onDrill`이 있을 때 `currentId` 행에 보이는 표시(예: `현재`, `aria-hidden` — 의미는 `aria-current`)를 단다. `drillOnName`(기본 `false`)이 true이고 `onDrill`이 있으면 드릴 가능한 행의 이름 클릭이 보이기 대신 드릴이고(현재 행은 `drillOnly`를 포함해 무동작), 체크박스·Space는 그대로 보이기다. 이 경우 `hint`로 제스처를 알린다. 선택 `onCheck?(id, checked)`(#2416)가 있으면 체크(클릭·Space)는 `onVisibleChange` 대신 누른 노드 id와 새 체크를 알린다(가지와 그 유일한 leaf가 같은 leaf를 덮어도 구분됨). 선택 `checkedOf?(id)`는 노드의 체크(`true`·`false`·`'mixed'`)를 메뉴가 직접 주고, `undefined`면 leaf에서 계산한다. 메뉴가 축이 둘인 체크(예: Motion 포함과 Module 포함)를 스스로 들 때 쓴다. `모두 보이기`는 그대로 `onVisibleChange`다.

### 마크·축·격자 기본값 (Decided, #2725)

`EChart`는 모든 차트를 SDK의 ECharts 테마(`chartMarks.ts`의 `CHART_MARKS`·`CHART_ECHARTS_THEME`) 위에 그린다. 그래서 `AnalysisChart`·`AnalysisChartFrame`·`topNBar`와 소비자가 직접 만든 옵션이 같은 기본값을 받고, 옵션에 적은 값이 이긴다. 색은 테마가 아니라 옵션(`chartTheme()`)이 토큰에서 읽는다.

- 글자: 차트 기본·축 라벨·축 이름 12px. 마크 안 값 라벨만 더 작다.
- 격자: 값 축에만 1px 실선(`chart-grid`). 범주·시간 축에는 없다(히트맵 칸 경계는 예외). 산점도는 두 값 축 모두 격자. 오른쪽 값 축은 격자를 그리지 않는다.
- 축: 눈금 표시 없음. 값 축 선 없음. 범주·시간 축 기준선은 `border-control`.
- 막대: 최대 40px, 범주 간격 35%, 막대 간격 12%. 값 끝 모서리 2px(세로는 위, 가로는 오른쪽), 누적 조각은 0. 상태 테두리 층은 같은 배치를 따른다.
- 선: 2px, 점선·파선(비교·이전 기간) 1.5px. 점은 12개까지 그리고 넘으면 hover 때만 그린다(markPoint가 있거나 선택한 지점이 있는 시리즈는 유지). 보이는 시리즈가 실선 하나뿐이고 막대가 없으면 아래를 불투명도 0.09로 채운다.
- 막대 안 값 라벨 색은 채움 위 4.5:1을 넘는 쪽(`segmentLabelStyle`)이다.
- 축 끊김: `AnalysisChartFrame.yFit` 선 차트의 값 축이 0에 닿지 않으면, 범주 기준선 시작점에 빗금 두 줄(`border-control`, 바탕은 카드 면)을 그린다. 모든 값이 0보다 크면 아래쪽, 모두 0보다 작으면 위쪽이다. 0이 축 범위 안이면 그리지 않는다. 범위는 ECharts가 그린 축에서 읽는다. 막대 수량 축은 늘 0에서 시작한다.
- 높이 단계(`CHART_HEIGHTS`): compact 200px, regular 280px(`AnalysisChart`)·260px(`AnalysisChartFrame`), hero 360px, fill 최소 320px. 행 기반 차트(`topNBar`, `rowPitch` 가로 막대)는 행 수만큼 자라며 `topNBar` 기본 행은 28px이다.
- hover(#2736): 올린 계열만 강조한다 — 선은 1px 굵어지고, Chart Frame 막대는 계열 선색 1px 테두리를 얻는다. 나머지 계열은 기본으로 흐리지 않는다(#2342 소유자 결정). 흐림을 켠 차트(`emphasisFocus: 'series'`)의 나머지 계열은 불투명도 0.3이다(ECharts 기본 0.1 대신). 선택·행 강조·최소/최대·상태 테두리가 있는 막대는 hover 때도 그 테두리를 유지한다.
- 선택 마크(#2736): 원래 채움을 두고 `chart-selection-outline` 1.5px 링을 두른다 — Chart Frame의 선택 지점, 산점도·히트맵·도넛·파레토·Top N. 상자 그림은 상자가 테두리로 그려져 링이 색을 가리므로 선택 때 계열 테두리를 3px로 굵게 한다. `LaneTimeline`·순서 구간 트랙의 선택 구간은 컨펌된 2px 선택 테두리를 유지한다.
- 구간 띠(#2736): 끌기(Brush) 중인 띠와 선택한 구간은 모든 차트에서 `chart-selection-outline` 불투명도 0.1로 채운다 — Chart Frame Brush와 선택 구간, 산점도·히트맵 사각 끌기, `LaneTimeline`·순서 구간 트랙의 구간 선택(2px 테두리는 그대로).

### 종류별 상호작용

`AnalysisChart`의 `ChartSpec`은 종류와 입력 데이터의 유효 조합을 고정한다([ADR-0058](../adr/0058-analysis-chart-spec-union.md)). 기존 line/bar `AnalysisChartFrame` 소비자는 그대로 유지한다.

| 종류 | Zoom | Brush·선택 | Reset | Compare | Annotate | Export | Drill | 표로 보기 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| heatmap | — | 클릭·사각 끌기·표 체크박스로 셀 다중 선택 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 같은 셀 데이터·선택·상세 |
| donut | — | 클릭·표 체크박스로 한 항목 선택, 재클릭 해제 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 같은 구성비 데이터·선택·상세 |
| scatter | — | 클릭·사각 끌기·표 체크박스로 점 다중 선택(범주 칸 안 지터 포함) | 선택·끌기 영역 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | ID·그룹·양축 값과 단위·미확인·선택·상세, 선택 범주 모드의 그룹·짧은 라벨·하한·상한, 소비자 상태·사유 |
| boxPlot | — | 박스·중앙값·이상치 클릭·표 체크박스로 한 그룹 선택, 재클릭 해제 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 그룹·다섯 통계·n·이상치·미확인·선택·상세 |
| pareto | — | 막대 클릭·표 체크박스로 항목 다중 선택, 누적선은 선택하지 않음 | 선택 해제 | — | — | manifest `features.export` | 단일 실제 항목 선택 요약·표 행의 상세 버튼, 기타는 없음 | 표시 순서의 값·누적 %·기타·선택·상세 |
| histogram | — | — | — (지울 선택·확대 없음) | — | — | manifest `features.export` | — | 구간 시작·끝·개수·전체 대비 비율·소비자 상태·사유, 키보드 접근 가능 |
| topNBar | — | 막대 클릭으로 선택, ⌘/Shift+클릭으로 추가, 표 체크박스 | 선택 해제 | — | — | manifest `features.export` | 더블클릭·Enter·요약 및 표 행의 상세 버튼 | 표시 TopN과 같은 순서·값·선택·상세 |
| LaneTimeline (별도 API) | Ctrl/⌘+wheel·버튼·키보드 확대, drag 이동 | 클릭·방향키/Enter 단일 선택, Escape 해제; 선택 `rangeBrush`면 `구간 선택`·drag·Shift+←/→ 시간 구간 | 시간 viewport 초기화 | — | — | manifest `features.export`(CSV·이미지, #2792) | — | 방향키/Home/End 탐색·DOM 텍스트 요약·구간 표(줄·시작·끝·상태·길이, #2792) |

`ChartSeries.step`의 `'start' | 'middle' | 'end'`는 선의 계단 위치를 정한다. 생략하면 직선으로 연결하며 결측 지점은 연결하지 않는다. `AnalysisChartFrame.yFit`은 세로 선 차트의 왼쪽 Y축을 값 범위에 맞추고, 선언된 축 확장 범위도 포함한다. 생략하면 기존 0 기준을 사용한다.

`AnalysisChartFrame`은 시간축 눈금을 관측된 버킷 경계에 놓는다(#2579). 버킷 간격을 추론할 수 있으면 표시 구간과 차트 폭에 맞춰 버킷 간격의 배수를 사용한다. 그 간격으로 표시 구간에 눈금이 하나도 나오지 않으면 구간의 첫 관측 버킷을 기준으로 삼는다. 관측 시각이 하나뿐이면 그 시각에만 눈금과 라벨을 표시하고 축 범위는 자동으로 정한다.

**히트맵 밀도 선택 옵션 (#2431):** `HeatmapSpec.minRowHeight?: number`에 양의 유한 px 값을 주면 모든 y축 라벨을 표시하고 행마다 그 높이를 확보한다. `size="fill"`은 차트 내부에서 세로 스크롤하며 다른 크기는 내용 높이로 늘어난다. 생략·비유한·0 이하 값은 기존 자동 높이·라벨 간격을 유지한다. 최소 캔버스 높이는 `heatmapMinCanvasHeight(rows, minRowHeight)`(행 × 행 높이 + 축 공간, #2755)다. `statusDisplay?: 'marker' | 'border'`의 기본은 `marker`이며, `border`는 셀 내부 기호만 생략하고 상태 테두리·범례·툴팁·표·CSV·선택 요약은 유지한다.

**도넛 높이 맞춤 (#2431):** standard chrome의 fill 도넛은 사용 가능한 그림 높이에 맞춘다. ECharts의 백분율 반지름은 폭·높이 중 작은 변을 기준으로 한다. 중앙 라벨을 위해 그림 최소 높이는 112px, 전체 차트 최소 높이는 256px이며 이보다 낮은 패널에서는 기존 패널 스크롤 경로로 전체 고리를 확인한다. 이 최소 높이는 다른 차트 종류나 full/compact chrome을 바꾸지 않는다.

출력 미선언 선택은 Chart Local State다. 선언한 분석 선택 출력은 메뉴 URL에 기록한다. Global Context 변경 시 선택을 지우고 spec 변경 시 사라진 키를 버린다. 기본 캔버스 클릭은 드릴하지 않는다. 히트맵은 선택 `cellActivation: { on: 'click' | 'dblclick', onActivate(x, y) }`로 셀 실행을 선언한다. 키보드는 표 체크박스로 셀 하나를 선택한 뒤 선택 요약의 `선택 지점 실행`을 Enter로 실행하며, 기존 `onCellClick` 상세 버튼은 독립적으로 유지한다. 표의 체크박스와 상세 버튼이 키보드 경로이며, 선택은 체크 상태와 요약 글로도 표시한다. 합성 항목(기타·미분류)은 소비자 ID가 없으므로 상세 버튼이 없다. 눈에 보이는 데이터 요약을 차트 section의 `aria-describedby`로 연결하며, 표와 CSV는 같은 데이터 투영을 쓴다. 히트맵의 누락 좌표는 빈 자리로, null은 미확인 표식으로, 0은 값으로 구분한다. threshold 색은 승인된 실제 판정에만 쓰고 범례에 세 판정명을 함께 적는다.

`DonutSpec.selectedId?: string | null`은 주어진 조각을 선택하고 중앙에 이름·값·비율을 보이며(null·알 수 없는 ID는 선택 없음), 클릭·표 선택·초기화 뒤에는 `selectedId`나 전역 Context가 바뀔 때까지 로컬 선택을 유지하고 `onSelectedChange(id | null)`로 선택만 알리며(합성 항목·해제는 null), `onSliceClick`은 기존 상세 버튼에서만 실행한다(#2445).

`HeatmapSpec.categories?: readonly HeatmapCategory[]`(#2441)는 `{ id, label: Text, tone: Tone }` 목록과 `HeatmapCell.category`로 수치 scale 대신 범주 채움·범례를 선언한다. `Tone`은 `StatusBadge`의 success·warning·danger·neutral·info를 그대로 쓰며, 각 상태의 기존 soft 배경과 짝지은 label 글자색으로 칸 값을 불투명하게 표시한다. 툴팁·표·CSV·선택 접근 이름에 같은 번역 범주명을 포함하고 `status`의 테두리·기호·사유는 독립적으로 유지한다. 범주 ID가 없거나 선언에 없으면 값은 그대로 두고 채움·범주명만 미확인으로 표시한다. `categories`를 생략하면 수치 scale·표·CSV·이벤트·렌더링은 그대로다.

scatter의 null 좌표는 표에 미확인으로 남기고 플롯에서는 제외한다. 그룹은 색과 기호로 함께 구분한다. 선택 `xCategories`를 주면 `order`의 범주를 왼쪽부터 칸으로 놓고 점의 `category`로 배치하며 수치 `x`와 `xUnit`은 쓰지 않는다(축 이름은 `xLabel`). 빠지거나 선언되지 않은 범주의 점은 개발 진단과 함께 제외한다. `jitter`는 칸 너비에 대한 퍼짐 비율로 기본 0.6, 범위 [0, 0.9]이며 0은 칸 중앙이다. 점 ID의 안정 해시로 위치를 정하므로 입력 순서와 반복 실행에 흔들리지 않는다. null y는 표에 미확인으로 남고 그리지 않는다. `groups`는 `ChartRowGroups`와 같은 선언으로 짧은 칸 라벨 아래에 연속 그룹마다 라벨을 한 번 걸쳐 그리고 그룹 사이에 구분선을 둔다. 표·CSV·점 선택기·선택 요약에도 선언한 그룹 헤더와 짧은 라벨을 쓴다. `bounds`는 범주마다 하한·상한을 각각 선택 제공한다. 상·하한은 서로 다른 점선 패턴으로 칸 너비에 걸쳐 그리고 둘 다 있을 때만 옅은 띠를 채운다. 이웃한 같은 값은 이어 그리며 y 범위에 경계를 포함한다. 실제 있는 선·띠만 범례에 내고, 표·CSV·점 선택기·선택 요약은 점의 범주별 하한·상한을 표시하며 없는 값은 빈 칸이다. `boundLabels`로 범례와 열 이름을 바꿀 수 있다(기본 상한·하한·기준 범위). `ScatterPoint.status`는 수치·범주 모드 모두 소비자가 준 판정만 받으며 SDK는 경계로 판정을 만들지 않는다. #2326의 상태 테두리·톤별 기호와 (tone, label)별 범례, 툴팁·표·선택 요약·CSV의 상태·사유 글을 재사용한다. 차트 요약 줄은 점별 상세를 늘어놓지 않고 상태별 개수만 더한다. 색만으로 그룹·상하한·상태를 구분하지 않으며 새 옵션이 없으면 기존 투영을 유지한다.

`ScatterSpec.density='quiet'`는 선택 옵션이다. 일반 점 6px·채움 0.45, 소비자 상태 점 같은 6px·채움 0.6·불투명도 0.75의 상태색 1px 고리를 쓰고 바깥 받침을 생략한다 — 같은 칸에 기준 밖 점이 쌓여도 정상 점보다 조금만 진하게 보이도록. 모든 묶음은 원 하나로 그리고(6px에서 모양 차이는 읽히지 않는다), 범주 요약은 묶음 이름을 나열하지 않고 개수만 쓴다. 상태 기호는 hover·선택 때 표시하며 기준 띠(0.12)·점선·선택 강조·표·CSV는 유지한다. 범주 가로축은 quiet와 무관하게 겹치는 라벨을 숨기고, 칸 폭보다 긴 묶음 라벨은 그리지 않는다(구분선은 남김).
quiet의 정지 상태에서는 고리·크기로 상태 유무를 구분하지만 톤은 색에 의존하므로 hover·선택 기호, 범례·요약 개수·표로 확인한다. SDK는 경계 위치로 상태를 추론하지 않는다.
일반 점은 표면 대비 3:1 미만이며 6px에서는 그룹 모양도 구분하기 어려워 그룹 확인은 색·툴팁·표, 데이터 확인은 키보드 표·CSV·요약에 의존한다.

boxPlot은 원자료 대신 호출자가 계산한 통계를 받으며 min/max는 그릴 수염 끝점이다(Tukey 모드도 실제 inlier 끝점을 호출자가 계산). 유효하지 않은 통계와 미제공 n은 미확인이다. Pareto는 유효한 원본 항목을 값 내림차순으로 안정 정렬하고 표시 한도(기본 10, 최소 2)에 기타를 포함한다. 기타는 항상 마지막이며 누적률은 유효한 원본 합계를 분모로 표시 순서를 따른다. 목표 도달 요약은 정렬한 원본 항목 수를 센다(목표 기본 0.8, 유효 범위 (0,1]). 요약의 항목 수도 원본 항목 수이며, 기타로 묶였으면 화면 행 수를 함께 밝힌다(«원본 12개 항목(화면 4행, 나머지 기타) · 합계 165 건 · 상위 5개 항목이 80% 도달», #2720). 합계 0이면 도달을 주장하지 않는다.

**histogram (Decided, #2429):** 공개 `HistogramSpec`은 `bins: HistogramBin[]`(`{ start; end; count }`) 또는 `values: number[]` 중 정확히 하나와 `xUnit`·`xLabel`을 받는다. 주어진 bins는 정렬하거나 재집계하지 않고 수치 축의 실제 폭·간격으로 그린다. 유한한 start < end, 음수가 아닌 안전 정수 count(정수와 차이 1e-9 이하는 반올림), 입력 순서에서 앞서 수락한 bin과 겹치지 않는 항목만 수락하며 나머지는 개발 진단 후 제외한다. values의 비유한 값과 명시적 `binning.domain: [min, max]` 바깥 값은 개발 진단 후 제외한다(양 끝은 포함). `binning.width` 또는 `binning.count` 중 하나로 같은 폭의 구간을 정한다. 둘 다 없으면 Sturges `ceil(log2(n) + 1)`을 1–512로 제한한다. count도 양의 안전 정수이며 최대 512로 제한하고 개발 진단을 남긴다. width는 유한 양수이고 512개를 넘게 요구하면 진단 후 빈 상태로 거부하며 임의로 넓히지 않는다. width 사용 시 min부터 시작하여 마지막 구간 끝이 max를 포함하도록 올림하고, 그 밖에는 max에서 끝난다. 구간은 `[start, end)`이고 마지막 끝만 포함한다. min과 (count 지정 또는 단일 값일 때) max는 그대로 두고, 그 밖에 계산한 경계(width 사용 시 마지막 끝 포함)는 유효숫자 15자리로 정리해 부동소수 누적 오차(0.1×3)를 없애되, 그 이동이 구간 폭의 1e-9 이하일 때만 정리하고 아니면 계산값을 그대로 쓰며, 각 값의 소속은 이렇게 내보낸 경계와의 비교로만 정한다(표·툴팁·CSV·`binStatus`에 보이는 구간과 개수가 항상 일치). 단일 값은 기본 폭 1(수치 표현에 필요하면 더 넓게)의 구간 하나를 중심으로 만들며 명시 count·width는 그대로 적용한다. 잘못된 조합·domain·수치로 표현 불가능한 구간은 개발 진단 후 빈 상태다. 비율은 수락한 값의 전체 개수 대비 %다. `referenceLines: { id; value; label; tone?: ChartStatus['tone'] }[]`는 수치 x축에 파선·라벨을 그리며 축을 바깥 기준선 값까지 확장한다. 라벨은 선에서 플롯 가운데 쪽으로 놓여(축 앞쪽 절반의 선은 오른쪽, 나머지는 왼쪽) 축 양 끝의 기준선 라벨도 플롯 안쪽으로 그린다. 라벨이 고른 쪽 남은 폭보다 길면(좁은 플롯) 밖으로 나갈 수 있다. 비유한 값·중복 ID는 개발 진단 후 제외하고 tone이 없으면 중립 기준선 색을 쓴다. `binStatus(bin)`의 소비자 판정만 상태색 채움·기호·상태 범례로 표시하며 기준선으로 상태를 추론하지 않는다. 기호는 입력 순서에서 경계가 맞닿고 tone·label이 같은 연속 상태 bin(소비자가 상태를 부여한 0개 bin 포함)마다 가장 높은 첫 bin 위에 하나만 표시하며, 채움색·툴팁·키보드 표·CSV·상태 범례는 bin별 판정을 유지한다. 툴팁은 구간·개수·비율·상태 사유, 같은 데이터의 키보드 표와 CSV는 시작·끝·개수·비율·상태(기호 포함)·사유를 제공한다. 관측값이 없는 명시 bin의 0도 데이터이며 입력이 비면 기존 빈 상태를 쓴다. 표·CSV·이미지 복사·인쇄는 기존 프레임과 권한 게이트를 재사용한다. Brush·선택·드릴·Zoom·Compare·Annotate는 제공하지 않는다.

### TopN·Lane 시간선 (Decided, #576)

[ADR-0064](../adr/0064-topn-bar-and-lane-timeline.md)의 `topNBar`는 소비자가 집계한 전체 항목을 받아 안정 내림차순·기본 상위 8개를 표시한다. 공동 1위는 지정한 상위 N개를 넘겨도 모두 표시한다. 범례와 막대 값 라벨에는 단위를 붙인다. 음수·비유한 값·잘못된 색·중복 ID는 제외(첫 유효 항목), 잘못된 N은 8로 복구하며 개발 진단을 남긴다. 0은 데이터다. 표시 토큰에 해당하는 소비자 범례만 토큰당 한 번 표시한다. 기본 접힘, controlled/uncontrolled 펼침, `hideWhenEmpty`(기본 false)를 제공한다. 선택 옵션 `selectedId`는 페이지가 지금 보이는 항목(예: 주소의 설비)이다. 주면 차트가 그 항목을 따른다. 그 막대가 그려져 있으면 선택이고(행이 늦게 오거나 N이 늘어도), 그려지지 않았지만 유효한 입력 항목이면 선택 요약이 `<라벨> · 상위 N개 밖`이라고 말한다. 클릭·초기화·Brush는 선택을 차트 안의 것으로 바꾸고, 값이나 전역 Context가 바뀌면 다시 따른다. `null`은 아무것도 따르지 않는다(선택 없음). 주지 않으면 선택은 지금처럼 차트 안에만 있다(#2187). 명시 height가 없으면 플롯은 `max(120, 표시 수 × 28 + 24)`px이며 긴 라벨 전문은 툴팁·표로 확인한다. 막대 두께는 아래 마크 기본값(행 높이의 65%, 최대 40px)을 따른다. Pareto의 기타·누적률을 만들지 않는다.

누적/계열 차트의 범주 행에서 드릴이 가능한 가로 막대는 `AnalysisChartFrame orientation="horizontal"`을 써 잘리지 않는 전체 폭 라벨을 유지하고, 단일 측정값 순위에 상위 N 자르기·접기가 필요하면 `topNBar`를 써 112px 라벨 말줄임을 적용한다. 막대 두께는 둘 다 마크 기본값을 따른다.

`LaneTimeline`은 `AnalysisChart` union 밖의 직접 Canvas 2D 시간선이다. §6의 시간대 없는 설비 wall-clock을 UTC getter 기반 epoch ms로 인코딩해 받고, 사용자 표시는 시간대 없이 한다. depth/rank·색 토큰·의미적 orphan/open 경계도 소비자가 제공한다. 112px gutter·24px 행·depth당 2px inset(최소 높이 2px)·최소 구간 폭 1.5px, 최소 전체 폭 352px 아래에서는 가로 스크롤한다. 축은 세로 스크롤 밖에 고정하고 backing canvas와 hit-test는 가시 행만 대상으로 한다. 가장 깊은 구간, 동률은 나중 입력이 우선한다. LOD 레인의 포인터 잡기는 포인터가 놓인 픽셀 열의 커버리지 승자를 고르므로 툴팁과 클릭 대상이 칠한 구간과 같다. rank strong/weak/off는 원래 두께/절반 두께·alpha·점선/숨김이며 선택 강조는 독립이다. orphan은 꺾쇠, open은 점선 끝과 텍스트로 표현하며 viewport clip으로 만들거나 지우지 않는다. 그리기는 두 canvas로 나뉜다. 데이터 canvas(`role=img`, 포인터 이벤트와 `getBoundingClientRect`의 대상)는 구간만 그리고, 같은 sticky 래퍼 안의 형제 오버레이 canvas(`aria-hidden`, `pointer-events-none`)는 선택 윤곽을 데이터 위에 항상 마지막으로 그린다. 레인의 보이는 구간 수가 plot 폭(px) 이상이면 그 레인은 LOD로 그린다: 구간이 닿는 픽셀 열마다 레인×depth별로 가장 많이 덮는 구간의 색을 고르고(동률은 나중 입력), depth 안에서 이웃한 같은 색 열을 한 `fillRect`로 합쳐 색별로 묶어 채운다(depth 순서는 바꾸지 않는다). 합치는 키는 색과 rank 윤곽 스타일이며 둘 중 하나라도 다르면 합치지 않는다. 커버리지는 전체 정밀도로 비교한다. rank 윤곽·orphan·open 장식은 열을 이긴 구간에만 정확 경로와 같은 코드로 그리되, 같은 depth에서 나중에 그려지는 승자가 이긴 열(글리프가 튀어나온 폭 포함)로는 잘라 그리므로 정확 경로에서 뒤 구간에 덮일 장식은 LOD에서도 보이지 않는다. 구간·depth별 버킷은 depth 하나씩 폭 크기 버퍼 한 쌍을 재사용해 depth 수에 비례해 늘지 않는다. 이긴 구간이 한 열을 온전히 덮는 열은 정확 경로와 같고, 가장자리 열은 이웃한 승자 색으로만 다르다. 밀도가 낮은 레인(확대한 화면)은 이전과 같은 `fillRect` 순서로 구간마다 그린다.

`LaneTimeline`의 `overlays?: TimelineOverlay[]`는 메뉴가 시각·구간·구간 집합에 표시를 얹는 선언형 길이며([ADR-0144](../adr/0144-lane-timeline-declarative-overlays.md)) SDK는 로그·동작·설비 같은 의미를 모른다. 종류는 셋이다: `instant`(`id`, `time`, 선택 `laneId`·`colorToken`·`dash: boolean | number[]`·`label`: 세로선), `range`(`id`, `start`, `end`, 선택 `laneId`·`colorToken`·`label`: 반투명 띠와 테두리), `segments`(`id`, `segmentIds`, 선택 `colorToken`, `style: 'outline' | 'fill'`: 모델의 id 표로 찾은 구간의 윤곽 또는 채움). `laneId`가 있으면 그 레인 행에만, 없으면 모든 레인에 걸쳐 그린다. 쌓는 순서는 데이터 canvas < 오버레이(종류 순서 range < instant < segments, 같은 종류 안에서는 배열 순서) < 선택 윤곽이며 모두 오버레이 canvas에 그리므로 이미지 복사에도 들어간다. 유한하지 않거나 JS Date 범위(±8.64e15)를 넘는 시각, `start > end`, 중복 `id`는 제외하고 개발 진단을 남기며, 모르는 레인·구간 id는 조용히 건너뛰고 진단은 한 번이다. `label`이 있는 표시는 화면 읽기용 요약에 목록으로 나온다(canvas 내용은 보조기기에 보이지 않는다). 배열은 메모이즈한다: 새 배열은 값이 같아도 오버레이 층을 한 번 다시 그린다.

`LaneTimeline.quiet`은 확대·축소·초기화와 표로 보기·내보내기(#2792)를 이름이 있는 아이콘 버튼으로 표시하고, 경계 안내·선택 요약·탐색 읽기 줄을 시각적으로 숨겨 보조기기에는 남긴다. 구간 선택 확대 버튼은 계속 표시한다. `tickSpacing`은 달력 단위의 눈금 간격을 정하는 목표 픽셀 값이며, 생략하거나 유효한 양수가 아니면 160px를 사용한다.

`LaneTimeline.separateRows`(#2497)는 기존 `--spacing-4` 간격만큼 막대 사이를 띄운다. 막대의 위아래를 같은 양만큼 줄여 레인 이름과 24px 행 위치를 유지하며 포인터 판정과 선택 윤곽도 줄어든 막대를 따른다. 생략하면 기존 행 모양을 유지한다.

`LaneTimeline`의 선택 `rangeBrush?: RangeBrushOptions`(#1860)는 `OrderedIntervalTrack`의 구간 선택을 같은 생김새와 키로 더한다. 주면 도구줄에 `구간 선택` 토글(아이콘과 글자, `toggle` 변형: 켜짐은 선택 면과 선택 테두리)이 확대 초기화 앞에 생기고, 켜진 동안 plot drag(3px 초과)는 이동 대신 시간 구간을 고르며 클릭은 구간을 선택하지 않는다. Shift+←/→는 구간 끝을 보이는 창의 1/20씩 옮기고(시작은 구간 시작, 없거나 보이는 창 밖이면 보이는 창의 시작) 토글을 켠다. 이때 도움말 툴팁과 화면 읽기용 도움말도 `구간 선택을 켠 뒤 끌기 / Shift+←→`를 더한다. 구간은 오버레이 canvas에 플롯 높이 전체의 2px `chart-selection-outline` 테두리와 같은 색 불투명도 0.1 채움(#2736)으로 표시 위·선택 윤곽 아래에 그리고, drag 중에도 그린다. 선택 요약은 `선택 구간: 시작–끝`과 `선택 구간 확대`를 선택한 막대의 요약보다 먼저 보인다. Escape와 `확대 초기화`가 구간을 지우고 토글을 끈다. 구간은 Chart Local State다. 주지 않으면 토글이 없고 drag·Shift+방향키·요약이 지금과 같다. 같은 상태와 키보드 대체 입력은 도메인 없는 `useRangeBrush`로 공개되어 메뉴가 직접 그린 시간·순서 축 표면도 쓴다(ADR-0052); `OrderedIntervalTrack`도 이 훅을 쓴다.

순서 기반 유사 구간 찾기(#1861)는 그리기 없는 계산 조각 `findSequenceMatches`·`findRepeatedSequences`(`@ap/components`)다. 시간을 빼고 메뉴가 `symbol(item)`으로 선언한 단계열의 정확 일치만 본다. 단계의 뜻(동작·상태)과 결과를 어떻게 그릴지는 메뉴가 정하며, 구간 선택과는 `itemsInRange`·`sequenceSteps`로 잇는다. `findRepeatedSequences`의 `maxLength`(기본 32)는 성능 경계이고 도메인 제한이 아니다. 세부는 [charts.md](../../packages/sdk/components/docs/charts.md).

렌더러는 마운트마다 한 번 만들어지고 이후 prop 변경은 `update()`로 받는다. 모델이 바뀌면 데이터 층을 다시 그리고 보기를 새 모델의 domain으로 되돌리며([ADR-0064](../adr/0064-topn-bar-and-lane-timeline.md)), 그 밖의 변경은 보기를 보존한다. 팔레트·neutral·윤곽 필드·높이는 내용으로 비교해 바뀔 때만 데이터 층을 다시 그리고, `formatTick`·`formatTooltip`·`onSelect`·`onHover`는 최신 참조만 보관해 참조가 바뀌어도 그리지 않는다. 선택·오버레이 변경은 오버레이 층만 그린다. 이벤트 구독·`ResizeObserver`·`MutationObserver`는 한 번만 설치하고, 크기가 실제로 바뀔 때만 다시 그린다.

확대·이동·scroll은 refs와 dirty rAF만 갱신하고 React render를 추가하지 않는다. modifier 없는 wheel은 네이티브 세로 스크롤이다. 줄이 줄 영역 높이 안에 다 들어가면 줄 영역은 스크롤을 가두지 않아 wheel이 바깥 패널·페이지로 넘어간다(#2518). 확대는 포인터/키보드 중심을 기준으로 데이터 domain 내 최소 1ms부터 전체 폭까지다. `resetZoom`은 시간 범위만 복원하며 `reveal(index)`·`revealById(id)`는 유효 입력의 flatten 순서로 행·시간을 드러낸다. density는 데이터 변경 때 복사·정렬하고 viewport bin 이진 검색을 사용한다. 시간축 눈금은 UTC getter 기준 분·시·일 달력 간격을 쓰고 시간대 없이 시:분을 표시하며, 날짜는 첫 눈금과 wall-clock 날짜 경계(00:00)에 한 번 표시한다(`formatTick` 재정의 우선). ResizeObserver·DPR·테마 변경 redraw와 모든 구독/raf cleanup을 소유한다. DOM 툴팁과 키보드 요약은 시간·depth·rank·경계 의미를 글로도 제공한다. 잘못된 시간/역전/중복 ID는 제외, 잘못된 depth는 0, 빈/무효 palette는 기본 색으로 복구한다. 선택·viewport는 로컬이며 URL·Global Context를 쓰지 않는다. 공개 타입·사용 예는 [SDK 차트](../../packages/sdk/components/docs/charts.md).

### OrderedIntervalTrack 순서 트랙 (Decided, ADR-0121)

기본 `axis='order'`는 소비자가 준 서수 위치를 쓰며 **표시용 시간을 기준으로 재정렬하지 않는다**. `formatTime`은 선택 시간 라벨의 표시만 맡고 `axis='time'`은 소비자가 시간 좌표를 명시했을 때만 쓴다. `axisLabel?: string`은 축 거터 위와 범위 요약 앞에 표시하며 소비자가 주지 않으면 생략한다. 축 눈금·범위·항목 순번은 하나의 formatter를 쓴다. 기본은 locale 숫자 형식이며 정수 domain에서는 확대 범위도 정수로 반올림하고, 그 밖에는 소수 둘째 자리까지 표시한다. `formatTick`은 이 formatter를 바꾸며, 시간 축에서 생략하면 `formatTime`을 쓴다. `markers`(`order`, `label`, `kind: 'boundary' | 'inversion' | 'partial'`)는 소비자가 선언하며 파일 경계·시간 역전을 추론하지 않는다. 순서 눈금은 정수 `1·2·5 × 10ⁿ` 간격이고 겹치는 축 라벨을 솎는다. 입력·상태·요청 상한은 [§13](components.md#orderedintervaltrack--선언과-상태-decided-adr-0121)이 소유한다.

컨펌된 줄 막대 문법: 112px 라벨 여백·24px 행의 개별 구간 막대, 일반 테두리는 폭 4px 이상일 때만 그린다. 선택 테두리는 독립된 `chart-selection-outline` 2px다. 구간은 inset 1px의 선택선과 inset 3px의 `surface-card` 2px halo로 상태 fill 사이에 중립색 간격을 둔다. 폭 10px 미만 구간은 halo를 생략하고 선택 외곽선 상자를 최소 6px 폭으로 그린다. 점은 `surface-card` 6px halo 위에 선택선을 그린다. halo를 그릴 때 선택선과 중립색, 중립색과 세 상태색(`chart-series-1/2/3`)은 각각 3:1 이상 대비를 유지한다. 열린 끝은 점선이고 이월은 꺾쇠다. 구간 안 라벨 판은 두지 않으며 전문은 툴팁·선택 요약·목록에 남긴다. 점은 전체 범위에서 축 아래 8px 밀도 줄로 모이고 확대해서 구분 가능한 때 상태색 마름모로 보인다(선택/포커스 점은 항상 표시). 점의 표면색 경계가 막대 위에서도 형태를 구분하며, 점 이벤트 범례는 `chart-no-data` 채움과 `text-secondary` 1px 선의 마름모다. 표식 캡션의 두 기준선 간격은 16px이며 시간 라벨이 켜지면 표식·미수신 캡션을 시간 라벨 아래 별도 줄로 옮긴다. 현재 키보드 탐색 위치는 구간·점 모두 중립색 바탕의 삼각 표식으로 구분하며 선택 테두리와 별개다. 축은 세로 가시 창 위에 고정하고 DPR·크기·테마 변경 때 다시 그린다. 선택 입력 `partialGaps`([선언은 §13](components.md#orderedintervaltrack--선언과-상태-decided-adr-0121))의 현재 범위는 상태색이 아닌 `surface-sunken` 음영과 «미수신» 라벨로 구분한다.

Zoom·Brush·항목 선택은 Chart Local State이며 URL·Global Context를 바꾸지 않는다. 수정키 없는 wheel은 네이티브 스크롤, Shift 또는 Ctrl/⌘ + wheel은 포인터 중심 확대다. 끌기는 이동이며 `구간 선택`을 켜면 Brush다. 툴바 확대·축소·초기화, 키보드 `+`/`−`, `Shift+←/→`와 `선택 구간 확대`가 같은 결과를 제공한다. `←/→`·Home/End는 현재 줄 항목을 순서 좌표로 탐색하고 `↑/↓`는 이웃 줄에서 가장 가까운 순서 항목으로 이동하며 행을 드러낸다. Enter·클릭은 `onSelect(item)`, Escape는 `onSelect(null)`과 Brush 해제다. `selectedId`는 제어형 강조이며 목록 선택 동기화는 소비자 몫이다. 조작 버튼은 부모 폼을 제출하지 않는다. 툴팁은 paint containment 밖의 portal에 `text-xs max-w-xs`로 내용에 맞는 폭으로 표시하며 포인터 오른쪽 공간이 부족하면 왼쪽으로 반전하고 화면 경계 안에 제한된다. `표로 보기`는 현재 가로 범위 전체 줄의 텍스트 대안 표(줄·항목·시작·끝·상태·길이 열, 20개씩 페이지, #2792)로 불완전 여부까지 읽고 항목 버튼의 `aria-pressed`, 행의 `aria-selected`와 `TableRow current`(강조 표면·`aria-current`)로 선택을 알린다. 구간 선택·시간 라벨·표로 보기 토글은 `toggle` 변형이다(#2720). 포커스 요약의 보이는 줄은 탐색 항목 한 줄이며, 같은 `output` 안의 `sr-only` 텍스트로 현재 범위의 선언 표식 종류·라벨·서수와 미수신 범위를 함께 제공한다. 항목 표는 이 요약을 참조하고 같은 범위 설명을 표 위 캡션으로도 보인다. Compare·Annotate는 이 조각에 포함하지 않는다. 내보내기는 위 «캔버스 차트의 표로 보기·내보내기»를 따른다. 기존 LaneTimeline의 시간 축 동작은 그대로다.

### 결정 기록

- [#2538](https://github.com/hjung3113/analytics-platform/issues/2538)에서 변형 A의 도구 줄, 선택 요약의 빠른 구간, 주석 비활성 사유 표시를 확정했다.

### 상태 분리

- Global Context
- Page Filter
- Chart Local State
- Persistent Annotation

차트마다 이 상태를 섞어 구현하지 않는다.

### 분석 선택 전달 (Decided, ADR-0175, #2732)

패널은 `outputs`의 `selection`에 차원과 형태를 선언한다. 값 묶음(`set`)과 범위(`range`)는 메뉴 URL에 기록되며 공유 링크와 뒤로가기로 복원한다. 행 묶음은 화면에만 둔다. 같은 페이지에서 값을 받는 패널은 `filter` 또는 `highlight`를 선언한다. 필터를 적용한 패널의 배지는 적용 후 모집단 수 `n`과 «선택 적용»을 표시한다. 전역 기간과 설비 선택은 사용자가 명시적으로 적용할 때만 바뀐다. [ADR-0175](../adr/0175-chart-selection-feeds-next-analysis.md), [ADR-0176](../adr/0176-user-analysis-menu-one-definition-two-homes.md)

패널 입력 투영과 가용성 판정에는 값 묶음을 `pageParams` 배열로, 범위를 `pageParam` 문자열로 넘긴다. 같은 단일 범위 키가 반복되면 메뉴 URL 코덱이 `duplicate_page_key` 오류를 낸다. 코덱을 통과한 값 중 유효하지 않은 분석 선택 값은 투영과 가용성 판정에서 빠지고 입력 훅의 `rejected`에 해당 키가 표시된다. 출력 훅의 `select(null)`로 URL에서 그 키를 지운다.

`useAnalysisSelectionChips(onClearCommit?)`는 현재 화면에서 유효한 분석 선택 키마다 값, 차원, 라벨(미선언 시 `null`), 첫 출력 패널을 돌려준다. 첫 출력 패널이 다른 칩의 키를 필터로 읽으면 그 칩의 키를 `after`에 담고 뒤에 놓는다. 앞선 키가 여럿이면 선언 순서상 첫 키를 쓴다. 복원한 URL에서 필터 입력이 순환하면 그 순환만 선언 순서상 첫 칩에서 끊고(그 칩의 `after`는 `null`), 순환 밖 칩의 `after`는 그대로 둔다. `clear(key)`는 해당 키 하나만 지우고, `clearAll()`은 화면의 분석 선택 키를 한 번에 지운다. 다른 페이지 키와 전역 Context는 유지한다. 주소 변경이 가드를 통과하면 주소를 쓰기 직전에 `onClearCommit`을 호출한다. 첫 인자는 지울 키이며 전체 지우기에서는 `null`이다. 두 번째 인자 `{ from, to }`는 현재 주소와 쓸 주소를 담는다. 보드에서는 부모가 `to`를 나중에 반영할 수 있다.

첫 출력 패널은 `useAnalysisSelectionOutput(panelId, key, { available })`로 현재 데이터에 있는 값 묶음(`readonly string[]`) 또는 범위(`{ from, to, compare? }`)를 알릴 수 있다. 범위의 두 끝은 선택 값과 같은 형식으로 제공하며, 끝점이 닿아도 겹친 것으로 본다. 기본 문자열 순서는 같은 형식과 시간대의 ISO-8601 시각에 쓸 수 있으며, 숫자 축처럼 순서가 다른 경우에는 참조가 안정적인 비교 함수 `compare(a, b)`를 넘긴다. 값이 하나도 일치하지 않거나 범위가 겹치지 않으면 칩의 `available`은 `false`다. 일부만 일치하거나 가용성을 아직 모르면 `true`다. 로딩 중에는 `available`을 생략하거나 `undefined`로 둔다.
첫 출력 패널의 `filter` 입력을 따라가 같은 키로 돌아오는 경우 그 키의 가용성은 미보고로 본다. 드릴을 선언한 메뉴에서는 보고 당시의 드릴 값이 현재 주소와 일치할 때만 그 보고를 적용한다. `useAnalysisSelectionOutput()`의 `availabilityCurrent`는 현재 드릴 주소에서 보고 값이나 보고 철회(`available: undefined`)가 가용성을 읽는 쪽에 반영되었을 때 `true`다.

분석 선택 칩을 클릭하거나 Enter·Space를 누르면 편집 팝오버가 열리고 첫 입력으로 포커스가 이동한다. 편집 중에는 출처 강조를 유지한다. Esc로 닫으면 칩으로 돌아간다. 값 묶음은 첫 출력 패널의 현재 보고 값과 이미 선택한 값을 체크 목록에 표시한다. 보고 목록에 없는 선택 값에는 «해당 없음»을 붙인다. 범위는 시작과 끝을 입력하며 시작이 끝보다 늦으면 오류를 표시한다. 순서는 보고한 `compare`를 따르고, 없으면 문자열 순서를 쓴다. «적용»은 칩 모델의 `editor.replace(key, selection, onCommit?)`로 해당 키를 바꾼다. 지우기와 같은 주소 변경 관문을 쓰며, 변동이 없는 적용은 주소를 쓰지 않고 완료한다. 빈 값 묶음은 해당 키를 지운다.

`filter`로 키를 받는 패널은 `useAnalysisSelectionInputs(panelId).applied`에서 필터 값을 읽는다. 가용하지 않은 키는 `unavailable`에 들어가고 `applied`와 `filtered` 판정에서 빠진다. 가용성은 주 화면과 각 보드 칸의 메모리에 따로 둔다. 주 화면은 메뉴·경로·세션·리비전·Scope가 바뀌면 새 저장소를 쓴다. 보드에서는 칸 본문과 조회 편집기가 같은 저장소를 쓰며 페이지 키만 바뀌는 동안 재사용한다. 시트나 칸이 사라지거나 메뉴·경로 파라미터·Scope·어댑터·세션·리비전·Registry가 바뀌면 새 저장소를 쓴다. 조회 편집기가 열려 있어도 본문의 마지막 보고자가 내려가면 해당 보고를 지운다. 빌려 온 패널은 가용성을 보고하지 않는다. URL, 저장된 뷰, 공유 링크에는 분석 선택 값만 남으므로 뒤로가기로 앞선 선택을 복원하면 출력 패널의 현재 데이터에 맞춰 가용성을 다시 판정한다.

분석 선택 칩에 마우스를 올리거나 키보드로 포커스하면 첫 출력 패널을 강조한다(#2733). 표시 중인 패널은 포커스 링 안쪽에 출처 링을 그리고, 본문이 가려진 경우 표시 중인 탭으로 출처를 알린다. `PanelWorkspacePanel`의 배치 ID가 출력 선언의 패널 ID와 다르면 `analysisSelectionSourceId`에 출력 선언의 패널 ID를 지정한다. `useAnalysisSelectionOutput().highlighted`로 해당 키의 출처 강조를 읽어 범주 축 막대와 선 차트의 점에도 점선을 그릴 수 있다. 시간 축 막대 차트는 패널의 출처 링만 표시한다. 시간 축 막대 점선은 #2733 후속 작업으로 남긴다. 가용성 보고나 선택 쓰기만 하는 호출은 `subscribeHighlight: false`로 구독을 끄고, 출처 차트에서 강조를 읽는다. 강조 상태는 화면·보드 칸별 메모리에 두고, 포인터가 벗어나거나 포커스를 잃으면 해당 입력의 강조를 끝낸다. 칩이 사라지면 강조도 지운다. 강조 자체는 포커스, 분석 선택 값, URL, 저장된 뷰를 바꾸거나 화면 읽기 알림을 내지 않는다. 애니메이션은 사용하지 않는다.

### 차트를 그릴 수 없는 환경

캔버스 2D 컨텍스트나 `ResizeObserver`가 없어 엔진이 시작하지 못하면(시도해서 실패한 경우만) 차트는 예외를 던지지 않고 그리는 영역에 «이 환경에서는 차트를 그릴 수 없습니다» 상태(중립 톤)를 보인다. 프레임·제목·툴바·표는 그대로 그린다. 이유: 테스트 환경(jsdom)과 start kit의 렌더 검사에서 메뉴가 별도 래퍼나 설정 없이 차트 주변 텍스트를 검증할 수 있게 한다. 실제 브라우저 동작은 바뀌지 않는다.

### Persistent Annotation과 선택 기능 (Decided, #103)

- **주석은 서버 소유이고 `(chartId, scopeId)`로 키한다.** Chart Frame은 `adapter.listAnnotations({ chartId, scopeId })`·`saveAnnotation({ chartId, scopeId, from, to, text })`로만 읽고 쓴다(모듈 전역 저장소·`chartId`만으로 행을 고르는 조회 금지). 서버는 요청 시점의 세션으로 권한(`analytics:view`)과 Site 경계(§6.2, ADR-0004)를 판정하고, 작성자·시각은 서버가 찍는다(입력에 두 필드가 없다). Scope가 없으면(`null`) 읽지도 쓰지도 않는다 — `null`은 "전체 사이트"가 아니다.
- **삭제는 작성자만 한다(Decided, #399, [ADR-0041](../adr/0041-annotation-author-delete-audit.md)).** `adapter.deleteAnnotation({ chartId, scopeId, id })`는 목록·저장과 같은 관문을 지난 뒤 `(chartId, scopeId)` 안에서만 id를 찾는다 — 없으면 `empty`, 남이 쓴 주석이면 `forbidden`이고 다른 사이트·작성자의 행은 드러내지 않는다. 화면은 서버가 계산해 목록·저장 응답에 싣는 `mine`(작성자 id는 내보내지 않는다)이 true인 주석에만 "삭제: <문구>" 버튼을 그리고, 서버는 삭제 때 작성자를 다시 확인한다. 인라인 확인 한 단계(`window.confirm` 없음) 뒤 삭제하고 다시 조회하며, 실패하면 주석을 그대로 두고 고정 문구로 알린다. 성공한 삭제는 감사 행(`action: delete`, 대상 유형 `annotation`, 문구는 `reason`)을 남기고 콘솔 감사 화면에서 읽는다.
- **겹치는 범위의 주석 라벨은 줄을 나눠 그리고 영역 폭으로 줄여 그린다.** 같은 범위를 덮는 주석은 겹친 순서대로 한 줄씩 아래로 내려 서로 덮지 않고, 긴 문구는 영역 폭에서 말줄임표로 줄인다. 전문은 차트 아래 목록에 있다.
- **Scope는 조회 식별자에 들어간다.** 사이트를 바꾸면 이전 사이트의 주석은 즉시 숨겨지고 새 사이트의 주석을 읽는다. 저장이 거부·실패하면 입력 문구를 유지하고 행을 추가하지 않는다. 늦게 끝난 저장은 그 사이 취소·재열기·Scope 변경으로 바뀐 새 입력을 지우지 않는다. 주석 조회가 실패하면(error·timeout·forbidden) "없음"처럼 보이지 않고 차트는 그대로 둔 채 로컬 실패 문구와 다시 시도를 보인다(§19).
- **Compare·Annotate·Export는 현재 메뉴 manifest의 `features`(§5)를 따른다.** 선언하지 않은 메뉴의 차트는 그 버튼을 그리지 않고, Annotate가 꺼져 있으면 주석을 조회하지도 않는다. Annotate가 켜져 있으면 `analytics:view` 권한이 없거나 Scope를 선택하지 않았을 때 도구 줄의 «주석»과 선택 요약의 «주석 남기기»를 비활성화하고 이유를 표시한다. 플랫폼 밖에서는 «이 화면에서 주석을 남길 수 없습니다.»를 표시한다. Zoom·Reset과 출력 미선언 Brush는 Chart Local State다.
- **기준 시각 전후 비교 조각(`beforeAfterPeriods`, `@ap/contracts`, #1243, ADR-0106 결정 4):** 선택 순수 함수이고 쓰지 않으면 아무것도 달라지지 않는다. 입력은 기준 시각 `at`(시간대 없는 wall-clock `YYYY-MM-DDTHH:mm:ss`, 06 §6.3), 앞·뒤 길이(`{ hours }` 또는 `{ days }`, 양의 정수, 1일 = 24시간 — 시간대·DST·`Date.now()` 없이 달력 숫자로만 더한다), 선택 `until`(뒤 구간의 배타적 상한, 보통 서버 `defaultRangeTo`)이다. 출력은 반개방 `[at − 앞, at)`과 `[at, at + 뒤)`로 맞닿고 기준 시각은 뒤 구간에 속한다. `until`은 뒤 구간만 자르며 `until <= at`이면 뒤 구간은 null이다. **뒤 구간이 분석 Context 기간(`from`·`to`)이 되고 앞 구간은 이 문서의 기존 Compare 계약대로 메뉴가 이전 기간 시리즈(`compareSeries`)로 조회한다** — 새 Context·URL 키와 Frame 동작 변경이 없고 "맞춤 → 자르기"는 뒤 구간을 현재 기간으로 그대로 쓴다. 메뉴는 기준 시각과 앞·뒤 길이를 모두 명시해서 넘긴다 — SDK가 길이 기본값을 정해 주지는 않는다. 예: `beforeAfterPeriods(at, { before: { days: 7 }, after: { days: 7 } })`.
- Brush 구간은 선언한 분석 선택 출력으로 메뉴 URL에 기록할 수 있다. 출력 미선언 구간은 차트에만 남는다. 전역 기간을 바꾸려면 «분석 구간으로 적용»을 확인한다.
- **시간축 구간은 막대 경계로 바깥쪽에 맞춘 뒤, 비교 중이면 현재 조회 기간으로 자른다(맞춤 → 자르기).** 경계는 현재 기간 시리즈의 x(막대 시작, 정렬·중복 제거)와 조회 상한 `global.to`다. `global.from`이 첫 막대보다 앞이면 시작 경계에 넣는다. 현재 기간 시리즈 전체의 x를 쓰고, 줌·범례 숨김으로 경계 목록을 바꾸지 않는다. 이전 기간(Compare) 시리즈의 x는 제외한다. 요약은 `from <= x < to`라서 "전체"와 마지막 막대의 끝은 `global.to`여야 그 막대가 빠지지 않는다. 범주축은 가장 가까운 범주 그대로다. 조회 끝이 없으면 초 단위로만 맞추고 막대 간격을 지어내지 않으며, 아래 키보드 경로도 그리지 않는다. 잘린 부분이 있으면 선택 요약에 한 줄로 알리고, 고른 구간이 모두 현재 기간 밖이면 선택하지 않고 이유를 알린다. 비교를 켜면 이미 있는 선택과 열린 "분석 구간으로 적용" 확인도 같은 순서로 다시 맞춘다. ([ADR-0036](../adr/0036-chart-range-keyboard-snap-compare-clip.md))
- **키보드로도 같은 선택을 만든다.** 선택 요약의 시작·끝과 [선택], 선택 요약의 `1시간`·`4시간`·`전체`(데이터 범위가 그 길이보다 짧거나, 맞춘 결과가 그 길이보다 넓으면 숨김)가 끌기와 같은 맞춤 함수를 쓴다. 끌기는 보조 경로로 남는다. 각 경로에서 고른 구간은 선언한 분석 선택 출력으로 메뉴 URL에 기록할 수 있다. 전역 기간은 명시적으로 적용할 때 바뀐다. 단 `size="fill"`은 시작·끝 입력과 빈 선택 안내를 `구간 선택`이 켜져 있거나 선택 구간이 있을 때만 그려 그림이 공간을 쓴다(ADR-0067 결정 21). 키보드로 `구간 선택`을 켜면 포커스가 시작 필드로 간다. 시간축에서 빠른 구간이 가능하면 선택 전에도 «빠른 구간 선택»과 버튼을 표시한다. 선택 후에도 같은 버튼을 유지해 누른 버튼에 포커스가 남는다. 선택 후에는 선택 구간, 빠른 구간, «주석 남기기», «분석 구간으로 적용», «지우기»를 배치한다. 적용할 수 없으면 시간축 여부, 현재 화면 지원 여부 또는 권한에 따라 이유를 표시한다.
