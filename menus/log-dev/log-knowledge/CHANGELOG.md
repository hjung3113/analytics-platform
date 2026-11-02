# @ap/menu-log-knowledge 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.2.0 — 2026-11-02

- 조회·쓰기 선언(`src/endpoints.ts`: 조회 4종은 표 필터 모델, 쓰기 12종), mock 처리기(`./mock`), 카탈로그 관리 메뉴 권한 `knowledge:catalog-manage`(#1194).

## 0.1.0 — 2026-11-02

- 초기 기록: 화면 없이 계획 메뉴 manifest(카탈로그 관리)만 선언. 서버 조회는 `logKnowledge.*`(#1193).

## 0.2.0 — 2026-11-02

- 카탈로그 조회 4종·쓰기 12종 선언(`src/endpoints.ts`, 조회는 표 필터 모델 `filters`), mock 핸들러(`./mock`). manifest 권한을 `knowledge:catalog-manage`로 바꿨다(#1194 r).
