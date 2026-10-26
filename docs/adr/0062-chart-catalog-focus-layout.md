# ADR-0062 — 차트 카탈로그 집중형 레이아웃

- Status: Decided (2026-10-21)
- Decider: conductor on owner delegation “아스트라 리뷰받고 결정”
- Scope: #530, 차트 카탈로그 견본 메뉴

## 맥락

첫 `AnalysisChart` 메뉴 소비자는 [06 §16](../contract/platform-ui-contract.md#16-analysis-chart-contract)의 종류별 상호작용을 실제 데이터 조회·Scope·Context와 함께 검증한다. 작은 차트를 일곱 개 동시에 압축하기보다 선택한 한 차트의 축·단위·선택 요약·Trust를 읽을 공간이 필요하다. 공개 사례와 초기 A/B/C 대안은 [표현 패턴 조사](../research/2026-10-21-chart-catalog-page-patterns.md)에 있다.

## 결정

D의 상단 종류 Tabs + 큰 단일 차트 + 기본 접힘 지원 레일 + 집중 모드에 E의 오른쪽 레일 너비 조절만 결합한다. 페이지 머리와 Context를 유지하고 남은 높이를 채우며, 차트와 지원 정보는 각각 내부 스크롤한다. 실제 본문 폭이 차트 480px·지원 240px·간격/분리자를 수용하지 못하면 지원 영역을 아래로 놓는다. 자동 clamp와 선호 폭을 분리한다. 선호 폭·열림 상태는 페이지에 머무는 동안만 유지한다(메뉴 코드는 웹 저장소를 쓰지 않는다 — lint `no-restricted-globals`).

종류는 `kind` 링크로 복원하고, 레일 폭·접힘과 집중은 조회 식별자에 넣지 않는다. 레일·집중 변경은 차트 인스턴스와 선택·Zoom·범례·표를 유지한다. 종류 변경은 새 차트 정체성이며 선택·상세 결과를 넘기지 않는다. Context/Scope 변경의 선택 초기화는 기존 차트 계약을 따른다. 미지원 동작은 차트에서 숨기고 지원 패널에 보이는 이유를 둔다.

## Considered Options

- **A — 행렬 표 + 상세 Drawer:** 종류×동작 비교는 좋지만 차트 폭이 제한된다.
- **B — 목록 + 단일 작업대:** 차트 판독성은 좋지만 종류 간 지원 비교가 약하다.
- **C — 카드 그리드 + 실행 기록:** 한눈 탐색은 쉽지만 동시에 일곱 차트가 작아진다.
- **D — 집중형 (채택):** 상단 선택·단일 큰 차트·기본 접힘 레일로 차트를 우선한다.
- **E — 3분할 조절형 (오른쪽 resize만 채택):** 양쪽 상시 패널은 공간을 줄이므로 왼쪽 종류 레일은 제외한다.
- **F — 고밀도 그리드:** 좁은 크기에서 축·툴바·요약·Trust 판독성이 떨어져 제외한다.

## 결과

패널·측정 코드는 현재 한 소비자이므로 메뉴 내부에 둔다([06 §24](../contract/platform-ui-contract.md#premature-platformization)). #575 Composable Analysis Workspace의 공통 Panel 계약이 정해지면 그 계약으로 이관한다. 이번 결정은 범용 Panel API·자유 배치·Saved View를 구현하지 않는다. line/bar Drill은 #541 계약 전까지 구현하지 않으며 [백로그](../../.planning/backlog.md)에 재개 조건을 남긴다.
