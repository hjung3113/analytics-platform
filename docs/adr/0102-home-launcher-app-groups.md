# ADR-0102: 홈 그룹 타일과 앱 소유 표시 설정

- 상태: **Decided** (2026-10-30)
- 결정자: 사용자 — 실제 앱 시안 A 선택 (#1109)
- 범위: 홈 Consumer 표시와 앱 조립. SDK·권한·URL 계약 변경 없음.

## 맥락

플랫폼 홈은 접근 가능한 업무 시스템으로 복귀하는 진입점이다. 시스템 수가 늘어나도 분류와 조립은 앱이 소유하고 홈은 시스템 도메인을 알지 않아야 한다. 사용자는 실제 앱의 A 그룹 타일을 선택했다.

## 결정

1. 앱 `apps/platform-web/src/menus.ts`가 `HOME_LAUNCHER_GROUPS`를 선언한다. 분석(Analysis): MARS·BRAVO·CLAS, 업무 운영(Work operations): 표준 로그 개발·개선 실행, 도구(Tools): 도구, 플랫폼 관리(Platform administration): 운영 콘솔 순서다. 그룹 안에서는 `accessibleSpaces` 순서를 유지한다.
2. 홈은 작은 가로 아이콘·이름·설명·이어서 텍스트를 담은 카드 링크를 그린다. 그룹 라벨은 접기 제어가 아닌 비대화형 제목이다. 표시 토큰과 홈 구성은 [소유 문서 §3.1](../design/multi-workspace-ui.md#31-셸-배치-decided-2026-10-09)을 따른다. 빈 그룹은 생략하고 미분류 접근 가능 시스템은 기타(Other)에 한 번만 표시한다.
3. 비공개 Consumer 조립 진입점 `@ap/menu-home/launcher`의 `createHomeComponent(groups)`는 설정을 closure에 캡처한 안정적인 lazy component를 만든다. 앱 모듈 범위에서 한 번 만들고 Registry 조립에서 홈 component만 바꾼다. 루트는 `manifests`만 export하며 생성기 마커는 유지한다. 설정의 시스템 ID 중복은 factory 생성 때 거절한다.
4. 설정 없는 기본 manifest는 기존 라벨 없는 격자를 유지한다. 접근·진입/이어서 URL·Context는 기존 Kernel 판정 그대로다. 운영 콘솔 설명은 현재 사용자가 열 수 있는 섹션만 담으며 하단의 내 할 일·즐겨찾기·최근 방문·공지를 유지한다.

## 대안과 결과

시스템 분류를 `SpaceDef`나 SDK 슬롯으로 올리는 대신 홈 전용 표시 설정으로 둔다. 다른 표면이 이 분류를 요구하지 않는 상태에서 공개 플랫폼 계약을 늘릴 이유가 없다. 앱이 설정을 바꾸거나 기본 manifest로 돌아갈 수 있어 되돌릴 수 있다. import 예외는 앱 `src/menus.ts`의 정확한 서브패스 하나에만 적용하며 다른 앱 파일·메뉴 소비자·중첩 서브패스에는 적용하지 않는다.

다른 표시 표면(예: 셸 시스템 전환기)이 같은 분류를 필요로 하면 배치와 공통 소유권을 다시 검토한다. 공개 계약 변경은 사용자 승인을 받으며 자동 SDK 승격을 약속하지 않는다. 범용 조각의 소유 기준은 루트 규칙과 [ADR-0052](0052-rich-content-stays-in-the-sdk.md)를 따른다.

소유 문서: [다중 워크스페이스 UI](../design/multi-workspace-ui.md), [패키지 경계](../integration/platform-packages.md).
