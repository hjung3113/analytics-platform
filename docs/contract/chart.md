# 차트 계약

> Scope: Chart Frame과 Zoom/Brush/Compare/Annotate 공통 Interaction 계약.  
> 포함 절: §16  
> 색인과 「절 → 문서」 대응표: [06. Platform UI Contract](platform-ui-contract.md)  
> 상태 표기(Decided / Candidate / Open / Deferred): [문서 소유권과 결정 상태](platform-ui-contract.md#문서-소유권과-결정-상태)

## 16. Analysis Chart Contract

Primary candidate는 `../architecture/frontend-ui-ux.md`에 따라 Apache ECharts다.

플랫폼은 Chart의 비즈니스 정의가 아니라 **Chart Frame과 Interaction Contract**를 소유한다.

`AnalysisChartFrame`의 그림 위에서 수정키 없는 휠은 가장 가까운 스크롤 컨테이너를 그대로 스크롤하고(프레임이 막지 않는다), Shift+휠이 확대이며 키보드·포인터 대안은 툴바 `확대` 버튼이다(#700).

**`markLines`.** `{ y: number; label: string; unit?: string; metricVersion?: string }[]`를 받아 값 축의 `y` 위치에 라벨이 붙은 기준선을 그린다(세로 차트는 가로선, 가로 막대는 세로선). `startAlign`에서는 x가 더는 한 값 축이 아니므로 무시하고 아래 단위 안내도 하지 않는다. 그릴 선에 `unit`이나 `metricVersion`이 있고 Frame의 `unit`·`metricVersion`과 다르면 그 선만 그리지 않고, 차트 동작 도구줄 밖(범례 아래 안내 줄)에 `<라벨> 기준선은 단위가 달라 표시하지 않음`을 `text-text-secondary`로 선마다 한 줄 보인다. 두 필드를 생략한 선은 그대로 그린다.

**가로 막대의 행 포커스와 `rowPitch`([ADR-0079](../adr/0079-chart-row-focus-row-pitch.md), #690).** `orientation="horizontal"` 범주 차트만 받는다(그 밖에서는 무시하고 개발 중 경고). `activeCategory`가 있으면(`null` = 행 없음) 프레임은 그 행만 강조하고 스스로 강조 상태를 바꾸지 않는다 — 막대 클릭은 `onActiveCategoryChange(category, 'pointer')`, 지점 선택기의 이동은 `(category, 'keyboard')`만 부르며 소유자는 메뉴 하나다. 강조는 색만이 아니라 그 행 막대의 테두리와 굵은 범주 라벨이고, 선택 요약이 `활성 행`을 적는다. `activeCategory`가 없으면 강조는 없고 기존 동작 그대로이며, 콜백만 주면 강조 없이 클릭·이동만 알린다. 행 포커스와 `pointActivation`은 별개다: 한 번의 클릭은 먼저 행 콜백을 부르고, `on: 'click'`이면 이어서 `onActivate`를 부르며, 키보드 실행은 `선택 지점 실행`이다. `rowPitch`(px, 최소 24 — WCAG 2.2 2.5.8 대상 크기, 미만은 24로 올리고 개발 중 경고)는 차트 높이를 `행 수 × pitch + 축 여백`으로 만들고(`rowPitch`에서는 `containLabel` 없이 고정 격자 — 왼쪽 라벨 여백 140px, 행 영역이 정확히 `행 수 × pitch`라서 행 i의 윗변이 격자 위 여백 + i × pitch다) 플롯 상자가 주어진 `height`/`size`(`fill` 포함)만큼의 창으로 안에서 세로 스크롤한다. 수정키 없는 휠은 가장 가까운 스크롤 컨테이너, 곧 이 안쪽 상자를 스크롤하고 끝에서 바깥으로 넘어간다(위 #700 규칙 그대로). **`rowPitch`에서는 범주 `dataZoom`(Shift+휠, `확대` 버튼)이 꺼지고 Brush는 유지한다** — viewport 모델이 둘이면 선택 요약·Brush 범위·내보내기가 어느 창 기준인지 모호해진다. `revealActive`는 `activeCategory`가 밖에서 바뀔 때 그 행이 창 밖이면 `격자 위 여백 + 인덱스 × pitch`로 스크롤하며(순수 `revealScrollTop`) 포커스는 옮기지 않고, 프레임 자신의 클릭에서 온 변경은 스크롤하지 않는다. `rowPitch`가 없다가 `revealActive`·`activeCategory`가 있는 채로 생기면 그 행을 다시 드러낸다(새 스크롤 상자는 맨 위에서 시작한다). `activeCategory`가 밖에서 바뀌면(프레임 자신의 보고가 아닌 변경) 선택 지점, 곧 지점 선택기와 `지점 동작`의 대상도 그 행으로 옮긴다: 지금 선택한 시리즈의 그 행 지점이 `isPointSelectable`이면 그것, 아니면 그 행의 첫 선택 가능 지점이다. 포커스는 옮기지 않고, `null`은 선택을 그대로 두며, 프레임 자신이 이미 그 행을 선택한 변경은 다시 옮기지 않는다. `rowPitch`가 **없는** 가로 범주축은 행이 읽을 만한 라벨 높이보다 낮으면 범주 라벨을 자동으로 솎는다(ECharts `axisLabel.interval: 'auto'`, 충분히 높으면 모두 보임). `rowPitch`가 있으면 모든 라벨을 그린다. 프레임은 행 수 상한을 두지 않는다: 메뉴가 엔드포인트의 `limits.maxRows`로 자르고(§15 행 상한, §19 `too_large`) 전체 데이터를 프런트로 보내지 않는다(§27).

**값 라벨과 합계(`valueLabels`·`reaggregation`·`serverTotals`, 가로 누적 막대만, #580 노드 580d, ADR-0082).** `valueLabels`는 `'segment'`·`'total'`·`'both'`이고 없으면 출력은 지금과 같다(가로 누적이 아니면 무시하고 개발 중 경고). **조각 라벨**은 조각 안쪽에 자릿수 구분 수를 그리고(압축 표기 없음: ko·en 모두 `1,234`·`12.3`, 소수 자리는 |값| ≥ 100이면 0, 아니면 최대 1 — 옆의 `valueFormat` 합계와 같은 모양으로 읽힌다) 정확한 값은 툴팁에 남긴다. 보이는 시리즈가 **정확히 하나**이면 `segment`·`both` 모두 조각 라벨을 그리지 않고(`startAlign` 포함, 조각이 곧 합계) 합계만 남는다. ECharts가 해석한 라벨 상자가 조각 상자의 폭이나 높이에 들어가지 않으면 그 라벨만 숨기고(추정이 아니라 `labelLayout`의 실제 기하 — `LabelLayout` 기능을 `EChartImpl`이 등록하고, 폭이 0인 `0` 조각도 같은 규칙이라 숨는다), `null` 조각에는 라벨이 없다. `minMax`가 켜져(강조할 시리즈가 있어) 있으면 조각 라벨은 하나도 그리지 않고 `최소`/`최대` 칩과 합계만 남는다 — 칩과 숫자가 같은 행에서 자리를 다투므로 칩이 강조를 맡는다(위치로 칩을 알아보는 방식은 세 번의 리뷰에서 실패해 버렸다, 노드 580d D7). 실제 그려진 결과는 `chartValueLabels.render.test.ts`가 ECharts 서버 SVG 렌더러로 고정한다. 글자색은 지원하는 막대 채움(`chart-blue·teal·green·purple`, `cat-amber·teal·purple`, `chart-series-1…4`, `chart-status-good·warn·critical`, `chart-remainder`)마다 `text-primary`(밝은 채움)와 `text-on-accent`(어두운 채움: `chart-series-1…4`·`cat-purple`·`chart-status-warn`·`chart-status-critical`) 중 하나이며 이 채움에서는 4.5:1 이상이고 `chartValueLabels.test.ts`가 CSS 토큰을 읽어 쌍마다 고정한다. 이 집합 밖의 채움(`ChartSeries.color`는 어떤 토큰이든 받는다)은 표면색 칩 위의 `text-primary`로 그려 읽힌다. **합계**는 `reaggregation`이 `canClientSum`일 때만 클라이언트가 보이는 조각을 더한다(`reaggregation` 없음 = 더하지 않음). 더하지 않는 측정은 `serverTotals`(범주별)로만 그리며, 서버 합계는 숨긴 시리즈까지 포함하므로 **모든 시리즈가 보일 때만** 쓴다. 숨긴 시리즈(Compare를 켰다면 이전 기간 시리즈 포함)가 있고 더할 수 있으면 보이는 조각의 합이며 이름은 `표시 합계`다. `null` 조각이 하나라도 있는 행은(서버 합계도 같다) **부분 합계**라 굵은 숫자가 아니라 `≥ n` 기울임과 속 빈 마름모 표식으로 그리고 툴팁은 `PM3 미측정`처럼 빠진 시리즈를 말한다(전부 `null`인 행은 합계가 없다). 시리즈가 보이는데 합계가 하나도 없으면 행마다 아무것도 그리지 않고 차트마다 한 줄 `합계 없음 — 이 측정은 더하지 않습니다`만 범례 아래 안내 줄에 둔다(시리즈를 모두 끈 상태에서는 이 줄이 없다 — 상태 문장이 이유를 말한다. `표시 합계 — …`, 부분 합계 설명 `◇ ≥ 합계: 미측정 계열이 있는 행의 합계`도 같은 줄 묶음에 한 번이며, 페이지가 이미 설명하면 선택 `partialTotalNote={false}`로 끈다). 접근 가능한 표는 같은 이름(`합계`/`표시 합계`)의 마지막 열에 `≥ n (PM3 미측정)`으로 같은 말을 쓴다. `startAlign`(보이는 시리즈 2개 이상)에서는 조각 라벨이 레인 조각 안에 남고 합계는 레인 끝의 고정 오른쪽 열에 서며, 평범한 누적 막대는 합계가 막대 끝에 서되 마지막 쌓인 시리즈의 조각이 그 행의 최소나 최대라 `minMax` 칩이 막대 끝에 놓인 행만 칩 폭만큼 비켜서고(다른 행은 비키지 않고, `startAlign`은 비키지 않는다) 오른쪽 grid 여백은 가장 긴 합계(5자리 + 표식)를 담도록 늘어난다. 값·합계는 `startAlign`으로 바뀌지 않는다. `stacked`에 `canClientSum`이 거절하는 `reaggregation`을 주면 개발 중 경고한다(누적은 더할 수 없는 측정의 합을 그린다).

**`startAlign`과 `minMax`(가로 막대, #690 노드 690o).** `startAlign`(가로 누적 막대만, 그 밖에서는 무시하고 개발 중 경고)은 **시각 배치일 뿐**이다 — 값·합계·접근 가능한 표·선택 요약·내보내기는 바뀌지 않는다. 보이는 시리즈마다 레인을 하나 두고, 레인 폭은 그려진 행 전체에서 그 시리즈의 최댓값(`null`·0 이하·비유한 값은 0)이며, 모든 행의 k번째 조각은 레인 k의 왼쪽 끝에서 시작하고 레인 사이에는 레인 폭 합의 2%인 고정 간격이 있다. 행의 값이 짧으면 빈 칸이 남는다. 구현은 조각 앞에 같은 `stack`의 투명 spacer 시리즈(값 = `레인 폭(k−1) + 간격 − 그 행의 직전 시리즈 값`)를 끼우는 것이며 spacer는 `silent`·`tooltip.show: false`·강조 없음이고 범례·지점 선택기·키보드·`pointActivation`·`pointActions`·행 강조·표에 나타나지 않는다. 숨긴 시리즈는 레인을 잃는다. 값축은 더 이상 0부터의 값 척도가 아니므로 숫자 눈금과 단위 이름을 감추고 레인 시작마다 구분선과 시리즈 이름을 그리며(`markLines`는 무시), **Brush는 꺼진다** — x가 하나의 값 척도가 아니라 끌어 고른 구간이 값을 뜻하지 않기 때문이다. 이것이 위 "`rowPitch`는 Brush를 유지한다" 규칙의 예외이며, 버튼은 이유를 `title`로 밝히고 선택 요약은 구간 선택을 안내하지 않는다. `rowPitch`·행 강조·`visibleSeriesIds`·`legend={false}`는 그대로 동작한다. `minMax`(가로 범주 막대)는 **시리즈마다** 가장 작은 값의 행과 가장 큰 값의 행을 계산해 그 막대 조각에 굵은 윤곽(채움 변경 없음, 최소·최대는 서로 다른 두 토큰)과 `최소`/`최대` 라벨을 붙이며 `startAlign` 여부와 같게 그린다. `null`, `isPointSelectable`이 거절한 지점, 숨긴 시리즈는 제외하고, **측정 행이 2개 미만인 시리즈와 측정 값이 모두 같은 시리즈는 강조하지 않는다**(구분할 것이 없다). 값이 모두 같은 시리즈는 침묵하지 않고 선택 요약과 키보드 지점 선택기가 선택 시리즈에 대해 `<시리즈>: 모든 값이 같음`(en `all values equal`)이라고 밝힌다. 라벨은 표면색 배경·작은 패딩·강조색 테두리의 칩이라 어떤 채움 위에서도 읽히고(굵은 윤곽은 조각에 그대로), `startAlign`이 없으면 조각 오른쪽 바깥에 두며, `startAlign`에서는 최대 조각이 레인을 꽉 채우므로 `최대`는 조각 안쪽 오른쪽 끝(`insideRight`), `최소`는 레인의 빈 곳 오른쪽 바깥에 둔다. 강조할 시리즈가 있으면 마지막 조각의 라벨이 잘리지 않도록 오른쪽 grid 여백을 확보한다. `startAlign`에서 최댓값이 0인 레인도 이름을 잃지 않고(이름 최소 폭 보장), 보이는 레인이 모두 0이면 명목 폭으로 레인 시작을 떼어 이름을 유지한다. 보이는 시리즈가 2개 미만이면 `startAlign`은 아무것도 하지 않는다 — 일반 값축·눈금·단위가 남고 Brush도 쓸 수 있으며, 시리즈 숨기기는 일반 사용자 동작이므로 개발 경고도 없다. 행 강조와 겹치면 두 단서(윤곽 + 번짐)가 모두 보이고, 키보드 지점 선택기 항목에 `· 최소`/`· 최대`가, 선택 요약에 선택 지점 시리즈의 최소·최대가 글로 나온다.

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

### 메뉴가 조립하는 차트 조각 (Decided, #541·#580 S4)

`AnalysisChartFrame`의 선택 API는 메뉴가 의미를 정하고 프레임은 지점·행·시리즈 표시만 제공한다([ADR-0063](../adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md)). 기본 소비자는 새 prop 없이 기존 동작을 유지한다.

- `pointActivation?: { on: 'click' | 'dblclick'; onActivate(point) }`, `pointActions?: readonly { id; label; onSelect(point); disabled? }[]`의 `point: ChartPoint`는 `{ x: string; seriesId: string; value: number | null }`이다. 시간 x는 원래 wall-clock 문자열, 범주는 소비자 문자열 그대로다. 프레임은 단계·목적지를 알지 못하며 URL·Global Context를 쓰지 않는다. 메뉴가 콜백에서 `useDrill` 등 자신의 이동을 실행한다.
- 클릭은 지점을 선택한다. `dblclick` 활성화를 선택한 경우 클릭은 선택만 하고 `onPointClick`을 실행하지 않으며, 네이티브 더블클릭은 활성화 콜백만 실행한다. OS·브라우저마다 다른 더블클릭 판정 시간을 타이머로 추정하지 않는다. 이 선택이 없으면 기존 `onPointClick(x, seriesId)`는 즉시 실행한다.
- 선택기는 보이는 시리즈의 지점을 키보드로 고르고 `선택 지점 실행`으로 같은 활성화를 실행한다. `지점 동작`은 선택 지점의 메뉴를 열며 오른쪽 클릭은 해당 지점을 선택한 뒤 같은 메뉴를 연다. 포커스된 차트에서 Shift+F10·ContextMenu 키도 같은 메뉴를 연다. 선택 전에는 첫 지점을 기본으로 사용한다. 메뉴를 이동 없이 닫으면 실제로 연 차트 또는 툴바 버튼으로 포커스가 돌아가며, 동작이 이동을 실행하면 목적지 포커스를 유지한다. `pointActions`는 목록 또는 선택 지점을 받는 함수 `(point) => readonly ChartPointAction[]`이고, 함수는 메뉴를 열 때 선택 지점으로 평가한다(지점마다 맞는 동작만 보이게 한다 — 키보드 순서·포커스 규칙·`keepsFocus`는 그대로). 선택 지점의 목록이 비면 `지점 동작`을 끄고 오른쪽 클릭·Shift+F10도 메뉴를 열지 않는다. 선택 `isPointSelectable(point)`가 false인 지점(예: 보조 행)은 지점 선택기 `<select>`에 나오지 않고 키보드로 닿지 않으며 클릭·더블클릭·오른쪽 클릭의 `pointActivation`·`onPointClick`·`onActiveCategoryChange`도 받지 않는다(함수는 `series`처럼 안정된 참조로 준다). 선택 `legend={false}`는 프레임 자체 범례와 체크박스를 그리지 않는다 — 표시를 `visibleSeriesIds`로 소유하는 페이지용이며, 없이 쓰면 사용자가 시리즈를 끌 수 없어 개발 중 경고한다(접근 가능한 표와 선택 요약은 그대로). 선택 `fillMin`(`size="fill"`, §12.8 높이 채움): 그림 상자의 바닥을 기본 320px에서 낮추며, 160px 아래는 160으로 올린다. Brush 모드에서는 지점 선택·실행·동작 메뉴를 끄고 이유를 표시한다. 경로 바의 이전 단계 칩·가운데 단계 메뉴·전체 버튼은 차트 없이도 키보드로 이동할 수 있다(§12.7).
- `orientation?: 'vertical' | 'horizontal'`은 기본 vertical이다. horizontal은 `xType='category'`에서만 적용하며(time에서는 무시), 범주를 입력 순서대로 위→아래 행, 값을 가로축, 시리즈를 막대로 그린다. 라벨은 소비자가 준 문자열 그대로이고 그룹·계층을 추론하지 않는다. 범주축은 첫 입력 시리즈의 서로 다른 범주를 첫 등장 순서대로 사용하며, 각 시리즈의 중복 범주 값은 첫 값을 쓴다. 축에 없는 범주는 지점 선택기·콜백·표·내보내기에서도 제외하며 누락 값은 null이다. `stacked`는 한 행에 여러 시리즈의 세그먼트를 쌓는다. Zoom·Brush는 세로 범주축을 대상으로 하며 선택 요약·주석·표·내보내기·Trust는 같은 데이터를 사용한다.
- `visibleSeriesIds?: readonly string[]`이 있으면 현재·비교 시리즈의 표시는 이 prop만 따른다. 범례는 `onVisibleSeriesChange?(ids: string[])`로 다음 표시 집합을 요청하고 자체 표시를 바꾸지 않는다. 없으면 기존 로컬 표시 상태를 쓰며 콜백은 변경을 알린다. Reset은 현재 범례의 모든 ID를 요청하고, controlled 소비자는 수락 여부를 정한다. 모든 시리즈를 끈 상태는 `표시할 시리즈를 모두 껐습니다`로 표시하며 데이터 없음으로 취급하지 않는다. 이 상태의 문장 옆에 `모두 보이기` 버튼을 둔다: controlled이면 `onVisibleSeriesChange`로 현재(비교가 켜졌을 때만 비교 포함) 시리즈의 모든 ID를 요청하고, `visibleSeriesIds`가 없으면 로컬 표시를 모두 되살린 뒤 콜백이 있으면 알린다. `LegendTree`는 `onDrill`이 있고 모든 보이기 잎이 꺼졌을 때 트리 머리에 같은 이름의 버튼(일반 Tab 정지점)을 그려, 입력 집합에 모든 잎을 더해 `onVisibleChange`로 보낸다(그 밖의 ID는 유지). 트리 제스처: 시리즈 행의 체크박스·이름 클릭·Space는 보이기이고, `onDrill`이 있으면 Enter는 드릴 가능한 행에서 드릴(펼침·`onSelect` 아님)이다. 드릴 가능한 행은 `drillOnly` 노드, 선택 `canDrill(id)`가 true인 행, `canDrill`이 없으면 자식 있는 행이며(`drillOnly`가 `canDrill=false`보다 앞서고, `onDrill`이 없으면 `canDrill`은 효과가 없다), 그 밖의 행의 Enter는 자식이 있으면 펼침 토글, 잎이면 무동작이다. 드릴 가능한 현재가 아닌 시리즈 행은 hover/focus 때 보이는 `<이름> 단계로 이동` 버튼(`tabIndex=-1`)을 갖고, `drillOnly` 노드는 체크박스·`aria-checked`·보이기 잎이 없고 행 클릭이 드릴이다. 현재 단계는 `aria-current`(`aria-selected` 아님)이며 드릴은 보이기를 바꾸지 않는다([ADR-0084](../adr/0084-legend-tree-drill.md)).

### 종류별 상호작용

`AnalysisChart`의 `ChartSpec`은 종류와 입력 데이터의 유효 조합을 고정한다([ADR-0058](../adr/0058-analysis-chart-spec-union.md)). 기존 line/bar `AnalysisChartFrame` 소비자는 그대로 유지한다.

| 종류 | Zoom | Brush·선택 | Reset | Compare | Annotate | Export | Drill | 표로 보기 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| heatmap | — | 클릭·사각 끌기·표 체크박스로 셀 다중 선택 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 같은 셀 데이터·선택·상세 |
| donut | — | 클릭·표 체크박스로 한 항목 선택, 재클릭 해제 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 같은 구성비 데이터·선택·상세 |
| scatter | — | 클릭·사각 끌기·표 체크박스로 점 다중 선택 | 선택·끌기 영역 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | ID·그룹·양축 값과 단위·미확인·선택·상세 |
| boxPlot | — | 박스·중앙값·이상치 클릭·표 체크박스로 한 그룹 선택, 재클릭 해제 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 그룹·다섯 통계·n·이상치·미확인·선택·상세 |
| pareto | — | 막대 클릭·표 체크박스로 항목 다중 선택, 누적선은 선택하지 않음 | 선택 해제 | — | — | manifest `features.export` | 단일 실제 항목 선택 요약·표 행의 상세 버튼, 기타는 없음 | 표시 순서의 값·누적 %·기타·선택·상세 |
| topNBar | — | 막대 클릭·표 체크박스로 항목 다중 선택 | 선택 해제 | — | — | manifest `features.export` | 요약·표 행의 명시적 상세 버튼 | 표시 TopN과 같은 순서·값·선택·상세 |
| LaneTimeline (별도 API) | Ctrl/⌘+wheel·버튼·키보드 확대, drag 이동 | 클릭·방향키/Enter 단일 선택, Escape 해제 | 시간 viewport 초기화 | — | — | — | — | 방향키/Home/End 탐색·DOM 텍스트 요약 |

선택은 URL·Global Context를 바꾸지 않는 Chart Local State다. Global Context 변경 시 선택을 지우고 spec 변경 시 사라진 키를 버린다. 캔버스 클릭은 드릴하지 않는다. 표의 체크박스와 상세 버튼이 키보드 경로이며, 선택은 체크 상태와 요약 글로도 표시한다. 합성 항목(기타·미분류)은 소비자 ID가 없으므로 상세 버튼이 없다. 눈에 보이는 데이터 요약을 차트 section의 `aria-describedby`로 연결하며, 표와 CSV는 같은 데이터 투영을 쓴다. 히트맵의 누락 좌표는 빈 자리로, null은 미확인 표식으로, 0은 값으로 구분한다. threshold 색은 승인된 실제 판정에만 쓰고 범례에 세 판정명을 함께 적는다.

scatter의 null 좌표는 표에 미확인으로 남기고 플롯에서는 제외한다. 그룹은 색과 기호로 함께 구분한다. boxPlot은 원자료 대신 호출자가 계산한 통계를 받으며 min/max는 그릴 수염 끝점이다(Tukey 모드도 실제 inlier 끝점을 호출자가 계산). 유효하지 않은 통계와 미제공 n은 미확인이다. Pareto는 유효한 원본 항목을 값 내림차순으로 안정 정렬하고 표시 한도(기본 10, 최소 2)에 기타를 포함한다. 기타는 항상 마지막이며 누적률은 유효한 원본 합계를 분모로 표시 순서를 따른다. 목표 도달 요약은 정렬한 원본 항목 수를 센다(목표 기본 0.8, 유효 범위 (0,1]). 합계 0이면 도달을 주장하지 않는다.

### TopN·Lane 시간선 (Decided, #576)

[ADR-0064](../adr/0064-topn-bar-and-lane-timeline.md)의 `topNBar`는 소비자가 집계한 전체 항목을 받아 안정 내림차순·기본 상위 8개를 표시한다. 음수·비유한 값·잘못된 색·중복 ID는 제외(첫 유효 항목), 잘못된 N은 8로 복구하며 개발 진단을 남긴다. 0은 데이터다. 표시 토큰에 해당하는 소비자 범례만 토큰당 한 번 표시한다. 기본 접힘, controlled/uncontrolled 펼침, `hideWhenEmpty`(기본 false)를 제공한다. 명시 height가 없으면 플롯은 `max(120, 표시 수 × 28 + 24)`px이며 긴 라벨 전문은 툴팁·표로 확인한다. 막대 두께는 최대 24px로 제한한다. Pareto의 기타·누적률을 만들지 않는다.

누적/계열 차트의 범주 행에서 드릴이 가능한 가로 막대는 `AnalysisChartFrame orientation="horizontal"`을 써 최대 두께 18px과 잘리지 않는 전체 폭 라벨을 유지하고, 단일 측정값 순위에 상위 N 자르기·접기가 필요하면 `topNBar`를 써 112px 라벨 말줄임과 최대 두께 24px을 적용한다.

`LaneTimeline`은 `AnalysisChart` union 밖의 직접 Canvas 2D 시간선이다. §6의 시간대 없는 설비 wall-clock을 UTC getter 기반 epoch ms로 인코딩해 받고, 사용자 표시는 시간대 없이 한다. depth/rank·색 토큰·의미적 orphan/open 경계도 소비자가 제공한다. 112px gutter·24px 행·depth당 2px inset(최소 높이 2px)·최소 구간 폭 1.5px, 최소 전체 폭 352px 아래에서는 가로 스크롤한다. 축은 세로 스크롤 밖에 고정하고 backing canvas와 hit-test는 가시 행만 대상으로 한다. 가장 깊은 구간, 동률은 나중 입력이 우선한다. rank strong/weak/off는 원래 두께/절반 두께·alpha·점선/숨김이며 선택 강조는 독립이다. orphan은 꺾쇠, open은 점선 끝과 텍스트로 표현하며 viewport clip으로 만들거나 지우지 않는다.

확대·이동·scroll은 refs와 dirty rAF만 갱신하고 React render를 추가하지 않는다. modifier 없는 wheel은 네이티브 세로 스크롤이다. 확대는 포인터/키보드 중심을 기준으로 데이터 domain 내 최소 1ms부터 전체 폭까지다. `resetZoom`은 시간 범위만 복원하며 `reveal(index)`·`revealById(id)`는 유효 입력의 flatten 순서로 행·시간을 드러낸다. density는 데이터 변경 때 복사·정렬하고 viewport bin 이진 검색을 사용한다. 시간축 눈금은 UTC getter 기준 분·시·일 달력 간격을 쓰고 시간대 없이 시:분을 표시하며, 날짜는 첫 눈금과 wall-clock 날짜 경계(00:00)에 한 번 표시한다(`formatTick` 재정의 우선). ResizeObserver·DPR·테마 변경 redraw와 모든 구독/raf cleanup을 소유한다. DOM 툴팁과 키보드 요약은 시간·depth·rank·경계 의미를 글로도 제공한다. 잘못된 시간/역전/중복 ID는 제외, 잘못된 depth는 0, 빈/무효 palette는 기본 색으로 복구한다. 선택·viewport는 로컬이며 URL·Global Context를 쓰지 않는다. 공개 타입·사용 예는 [SDK 차트](../integration/sdk-charts.md).

### 상태 분리

- Global Context
- Page Filter
- Chart Local State
- Persistent Annotation

차트마다 이 상태를 섞어 구현하지 않는다.

### Persistent Annotation과 선택 기능 (Decided, #103)

- **주석은 서버 소유이고 `(chartId, scopeId)`로 키한다.** Chart Frame은 `adapter.listAnnotations({ chartId, scopeId })`·`saveAnnotation({ chartId, scopeId, from, to, text })`로만 읽고 쓴다(모듈 전역 저장소·`chartId`만으로 행을 고르는 조회 금지). 서버는 요청 시점의 세션으로 권한(`analytics:view`)과 Site 경계(§6.2, ADR-0004)를 판정하고, 작성자·시각은 서버가 찍는다(입력에 두 필드가 없다). Scope가 없으면(`null`) 읽지도 쓰지도 않는다 — `null`은 "전체 사이트"가 아니다.
- **삭제는 작성자만 한다(Decided, #399, [ADR-0041](../adr/0041-annotation-author-delete-audit.md)).** `adapter.deleteAnnotation({ chartId, scopeId, id })`는 목록·저장과 같은 관문을 지난 뒤 `(chartId, scopeId)` 안에서만 id를 찾는다 — 없으면 `empty`, 남이 쓴 주석이면 `forbidden`이고 다른 사이트·작성자의 행은 드러내지 않는다. 화면은 서버가 계산해 목록·저장 응답에 싣는 `mine`(작성자 id는 내보내지 않는다)이 true인 주석에만 "삭제: <문구>" 버튼을 그리고, 서버는 삭제 때 작성자를 다시 확인한다. 인라인 확인 한 단계(`window.confirm` 없음) 뒤 삭제하고 다시 조회하며, 실패하면 주석을 그대로 두고 고정 문구로 알린다. 성공한 삭제는 감사 행(`action: delete`, 대상 유형 `annotation`, 문구는 `reason`)을 남기고 콘솔 감사 화면에서 읽는다.
- **겹치는 범위의 주석 라벨은 줄을 나눠 그리고 영역 폭으로 줄여 그린다.** 같은 범위를 덮는 주석은 겹친 순서대로 한 줄씩 아래로 내려 서로 덮지 않고, 긴 문구는 영역 폭에서 말줄임표로 줄인다. 전문은 차트 아래 목록에 있다.
- **Scope는 조회 식별자에 들어간다.** 사이트를 바꾸면 이전 사이트의 주석은 즉시 숨겨지고 새 사이트의 주석을 읽는다. 저장이 거부·실패하면 입력 문구를 유지하고 행을 추가하지 않는다. 늦게 끝난 저장은 그 사이 취소·재열기·Scope 변경으로 바뀐 새 입력을 지우지 않는다. 주석 조회가 실패하면(error·timeout·forbidden) "없음"처럼 보이지 않고 차트는 그대로 둔 채 로컬 실패 문구와 다시 시도를 보인다(§19).
- **Compare·Annotate·Export는 현재 메뉴 manifest의 `features`(§5)를 따른다.** 선언하지 않은 메뉴의 차트는 그 버튼을 그리지 않고, Annotate가 꺼져 있으면 주석을 조회하지도 않는다. 라우트가 없는 곳에 놓인 차트는 세 기능 모두 제공하지 않는다. Zoom·Brush·Reset은 manifest와 무관한 Chart Local State다.
- Brush로 잡은 구간은 URL·전역 기간을 바꾸지 않는다. "분석 구간 적용…"의 확인을 거쳐야만 전역 기간이 바뀐다.
- **시간축 구간은 막대 경계로 바깥쪽에 맞춘 뒤, 비교 중이면 현재 조회 기간으로 자른다(맞춤 → 자르기).** 경계는 현재 기간 시리즈의 x(막대 시작, 정렬·중복 제거)와 조회 상한 `global.to`다. `global.from`이 첫 막대보다 앞이면 시작 경계에 넣는다. 현재 기간 시리즈 전체의 x를 쓰고, 줌·범례 숨김으로 경계 목록을 바꾸지 않는다. 이전 기간(Compare) 시리즈의 x는 제외한다. 요약은 `from <= x < to`라서 "전체"와 마지막 막대의 끝은 `global.to`여야 그 막대가 빠지지 않는다. 범주축은 가장 가까운 범주 그대로다. 조회 끝이 없으면 초 단위로만 맞추고 막대 간격을 지어내지 않으며, 아래 키보드 경로도 그리지 않는다. 잘린 부분이 있으면 선택 요약에 한 줄로 알리고, 고른 구간이 모두 현재 기간 밖이면 선택하지 않고 이유를 알린다. 비교를 켜면 이미 있는 선택과 열린 "분석 구간 적용…" 확인도 같은 순서로 다시 맞춘다. ([ADR-0036](../adr/0036-chart-range-keyboard-snap-compare-clip.md))
- **키보드로도 같은 선택을 만든다.** 선택 요약의 시작·끝과 [선택], 구간 선택 옆의 `1시간`·`4시간`·`전체`(데이터 범위가 그 길이보다 짧거나, 맞춘 결과가 그 길이보다 넓으면 숨김)가 끌기와 같은 맞춤 함수를 쓴다. 끌기는 보조 경로로 남는다. 어느 경로도 URL·전역 기간을 바꾸지 않는다. 단 `size="fill"`은 시작·끝 입력과 빈 선택 안내를 `구간 선택`이 켜져 있거나 선택 구간이 있을 때만 그려 그림이 공간을 쓴다(ADR-0067 결정 21). 키보드로 `구간 선택`을 켜면 포커스가 시작 필드로 간다. 주석 목록·오류·적용 확인 행은 그대로이고 다른 크기는 항상 그린다.
