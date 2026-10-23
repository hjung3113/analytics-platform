# ADR-0075 — 페이지 머리 한 줄 접기 + 얇은 응답 띠 (B안)

- Status: Decided (2026-10-23)
- Decider: 사용자(2026-10-23) — "이 부분이 너무 큰데 접게 못하나?" 요청 뒤 실제 앱 시안 A/B/C 중 B를 컨펌했다.
- Scope: [#680](https://github.com/hjung3113/analytics-platform/issues/680). 관련: [ADR-0067](0067-dockview-layout-engine-board-v2.md)(작업 영역·fill 페이지), [ADR-0017](0017-shared-outcome-banner.md)(공유 응답 배너), [ADR-0029](0029-page-filter-bar-collapse-summary.md)(접힘 요약).

## 맥락

`layout="fill"` 페이지(지금은 사이클타임 드릴다운)는 조회 조건·페이지 필터·안내·칩 줄이 작업 영역 위에 쌓여 1440×900에서 작업 영역이 화면 아래로 밀리고, 응답 배너가 뜨면 페이지가 스크롤된다. 세로 공간이 고정인 fill 페이지에서 이 머리 영역이 가장 큰 비용이다.

## 결정

시안(실제 앱 캡처): <https://claude.ai/artifact/5F3qbQMmwZCVGeYwJjkS83>

- fill 페이지의 머리 영역(안내 `contextNotes` + `contextExtension`)을 한 줄로 접는다. 기본은 접힘, 메뉴별로 기억한다. 접힌 줄은 적용된 요약 칩과 미적용·확인 필요·안내 개수 표식, 펼치기 버튼이다. 숨기면 안 되는 상태(적용 칩, 초안 페이지 키 변경, 잘못된 페이지 키)는 줄에 남기거나 펼친 채 시작한다.
- fill 페이지의 공유 응답 배너는 한 줄 얇은 띠(`자세히` Popover + `다시 시도`)로 바꾼다. 같은 컴포넌트의 `compact` 변형이며 규칙은 그대로다.
- 새 공개 API는 `PlatformPageProps.contextNotes`뿐이다. 계약은 06 §8·§12.8·§19.

## Considered Options

- **A** 머리 영역을 더 촘촘하게 줄이기만 한다(접기 없음) — 안내·필터·칩이 모두 남아 줄어드는 높이가 작다.
- **B (채택)** 한 줄 접기 + 얇은 띠 — 작업 영역이 첫 화면에 들어오고 상태는 줄에 남는다.
- **C** 머리 영역을 작업 영역 옆 패널로 옮긴다 — 레이아웃 계약(§12)과 보드 칸 폭에 맞지 않고 변경 범위가 크다.

## 결과

- flow 페이지는 그대로다(세로로 스크롤). 다시 여는 조건은 `.planning/backlog.md`에 있다.
- 사이클타임은 `PageFilterBar collapsible`을 머리 안에 그대로 둔다(접기 두 단계). 이를 없애는 일은 별도 결정이다.
- 작업 영역 모드가 바뀌는 #686에서 접기·띠 조건(fill)을 같이 본다.
