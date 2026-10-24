# ADR-0079 — 차트 행 포커스(제어형)와 `rowPitch` viewport

- Status: Decided (2026-10-24)
- Decider: 코디네이터(사용자 위임, #690 계획), 되돌릴 수 있음.
- Scope: [#690](https://github.com/hjung3113/analytics-platform/issues/690) 1단계 SDK 조각 S1([ADR-0078](0078-hw-time-layout-recipes.md)). [#541](https://github.com/hjung3113/analytics-platform/issues/541) 항목 F 가운데 viewport 선택(`dataZoom` 창 대 안쪽 스크롤)을 결정한다. 관련: [ADR-0063](0063-consumer-owned-chart-pieces-and-unbounded-drill.md)(`visibleSeriesIds` 제어형 패턴, `pointActivation`).

## 맥락

HW Time 같은 메뉴는 가로 누적 막대 Frame 둘이 같은 행을 보여 줘야 한다(맥락 | 상세). 행이 많으면 막대 높이는 고정하고 차트 안에서 스크롤해야 하며, 한 Frame에서 고른 행이 다른 Frame에서도 보여야 한다.

## 결정

- 행 강조의 소유자는 메뉴 하나다. `AnalysisChartFrame`은 `activeCategory`(제어형, `null` = 행 없음)를 받아 그 행의 막대 테두리와 굵은 범주 라벨로 그리고, 클릭·지점 선택기 이동은 `onActiveCategoryChange(category, 'pointer' | 'keyboard')`로만 알린다. prop이 있으면 프레임은 자기 강조 상태를 갖지 않는다. prop이 없으면 기존 동작 그대로다.
- 행 포커스와 `pointActivation`(드릴 진입·키보드 `선택 지점 실행`)은 별개다. 한 번의 클릭은 행 콜백을 먼저, `on: 'click'`이면 `onActivate`를 그 뒤에 부른다.
- `rowPitch`(≥24px, WCAG 2.2 2.5.8)는 차트 높이를 `행 수 × pitch + 축 여백`으로 만들고, 플롯 상자를 주어진 `height`/`size`의 창으로 삼아 안에서 스크롤한다. **이 모드에서 범주 `dataZoom`(Shift+휠·`확대`)은 끄고 Brush는 둔다.**
- `revealActive`는 밖에서 바뀐 `activeCategory`의 행을 창 안으로 스크롤한다(`격자 위 여백 + 인덱스 × pitch`, 순수 `revealScrollTop`). 포커스는 옮기지 않고, 프레임 자신의 포인터 클릭에서 온 변경은 스크롤하지 않는다.
- 프레임에 새 행 수 상한은 없다. 메뉴가 엔드포인트의 `limits.maxRows`(06 §15·§19 `too_large`)로 자르고 §27대로 전체 데이터를 프런트로 보내지 않는다.
- 가로가 아닌 차트에서 이 prop들은 무시되고 개발 중 `console.warn`이 알린다.

## Considered Options

- **동기화 그룹 컨텍스트:** 같은 그룹의 Frame이 행을 암묵적으로 공유한다. 숨은 결합이고 URL·페이지 상태와의 소유가 모호하며, 메뉴가 행 선택을 다른 곳(표·Inspector)에도 쓸 때 다시 한 번 중계해야 한다. 기각.
- **(채택) 제어형 prop:** ADR-0063의 `visibleSeriesIds`와 같은 모양이라 소비자에게 새 개념이 없다.
- **`dataZoom` 창으로 행 스크롤:** 이미 있는 줌 창을 행 이동에 쓴다. 막대 높이가 행 수에 따라 줄어 고정 높이가 깨지고, 줌과 스크롤 두 viewport가 겹쳐 선택 요약·Brush 범위·내보내기가 어느 창 기준인지 모호해진다. 기각.
- **(채택) 안쪽 스크롤:** 막대 높이가 고정이고 휠은 가장 가까운 스크롤 컨테이너 규칙(§16, #700)을 그대로 따른다.

## 결과

- `rowPitch`에서는 모든 행이 그려지고 확대가 꺼지므로 값 축은 보이는 시리즈 전체 범위를 그대로 쓴다(보이는 창 기준 autoscale 없음). 안쪽 스크롤 위치는 소비자 쪽 DOM 상태이고 기간 변경 때 따로 초기화하지 않는다. #541 F의 나머지 정책(autoscale·숨김 시리즈·reset)은 이 결정 범위 밖이다.

- 계약은 06 §16 "가로 막대의 행 포커스와 `rowPitch`"다. 기존 가로 소비자는 `rowPitch`를 주지 않으면 줌을 유지한다.
- 격자 위·아래 여백(16·44px)은 옵션과 높이 계산이 `analysisChartGeometry.ts`의 상수 하나를 쓴다. x축 눈금 라벨이 아래 여백 안에서 격자를 줄이므로 행 간격은 pitch에 근접한 값이다(실측은 E2E, 690m).
