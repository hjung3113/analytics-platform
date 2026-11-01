# @ap/menu-analytics 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.3.3 — 2026-11-01

- 페이지 4종(생산성 개요·사이클타임 드릴다운·실행 상세·차트 카탈로그)에서 `density="compact"` 선언을 걷는다 — SDK 기본 밀도가 compact로 바뀌었다(#1217, 06 §12).

## 0.3.2 — 2026-11-01

- 차트 카탈로그: 종류 탭의 `지원 N/8` 표기를 걷고(트리거 `aria-label`의 지원 수는 유지), 넘치는 탭은 `TabsList overflow="menu"`의 `더보기` 메뉴로 옮긴다(#1190).

## 0.3.1 — 2026-10-31

- 분석 페이지(차트 카탈로그·사이클타임·실행 상세)와 생산성 개요는 `density="compact"`를 선언한다(#1166, 06 §12.2).
- 실행 상세: 패널 사이 간격을 12px로 통일(이중 상단 여백 제거, QueryView 안 패널에 간격 추가)하고 구간 표를 일반 표와 같게 맞췄다(셀 좌우 16px, 머리글 한 줄 말줄임 + `title`)(#1166).

## 0.3.0 — 2026-10-27

- occurrence anchor는 파서 RecordSequence(불투명 숫자 문자열)이고 시작 시각은 별도 필드 `startedAt`이다. 실행 표의 시작 열 정렬은 `sort=startedAt:*`(옛 `sort=anchor:*`는 거절), ExecutionDetail은 시작 시각을 별도 칸으로 보인다(#1007, ADR-0094).

## 0.2.0 — 2026-10-27

- CycleTimeDrilldown이 Saved View를 지원한다(`features.savedView`, 조건 6종과 page 키 6종 선언, #1011).

## 0.1.0 — 2026-10-27

- 초기 기록: ProductivityOverview, CycleTimeDrilldown, ExecutionDetail, ChartCatalog와 Wafer Journey 계획.
