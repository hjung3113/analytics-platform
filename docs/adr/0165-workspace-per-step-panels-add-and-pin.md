# 작업 영역 — 드릴 단계별 패널, 패널 추가 목록과 고정

상태: **Decided (2026-11-16)**
- 결정자: #2391 결정(고문, 소유자 위임), 되돌릴 수 있음.
- Scope: `PanelWorkspace` 패널 선언 `placement`·`pin`, `PanelAddMenu`, `usePinnedPanels`, `usePageKeyRules`의 반복 키 검사. 계약 원천은 [layout.md §12.8](../contract/layout.md#128-panelworkspace-decided-adr-0067-결정-391822)이다. 관련: [ADR-0067](0067-dockview-layout-engine-board-v2.md), [ADR-0130](0130-workspace-stack-default-and-declared-stack-layout.md), [ADR-0063](0063-consumer-owned-chart-pieces-and-unbounded-drill.md).

## 맥락

HW Time(#2391)은 드릴 단계마다 다른 패널을 보이고, 사용자가 고른 패널(분포·산점도 등)을 다음 단계에도 남기고 싶어 한다. 단계 수와 패널 종류는 메뉴마다 다르다. 작업 영역은 이미 `persistKey`가 바뀌면 다시 마운트해 그 키의 배치를 읽고, 패널 집합이 바뀌면 빠진 패널을 주 패널 묶음의 탭으로 넣는다. 사용자가 더한 패널이 탭 뒤에 숨으면 더한 것이 보이지 않는다.

## 결정

1. **단계별 패널(#2397):** 새 prop을 두지 않는다. 메뉴가 단계마다 `persistKey`·`panels`·`presets`를 넘기면 단계마다 배치가 따로 저장된다. 고정된 패널은 메뉴가 각 단계의 `panels`에 넣는다.
2. **놓는 자리(#2398):** 패널 선언 `placement: 'below'`는 배치가 아직 그 패널을 갖지 않을 때(사용자가 더한 패널, 그 패널을 적지 않은 프리셋) 맨 아래 새 줄(전체 폭)로 연다. 없으면 지금처럼 주 패널 묶음의 탭이다. 사용자가 이미 놓은 자리는 바꾸지 않는다. 쌓기 모드의 저장된 줄 높이는 그대로 두고 새 줄은 360px로 시작한다.
3. **추가:** `PanelAddMenu`는 메뉴가 준 목록과 «추가하면 고정» 체크 하나(기본 켬)만 그린다. 이미 있는 패널과 `disabledReason`이 있는 항목은 사용 불가와 사유를 보인다. 행 오른쪽 클릭 메뉴는 두지 않는다. 패널을 실제로 더하는 것은 메뉴다(작업 영역 명령 모델은 `dock/`에 있고 메뉴 패널 목록은 메뉴의 것이다).
4. **고정:** 패널 선언 `pin: { pinned, onToggle }`이 패널 머리에 누름 상태 버튼(`<제목> 고정`, `aria-pressed`)을 그린다. 고정 집합은 메뉴가 선언한 반복 page key 하나(`usePinnedPanels(pageKey, known)`, kernel 식별자 규칙, `repeatedPageKeys`, 보통 `hiddenPageKeys`)다. 저장된 뷰와 공유 링크가 선언된 page 키로 함께 싣는다(kernel §6.4, §21.1). 기본 = 키 없음. 모르는 id는 읽을 때 무시하고 고치지 않으며 `rules`(`repeated: true`)로 거절한다.

## Considered Options

- **page key 고정 집합 + 메뉴가 더함(채택):** 공유·저장·뒤로가기가 기존 page 키 규칙을 그대로 따른다. SDK는 도메인을 모른다.
- **작업 영역 로컬 저장소에 고정 집합:** 링크와 저장된 뷰가 고정을 싣지 못하고 사용자별 브라우저에 갇힌다.
- **`step` prop을 작업 영역에 더함:** `persistKey` 다시 마운트로 이미 되는 일을 둘로 만든다.
- **새 패널을 탭으로(현재 기본):** 더한 패널이 뒤 탭에 숨어 더한 결과가 보이지 않는다.

## 결과

선언을 더한 메뉴만 바뀐다. 기본 동작(탭으로 합류, 핀 버튼 없음)은 그대로다. 첫 소비자는 HW Time 조립 #2399다.
