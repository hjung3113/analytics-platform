# SDK TopN·Lane 차트

`@ap/components`는 `AnalysisChart`의 `TopNBarSpec`과 독립 `LaneTimeline`을 공개한다([ADR-0064](../../../../docs/adr/0064-topn-bar-and-lane-timeline.md), [06 §16](../../../../docs/contract/chart.md#16-analysis-chart-contract)). 두 부품은 플랫폼의 `I18nProvider` 아래에 놓는다. `AnalysisChart`도 `PlatformProvider` 없이 `I18nProvider`만으로 그려진다(#1953 B). 플랫폼 밖에서는 `exportActions: { exportAllowed: true }`일 때 CSV와 선언된 이미지 동작을 표시한다. Frame과 Top N은 내보내기 팝오버에 모으며, 플랫폼 안에서는 메뉴 `features.export`가 표시 여부를 결정한다. `AnalysisChartFrame`은 `PlatformProvider` 없이도 순수 차트 동작을 쓴다(아래 «플랫폼 밖의 Chart Frame»).

## Chrome

`AnalysisChartFrame`·`AnalysisChart`는 선택 `chrome?: 'full' | 'standard' | 'minimal'`을 받는다. 명시값이 우선하며 생략하면 카드·보드 pane은 기존 `full`, 작업 영역 패널은 `standard`다. 수준별 동작은 [차트 계약 §16](../../../../docs/contract/chart.md#16-analysis-chart-contract)을 따른다. `ChartChrome`·`ChartChromeOptions` 타입도 공개한다.

`standard`에서는 메뉴가 다음 선택 prop을 패널마다 선언한다. `full`·`minimal`에서는 무시한다. URL은 SDK가 읽지 않는다.

| Prop | 기본값 | 동작 |
| --- | --- | --- |
| `legendPlacement?: 'top' \| 'bottom' \| 'side'` | `bottom` | 플롯 위/아래 가로 줄(좁으면 줄바꿈, 최대 80px) 또는 오른쪽 세로 목록 |
| `toolsReveal?: 'always' \| 'hover'` | `always` | 상시 표시 또는 차트 hover/focus-within 때 표시. 키보드·AT 접근을 유지하며 더보기가 열려 있는 동안에도 표시. Frame에서 `headingInToolbar`를 켜거나 `toolbarStart`를 주면 합쳐진 도구 줄은 상시 표시 |
| `legendCaption?: ReactNode` | 없음 | 위/아래 범례 줄 끝, 오른쪽 범례 목록 아래에 캡션 표시 |

Frame에서 `headingInToolbar`는 제목을 도구 줄에, `toolbarStart`는 패널 설정 같은 컨트롤을 도구 앞에 놓는다. `extraActions`는 `full`에서도 더보기에 놓인다. 빠른 구간은 선택 요약에서 쓴다. 지점 선택·추가는 더보기에서 할 수 있다. `full`에서 드릴·지점 동작·상태·세로 경계를 제공하면 지점 선택기는 도구 줄 아래에 있다. `pointClickHint`는 소스 호환용이며 SDK가 가능한 조작을 안내한다.

## Chart Frame

`AnalysisChartFrame.emptyCategoryLabel`(가로 범주 막대의 빈 행 문구) 규칙은 [차트 계약 §16](../../../../docs/contract/chart.md#16-analysis-chart-contract)이 소유한다.

## TopN

```tsx
import { AnalysisChart, type TopNBarSpec } from '@ap/components';

const spec: TopNBarSpec = {
  kind: 'topNBar',
  items: [
    { id: 'a', label: 'Alpha', value: 12, colorToken: 'chart-series-1' },
    { id: 'b', label: 'Beta', value: 0, colorToken: 'chart-series-2' },
  ],
  topN: 8,
  defaultExpanded: true,
  legend: [{ label: 'Group A', colorToken: 'chart-series-1' }],
  onItemClick: id => showDetails(id),
};
<AnalysisChart chartId="rank" title="Ranking" unit="count" spec={spec} />;
```

`items: TopNBarItem[]`는 소비자가 집계한 전체 목록이다. SDK는 입력을 바꾸지 않고 값 내림차순으로 안정 정렬한다. `expanded`/`onExpandedChange`로 펼침을 제어하거나 `defaultExpanded`(기본 false)를 사용한다. 빈 프레임까지 숨기려면 `hideWhenEmpty`를 지정한다. 클릭은 로컬 선택이며 `onItemClick`은 요약·표의 명시적 상세 버튼에서만 실행된다. 표·CSV는 표시된 TopN의 같은 순서·값을 사용한다. Export는 메뉴 manifest의 `features.export`가 켜진 경우만 제공한다.

## Lane

```tsx
import { useMemo, useRef } from 'react';
import { LaneTimeline, type LaneTimelineHandle, type TimelineLane } from '@ap/components';

const lanes: TimelineLane[] = [{ id: 'a', label: 'Lane A', segments: [
  { id: 'segment-a', start: 1792540800000, end: 1792540860000,
    depth: 1, rank: 'high', startBoundary: 'orphan', endBoundary: 'open' },
] }];
const timeline = useRef<LaneTimelineHandle>(null);
<LaneTimeline ref={timeline} ariaLabel="Intervals" lanes={lanes} height={360}
  densityInstants={[1792540800000]} outlineWidthsByRank={{ high: 3, mid: 2, low: 1.5 }}
  outlineMode="strong" onSelectedChange={id => showSelection(id)} />;
// Explicit consumer actions:
timeline.current?.revealById('segment-a');
timeline.current?.reveal(0);
timeline.current?.resetZoom();
```

`overlays`는 메뉴가 시각·구간·구간 집합을 표시하는 선언형 선택 prop이다(SDK는 의미를 모른다). 배열은 `useMemo`로 고정한다: 인라인 배열은 값이 같아도 매 렌더 오버레이 층을 한 번 다시 그린다. 쌓는 순서는 구간 < 오버레이(range < instant < segments, 같은 종류 안에서는 배열 순서) < 선택 윤곽이다.

```tsx
import type { TimelineOverlay } from '@ap/components';

const overlays = useMemo<TimelineOverlay[]>(() => [
  { kind: 'instant', id: 'e1', time: 1792540830000, label: '알림', dash: true },
  { kind: 'range', id: 'r1', start: 1792540800000, end: 1792540860000, laneId: 'a', label: '점검' },
  { kind: 'segments', id: 's1', segmentIds: ['segment-a'], style: 'outline' },
], []);
<LaneTimeline ariaLabel="Intervals" lanes={lanes} overlays={overlays} />;
```

유한하지 않거나 Date 범위(±8.64e15)를 넘는 시각·`start > end`·중복 `id`는 제외되고 개발 진단이 남는다. `label`이 있는 `instant`·`range`는 화면 읽기용 요약에 나온다.

`TimelineSegment.start/end`는 시간대 없는 설비 wall-clock을 UTC getter 기반 epoch ms로 인코딩한 값이며 `start <= end`다. 화면에는 `YYYY-MM-DD HH:mm:ss` 형식으로 시간대 없이 표시한다. `depth`는 0 기반 레이아웃 입력이다. `rank`는 소비자 문자열이며 SDK가 뜻을 추론하지 않는다. `paletteTokens`는 기본 네 series 색을 대체하고 `neutralColorToken`은 neutral 구간의 대체색이다. `colorToken`이 구간에 있으면 우선한다. `outlineMode`는 strong/weak/off이고 선택 테두리는 독립이다.

`description`과 `trust: { source, updated, coverage }`로 설명·기존 공통 Trust footer를 제공할 수 있다.

`selectedId: string | null`과 `onSelectedChange`로 선택을 제어한다. 없으면 `defaultSelectedId`에서 시작한다. region에 Tab으로 진입해 방향키/Home/End로 구간을 탐색하고 Enter로 선택, Escape로 해제한다. 포커스된 구간의 lane·시작/종료 시각·`depth`·`rank`·시작/종료 경계 의미는 DOM 요약으로 읽을 수 있다. `formatTooltip(segment, lane)`는 안전한 텍스트를 반환하며 의미 경계와 기본 시간 요약이 덧붙는다. `formatTick(time)`으로 축 표시를 바꾸어도 좌표는 epoch ms를 유지한다.

Ctrl/⌘+wheel·+/−·확대 버튼으로 확대하고 plot drag로 이동한다. modifier 없는 wheel은 세로 스크롤이다. 축은 고정되고 구간 canvas는 가시 행만 그린다. 352px 미만 컨테이너에서는 내부 가로 스크롤한다. reveal 순서는 **유효한** lanes→segments 입력 순서이며 중복/무효 입력을 제외한 순서다. 재정렬될 수 있으면 `revealById`를 사용한다.

### 구간 끌어 고르기 (`rangeBrush`, `useRangeBrush`)

`LaneTimeline`에 선택 `rangeBrush`를 주면 도구줄에 `구간 선택` 토글이 생긴다. 켜진 동안 plot drag는 이동 대신 시간 구간을 고르고(epoch ms, 구간과 같은 좌표), 클릭은 구간을 선택하지 않는다. Shift+←/→는 구간 끝을 보이는 창의 1/20씩 옮기고(구간이 없으면 보이는 창의 시작부터) 토글을 켠다. 선택 요약은 `선택 구간: 시작–끝`(`formatTick`, 없으면 `YYYY-MM-DD HH:mm:ss`)과 `선택 구간 확대`를 보인다. Escape와 `확대 초기화`가 구간을 지운다. 생김새와 키는 `OrderedIntervalTrack`의 구간 선택과 같다(플롯 높이 전체의 2px `chart-selection-outline`). 주지 않으면 토글이 없고 drag·키·요약이 지금과 같다.

```tsx
const [range, setRange] = useState<AxisRange | null>(null);
<LaneTimeline ariaLabel="Intervals" lanes={lanes} rangeBrush={{ value: range, onChange: setRange }} />;
// 제어하지 않을 때: rangeBrush={{}} 또는 rangeBrush={{ onChange }} (메모이즈하지 않아도 된다)
```

차트 밖 표면(메뉴가 직접 그린 띠·canvas)은 같은 상태와 키보드 대체 입력을 `useRangeBrush({ value?, defaultValue?, onChange?, minSpan? })`로 쓴다. 반환값의 `mode`·`setMode`는 토글, `select(from, to)`는 끝난 drag(순서 무관, 축 값), `keyDown(event, view)`는 Shift+←/→를 처리했으면 true(React와 DOM 키 이벤트 모두 받는다, 구간 시작이 보이는 창 밖이면 창의 시작부터 다시 잡는다), `clear()`는 Escape·초기화다. 포인터 좌표를 축 값으로 바꾸는 일과 그리기는 표면 몫이며, 3px(`RANGE_BRUSH_DRAG_THRESHOLD`)보다 짧은 누름은 클릭으로 본다. 구간은 Chart Local State라 URL·전역 Context를 바꾸지 않는다.

### 순서 기반 유사 구간 찾기 (`findSequenceMatches`, `findRepeatedSequences`)

시간을 빼고 순서만 같은 구간을 찾는 계산 조각이다(#1861). 화면은 그리지 않는다. 메뉴는 레인마다 항목을 순서대로 넘기고(`SequenceLane<T> = { id, items }`, 정렬은 메뉴 몫), `symbol(item)`으로 항목이 뜻하는 단계를 문자열로 선언한다. 같은 문자열이면 같은 단계다. SDK는 단계에 뜻을 붙이지 않는다(동작·상태·설비 의미는 메뉴 몫). 일치는 정확 일치다(빈칸·치환 없음).

- `findSequenceMatches(lanes, pattern, { symbol, collapseRuns? })`: 단계가 `pattern`과 같은 곳을 모두 찾는다. 레인 순서, 레인 안 위치 순서로 돌려준다. 한 레인 안에서는 겹치지 않는다(왼쪽부터, 먼저 시작한 것). 빈 `pattern`은 아무것도 찾지 않는다.
- `findRepeatedSequences(lanes, { symbol, collapseRuns?, minLength? = 3, maxLength? = SEQUENCE_MAX_LENGTH(32), minCount? = 2 })`: 모든 레인에 걸쳐 `minCount`번 이상(겹치지 않게) 나오는 단계열을 찾는다. 최대인 것만 남긴다: 같은 횟수의 더 긴 결과 하나가 모든 나타남을 품으면 뺀다. 정렬은 단계 수(긴 것 먼저), 나타난 횟수(많은 것 먼저), 첫 위치 순이다. 단계열은 아직 `minCount`번 나오는 동안만 한 단계씩 늘리므로 일은 찾은 반복만큼이고 최대 단계 수 × `maxLength`다(1만 항목에서 무작위·주기·잡음 섞인 주기 단계 모두 0.1초 안). `maxLength`는 이 성능 경계일 뿐이다. 더 긴 반복은 그 안의 `maxLength` 단계 창 하나하나(서로 겹침)가 각각 결과로 나온다. 바뀐 입력에서만 다시 부르게 `useMemo`에 둔다. `minLength`·`maxLength`·`minCount`가 유한하지 않으면 기본값을 쓴다.
- `collapseRuns: true`: 이웃한 같은 단계를 한 단계로 본다(레인과 `pattern` 모두). 일치 범위는 그 연속 전체를 덮는다.
- 결과 `SequenceMatch<T> = { laneId, from, to, items }`: `from`·`to`는 레인 `items`의 포함 색인이고 `items`는 그 사이 항목이다. 그리기는 메뉴가 고른다(예: `LaneTimeline` `overlays`의 `segments`에 `items`의 id를 준다).
- `useRangeBrush`와 잇기: `itemsInRange(items, range, span)`는 구간 안에 다 들어간 항목을 순서대로 돌려주고, `sequenceSteps(items, { symbol, collapseRuns? })`는 그 단계열(`pattern`)을 만든다.

```ts
// stepOf는 모듈 범위의 안정된 함수, source는 메뉴가 고른 기준 레인(예: 선택한 레인)이다. 구간 선택은 시간 구간만 주고 레인은 정하지 않는다.
const seqLanes = useMemo(() => lanes.map(l => ({ id: l.id, items: l.segments })), [lanes]);
const pattern = useMemo(() => (range && source ? sequenceSteps(itemsInRange(source.segments, range, s => [s.start, s.end]), { symbol: stepOf }) : []), [range, source]);
const matches = useMemo(() => findSequenceMatches(seqLanes, pattern, { symbol: stepOf }), [seqLanes, pattern]);
const overlays = useMemo((): TimelineOverlay[] => [{ kind: 'segments', id: 'same-order', segmentIds: matches.flatMap(m => m.items.map(s => s.id)), style: 'outline' }], [matches]);
```

## 플랫폼 밖의 Chart Frame (`AnalysisChartFrame`, #1953 C)

`PlatformProvider` 없이 `I18nProvider`와 `@ap/ui` CSS만으로 `AnalysisChartFrame`을 그린다. Zoom·Brush·로컬 선택·지점 선택(`pointActivation`·`pointActions`·`isPointSelectable`)·툴팁·같은 데이터 표·`selectionActions`·`초기화`는 플랫폼 안과 같다. Compare는 숨기고 Annotate와 `분석 구간으로 적용`은 비활성화 사유를 표시한다. 구간 선택은 Chart Local State라 페이지가 `selectionActions`로 자기 동작을 붙인다.

- `exportActions={{ exportAllowed: true, notify? }}`일 때 `내보내기` 팝오버에서 CSV를 받을 수 있다. CSV 머리줄의 `from`·`to`는 `period`에서 읽고, `imageCopy`·`imagePrint`를 선언하면 같은 팝오버에 해당 동작을 추가한다. 기본은 꺼짐이고, 결과 문구는 `notify(text, tone?)`로, 없으면 버튼 옆 `role=status` 한 줄로 전한다.
- `period?: { from?: string | null; to?: string | null }`: 시리즈가 덮는 기간(점과 같은 `YYYY-MM-DDTHH:mm:ss` wall-clock, 변환하지 않는다 — ADR-0064). `Z`·오프셋·날짜만 같은 다른 형식은 쓰지 않고 개발 경고를 낸다. `to`가 있으면 시간축에 키보드 구간 선택(시작·끝 선택, 1시간·4시간·전체)이 생긴다. 없으면 끌기만 된다. 값이 바뀌면 로컬 선택이 초기화된다(플랫폼 안의 전역 Context 변경과 같다).
- `PlatformProvider` 안에서는 두 prop을 읽지 않는다: 메뉴 manifest `features.export·compare·annotate`와 전역 기간이 결정하고, prop으로 메뉴 권한을 넓히지 못한다.

```tsx
<I18nProvider>
  <AnalysisChartFrame chartId="flow" title="처리량" unit="ea" series={series}
    period={{ from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' }}
    imageCopy exportActions={{ exportAllowed: true, notify: text => myToast(text) }}
    selectionActions={sel => <Button size="toolbar" onClick={() => filterTable(sel)}>표 거르기</Button>} />
</I18nProvider>
```

## 변경 기록

2026-10-21 / #541: `ChartPoint`, `ChartPointAction` 추가. `AnalysisChartFrame`에 `pointActivation`, `pointActions`, `orientation`, `visibleSeriesIds`, `onVisibleSeriesChange` 추가. `AnalysisChart` 반환 타입이 `JSX.Element`에서 `JSX.Element | null`로 바뀌었다(`topNBar.hideWhenEmpty`, 호환성 변경).

2026-10-21 / #576: `TopNBarItem`, `TopNBarSpec`, `LaneTimeline`, `LaneTimelineProps`, `LaneTimelineHandle`, `TimelineLane`, `TimelineSegment` 추가. `ChartSpec`에 `topNBar` 추가, 카탈로그 `topNBar`·`lane` 소비 예 추가. 배포 태그는 릴리스 단계에서 정한다.

2026-11-10 / #1657: 선택 옵션 추가(기본 동작 불변). `ChartSeries.axis?: 'left' | 'right'`와 `AnalysisChartFrame`의 `rightAxis?: { unit; valueFormat? }`로 세로 비누적 차트에 오른쪽 값 축을 둔다(가로·누적은 무시하고 개발 중 경고; 툴팁·표·CSV는 시리즈별 단위; `markLines`는 왼쪽). `AnalysisChartFrame`·`AnalysisChart`·`LaneTimeline`에 `imageCopy?: boolean`을 추가한다 — `이미지 복사` 버튼은 prop이 true이고 메뉴 `features.export`가 켜졌을 때만 보이며, PNG를 클립보드에 복사하거나(보안 컨텍스트가 아니면 다운로드) 결과를 토스트로 알린다. 소비자 조치 없음. 규칙은 `docs/contract/chart.md` §16.

2026-11-10 / #1665: 선택 옵션 추가(기본 동작 불변). `AnalysisChartFrame`·`AnalysisChart`·`LaneTimeline`의 `imagePrint?: boolean`은 `imageCopy`와 같은 PNG를 차트 제목과 함께 인쇄한다(`features.export`가 켜진 메뉴에서만 표시).

2026-11-11 / #1746: 선택 옵션 추가(기본 동작 불변). `LaneTimelineProps.overlays?: TimelineOverlay[]`와 타입 `TimelineOverlay`(`instant`·`range`·`segments`) 추가. 렌더러는 마운트마다 한 번 만들어지고, 선택·오버레이 변경은 오버레이 층만 다시 그린다. `LaneTimelineHandle`은 그대로다.

2026-11-15 / #1861: 추가(기존 동작 불변). 순서 기반 유사 구간 찾기 계산 조각 `findSequenceMatches`·`findRepeatedSequences`·`sequenceSteps`·`itemsInRange`·`SEQUENCE_MAX_LENGTH`와 타입 `SequenceLane`·`SequenceMatch`·`SequenceMatchOptions`·`RepeatedSequence`·`RepeatedSequenceOptions`.

2026-11-15 / #1860: 선택 옵션 추가(기본 동작 불변). `LaneTimelineProps.rangeBrush?: RangeBrushOptions`(구간 끌어 고르기)와 차트 밖 표면용 `useRangeBrush`·`AxisRange`·`RangeBrush`·`RangeBrushOptions`·`RangeBrushKey`·`RANGE_BRUSH_DRAG_THRESHOLD` 추가. `OrderedIntervalTrack`의 구간 선택이 같은 훅을 쓴다(동작 같음).
2026-11-15 / #1953 C: 선택 옵션 추가(기본 동작 불변). `AnalysisChartFrame`이 `PlatformProvider` 없이 그려진다(순수 차트 동작만, Compare·Annotate·`분석 구간 적용` 없음). `exportActions?: ChartExportActionsPolicy`(내보내기·이미지, 기본 꺼짐)와 `period?: { from?, to }`(키보드 구간 선택의 끝) — 둘 다 플랫폼 안에서는 무시. 슬라이스 A의 `imageActions`·`ChartImageActionsPolicy`는 미배포라 별칭 없이 `exportActions`·`ChartExportActionsPolicy`로 이름을 바꿨다(CSV까지 덮으므로). 소비자 조치 없음.

2026-11-15 / #1953 A: 선택 옵션 추가(기본 동작 불변). `LaneTimeline`의 `exportActions?: ChartExportActionsPolicy`(`{ exportAllowed, notify? }`) — `PlatformProvider` 없이 `I18nProvider`만으로 `imageCopy`·`imagePrint`를 쓰려면 `exportAllowed: true`를 준다(기본 꺼짐, 결과는 `notify` 또는 버튼 옆 상태 줄). 플랫폼 안에서는 무시되고 메뉴 `features.export`가 결정한다. 소비자 조치 없음. 규칙은 `docs/contract/chart.md` §16.

2026-11-15 / #1953 B: 선택 옵션 추가(기본 동작 불변). `AnalysisChartProps.exportActions?: ChartExportActionsPolicy`(`LaneTimeline`·`AnalysisChartFrame`과 같은 prop·타입) — `AnalysisChart`(topNBar·donut·scatter·pareto·heatmap·boxPlot)가 `PlatformProvider` 없이 `I18nProvider`만으로 그려진다. 플랫폼 밖에서는 `exportAllowed: true`일 때만 `내보내기`(CSV, 맥락은 비어 있다)·`imageCopy`·`imagePrint`가 보이고(기본 꺼짐) 결과는 `notify` 또는 버튼 옆 상태 줄로 전한다. 플랫폼 안에서는 무시되고 메뉴 `features.export`와 토스트가 그대로 결정한다. 소비자 조치 없음. 규칙은 `docs/contract/chart.md` §16. 다운로드가 실패하면 `warning`으로 전한다. 플랫폼 안에서는 무시되고 메뉴 `features.export`가 결정한다. 소비자 조치 없음. 규칙은 `docs/contract/chart.md` §16.

2026-11-22 / #2700: `AnalysisChart` 범주 차트의 `초기화`·`구간 선택` 도구와 히트맵 발산 범례의 선택 `scale.pivotLabel`은 [Chart Contract §16](../../../../docs/contract/chart.md#16-analysis-chart-contract)을 따른다.
