# @ap/menu-metrics 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.2.0 — 2026-11-05

- 지표 카탈로그의 검색·필터가 표 필터 모델 하나로 동작한다(#1218, [ADR-0112](../../../docs/adr/0112-catalog-joins-table-filter-model-analysis-bar-keeps-apply-once.md)). 이름·ID 빠른 검색은 표 툴바로, 상태·도메인은 표 컬럼 필터(칩·편집기)로 옮겼고 URL 키 `status`·`domain`은 숨은 반복 `filter` 키로 바뀌었다(호환 약속 없음). 지표 개수 조회는 조건을 넣지 않는다.

## 0.1.1 — 2026-11-01

- 카탈로그 표가 지표 쌍 배너와 같은 서버 오류·0건이면 배너 하나로 묶인다(#1175, SDK 변경, 메뉴 코드 변경 없음).

## 0.1.0 — 2026-10-27

- 초기 기록: MetricCatalog, MetricDetail.
