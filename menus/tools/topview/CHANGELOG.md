# @ap/menu-topview 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.1.6 — 2026-11-19

- (#2542) Focus 메뉴를 «동기 재생»으로 표시하고, Top View 패널 아래에 벽시계 재생 커서와 단축키 힌트를 둔다. 표시 중인 Layout을 권한이 있을 때 Studio에서 연다.

## 0.1.5 — 2026-11-19

- (#2542) Top View와 Focus는 적용 구간에 알려진 Occurrence가 없으면 watermark를 함께 보여 주고 위치 상태를 숨긴다.

## 0.1.4 — 2026-11-19

- (#2542) Top View의 순간을 Focus에 이어 주고, 커서를 주소에 보존하며, 키보드·Gantt로 이동할 수 있게 한다. 호스트의 초 단위 커서도 읽고 설비·시간·진입 변경 시 주소의 커서와 구간을 지우며, 컨트롤에 포커스가 있을 때 Space 단축키를 넘긴다.

## 0.1.3 — 2026-11-18

- (#2503) Focus 재생은 화면 자체 기간과 커서를 사용하므로 live 조회를 명시.

## 0.1.2 — 2026-11-15

- 재생 응답 구간과 적용된 조회 구간 대조 (#2056).

## 0.1.1 — 2026-11-14

- 화면 문구를 긍정형 개조식으로 정리하고 줄표·가능 표현을 줄임 (#1996).

## 0.1.0 — 2026-11-11

- 뷰어(Top View·Focus)를 호스트 모듈 마운트에서 일반 메뉴 패키지로 옮겼다(#1659). 그룹 `topview`(도구 공간), 메뉴 `eqv:topview`(주 화면, `/tools/eqv-topview`, 별칭 `/tools/topview`)·`eqv:focus`(`/tools/eqv-focus`, 별칭 `/tools/topview/focus`), 권한 `eqv:view`. id·경로·페이지 키·요청 파라미터는 그대로다.
- 화면은 `ModuleHost` 대신 Kernel 훅(`usePlatform`, `useMenuFetch`, `useMenuQuery`)을 쓴다. 상세 슬롯과 `host.status`가 없어져 구성요소 상세는 항상 인라인 패널, 접근 거부는 화면 안의 상태로 보인다.
- Data Trust(EV#187): 읽기 응답의 `trust`·`assessments`를 `DataTrustIndicator` 한 줄로 보인다(이전의 평가 알림 목록 대체). 연결 검증 알림은 그대로 둔다.
- `StateMessage`·`LoadingBlock`은 `@ap/components`를 쓴다. `Panel`·`ViewerZoomControls`·`--eqv-*` 테마는 `@eqv/ui`에 남는다(SDK 대응물 없음).
