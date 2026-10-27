# SDK TopN·Lane 차트

`@ap/components`는 `AnalysisChart`의 `TopNBarSpec`과 독립 `LaneTimeline`을 공개한다([ADR-0064](../adr/0064-topn-bar-and-lane-timeline.md), [06 §16](../contract/chart.md#16-analysis-chart-contract)). 두 부품은 플랫폼의 `I18nProvider` 아래에 놓는다. `AnalysisChart`는 기존과 같이 `PlatformProvider`도 필요하다.

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
import { useRef } from 'react';
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

`TimelineSegment.start/end`는 시간대 없는 설비 wall-clock을 UTC getter 기반 epoch ms로 인코딩한 값이며 `start <= end`다. 화면에는 `YYYY-MM-DD HH:mm:ss` 형식으로 시간대 없이 표시한다. `depth`는 0 기반 레이아웃 입력이다. `rank`는 소비자 문자열이며 SDK가 뜻을 추론하지 않는다. `paletteTokens`는 기본 네 series 색을 대체하고 `neutralColorToken`은 neutral 구간의 대체색이다. `colorToken`이 구간에 있으면 우선한다. `outlineMode`는 strong/weak/off이고 선택 테두리는 독립이다.

`description`과 `trust: { source, updated, coverage }`로 설명·기존 공통 Trust footer를 제공할 수 있다.

`selectedId: string | null`과 `onSelectedChange`로 선택을 제어한다. 없으면 `defaultSelectedId`에서 시작한다. region에 Tab으로 진입해 방향키/Home/End로 구간을 탐색하고 Enter로 선택, Escape로 해제한다. 포커스된 구간의 lane·시작/종료 시각·`depth`·`rank`·시작/종료 경계 의미는 DOM 요약으로 읽을 수 있다. `formatTooltip(segment, lane)`는 안전한 텍스트를 반환하며 의미 경계와 기본 시간 요약이 덧붙는다. `formatTick(time)`으로 축 표시를 바꾸어도 좌표는 epoch ms를 유지한다.

Ctrl/⌘+wheel·+/−·확대 버튼으로 확대하고 plot drag로 이동한다. modifier 없는 wheel은 세로 스크롤이다. 축은 고정되고 구간 canvas는 가시 행만 그린다. 352px 미만 컨테이너에서는 내부 가로 스크롤한다. reveal 순서는 **유효한** lanes→segments 입력 순서이며 중복/무효 입력을 제외한 순서다. 재정렬될 수 있으면 `revealById`를 사용한다.

## 변경 기록

2026-10-21 / #541: `ChartPoint`, `ChartPointAction` 추가. `AnalysisChartFrame`에 `pointActivation`, `pointActions`, `orientation`, `visibleSeriesIds`, `onVisibleSeriesChange` 추가. `AnalysisChart` 반환 타입이 `JSX.Element`에서 `JSX.Element | null`로 바뀌었다(`topNBar.hideWhenEmpty`, 호환성 변경).

2026-10-21 / #576: `TopNBarItem`, `TopNBarSpec`, `LaneTimeline`, `LaneTimelineProps`, `LaneTimelineHandle`, `TimelineLane`, `TimelineSegment` 추가. `ChartSpec`에 `topNBar` 추가, 카탈로그 `topNBar`·`lane` 소비 예 추가. 배포 태그는 릴리스 단계에서 정한다.
