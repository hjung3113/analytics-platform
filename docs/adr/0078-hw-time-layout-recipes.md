# HW Time: 연결 패널로 이루어진 한 분석 화면

상태: **Decided (2026-11-16)**
> **부분 대체 — #2391 / [ADR-0165](0165-workspace-per-step-panels-add-and-pin.md):** 아래의 일곱 기본 패널·Module → Motion 진입·Inspector 옵션은 네 단계(Module 타입 → Motion → Module)의 이전/현재 차트, 왼쪽 계층, 패널 도구 옵션 및 추가·고정으로 대체한다. step 4 기본 아래 줄은 HTM 추세 하나다. 나머지 서버 판정·패널별 조건·원본 표 계약은 유지한다.
- 결정자: 사용자 — #2350 캡처 검토 후 한 화면에서 분석하도록 결정.
- Scope: #2328·#2329, [작업 영역 계약](../contract/layout.md#128-panelworkspace-decided-adr-0067-결정-391822), [ADR-0067](0067-dockview-layout-engine-board-v2.md).

## 맥락

설비·Module·Motion을 분석하면서 View와 분포·추세 탭을 바꾸면 앞서 본 결과와 비교하기 어렵다. 소유자는 한 화면에 필요한 패널을 남기고, 선택한 항목이 연결된 패널의 결과를 바꾸는 방식을 선택했다.

## 결정

메뉴 `hw-time`은 `PanelWorkspace` 하나를 렌더한다. 표시 조건, 설비 × Module 히트맵, Motion 누적 막대, Motion 표, 회차 분포, 일별 평균 추세, 원시 표의 일곱 패널을 각각 독립 그룹에 둔다. 기본 패널은 막대다. 숨기기·다시 열기·재배치·최대화와 배치 저장은 SDK 명령과 `persistKey`를 따른다.

히트맵 셀을 누르면 `row`가 바뀌고 막대가 그 행을 강조하며 스크롤한다. 막대 선택은 `drillModule`로 Motion 표를 채우고, Motion 선택은 `drillMotion`으로 분포와 추세를 채운다. 링크를 복사하면 이 상태를 복원한다. Context 변경은 선언된 `contextResetKeys`로 드릴을 지운다. Module 선택을 해제하면 Motion 선택도 지운다. 드릴 패널이 사용자가 묶은 그룹의 배경 탭이면 SDK `revealRequest`로 앞으로 가져오며 포커스는 옮기지 않는다.

`align=1`은 Inspector 레일의 「옵션」 체크박스로 설정한다. 생략하면 누적이다. 막대가 사용하지 않는 정렬·min/max 옵션을 만들지 않는다. 원시 표는 전체 행의 페이징·내보내기를 유지하며, 연결 드릴에 따라 다시 조회하지 않는다. 표 안의 진입 명령도 연결된 Motion 표를 갱신한다.

분포와 추세는 각각 독립된 「이 패널만」 조건과 로컬 설정을 가진다. 체크 변경은 받은 결과의 표시만 바꾸며 조회하지 않는다. 서버가 준 판정만 표시하고, 차트는 기준 밖 상태만 강조한다. 분포는 SDK `density: 'quiet'`를 사용한다.

`view`와 `navViews`, View 전환용 carry set을 제거한다. 옛 `?view=`와 더 이상 읽지 않는 키는 무시한다. 옛 id `hw-time-steps|compare|overview|table`은 등록하지 않고 앱 조립(`apps/platform-web/src/menus.ts` `RETIRED_MENUS`)에서 `hw-time`의 은퇴 id로 선언한다(#2330, kernel.md §6.4). 옛 주소는 Context와 page state를 보존해 `/mars/hw-time`으로 replace하고, 저장된 보드 칸·즐겨찾기·최근 방문은 `hw-time`으로 읽히며, 옛 id로는 계측·최근 방문을 기록하지 않는다.

## 유지되는 SDK 조각

2026-10-24 결정으로 만든 범용 조각은 그대로 유효하다: S1 `AnalysisChartFrame` 가로 행 포커스(`activeCategory`, `rowPitch`, [ADR-0079](0079-chart-row-focus-row-pitch.md)), S2 `PanelWorkspace` `initialMode`·`revealRequest`·패널 `badge`, S3 `Inspector` `stack | rail`([ADR-0080](0080-inspector-forms.md)), S4 `DrillPath`/`DrillLayout` `summary` 슬롯. 06 §12.7의 «메뉴가 현재 단계 본문의 일부로 선언한 부모 맥락 패널은 허용하고, SDK는 앞 단계 본문을 스스로 남기지 않는다»도 유지한다. 세부 규칙은 layout §12.7·§12.8이 소유한다.

## 대안과 결과

- 네 개 메뉴의 레이아웃 데모 및 메뉴 하나의 네 View: 소유자가 실제 분석 흐름을 우선해 철회했다.
- 분포·추세 전환 탭: 동시에 비교할 수 없으므로 별도 패널로 둔다.
- 메뉴가 자체 배치·포커스·차트 표현을 구현하는 방식: SDK 작업 영역과 차트 옵션을 사용한다.

기존 드릴 경로와 필터 문법을 유지하고, 패널별 조회 소유자를 유지한다. 기본 프리셋은 탭 없이 시작하지만 사용자가 SDK로 패널을 묶는 선택은 허용한다. 네 레이아웃을 보이는 데모 목적은 종료한다.
