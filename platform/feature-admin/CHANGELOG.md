# @ap/menu-feature-admin 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.2.0 — 2026-11-03

- 그룹 `featureAdmin` → `flowSettings`(업무 흐름 space), 경로 `/flow/*`, 메뉴 이름 시스템·분석 영역·흐름 정책. 권한 요청 검토·부여 목록은 `@ap/menu-access`로 옮김(ADR-0110, #1287).

## 0.1.1 — 2026-10-31

- 상세 Drawer 슬롯에서 본문 제목 중복 제거(#1168).

## 0.1.0 — 2026-10-28

- 초기 기록: FoManagedSystems(Managed System), FoAnalyticsAreas(Analytics Area), FoPermissionRequests(권한 요청 검토), FoPermissionGrants(부여 목록), FoSettings(FeedbackOps 설정).
