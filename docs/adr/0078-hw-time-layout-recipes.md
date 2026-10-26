# ADR-0078 — HW Time 레이아웃 레시피 4종: 한 데이터, 네 가지 레이아웃 선언

- Status: Decided (2026-10-24)
- Decider: 사용자(2026-10-24) — #690 0단계 시안 캡처를 비교한 뒤 "메뉴 4개, 레이아웃만 다르게"를 골랐다.
- Scope: [#690](https://github.com/hjung3113/analytics-platform/issues/690) 1단계(관련 [#586](https://github.com/hjung3113/analytics-platform/issues/586)·[#580](https://github.com/hjung3113/analytics-platform/issues/580)). 관련: [ADR-0025](0025-drilldown-level-page-keys-path-bar-layout.md)(드릴 레이아웃), [ADR-0067](0067-dockview-layout-engine-board-v2.md)(작업 영역), [ADR-0077](0077-workspace-stack-mode-rows-keep-own-height.md)(쌓기 모드). **06 §12.7을 아래 범위에서 고친다.**

## 맥락

HW Time은 "기존 레거시 기능을 플랫폼과 SDK 위에서 다시 만든" 사례의 견본이다. #690 0단계 시안은 네 가지 레이아웃을 같은 데이터로 비교했고, 실제 앱 캡처는 #690의 2026-10-24 코멘트에 링크된 아티팩트에 있다. 드릴(설비 → Module → Motion)을 어떤 레이아웃으로 보일지는 메뉴마다 다르게 선언할 수 있어야 SDK가 범용 조각이 된다.

## 결정

새 그룹 `동작시간분석`(MARS 공간) 아래 메뉴 4개를 한 데이터 층 위에 두고, 레이아웃 선언만 다르게 한다.

- **`HW Time 단계별`:** `DrillLayout` + `summary` 슬롯 + `AnalysisLayout`(상세가 hero, 접히는 추이 섹션) + Inspector `stack`. 오늘의 §12.7 드릴 그대로다.
- **`HW Time 비교`:** 단계별 `PanelWorkspace` 프리셋. 3단계에서 맥락 | 상세를 나란히 놓고 행 포커스를 공유하며 Inspector `rail`을 쓴다.
- **`HW Time 개요`:** `PanelWorkspace initialMode="stack"`, 패널 배지가 붙은 개요.
- **`HW Time 표`:** `PlatformDataTable` + `DetailDrawer`.

06 §12.7에는 "현재 단계 본문의 일부로 메뉴가 선언한 부모 맥락 패널은 허용한다"는 문단과 `summary` 슬롯 문장을 더한다. SDK는 앞 단계 본문을 자동으로 남기지 않는다.

## Considered Options

- **기본 레시피 하나만(시안 아티팩트의 추천 A):** 메뉴를 하나로 줄이는 안. HW Time은 기존 기능을 이 플랫폼과 SDK로 옮길 수 있음을 보이는 견본이라 여러 배치를 다양하게 보여 주어야 한다는 이유로 사용자가 채택하지 않았다.
- **단계만 드릴(§12.7 그대로):** 부모 맥락을 옆에 둘 수 없어 Motion을 Module 전체와 비교하기 어렵다.
- **오버레이 드릴:** 앞 단계를 덮어 띄우는 안. 경로·포커스 계약(§26)과 충돌하고 선택하지 않았다.

## 결과

SDK 조각:

- S1 `AnalysisChartFrame` 가로 행 포커스(제어형 `activeCategory`, `rowPitch`).
- S2 `PanelWorkspace` `initialMode`·패널 reveal 요청(2a)과 패널 `badge`(2b).
- S3 `Inspector`의 `stack | rail` 형태.
- S4 `DrillPath`/`DrillLayout` `summary` 슬롯 — 이 ADR과 같은 변경.

만들지 않는 것: 동기화 그룹 Context, 선언형 레시피 층(메뉴 도우미로 남김), 단계 인식 저장(단계별 `persistKey`로 대신), 엔진 행 접기(S2c), `@ap/ui` Accordion, 깊이 3 초과, #575 P2 항목(전환기·실행 취소·보호 패널).

#580 노드 580g: 세 차트 메뉴가 `AnalysisChartFrame`의 값·합계 라벨(`valueLabels="both"`, `reaggregation="sum"`)과 범례 트리 드릴(`onDrill`·`currentId`, ADR-0084)을 채택했다. 트리는 단계마다 평평하다(L1 응답에 Motion 목록이 없다).

## 보충(2026-10-26, #912)

비교 메뉴는 드릴해도 위 단계 패널을 남긴다(B 주-상세, 사용자가 독립 리뷰로 결정). 요약(Module별)이 왼쪽 전체 높이, 오른쪽 위가 Module 구성, 오른쪽 아래가 Motion 상세이며 추세는 상세 옆 탭이다. 패널마다 자기 조회만 가진다: 요약 `{}`, 구성 `{drillModule}`(Module이 있을 때만), 상세 `{drillModule, drillMotion}`(둘 다 있을 때만). 아래 단계가 비면 패널을 없애지 않고 기다림 문구를 보인다. `persistKey`는 단계와 무관한 하나(`hw-compare`)이고 이전 `hw-compare-l1|l2|l3` 저장값은 읽지 않는다. 06 §12.7 문장은 SDK가 본문을 통째로 바꾼다는 서술에서 "`DrillLayout`은 단계마다 본문을 다시 마운트하지 않고 본문은 메뉴가 정한다"로 고쳤다(SDK 동작은 그대로, `DrillLayout.test.tsx`가 고정). 단계별·개요·표는 바뀌지 않는다.
