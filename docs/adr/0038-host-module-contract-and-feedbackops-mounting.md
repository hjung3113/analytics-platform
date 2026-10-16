# 업무 모듈은 한 원본을 두 호스트에 탑재하고, FeedbackOps 화면은 플랫폼 셸의 협업 공간에 모듈로 올린다

상태: **Proposed (2026-10-17)** — 선행 조사, 구현 안 함. 채택되면 [ADR-0027](0027-feedbackops-stays-standalone-entry-links.md)을 대체하고, [ADR-0026](0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)의 "FeedbackOps는 공간이 아니다"와 [ADR-0028](0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)의 "진입은 새 탭" 부분을 고친다. 그 전까지 ADR-0027이 유효하다.
- 결정자: 사용자 (미정)

플랫폼에는 지금 호스트 경계가 셋 있다: 서버 포트 `PlatformAdapter`([ADR-0019](0019-menu-query-endpoint-declaration.md)), 조립 주입 `#platform-assembly`([ADR-0009](0009-production-assembly-injection.md)), 위치 어댑터 `PlatformLocation`([ADR-0030](0030-location-adapter-base-path.md)). 셋 다 "플랫폼 앱이 자기 메뉴를 조립"하는 경계이고, 다른 저장소의 업무 모듈이 플랫폼 셸 안에서 무엇을 받는지는 정하지 않았다. [#396](https://github.com/hjung3113/analytics-platform/issues/396)은 세 제품이 한 SDK를 소비하고 각 제품이 독립 실행·플랫폼 탑재 둘 다 되는 것을 목표로 Decided했고(2026-10-16), equipment-visualization은 플랫폼 탑재가 기본으로 정정됐다([ADR-0039](0039-equipment-visualization-platform-first-host-contract.md)). FeedbackOps는 MVP에 가까워졌고, 사용자는 플랫폼 안으로 들일지 검토를 요청했다. ADR-0027이 화면 이전(ADR-0018)을 기각한 이유는 "화면이 두 벌이 된다"였다. 설계 전체와 근거는 [플랫폼 탑재 설계](../integration/platform-hosting-design.md)다.

## 결정 (제안)

- **호스트 → 모듈 계약을 `@ap/contracts`에 둔다.** 모듈은 화면 manifest(React 무의존 메타데이터)와 화면 컴포넌트를 내고, 호스트는 화면에 호스트 포트 하나(세션 스냅샷·권한 표시·모듈 상대 내비게이션·page 상태·Context 읽기·조립 설정·언어·알림·오류 보고·구독·해제 신호, 선택 기능으로 플랫폼 서버 조회와 상세 패널 슬롯)를 준다. 모듈 패키지는 `@ap/contracts`만 import하고 Kernel·셸·공통 컴포넌트를 import하지 않는다. 계약에는 정수 버전(`contract`)을 두고 호스트는 모르는 버전과 빠진 필수 기능을 등록 단계에서 거부한다.
- **한 실행 트리의 history·세션·전역 Context·알림·상세 슬롯 소유자는 호스트 하나다.** 모듈은 자기 라우터·로그인 화면·두 번째 셸을 만들지 않는다. 모듈이 가지는 데이터 캐시는 화면 마운트 범위로 두고 호스트 세션 세대가 바뀌면 버린다.
- **FeedbackOps는 "한 원본, 두 호스트"로 간다.** FeedbackOps가 화면 원본을 계속 소유하고, 화면을 호스트 포트만 보는 모듈 패키지로 옮긴다. FeedbackOps 독립 앱은 같은 화면을 자기 라우터·세션으로 조립하는 첫 번째 호스트로 남고, 플랫폼 셸은 그 화면을 협업 공간에 등록하는 두 번째 호스트가 된다. 백엔드·권한 판정·Managed System 규칙은 FeedbackOps 소유 그대로다.
- **탑재는 화면 단위로 순서대로 한다.** 첫 파일럿은 설문 참여·응답(Managed System 범위·상세 패널 없는 사용자용 흐름)이고, 다음이 신고자 VOC 흐름(VOC 등록 → 내 VOC → 신고자 상세)이다 — 이때 플랫폼의 1단계 읽기 화면(내 VOC·설문 응답 이력)이 FeedbackOps 원본 화면으로 바뀐다. 담당자 흐름(triage·Task·Finding)은 그 뒤, 관리·설문 빌더·전체 허브는 독립 앱에만 둔다. 탑재하지 않은 화면은 지금처럼 딥링크로 간다([딥링크 계약](../integration/feedbackops-deeplink.md)).
- **Managed System은 모듈 소유 page key로 남긴다.** 공간 → Managed System 매핑 표(#81)는 조립 계층이 공급하는 설정값이고, 공간 사이드바의 FeedbackOps 블록은 새 탭 대신 셸 안 이동(`managedSystem` 미리 채움 + `returnTo`)이 된다. 매핑은 권한이 아니다 — 무엇을 볼 수 있는지는 FeedbackOps 서버가 판정한다.

## Considered Options

- **(A) ADR-0027 유지 — 독립 앱 + 진입 링크만**: 추가 비용이 가장 적고 원본이 하나다. 대신 사용자가 앱 둘을 오가고(새 탭, #150 전에는 로그인 둘), FeedbackOps 화면에 플랫폼의 전역 Context·복귀·활용률 계측이 적용되지 않으며, 플랫폼은 1단계 읽기 화면(내 VOC·설문 응답 이력)을 따로 그려 원본 화면과 갈라진다. #396의 "제품을 영구 예외로 두지 않는다"와도 맞지 않는다.
- **(B) ADR-0018 A안 — 화면을 플랫폼 메뉴로 다시 작성**: 플랫폼 계약이 모두 적용되지만, ADR-0027이 기각한 이유(화면 두 벌, 4~8주 추정 재작성, 원본과 갈라짐)가 그대로 남는다.
- **(C) 앱 통째로 마운트(중첩 라우터 또는 iframe)**: 가장 빠르다. 중첩 라우터는 셸·history·URL이 둘이 되어 ADR-0018 B안에서 기각됐다. iframe은 격리되지만 내비게이션·포커스·접근성·크기 조정·쿠키가 각각 두 번째 체계가 되고(#396 §11), FeedbackOps CSP가 `frame-ancestors 'none'`으로 막는다.
- **(D, 제안) 한 원본, 두 호스트 — 화면을 모듈 패키지로, 호스트 계약은 `@ap/contracts`**: 화면 원본이 하나이고 두 호스트에서 같은 화면이 돈다. 플랫폼 안에서는 셸·Context·복귀·계측이 적용된다. 대신 FeedbackOps 쪽에 라우터 결합 분리·API 기준 경로 주입·캐시 범위 정리 같은 리팩터가 필요하고, 플랫폼은 호스트 계약과 `@ap/contracts` 배포 경로를 설계해야 한다.

## 결과

- 채택하면 ADR-0027을 Superseded로 바꾸고, 06 §9.1의 FeedbackOps 항목·15 §6·[저장소 구조](../integration/repository-layout.md) "FeedbackOps 통합 방식"·[딥링크 계약](../integration/feedbackops-deeplink.md)을 이 결정에 맞춰 고친다. 협업 공간의 셸 배치는 보이는 모양이 바뀌므로 `?variant=` 시안 컨펌이 먼저다(루트 AGENTS).
- 플랫폼 일: 호스트 계약 타입(`@ap/contracts`), Kernel의 모듈 등록(경로 접두사·열린 권한·그룹 어휘)과 호스트 포트 구성, 모듈 연결 패키지의 경계 lint. 추적은 [#402](https://github.com/hjung3113/analytics-platform/issues/402).
- FeedbackOps 일: 화면 모듈 패키지와 배포 가능한 `@fops/ui`(peer `@ap/ui`는 사용자 결정 2026-10-17), API 기준 경로 주입(지금 같은 origin 루트 상대 경로, CORS 없음), 라우터 의존 분리, 앱 루트가 주던 것(QueryClient·Toaster·문서 제목·상세 슬롯·`/me` 가드)을 모듈 루트나 포트로. 제안 이슈 [FO#1231](https://github.com/hjung3113/FeedbackOps/issues/1231).
- 선행 조건: FeedbackOps MVP 릴리스, 같은 사이트 배포(역방향 프록시 또는 하위 도메인 + CORS — #151)와 세션 방식(#150), `@ap/contracts` 배포 경로. 이 조건 전에는 구현을 시작하지 않는다.
