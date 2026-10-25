# LegendTree의 드릴은 보이기와 분리하고 이름 클릭·체크박스는 보이기로 둔다

- Status: Decided (2026-10-25)
- Decider: 코디네이터(사용자 위임, Opus xhigh 리뷰 반영), 되돌릴 수 있다.
- Scope: [#580](https://github.com/hjung3113/analytics-platform/issues/580) 노드 580e. 관련: [ADR-0057](0057-legend-tree-arrow-key-row-navigation.md), [docs/06 §16](../06_platform_ui_contract.md#16-analysis-chart-contract).

## 맥락

HW Time 소비자는 `onSelect` 없이 `LegendTree`를 쓰고 이름 클릭이 보이기를 바꾼다. 같은 트리에서 "이 단계로 내려가기"(드릴)를 더해야 한다. 드릴을 이름 클릭에 주면 기존 보이기 습관이 깨지고, `aria-selected`를 드릴에 쓰면 보이기의 `aria-checked`와 뜻이 섞인다. 시리즈가 아닌 단계 줄(예: 동작)은 체크박스가 없어야 한다.

## 대안

- **b1. 이름 클릭 = 드릴.** 한 번에 내려가지만 이름 클릭이 보이기였던 기존 동작이 바뀌고 실수로 시리즈를 바꾼다.
- **b2. 버튼만.** 보이기는 그대로지만 시리즈가 아닌 줄에는 눌러 내려갈 대상이 없고, 모든 줄에 버튼이 붙어 소음이 된다.
- **조합(선택).** 시리즈 줄은 체크박스·이름 = 보이기이고 자식이 있는 현재가 아닌 줄에 hover/focus 때만 보이는 `단계로 이동` 버튼(`tabIndex=-1`)을 둔다. 시리즈가 아닌 `drillOnly` 줄은 체크박스 없이 줄 클릭 = 드릴이다. Enter는 모든 줄에서 드릴이다.

## 결정

조합. `onDrill`·`currentId`·노드 `drillOnly`를 더한다.

- `drillOnly` 노드는 보이기 잎에 기여하지 않고 `aria-checked`·체크박스가 없으며 `›` 표식과 설명 `Enter: 이 단계로 이동`(`aria-describedby`, 읽기 전용 정렬 설명 유지)을 갖는다. Space는 보이기를 바꾸지 않는다.
- `onDrill`이 있으면 Enter는 모든 줄에서 `onDrill`을 부르고 펼치지 않으며 `onSelect`를 부르지 않는다. `aria-selected`는 쓰지 않고 현재 단계는 `aria-current="true"`와 굵은 글자·2px 시작선이다. `onDrill`이 없으면 ADR-0057의 키보드 계약이 그대로다.
- `aria-multiselectable="true"`는 체크박스가 하나라도 있을 때 둔다.
- `currentId`가 트리에 있고 펼침 prop이 없으면 첫 열림은 그 조상만이다. 이후 `currentId`가 바뀌면 닫힌 조상만 열고 사용자가 연 가지는 닫지 않는다.
- 드릴은 `visible`을 바꾸지 않는다. 모든 잎이 꺼지면 트리 머리(`onDrill`이 있을 때)와 `AnalysisChartFrame`의 상태 문장 옆에 `모두 보이기` 버튼을 둔다.

## 되돌리기

모두 선택 prop이라 지우면 기존 동작으로 돌아간다. 트리 머리 버튼을 `onDrill`에만 걸었다 — 새 prop이 없는 호출자의 Tab 순서와 기존 테스트를 바꾸지 않기 위해서다.
