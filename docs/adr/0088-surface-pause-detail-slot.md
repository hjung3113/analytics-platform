# 소유 표면이 가려지면 상세 슬롯 등록자는 자리를 지키되 표시권을 멈춘다

- Status: Decided (2026-10-27)
- Decider: 코디네이터(이슈 #893 §4.4 상세 우선권 표와 설계 보강 승인), 되돌릴 수 있다.
- Scope: [#893](https://github.com/hjung3113/analytics-platform/issues/893) 노드 893c2. 개정: [ADR-0047](0047-detail-panel-slot-single-registrant-model.md)(상세 슬롯 단일 등록자 모델)에 "중지" 상태를 더한다. 관련: [ADR-0087](0087-board-minimize-restore-history.md), [docs/06 §13](../contract/platform-ui-contract.md), [docs/16 §4](../design/analysis-board.md).

## 맥락

최소화된 보드는 언마운트되지 않는다(ADR-0087). 보드 칸이 연 상세는 칸의 React 트리에서 슬롯으로 portal 등록된 채 남는다. 두 가지가 어긋난다. (1) 보드를 가렸는데 그 칸의 상세가 오른쪽에 그대로 보인다. (2) 등록자를 "해제"로 풀면 사용자가 연 상세가 최소화만으로 사라지고, "종료"로 알리면(`onSuperseded`·`onClose`) 최소화가 선택·상세를 지우는 일이 된다. 최소화는 표시권을 잠시 놓는 일이지 상세를 끝내는 일이 아니다.

## 결정

`@ap/ui`에 도메인을 모르는 개념 **소유 표면 중지**를 둔다: 등록자를 소유한 화면이 잠시 가려졌지만 마운트는 남아 있다. `SurfacePauseScope paused`로 선언하고 `useSurfacePaused()`로 읽는다(중첩은 하나라도 중지면 중지). `@ap/ui`는 보드·칸·dock·메뉴라는 말을 모른다.

중지된 등록자는:

- **자리를 지킨다.** 해제가 아니다. 목록의 순서와 `activeKey`는 그대로다.
- **승자여도 보이지 않는다.** 슬롯의 `open`은 false가 되어 셸 aside가 숨고 `activation`은 늘지 않는다. 내용 등록자의 내용은 Provider가 그리지 않는다. portal 등록자의 서브트리는 마운트된 채 숨은 host에 남고(입력·탭 상태 유지), 자기 transient UI는 스스로 scope로 닫는다(`DetailDrawer`는 `TransientOverlayScope active={!paused} detached`, 중지 중에는 포커스를 가져오지 않고 닫혀도 앞 화면으로 포커스를 돌려주지 않는다).
- **`onSuperseded`·`onClose`를 부르지 않는다.** 중지는 종료가 아니다. 더 새 등록자가 슬롯을 가져가면 기존 규칙대로 `onSuperseded`가 불린다(종료 사유는 사용자의 새 상세 열기).
- **재개하면** 여전히 승자일 때만 다시 보이고 `activation`을 +1한다(새로 보이게 된 상세, VOC 드로어 양보 규칙 06 §13 그대로). 더 새 등록자가 이미 승자면 재개해도 되살리지 않는다.
- 중지된 채 **새로 등록**하는 등록자는 보이는 상세를 밀어내지 않는다: 목록 맨 뒤(가장 낮은 우선)에 서고 `onSuperseded`·`activation` 없이 대기한다.

### 상세 우선권 표(이슈 #893 §4.4)

| # | 상황 | 결과 | 고정하는 곳 |
| --- | --- | --- | --- |
| ① | 보드 상세 D1 → 최소화 → 새 상세 없음 → 복원 | D1이 단일 승자면 보드와 함께 다시 표시. 최소화만으로 선택·드릴 초기화 없음 | `BoardHidden.test.tsx`, `DetailPanelSlot.pause.test.tsx` |
| ② | D1 → 최소화 → 일반 상세 D2를 명시적으로 엶 | D2가 소유자, D1은 기존 교체 규칙으로 종료(`onSuperseded`) | `BoardHidden.test.tsx`, `DetailPanelSlot.pause.test.tsx` |
| ③ | ② 뒤 보드를 플로팅으로 복원(893d) | D2 유지, D1 자동 복원 없음 | `DetailPanelSlot.pause.test.tsx`(재개해도 비복원). 플로팅 쪽은 893d |
| ④ | ② 뒤 최대화로 복원 | 일반 화면(URL이 `/board`라 언마운트)의 D2는 보드 위에 없고 D1도 되살지 않는다. 이후 보드에서 연 상세가 소유 | `BoardHidden.test.tsx` |

### 보드 쪽

`BoardSurface`는 `visible=false`일 때 `SurfacePauseScope paused`와 `TransientOverlayScope active={visible}`을 건다: 보드 소유 menu·popover·dialog가 닫히고, 진행 중 구분자 끌기·시트 탭 끌기·dock의 지연 포커스 핸드오프가 정리된다. 분석 선택·초안·드릴·행 선택·차트 확대·스크롤은 지우지 않는다. 보드가 만든 되돌리기 토스트는 최소화 때 닫고, 숨은 보드는 새 토스트를 만들지 않는다(저장소 안내는 보일 때 한 번 말한다). 사용자가 바뀌면 이전 사용자의 표시 상태(`live`·복귀 주소·칩 시트·포커스)를 버린다 — 숨은 보드는 `mounted`가 사용자별이라 언마운트되고 세션 저장소는 구독자가 없어지며 비운다.

## 대안

- **a. 최소화를 해제로 취급**: 상세가 사라지고 복원 때 되살릴 방법이 없다. 기각.
- **b. 보드 전용 `paused` prop을 `DetailDrawer`에**: 슬롯 우선권 규칙(활성 판정·activation·VOC 양보)을 `@ap/components`가 따로 알아야 한다. 기각.
- **c. 중지된 portal 등록자도 unmount**: 입력·탭 상태와 포커스 정리 콜백이 따라 움직인다. 기각.
- **선택. d. 슬롯이 중지 상태를 아는 도메인 중립 scope.**

## 결과와 한계

- 공개 export: `SurfacePauseScope`, `useSurfacePaused`(`@ap/ui`). 슬롯 내부 컨텍스트(`DetailPanelSlotActionsContext`)에 `setPaused`가 늘었다(공개 아님).
- 중지되면 슬롯의 확장(전체 화면) 상태는 끝난다(기존 "활성 등록자가 닫히면 확장 해제" 규칙).
- 툴팁은 `TransientOverlayScope`의 대상이 아니다(Radix 툴팁이 트리거가 숨으면 닫힌다). 별도 정리 없음.
- 선택 행의 안정 식별자는 메뉴의 몫이고 이 결정은 건드리지 않는다.

## 되돌리기

`BoardSurface`의 두 scope를 빼면 이전 동작(상세가 최소화 뒤에도 보임)이다. 중지 상태는 `SurfacePauseScope`가 없으면 항상 false라 다른 소비자(FeedbackOps 포함)는 영향이 없다.
