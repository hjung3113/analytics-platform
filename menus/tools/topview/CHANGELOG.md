# @ap/menu-topview 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.1.0 — 2026-11-11

- 뷰어(Top View·Focus)를 호스트 모듈 마운트에서 일반 메뉴 패키지로 옮겼다(#1659). 그룹 `topview`(도구 공간), 메뉴 `eqv:topview`(주 화면, `/tools/eqv-topview`, 별칭 `/tools/topview`)·`eqv:focus`(`/tools/eqv-focus`, 별칭 `/tools/topview/focus`), 권한 `eqv:view`. id·경로·페이지 키·요청 파라미터는 그대로다.
- 화면은 `ModuleHost` 대신 Kernel 훅(`usePlatform`, `useMenuFetch`, `useMenuQuery`)을 쓴다. 상세 슬롯과 `host.status`가 없어져 구성요소 상세는 항상 인라인 패널, 접근 거부는 화면 안의 상태로 보인다.
- Data Trust(EV#187): 읽기 응답의 `trust`·`assessments`를 `DataTrustIndicator` 한 줄로 보인다(이전의 평가 알림 목록 대체). 연결 검증 알림은 그대로 둔다.
- `StateMessage`·`LoadingBlock`은 `@ap/components`를 쓴다. `Panel`·`ViewerZoomControls`·`--eqv-*` 테마는 `@eqv/ui`에 남는다(SDK 대응물 없음).
