# 동적 계층 탐색은 SDK 범용 조각으로 제공하고 메뉴가 단계를 선언한다

상태: **Decided (2026-11-07, v0.30.0 구현 착수 — 소유자 답 반영, 서비스 토큰 발급 주체는 관리자만).** 결정자: 소유자(2026-11-07). 초안: 설계 레인, 근거 [#1108](https://github.com/hjung3113/analytics-platform/issues/1108) §2–5·§8. 계층의 정적 Registry 경계는 #1108 §2의 채택 권고(안 B)를 그대로 쓴다.

## 배경

업무 시스템 → 그룹 → 메뉴는 정적 Registry가 소유하고, 메뉴 안의 도메인 객체(설비사 → 공정 → 모델 → SW, 지표 분류, 문서 계층)는 임의 깊이의 동적 계층이다. #1108은 둘을 섞지 않는 «정적 메뉴 + 동적 데이터 탐색»을 권고했다. 이미 정리된 것:

- Site 비의존 시스템의 Scope 숨김은 분리되어 구현됐다([ADR-0108](0108-space-scope-presentation-field.md)). 이 ADR의 범위가 아니다.
- 소비자는 log-dev 「모델」 메뉴(`log-models`)의 설비사→공정→모델→SW 계층과 관리자 생성 게시판·카테고리다(소유자 2026-11-07). 지식 허브 모델 탐색 표(A)는 유지하고 동적 탐색은 사이드바에 둔다. 본문 탐색기는 보류다.

## 결정

1. **범용 조각을 SDK(`@ap/components`)가 통째로 제공한다**(소유자 2026-11-07: #1108 포함)([ADR-0052](0052-rich-content-stays-in-the-sdk.md), [ADR-0063](0063-consumer-owned-chart-pieces-and-unbounded-drill.md)와 같은 원칙). 도메인을 모르는 조각이고, 단계 수·노드 종류·라벨·열리는 목적지는 **메뉴가 선언**한다. SDK는 선언을 받아 동작한다.
2. **조각 구성.** Kernel `PlatformMenuEntry.navTree`가 선언하고 `@ap/components`의 `HierarchyNav`가 데이터·탐색 상태를, 셸 두 사이드바가 배치를 소유한다. 순수 데이터 계약은 `@ap/contracts`, 공유 행 문법은 `@ap/ui`다. 기본 `drill`(sb), 메뉴 선택 `tree`(sa). 본문 `HierarchyExplorer`·`HierarchyBreadcrumb`은 만들지 않는다.
3. **데이터 계약.** `HierarchyNode`·`HierarchyPage`·`HierarchySource`(`listChildren`, `resolveAncestors`, 선택 `searchNodes`)를 따른다. SDK는 Fetch·SQL을 소유하지 않는다. 메뉴의 모듈 수준 `Source` 컴포넌트가 자기 선언 엔드포인트를 `useMenuFetch`로 조립하고 render prop으로 source를 준다. 현재 화면 Context에 의존하지 않아 그룹 내 다른 메뉴에서도 동작한다. 노드는 서버가 권한에 맞게 돌려주고 SDK 캐시는 사용자·revision마다 분리한다.
4. **ID와 URL.** 노드는 안정 ID로 식별하고 열리는 대상은 `target.menuId + params? + page?`(Registry의 기존 메뉴)다. page key로 객체를 여는 메뉴도 지원한다. 주소에는 대상 객체 ID만 두고 조상 라벨·펼침 상태·검색어는 직렬화하지 않는다. 새 탭은 노드를 제외한 조상을 `resolveAncestors`로 복원한다. 삭제·이동·권한 없음은 명시 상태로 표시하고 다른 객체로 조용히 보내지 않는다.
5. **SDK 제약은 이유 있는 것만.** 한 번에 불러오는 노드 수 상한과 취소 규칙은 성능·정합성 이유, `role=tree` 키보드는 접근성 이유라서 계약에 둔다. 깊이 상한·한 번에 하나만 선택 같은 정책은 두지 않는다(메뉴가 선언).
6. **사이드바 채택(소유자 2026-11-07).** [컨펌 Artifact JAMf3g2Z2yGUDHynCwfYGh](https://claude.ai/artifact/JAMf3g2Z2yGUDHynCwfYGh): 기본 sb(한 단계씩), 메뉴 선택 sa(펼친 트리); 모델=sa, 게시판=sb. 고정 메뉴와 현재 데이터 노드 표시를 함께 남기고 접힌 팝오버는 실제 이동한 선택만 닫는다. `navTree`를 쓰지 않는 메뉴의 기존 행 클래스·동작은 유지한다. 본문 탐색기는 소유자가 보류했으며 실제 본문 소비자가 요청하면 다시 연다.
7. **검증용 합성 소비자.** 제품 Registry나 DEV 메뉴를 추가하지 않는다. `@ap/components/testing`의 5,000노드·6단계 source와 geometry stub을 실제 `AppShell`의 drill·tree 테스트 Registry에 주입한다. 제품 소비자 연결은 #1449다.

## 대안과 버리는 이유

- **모든 노드를 Registry 메뉴로 등록(#1108 안 A):** 데이터 증가가 메뉴·권한·URL·배포 증가로 이어진다. 기각.
- **그룹·메뉴 전체를 가변 깊이 모델로 재작성(안 C):** 변경 범위와 MARS 회귀 위험이 크다. 보류.
- **로그 지식 허브 안에 전용 트리 구현:** 지표 분류·Wiki 문서 계층이 같은 필요를 가진다. 도메인을 모르는 조각은 소비자 수와 무관하게 SDK에 둔다(루트 AGENTS 승격 기준).
- **소비자 확정까지 대기(2026-11-02 보류):** 소비자가 정해져(2026-11-07) 조건이 충족되어 더 이상 해당하지 않는다.

## 결과

- 공개 추가와 제한의 원본: [Kernel §5](../contract/kernel.md#5-menu-extension-contract), [Components §13](../contract/components.md#hierarchynav), [Layout §7–8](../contract/layout.md#7-application-shell). API 스냅샷·다음 SDK 릴리스 행을 함께 갱신한다.
- 시각 스펙은 위 사이드바 컨펌 Artifact와 Opus 일관성 리뷰 P1·P2 반영본이다. 본문 탐색기·경로 부품은 [백로그](../../.planning/backlog.md)에 미구현·재개 조건을 남긴다.
- 시험: 느린 응답·취소·빠른 선택 전환에서 오래된 응답이 덮지 않음, 새 탭 깊은 링크, 무권한·삭제 상태, 키보드·스크린리더, 기존 MARS 메뉴 무변화.
