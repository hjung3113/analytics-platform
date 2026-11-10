# ADR-0134 — BRAVO Quest는 `PlatformAdapter` 포트에서 빼고 메뉴 조회 엔드포인트로 옮긴다

- 상태: Decided (2026-11-10, 사용자 결정, 되돌릴 수 있음). 구현은 [#1641](https://github.com/hjung3113/analytics-platform/issues/1641).
- 결정자: 사용자 — 저장소 리뷰 종합의 추천안에 "추천대로"(2026-11-10). 이슈 [#1639](https://github.com/hjung3113/analytics-platform/issues/1639).
- 바꾸는 결정: [ADR-0098](0098-adapter-preferences-people-notices-ports.md) 개정(2026-11-05, #1328 노드 c)의 Quest 포트 부분. Quest가 BRAVO 소유이고 개선 아이템이 ID로만 가리킨다는 [ADR-0106](0106-improvement-task-is-quest.md) 개정 2는 그대로다.

## 배경

`PlatformAdapter`에 `getQuest`·`searchQuests`가 필수 멤버로 있다. [`packages/AGENTS.md`](../../packages/AGENTS.md)는 포트에 메뉴 어휘를 넣지 않는다고 정한다. 공지 포트는 ADR-0098이 예외 이유를 적었지만 Quest는 "같은 필수 멤버"라고만 적었다. 호출처는 `platform/improvement-items`의 `QuestReference` 하나이고, `platform-api`는 이 두 메서드를 서비스하지 않는다.

## 결정

1. `getQuest`·`searchQuests`와 그 타입을 포트에서 빼고 메뉴 조회 엔드포인트로 옮긴다. mock 처리기는 메뉴의 `src/mock/`으로 간다.
2. 저장소 밖 SDK 소비자가 없으므로 expand → migrate → remove 단계를 두지 않고 SDK minor 하나에서 한 번에 바꾼다.
3. "BRAVO가 검색을 못 함"(`supported: false`)과 "지금 답 못 함"은 지금처럼 응답 모양으로 표현한다.

이유: 사내 어댑터가 메뉴 하나를 위해 필수 메서드 둘을 구현하지 않게 되고, 이유 없는 예외가 다음 업무 시스템 연동의 선례가 되지 않는다. 사내 어댑터가 생기기 전이라 지금 바꾸는 것이 가장 싸다.

## 대안

- **포트로 남기고 ADR-0098에 예외 이유를 적는다.** 일은 가장 적지만 Quest는 공지와 달리 메뉴 하나만 쓰므로 적을 이유가 없고, 메뉴 조회와 캐시도 갈라진 채로 남는다.

## 추천이 바뀌는 조건

Quest를 읽는 메뉴가 여럿 생겨 공통 어댑터 책임이 된다고 드러날 때.
