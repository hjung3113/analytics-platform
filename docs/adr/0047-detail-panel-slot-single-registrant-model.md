# 상세 패널 슬롯은 플랫폼 슬롯 하나로 통합하고, FeedbackOps의 내용 전달 방식은 같은 슬롯의 두 번째 등록 방식으로 흡수한다

상태: **Decided (2026-10-19, 결정자: 코디네이터 — 사용자는 "#442 진행"만 승인, 설계는 위임. 되돌릴 수 있음)** — 구현은 [#442](https://github.com/hjung3113/analytics-platform/issues/442).

[ADR-0046](0046-design-system-source-moves-to-platform-whole-package.md)에 따라 FeedbackOps `layout/`을 `@ap/ui`로 옮기면 상세 슬롯이 두 벌이 된다([포괄 목록](../integration/sdk-coverage-inventory.md) §3.6, [탑재 설계](../integration/platform-hosting-design.md) G10).

| | 플랫폼 `DetailPanelSlot`([ADR-0013](0013-detail-panel-shell-docked-slot.md)) | FeedbackOps `layout/useDetailPanelSlot` |
| --- | --- | --- |
| 방식 | 셸의 오른쪽 DOM 호스트에 소비자가 portal로 그린다 | 소비자가 노드를 컨텍스트에 올리고(`setContent`/`clear`) AppFrame이 그린다 |
| 훅 | `useDetailPanelSlot(): HTMLElement \| null` (제공자 없으면 throw) | `useDetailPanelSlot(node): void` (제공자 없으면 no-op) |
| 등록자 | 마지막 등록자 승리 + 개발 경고, 이전 등록자 복귀 | 마지막 쓰기 승리, 키별 정리 |
| 호출자 | `DetailDrawer` | `PageShell`·`ListShell`·`WorkbenchShell`의 `detailPanel` prop |

## 결정

- **슬롯은 `DetailPanelSlotProvider` 하나다(플랫폼 방식이 원본).** 호스트(`useDetailPanelSlotHost`)는 활성 등록자가 portal 방식이면 DOM 호스트를 채우게 두고, 내용 전달 방식이면 받은 노드를 호스트 안에 그린다. 두 방식은 같은 등록자 목록을 쓰므로 "마지막 등록자 승리·이전 등록자 복귀·개발 경고"가 한 규칙이다.
- **FeedbackOps 훅은 이름만 바꿔 옮긴다:** `useDetailPanelSlot(node)` → `useDetailPanelContent(node)`(이름 충돌 해소). 세 셸의 import 한 줄과 호출 한 줄만 바뀐다. 제공자가 없으면 no-op인 성질을 유지한다(storybook·단독 테스트).
- **FeedbackOps `DetailPanelSlotContext`는 옮기지 않는다.** FeedbackOps `AppFrame`이 SDK로 전환할 때 이 컨텍스트 제공을 `DetailPanelSlotProvider`로 바꾼다(전환 시점은 ADR-0046 Open과 같다). 그 전까지 `@fops/ui`는 FeedbackOps에 그대로 있다.
- 플랫폼 `AppShell`과 FeedbackOps `AppFrame`·EV `AppFrame`을 하나로 합칠지는 이 결정 밖이다(별도 이슈).

## Considered Options

- **(a, 채택) 슬롯 하나 + 등록 방식 둘:** 플랫폼 소비자 코드가 바뀌지 않고, FeedbackOps 셸 세 개는 한 줄 이름 변경으로 옮겨진다. 비용은 슬롯 구현이 두 방식을 모두 아는 것.
- **(b) 두 벌 유지(이름만 구분):** 구현은 가장 싸지만 호스트가 둘이라 한 화면에 둘이 동시에 등록하면 규칙이 갈린다. G10을 닫지 못한다.
- **(c) 플랫폼도 내용 전달 방식으로 통일:** portal이 주던 "등록한 페이지의 React 컨텍스트 보존"이 사라지고 `DetailDrawer`·메뉴 테스트가 모두 바뀐다.

## 결과

- `DetailPanelSlot.tsx`·`AppShell.tsx`(호스트)를 건드리는 상태·순서 로직이므로 #442는 `impl-complex`와 수정 diff 점검을 받는다.
- 06 §13 상세 슬롯 서술에 "등록 방식 둘, 활성 등록자는 하나"를 반영한다.
- Open: 셸 세 벌(플랫폼 `@ap/shell`·FeedbackOps `AppFrame`·EV `AppFrame`) 통합 여부.
