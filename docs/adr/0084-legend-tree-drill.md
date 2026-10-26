# LegendTree의 드릴은 보이기와 분리하고 이름 클릭·체크박스는 보이기로 둔다

- Status: Decided (2026-10-25)
- Decider: 코디네이터(사용자 위임, Opus xhigh 리뷰 반영), 되돌릴 수 있다.
- Scope: [#580](https://github.com/hjung3113/analytics-platform/issues/580) 노드 580e. 관련: [ADR-0057](0057-legend-tree-arrow-key-row-navigation.md), [docs/06 §16](../contract/platform-ui-contract.md#16-analysis-chart-contract).

## 맥락

HW Time 소비자는 `onSelect` 없이 `LegendTree`를 쓰고 이름 클릭이 보이기를 바꾼다. 같은 트리에서 "이 단계로 내려가기"(드릴)를 더해야 한다. 드릴을 이름 클릭에 주면 기존 보이기 습관이 깨지고, `aria-selected`를 드릴에 쓰면 보이기의 `aria-checked`와 뜻이 섞인다. 시리즈가 아닌 단계 줄(예: 동작)은 체크박스가 없어야 한다.

## 대안

- **b1. 이름 클릭 = 드릴.** 한 번에 내려가지만 이름 클릭이 보이기였던 기존 동작이 바뀌고 실수로 시리즈를 바꾼다.
- **b2. 버튼만.** 보이기는 그대로지만 시리즈가 아닌 줄에는 눌러 내려갈 대상이 없고, 모든 줄에 버튼이 붙어 소음이 된다.
- **조합(선택).** 시리즈 줄은 체크박스·이름 = 보이기이고 자식이 있는 현재가 아닌 줄에 hover/focus 때만 보이는 `단계로 이동` 버튼(`tabIndex=-1`)을 둔다. 시리즈가 아닌 `drillOnly` 줄은 체크박스 없이 줄 클릭 = 드릴이다. Enter는 드릴 가능한 줄에서 드릴이다(아래 개정).

## 결정

조합. `onDrill`·`currentId`·노드 `drillOnly`를 더한다.

- `drillOnly` 노드는 보이기 잎에 기여하지 않고 `aria-checked`·체크박스가 없으며 `CornerDownRight` 표식(펼침 화살표 `›`와 다른 모양; 현재 줄이 아니면 이 표식이 곧 항상 보이는 `<이름> 단계로 이동` 버튼이고 hover 버튼을 따로 두지 않는다)과 설명 `Enter: 이 단계로 이동`(`aria-describedby`, 읽기 전용 정렬 설명 유지)을 갖는다. Space는 보이기를 바꾸지 않는다.
- `onDrill`이 있으면 Enter는 드릴 가능한 줄에서 `onDrill`을 부르고 펼치지 않으며 `onSelect`를 부르지 않는다. `aria-selected`는 쓰지 않고 현재 단계는 `aria-current="true"`와 굵은 글자·2px 시작선이다. `onDrill`이 없으면 ADR-0057의 키보드 계약이 그대로다.
- `aria-multiselectable="true"`는 체크박스가 하나라도 있을 때 둔다.
- `currentId`가 트리에 있고 펼침 prop이 없으면 첫 열림은 그 조상만이다. 이후 `currentId`가 바뀌면(펼침을 제어하지 않는 uncontrolled일 때만) 닫힌 조상만 열고 사용자가 연 가지는 닫지 않는다. `expanded`를 넘긴 제어형은 호출자가 `expanded`를 소유하므로 자동으로 열지 않고 `onExpandedChange`도 부르지 않는다 — 현재 항목까지의 경로는 호출자가 연다.
- 드릴은 `visible`을 바꾸지 않는다. 모든 잎이 꺼지면 트리 머리(`onDrill`이 있을 때, 줄들 위의 자기 줄, 전체 폭)와 `AnalysisChartFrame`의 상태 문장 옆에 `모두 보이기` 버튼(`secondary` + `Eye`)을 둔다.

## 되돌리기

모두 선택 prop이라 지우면 기존 동작으로 돌아간다. 트리 머리 버튼을 `onDrill`에만 걸었다 — 새 prop이 없는 호출자의 Tab 순서와 기존 테스트를 바꾸지 않기 위해서다.

## 개정 (2026-10-25, #580 노드 580j, 사용자 UX 리뷰 UX-2·UX-3)

"Enter는 모든 줄에서 드릴"을 **뒤집는다.** 단계 이동 단서(`단계로 이동` 버튼, Enter 설명)가 없는 줄에서도 Enter가 말없이 이동해, 잎 줄에서 Enter가 화면을 바꾸는 것이 놀라웠고 가지 줄은 펼칠 수 없었다. 선택 prop `canDrill?: (id) => boolean`을 더한다. `onDrill`이 있을 때 줄이 드릴 가능한 조건은 `drillOnly`이거나, `canDrill?.(id)`가 true이거나, `canDrill`이 없으면 자식이 있는 것이다(`canDrill`이 false여도 `drillOnly`는 드릴 가능). 드릴 가능한 줄만 hover/focus-visible 버튼, `aria-describedby` → `Enter: 이 단계로 이동`, Enter 드릴을 갖는다. 그 밖의 줄은 Enter가 ADR-0057 그대로다(가지는 펼침 토글, 잎은 아무 일 없음). `canDrill`을 넘기지 않은 호출자는 자식 없는 시리즈 줄의 Enter 드릴을 잃는다(의도한 변경). 같은 개정에서 `drillOnly` 표식을 `CornerDownRight`로, 트리 머리 `모두 보이기`를 줄 위 자기 줄의 `secondary` 버튼으로 바꾼다. 되돌리려면 `canDrill={() => true}`가 이전 동작이다.
