# @ap/menu-analytics 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.3.1 — 2026-10-31

- 분석 페이지(차트 카탈로그·사이클타임·실행 상세)와 생산성 개요는 `density="compact"`를 선언한다(#1166, 06 §12.2).

## 0.3.0 — 2026-10-27

- occurrence anchor는 파서 RecordSequence(불투명 숫자 문자열)이고 시작 시각은 별도 필드 `startedAt`이다. 실행 표의 시작 열 정렬은 `sort=startedAt:*`(옛 `sort=anchor:*`는 거절), ExecutionDetail은 시작 시각을 별도 칸으로 보인다(#1007, ADR-0094).

## 0.2.0 — 2026-10-27

- CycleTimeDrilldown이 Saved View를 지원한다(`features.savedView`, 조건 6종과 page 키 6종 선언, #1011).

## 0.1.0 — 2026-10-27

- 초기 기록: ProductivityOverview, CycleTimeDrilldown, ExecutionDetail, ChartCatalog와 Wafer Journey 계획.
