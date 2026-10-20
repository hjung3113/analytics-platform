# 종류별 차트는 AnalysisChart의 ChartSpec 판별 union으로 받는다

상태: **Decided (2026-10-20, 결정자: 코디네이터 — 사용자 위임 "visual design is the conductor's call")**. 구현은 #545·#546이며 되돌릴 수 있다.

차트 종류마다 데이터와 상호작용의 의미가 다르다. 히트맵은 두 범주축의 셀, 도넛은 분모가 있는 구성비를 받는다. 하나의 느슨한 props 묶음은 의미 없는 조합을 허용하고, 종류별 컴포넌트만 공개하면 공통 프레임 계약이 분산된다.

## 결정

- `AnalysisChart`는 `spec: ChartSpec`을 받는다. 현재 판별자는 `heatmap | donut | scatter | boxPlot | pareto`다. 공통 props는 `chartId`, `title`, `description?`, `metricVersion?`, `unit`, `trust?`, `height?`, `emptyText?`다.
- 기존 `AnalysisChartFrame`의 line/bar API와 렌더 DOM은 유지한다. 제목·설명·지표 버전, Trust footer와 분석 레이아웃 head/body 구획만 비공개 모듈로 공유한다. 시간축 상호작용을 union에 합치는 일은 **구현하지 않는다**. 다시 여는 조건은 세 번째 시간축 종류 또는 두 API를 함께 써야 하는 소비자의 등장이다.
- 선택은 Chart Local State다. Context가 바뀌거나 Reset하면 지우며 데이터에서 사라진 선택 키도 버린다. 캔버스 클릭은 선택만 하고, 사각 끌기는 히트맵 셀과 scatter 점의 다중 선택을 한다. 표의 기본 체크박스가 같은 선택의 키보드 경로다. 도넛과 boxPlot은 한 번에 한 항목·그룹을 고르고 두 번째 클릭으로 해제한다. Pareto는 막대 항목을 다중 선택하며 누적선·기준선은 선택하지 않는다.
- 드릴 콜백은 선택과 분리한다. 정확히 한 항목을 선택한 요약과 표 행의 `상세` 버튼만 콜백을 부른다. `기타`·`미분류`는 소비자 ID가 없는 합성 항목이므로 선택·표·내보내기는 가능하되 드릴 동작을 만들지 않는다.
- 히트맵은 이미 등록된 scatter의 사각 심볼로 그린다. null은 미확인 셀, 누락된 좌표는 빈 자리, 0은 측정값이다. null은 no-data 채움과 대시 테두리로 표시하며 범례도 같은 표식을 쓴다. 선택은 ramp를 희석하지 않고 outline을 더한다.
- 연속 범례는 다섯 ramp 토큰을 잇는 HTML gradient다. 발산 스케일은 pivot 양쪽 중 긴 거리에 맞춰 대칭으로 확장하며 pivot은 가운데 토큰이다. `lowerIsBetter` 기본값 true, false면 ramp 순서를 뒤집는다. threshold는 실제 승인된 판정에만 쓰고, 첫 break 미만/첫 break 이상 둘째 미만/둘째 이상을 good/warn/critical로 나눈다. 판정명은 글자로도 보인다.
- 도넛의 `maxSlices`는 2–5로 제한한다(기본 5, `기타` 포함). 넘치면 값이 큰 항목부터 남기고 나머지를 `기타`로 묶는다. 동률은 입력 순서다. 명시 색을 유지하고 미지정 항목은 입력 순서로 네 series 토큰을 순환한다. 알려진 분모가 합보다 크면 `미분류`를 별도로 보이며 개수 제한에 포함하거나 `기타`에 합치지 않는다.
- 잘못된 셀·음수 slice·합보다 작은 분모·잘못된 threshold 경계는 개발 환경에서 `console.error`로 알리고 각각 무시·제외·합 사용·sequential fallback을 적용한다. 프로덕션에서도 fallback은 같다.
- Export는 현재 메뉴 manifest `features.export`가 켠 경우만 제공한다. 표와 CSV는 같은 데이터 투영을 쓴다. Compare·Annotate·히트맵 Zoom은 제공하지 않는다.
- **06 §24 반복 기준 예외:** 메뉴 소비자 2–3곳을 기다리지 않고 사용자 #529 SDK 차트 요청으로 먼저 공개한다. 현재 메뉴 소비자는 없고 첫 카탈로그 소비자는 #530의 범위다. 이 예외는 다른 신규 공통 컴포넌트의 승격 기준을 바꾸지 않는다.

## Considered Options

- **종류마다 컴포넌트 하나:** 데이터 타입은 단순하지만 제목·Trust·표·Export·접근성 계약을 각각 유지해야 한다.
- **AnalysisChartFrame props 확장:** 기존 시간축 Zoom/Compare/Annotate props와 히트맵·도넛 입력의 무효 조합이 늘고 기존 소비자 변경 위험이 크다.
- **ChartSpec 판별 union(채택):** 종류와 데이터의 유효 조합을 타입으로 고정하고 공통 프레임은 한곳에서 유지한다. 시간축은 필요가 확인될 때까지 기존 API를 유지하는 비용을 받아들인다.

## 결과

`@ap/components`가 `AnalysisChart`, `ChartSpec`, `HeatmapSpec`, `HeatmapCell`, `DonutSpec`, `DonutSlice`, `AnalysisChartProps`, `ScatterPoint`, `ScatterSpec`, `BoxStats`, `BoxPlotSpec`, `ParetoSpec`를 추가로 공개한다. #546에서 scatter·boxPlot·pareto를 추가하며 표·CSV·명시적 상세·로컬 선택 계약을 함께 적용한다. 상호작용의 소유 계약은 [06 §16](../06_platform_ui_contract.md#16-analysis-chart-contract)이며 크기·레이아웃 확장은 #547에서 다룬다.
