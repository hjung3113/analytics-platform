# TopN은 ChartSpec, Lane 시간선은 독립 Canvas 2D 부품으로 제공한다

상태: **Decided (2026-10-21, 코디네이터 위임 — #576)**. 사용자 요청에 따라 프로토타입 라운드 없이 명세를 구현하고, 디자인·UX 리뷰 뒤 코디네이터가 조정을 결정한다. 되돌릴 수 있다.

## 결정

- 두 부품의 모델·렌더러는 `@ap/components`가 소유한다. `@ap/ui`는 기존 색·간격·타이포 토큰과 primitive만 제공한다. 색은 `ThemeColorToken`으로 받고 런타임에서도 검증한다. raw 옵션·색 문자열 우회는 제공하지 않는다.
- TopN은 `AnalysisChart`의 `kind: 'topNBar'`다. 소비자가 카테고리별로 집계한 **전체** 항목을 주고 SDK가 복사·안정 정렬·제한한다. 조회·집계·도메인 등급은 소비자 책임이다. 기존 표·CSV·manifest Export·Trust·명시적 상세 버튼을 재사용한다. Pareto의 기타·누적률을 추가하지 않는다.
- Lane은 `LaneTimeline`과 `LaneTimelineHandle`이다. [ADR-0058](0058-analysis-chart-spec-union.md)의 시간축 분리를 유지한다. [ADR-0021](0021-echarts-canvas-renderer.md)의 ECharts Canvas와 다른 **직접 Canvas 2D 예외**를 가시 lane 렌더링에 한정한다. 독립 스크롤과 dirty-frame/viewport 제어를 직접 소유해야 React 렌더 없이 수십만 구간을 다룰 수 있기 때문이다. 감사 이력 목록인 `AuditTimeline`은 변경하지 않는다.
- TopN 무효 항목(음수·NaN·Infinity·중복 ID·잘못된 색)은 제외하고 개발 환경에서 진단한다. 첫 **유효** ID가 이긴다. 잘못된 N(정수가 아니거나 1 미만)은 기본 8로 복구한다. 프로덕션도 같은 fallback이며 로그만 생략한다. 0은 데이터다. 범례는 실제 TopN에 있는 유효 토큰만 소비자 순서로 남기고 토큰당 첫 라벨을 쓴다.
- TopN 기본 접힘은 false인 expanded로 표현한다. controlled 값이 있으면 요청 콜백만 실행하고, controlled→uncontrolled는 마지막 수락 값을 이어받는다. `hideWhenEmpty`만 전체 프레임을 숨긴다. 명시 `AnalysisChart.height`가 우선하고 없으면 `max(120, 표시 수 × 28 + 24)`를 쓴다. 긴 축 라벨은 112px에서 줄이고 전문은 툴팁·표에 남긴다. 막대 두께는 최대 24px로 제한한다(#576 UX D1).
- Lane의 시간은 §6의 시간대 없는 설비 wall-clock을 UTC getter 기반 epoch ms로 인코딩하며, 표시는 시간대 없이 한다. JS Date 표현 범위 밖·비유한 수·역전 구간과 전역 중복 구간 ID는 제외한다(첫 유효 ID 유지). 중복 lane ID는 첫 행을 유지한다. 입력 순서를 임의로 정렬하지 않는다. 0폭 구간·동시 구간·겹침은 유효하다. 잘못된 depth는 0, 큰 depth는 행 안 최소 2px 높이를 유지하는 inset으로 그린다. depth는 계층 추론이 아니다.
- palette의 잘못된 토큰을 제외하고 빈 결과면 기본 네 series 토큰을 사용한다. neutral은 `chart-no-data` fallback, 구간 명시 색이 최우선이다. rank의 유효한 비음수 유한 두께만 쓴다. strong은 원래 두께/불투명, weak는 절반 두께/alpha 0.5/점선, off는 rank 테두리를 숨긴다. 선택 outline과 의미적 orphan/open 표식은 이 모드와 독립이다.
- density 입력은 복사·유한 값 필터·오름차순 정렬을 데이터 변경 때만 수행한다. viewport bin마다 이진 검색하고 마지막 bin은 오른쪽 끝을 포함한다. 매 프레임 전체 instants를 순회하지 않는다. ticks는 범위에 따라 UTC getter 기준 분(1/2/5/10/15/30)·시(1/2/3/6/12)·일(1/2/5/10) 달력 간격을 고른다(#576 UX D3). 기본 축 라벨은 시간대 없이 시:분만 적고 날짜는 첫 눈금과 wall-clock 날짜 경계(00:00)에 한 번 붙인다. `formatTick` 소비자 formatter가 우선하며, 겹친 라벨은 생략하고 양끝을 clamp한다. 툴팁·키보드 요약은 시간대 없는 전문 타임스탬프를 유지한다.
- 112px gutter + 최소 plot 240px, 합계 352px보다 좁으면 내부 가로 스크롤한다. 24px 행, depth당 위아래 2px inset, 1.5px 최소 구간 폭이다. 축은 세로 스크롤 밖에 고정한다. backing canvas는 가시 높이만 할당하고 hit-test도 가시 행만 사용한다. 깊은 구간, 같은 깊이는 나중 입력을 나중에 그려 hit-test 우선순위와 일치시킨다.
- Ctrl/⌘+wheel은 포인터 기준 확대, modifier 없는 wheel은 네이티브 세로 스크롤이다. 키보드 +/−·버튼 확대는 가운데 기준이다. plot drag는 시간 이동이며 pointer cancel/lost capture는 선택을 실행하지 않는다. 확대 범위는 데이터 domain 안에서 최소 1ms(전체 domain이 작으면 그 폭)부터 전체 domain까지다. reset은 시간 viewport만 초기화한다. reveal은 유효 데이터 flatten 순서(lanes→segments)로 행을 드러내고 시간 중앙으로 이동한다. 유효하지 않은 index/ID는 no-op이다.
- viewport·scroll·drag는 refs/렌더러 클로저와 rAF에만 둔다. 연속 wheel/pan은 React render를 추가하지 않는다. 선택·키보드 요약·DOM 툴팁만 React state를 사용한다. 데이터 변경은 domain 초기화, 그 밖의 props/선택 변경은 viewport를 보존한다. 선택은 controlled/uncontrolled이며 없는 ID는 표시하지 않는다. URL·Global Context를 변경하지 않는다. Lane은 조회·내보내기·상세 이동을 소유하지 않는다.

세부 공통 계약과 Interaction 매트릭스는 [06 §16](../06_platform_ui_contract.md#16-analysis-chart-contract), 공개 API와 사용 예는 [SDK 차트](../integration/sdk-charts.md)가 소유한다.

## Considered Options

- **소비자가 잘라 정렬한 TopN만 제공:** SDK가 N 변경을 로컬에서 재계산할 수 없다. 전체 집계 입력을 채택한다.
- **Pareto 옵션으로 TopN 제공:** 기타·누적률과 단순 순위의 의미가 섞인다. 별도 판별자를 채택한다.
- **Lane을 ECharts custom series 또는 거대한 canvas로 제공:** 독립적인 가시 행 clipping·메모리 상한·React render 없는 확대 계약을 엔진 옵션과 결합한다. 고밀도 구간 전용 직접 렌더러를 채택한다.
- **모든 구간을 DOM 행/버튼으로 렌더:** 대량 입력의 메모리가 전체 segment 수에 비례한다. 가시 canvas + lane 라벨 + 한 항목씩 방향키 탐색/Enter/Escape와 텍스트 요약을 채택한다.

## 결과

공개 API가 추가된다. 기존 ChartSpec 판별 switch를 작성한 소비자는 `topNBar` 분기를 추가한다. Lane은 선택·viewport의 별도 부품이며 기존 시간축 Frame을 대체하지 않는다. SDK 공개 스냅샷과 외부 tarball 소비자 검증은 릴리스 게이트다.

Lane의 epoch ms는 시간대 없는 설비 wall-clock을 인코딩하며 표시는 시간대 없이 한다(06 §6).
