# 차트 범례는 비교 기간별로 묶고 이전 기간의 선 패턴을 대응시킨다

상태: **Decided (2026-10-04)**.
- 결정자: 사용자 — 실제 차트 위 `?variant=` 프로토타입에서 A/B/C 중 B를 선택했다(#207).

세부(범례 표시·선 패턴·stroke 토큰·표면 대비)는 [DESIGN.md](../../DESIGN.md#chart-legend-and-series-encoding--decided-b-2026-10-04)와 구현 이슈 [#207](https://github.com/hjung3113/analytics-platform/issues/207)이 소유한다. 이 ADR은 결정과 이유만 둔다.

공통 Chart Frame은 Compare, 시리즈 표시, 선 렌더링, 범례를 소유한다. Compare가 켜졌을 때 기존 한 줄 범례는 두 기간을 섞어 보여 P50/P95를 색 없이 구별하기 어려웠다. 막대 시리즈도 선 모양 범례 표시를 받았다. 이전 기간의 `cat-amber` 선은 차트 마크 대비 기준에 못 미쳤고, P95 기준 `markLine`은 이전 기간 선과 같은 경고 색을 사용했다. 실제 cycle-time 차트의 `?variant=` 프로토타입에서 세 가지 표현을 비교했고 사용자가 B를 선택했다.

## 결정

- Compare가 사용 가능하고 켜졌을 때 범례를 현재 기간과 이전 기간 그룹으로 나눈다. 두 이름은 기존 i18n 사전을 사용한다. Compare가 꺼져 있거나 사용할 수 없으면 일반 범례를 표시한다.
- 현재 기간 선은 Consumer가 선언한 `dashed` 값을 유지한다. 실선은 `'solid'`, 대시는 `[8, 4]`다. 이전 기간은 대응하는 선언을 따라 실선에 점선 `[2, 2]`, 대시에 대시-점선 `[8, 3, 2, 3]`을 적용한다. ECharts 선과 SVG 범례는 같은 배열을 사용한다.
- 막대 범례는 12px 채움 사각형과 2px 외곽선을 사용한다. `chart-remainder`의 외곽선에는 `border-control`을 사용한다.
- 얇은 이전 기간 amber 선과 외곽선에는 `cat-amber-stroke`(`#b45309`, RGB `180 83 9`)를 사용한다. 이 토큰은 마크용이며 작은 글자에는 쓰지 않는다. card/canvas/sunken 대비는 4.93:1 / 4.67:1 / 4.50:1이다.
- P95 기준 `markLine`과 라벨은 언제나 `text-secondary`로 표시한다.
- cycle-time 상세의 이전 시리즈를 현재 대응 항목에 맞춘다. P50은 non-dashed, P95는 dashed로 선언하고 이전 P95는 `cat-amber`를 사용한다. Productivity Overview의 cycle-time P95도 dashed로 두되 Compare manifest는 끈 상태로 둔다.

## Considered Options

- **(A) 현재 한 줄 범례 유지**: 변경이 가장 작다. 하지만 비교 기간이 섞이고, 네 P50/P95 선 패턴을 모두 구별하기 어렵다.
- **(B, 채택) 기간별 그룹과 대응 선 패턴 사용**: Chart Frame의 범례와 체크박스 동작을 유지하면서 기간과 분위수를 구별한다.
- **(C) 비교 표와 점 마커 사용**: 대응 관계는 분명해지지만 7일 시간별 시계열에 마커가 복잡함을 더하고 표가 공간을 차지한다.

## 결과

- `AnalysisChartFrame`이 범례 그룹, 선 패턴, 선·막대 swatch를 소유한다. 각 기간 그룹은 보이는 제목으로 이름을 연결하고, 네 개 이하의 대응 시리즈는 같은 CSS grid 열을 사용한다. 시리즈가 다섯 개 이상이면 기존처럼 줄바꿈하는 행을 사용한다. Consumer는 시리즈 색과 `dashed`만 선언하며 데이터나 URL 계약은 바꾸지 않는다.
- 이전 기간 amber 선은 범주 정체성을 유지하면서 대비 기준을 만족한다. 작은 글자와 P95 기준 마크는 중립 색을 쓴다.
- 프로토타입 브랜치와 `usePrototype` 전환 코드는 참고 자료일 뿐 제품 코드에 포함하지 않는다.
