# 도메인 Context는 Kernel `ContextKey`를 늘리지 않고 앱이 주입하는 네임스페이스 축으로 넓힌다

상태: **Decided (2026-11-11)** — 방향. 구현은 [#1703](https://github.com/hjung3113/analytics-platform/issues/1703)이 이어받는다.
- 결정자: 사용자(소유자) — 2026-11-11, [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강 §3의 소유자 결정 13행 전부에 «추천대로». 이 ADR은 그중 5번(확장 방식)과 6번(메뉴 간 전달 규칙)이다.
- Scope: [#1703](https://github.com/hjung3113/analytics-platform/issues/1703). 관련: [ADR-0059](0059-app-injected-equipment-axes-and-condition.md), [ADR-0072](0072-open-menu-vocabulary-app-declared-branded-ids.md) 결정 6, [cross-menu-links.md](../contract/cross-menu-links.md) §22.
- 구현 없음. `docs/contract/*`의 변경은 #1703이 계약 문서와 함께 한다(ADR-0072 결정 6이 닫은 목록을 바꾸지 않는다).

## 맥락

사내 도메인은 공통 Context(기간, Scope, 설비 조건)에 없는 축을 더 필요로 한다. `GlobalContext`의 필드와 `ContextKey`는 Kernel이 의미를 소유하는 닫힌 목록이다(ADR-0072 결정 6). 목록을 늘리면 모든 소비자와 URL 계약이 바뀐다. 이미 앱이 주입하는 설비 축 목록이 있다(ADR-0059).

세 가지가 걸린다.

- URL 버전 `v`와 저장된 뷰 `schemaVersion`을 올리면 이전 버전이 통째로 거부하므로 롤백이 깨진다([#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강 반례). 새 키는 `v=1` 아래 새 키로 더해야 이전 버전이 보존한다.
- 조건 map은 평평해서 두 도메인이 같은 축 id를 다른 뜻으로 쓰면 조건 세트가 조용히 다른 뜻으로 적용된다(같은 반례 목록).
- 지금 링크는 등록된 전역 Context를 목적지 지원 여부와 무관하게 싣는다([cross-menu-links.md](../contract/cross-menu-links.md) §22).

## 결정

1. **Kernel `ContextKey`를 늘리지 않는다.** 닫힌 목록과 기존 고정 키는 읽기 호환 집합으로 그대로 둔다. URL의 새 키는 `ContextKey`가 아니라 도메인 확장 슬롯이다. 새 축의 id가 ADR-0059의 Condition map 안에 놓이는지 별도 키인지는 #1703이 정한다.
2. **ADR-0059의 «앱이 주입하는 축»을 네임스페이스 축으로 일반화한다.** 도메인 축은 앱(조립)이 주입하고 id는 네임스페이스로 나눠 두 도메인의 같은 이름이 충돌하지 않게 한다. 정확한 id 문법은 #1703이 정한다.
3. **URL은 `v=1`을 유지한다.** 새 축은 `v=1` 아래 새 키로 더해 이전 버전이 모르는 키를 보존하게 한다. `v`와 `schemaVersion`은 올리지 않는다.
4. **메뉴 간 전달: 기존 키는 현행 유지.** 새 도메인 축은 양쪽 메뉴가 같은 정의를 선언했을 때만 전달한다. 목적지가 정의를 모르면 싣지 않고 `droppedPageKeys`처럼 버려진 것을 알 수 있게 한다.

## Considered Options

- **(A, 채택) 네임스페이스 축으로 일반화.** 닫힌 목록과 URL 버전을 건드리지 않는다.
- **(B) `ContextKey`에 도메인 키를 더한다.** Kernel이 도메인 어휘를 소유하게 되어 ADR-0072의 방향과 반대다.
- **(C) 새 도메인마다 `v`를 올린다.** 롤백이 깨진다.

## Deferred (구현 안 함)

- 네임스페이스 id 문법, 저장물 이행, 필터 엔진 확장, 축 정의 선언 모양. 이유: #1703이 소유한다. 다시 여는 조건: #1703 착수.
- 기존 고정 키 전달 규칙의 변경. 이유: 소유자가 현행 유지로 정했다.

## 결과

- 사내 메뉴는 자기 도메인 축을 Context 계약 변경 없이 주입한다. 저장소 밖 조립 시험([Host 조립 계약](../design/host-entry-contract.md) §10 4번)은 `GlobalContext`가 왕복 전후 같음을 확인한다.
