# 상세 패널은 셸이 소유하는 오른쪽 고정 슬롯에 둔다 (프로토타입 B안)

상태: **Decided (2026-10-04)**.
- 결정자: 사용자 — 실제 앱 위 `?variant=` 프로토타입에서 A(overlay) / B(docked) / C(responsive) 중 B를 선택했다(#195).

세부(슬롯·폭·URL·포커스 계약)는 [06 §7 Baseline·§8·§13](../06_platform_ui_contract.md#13-shared-component-layers), 배치는 [07 앱 셸 와이어프레임](../07_app_shell_wireframe.md), 표면·토큰 역할은 [DESIGN.md](../../DESIGN.md#shell-visual-rules)가 소유한다. 구현 범위는 #205다. 이 ADR은 결정과 이유만 둔다.

[ADR-0011](0011-design-direction-feedbackops-shell.md)은 FeedbackOps 토큰과 AppFrame 구조를 채택했지만 상세 패널 방식은 별도 결정으로 남겼다. 기존 DetailDrawer는 화면 폭에 따라 본문 위에 뜨거나 scrim·inert를 쓰는 overlay였다. FeedbackOps의 상세는 셸 슬롯에 놓여 목록과 나란히 보인다. 통합 때 같은 셸 구조를 쓰면서 목록을 계속 조작할 수 있도록 이 차이를 해결한다.

## 결정

- **셸 소유 오른쪽 고정 상세 슬롯을 채택한다.** 페이지는 내용을 등록하고 셸이 전체 높이 `aside`의 배치를 소유한다. 본문은 슬롯 옆에서 폭을 양보한다.
- **DetailDrawer의 props·URL 계약은 유지한다.** `focus`·`tab`의 소유권, 닫기·Esc, 딥링크·Back/Forward, 전체 화면 이동은 유지하고 렌더 위치만 바꾼다. modal overlay는 제거한다.
- 컨펌된 스펙은 `hjung3113/proto-m2-chart-drawer`의 B안과 `drawer-B-1440.png`·`drawer-B-1280.png`다(`.agents/reports/design/shots/m2-chart-drawer/`; #205 작업에는 `.review/proto/` 사본 제공). 프로토타입 코드 자체는 버린다.

## Considered Options

- **(A) overlay 유지**: 변경 비용이 없다. 대신 FeedbackOps 셸 편입 때 상세 패널 방식이 다르고 좁은 데스크톱에서는 목록 조작을 막는다.
- **(B, 채택) docked 셸 슬롯**: 목록과 상세를 함께 조작하고 FeedbackOps와 같은 배치를 쓴다. 본문 폭이 줄어 표 내부 스크롤과 페이지 재배치를 검증해야 한다.
- **(C) responsive 혼합**: 넓은 화면은 docked, 좁은 화면은 overlay로 바뀐다. 두 모드의 포커스·접근성·레이아웃 정책이 필요하고 화면 폭에 따라 목록 사용성이 달라진다.

## 결과

- 공통 등록 경계는 `@ap/ui`가 소유한다. 도메인·URL을 모르는 DOM 슬롯 primitive로 두어 components → shell 역방향 의존 없이 두 층에서 소비한다. portal은 페이지의 React Context를 유지한다.
- 셸은 한 슬롯을 제공하며 중복 등록은 마지막 등록 우선과 개발 경고로 처리한다. 상세가 없으면 본문이 슬롯 폭을 되찾는다.
- 비모달 상세는 포커스를 가두지 않는다. 목록과 상세 사이 이동을 허용하고, 열기·닫기의 포커스 이동은 공통 컴포넌트가 맡는다.
- #156 Management `drawer` 슬롯은 이 고정 슬롯을 소비한다. 06·07·DESIGN과 폴더 지침을 함께 갱신한다. 이 결정 기록은 E2E·프로토타입 캡처 비교가 통과했다는 뜻이 아니다.
