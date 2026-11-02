# @ap/menu-log-knowledge 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.3.0 — 2026-11-02

- 카탈로그 관리 화면(#1194 b, A안: 탭 + 오른쪽 서랍): 제조사·공정·모델·SW 버전 탭, 서버 페이징 표와 필터, 만들기·수정·비활성화, 칸 오류·충돌 안내. 모델 행에 `latestSoftwareLabel`.
- 서랍이 행을 `id` 필터 조회 한 번으로 읽고(조회 4종에 `id` 필터), 선택 목록은 서버 검색·더 보기, 기본 탭·필터를 주소에 함께 기록, 패키지 `styles.css` 추가.

## 0.2.0 — 2026-11-02

- 조회·쓰기 선언(`src/endpoints.ts`: 조회 4종은 표 필터 모델, 쓰기 12종), mock 처리기(`./mock`), 카탈로그 관리 메뉴 권한 `knowledge:catalog-manage`(#1194).

## 0.1.0 — 2026-11-02

- 초기 기록: 화면 없이 계획 메뉴 manifest(카탈로그 관리)만 선언. 서버 조회는 `logKnowledge.*`(#1193).

## 0.2.0 — 2026-11-02

- 카탈로그 조회 4종·쓰기 12종 선언(`src/endpoints.ts`, 조회는 표 필터 모델 `filters`), mock 핸들러(`./mock`). manifest 권한을 `knowledge:catalog-manage`로 바꿨다(#1194 r).
