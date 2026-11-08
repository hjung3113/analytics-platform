# @ap/menu-access 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.2.0 — 2026-11-07

- 운영 콘솔 권한 그룹의 서비스 토큰(`/operations/service-tokens`): 관리자 목록·발급·폐기, system Actor 선택·무기한 필터(#1443).

## 0.1.0 — 2026-11-03

- 초기 기록: 권한 요청 검토·부여 목록 메뉴를 feature-admin 패키지에서 받음(그룹 `access`, 운영 콘솔 space, 경로 `/operations/*` 유지; ADR-0110, #1287).
