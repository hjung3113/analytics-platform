# 같은 위젯 응답은 페이지 배너 + 간결 상태로 표시한다 (프로토타입 B안)

상태: **Decided (2026-10-04)**.
- 결정자: 사용자 — 실제 앱 위 `?variant=` 프로토타입에서 A/B/C 중 B를 선택했다(#55, 브랜치 `hjung3113/proto-m2-batch2`).

세부 상태·묶음·재시도·접근성 계약은 [06 §19](../06_platform_ui_contract.md#19-loading--empty--error-taxonomy), 시각 토큰과 배치는 [DESIGN](../../DESIGN.md#shared-interaction-and-data-states)이 소유한다. 이 ADR은 결정과 이유만 둔다.

여러 위젯이 같은 응답을 받으면 전체 상태 상자가 반복돼 페이지를 압도한다. 위젯별 정체성과 다음 행동은 남기면서 페이지가 관측한 동일 응답을 한 번 안내할 필요가 있다. 같은 응답이라는 사실만으로 수집·상위 시스템 원인을 단정할 수는 없다.

## 결정

- 사용자 컨펌 B안(배너 + 간결 상태)을 채택한다. 컨펌 참조는 `hjung3113/proto-m2-batch2` (`d29bec0`)의 위젯 상태 B안과 `.agents/reports/design/shots/m2-batch2`(원격 브랜치 `hjung3113/proto-m2-batch2`의 커밋에만 있다) 스크린샷이다. 프로토타입 분기 코드는 본 코드에 옮기지 않는다.
- `PlatformPage`가 응답 scope와 본문 상단 배너 위치를 제공한다. `QueryView`는 현재 응답·재시도·선택적 위젯 이름을 가장 가까운 scope에 등록하고 해제한다. 메뉴가 그룹 목록을 별도로 조립하지 않는다.
- 개별 위젯에 본문·조언·재시도·Correlation ID를 직접 표시한다. 바로 위에 같은 제목이 있으면 중복 제목을 생략하되 접근 이름은 유지한다.

## Considered Options

- **(A) 전체 상태 상자 반복:** 기존 구현을 유지하지만 같은 실패가 여러 번 강하게 표시된다.
- **(B, 채택) 배너 + 간결 상태:** 페이지 요약과 개별 진단·동작을 동시에 볼 수 있다.
- **(C) 배너 + chip + disclosure:** 더 작지만 timeout 조언 등 다음 행동이 추가 클릭 뒤에 숨는다. 사용자 결정으로 채택하지 않는다.

## 결과

- §19는 플랫폼 책임이므로 공통 components 층에 둔다. Consumer는 이름만 제공하며 URL·조회·데이터 계약은 유지한다.
- 페이지별 저장소와 `useSyncExternalStore`로 안정된 snapshot을 제공한다. 응답·재시도·이름·갱신 상태가 바뀔 때 layout effect로 갱신하고 cleanup에서 등록을 해제한다. 그룹 판정은 응답 객체 identity가 아니라 동일 grouping key의 peer 존재를 읽는 boolean snapshot으로 하며, 두 번째 일치 응답부터 첫 commit에 간결 상태를 사용한다. scope 밖에서는 기존 전체 상태를 유지한다.
- 그룹 재시도는 해당 그룹의 모든 조회를 실행한다. 하나만 실패하면 배너 없이 기존 전체 상태를 유지한다.
- 이 결정 기록은 브라우저·E2E·프로토타입 캡처 비교가 통과했다는 뜻이 아니다.

- scope는 처음부터 빈 assertive/polite 알림 채널을 유지하고 동일 그룹의 요약·갱신 문구만 갱신한다. 보이는 배너는 non-live group이다. 그룹 재시도 중에는 버튼의 폭·포커스를 유지하고 중복 활성화를 막는다. 배너 제거 시 그 안의 포커스만 이름 있는 본문 영역으로 이동한다.
- DetailDrawer는 페이지와 별도의 scope 및 자체 배너를 제공한다. 공개 StateMessage/OutcomeView에는 그룹 제어 props를 두지 않는다.
