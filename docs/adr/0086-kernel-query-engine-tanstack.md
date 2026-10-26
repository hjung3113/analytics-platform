# Kernel 조회 수명주기는 내부 엔진으로 TanStack Query를 쓴다

- Status: Decided (2026-10-26)
- Decider: 사용자 방향(2026-10-26, "유지보수·성능·확장성 측면에서 가장 좋은 방향으로. TanStack이 그런 면에서 좋으면 도입") + 코디네이터. 되돌릴 수 있다(공개 API가 바뀌지 않는다).
- Scope: [#825](https://github.com/hjung3113/analytics-platform/issues/825). 관련: [docs/06 §19](../06_platform_ui_contract.md), [ADR-0054](0054-write-port-declared-actions-idempotency-version.md), [ADR-0071](0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md), [ADR-0085](0085-entity-audit-cursor-pages.md).

## 맥락

`usePlatformQuery`·`useEntityQuery`·`useEntityAudit`·`useMenuQuery`·`useAdapterRequest`는 훅 인스턴스마다 `useState`+`useEffect`+`AbortController`를 따로 가졌다. 공유 캐시도 진행 중 요청 중복 제거도 없어, 같은 메뉴·Context를 읽는 보드 칸 둘이나 뒤로 가기·다시 마운트가 요청을 되풀이했다. 쓰기 뒤 새로고침(ADR-0054)은 이미 엔드포인트 단위로 좁혀져 있다. `@tanstack/react-query` 5.62.7은 FeedbackOps 프런트엔드와 `@ap/fo-bridge`가 이미 쓴다.

## 대안

| | A. Kernel 자체 중복 제거 | B. Kernel 내부 엔진으로 TanStack Query(선택) | C. TanStack을 SDK 조회 API로 공개 | D. 하지 않음 |
| --- | --- | --- | --- | --- |
| 유지보수 | 새 캐시를 직접 만든다(GC 타이머·관찰자 계수·마지막 구독자 abort 모두 우리 테스트) | 검증된 엔진. Kernel은 키 만들기와 envelope 매핑만 가진다. FO가 같은 라이브러리를 이미 쓴다 | B와 같지만 모든 소비자가 TanStack API·버전에 묶인다 | — |
| 성능 | 중복 제거만(SWR은 직접) | 중복 제거, 관찰자 공유(보드 칸), 뒤로/앞으로/다시 마운트의 SWR | B와 같다 | 칸·뒤로 가기마다 요청이 중복된다 |
| 확장성 | 무한 쪽·prefetch·폴링(#165)마다 새 Kernel 코드 | `useInfiniteQuery`·`prefetchQuery`·`refetchInterval`을 쓸 수 있다 | B와 같다 | — |
| 비용 | 약 2–3 KB, 엣지 케이스 몇 주 | SDK 소비자 기준 gz 약 12 KB(FO 없이), platform-web은 이미 번들됨 | 공개 계약 변경 | 0 |

C는 ADR-0043의 "플랫폼 소유 단일 프레임워크"를 깨고 TanStack 메이저를 SDK 깨짐 릴리스로 만든다. A는 유지보수에서 진다. D는 사용자 요청과 맞지 않는다.

## 결정

B. 조회 수명주기 계약의 원본은 [06 §19](../06_platform_ui_contract.md#19-loading--empty--error-taxonomy), 패키지 경계는 [platform-packages §3](../integration/platform-packages.md)이다. 아래는 결정 당시의 세부와 이유다.

1. `@tanstack/react-query` `5.62.7`을 `packages/kernel` `dependencies`에 정확히 고정한다(`@ap/fo-bridge`와 같은 버전, 함께 올린다 — `tooling/eslint` `boundaries.test.ts`가 두 manifest를 비교한다).
2. 내부 전용: `QueryClientProvider`를 쓰지 않고 `useQuery(options, client)`로 명시적으로 넘긴다. 메뉴의 `useQuery`가 Kernel 캐시를 조용히 읽지 않고 FO의 중첩 Provider도 독립이다. 클라이언트와 TanStack 타입은 `HostPlatform`/`MenuPlatform`·공개 `.d.ts`에 나가지 않는다. lint `denyQueryEngine`은 메뉴·메뉴 mock·components·shell·앱 프리셋에서 `@tanstack/react-query`·`@tanstack/query-core`와 하위 경로 import를 막는다. kernel·`@ap/fo-bridge`는 허용한다(그 밖의 패키지에는 이 게이트가 없다).
3. `PlatformProvider`당 `QueryClient` 하나(수명 내내). 세션 세대 `gen = adapterEpoch:revision:userId`가 모든 키의 둘째 요소이고, `gen`이 바뀌면 같은 커밋의 layout effect가 다른 세대 쿼리를 `removeQueries`로 지운다(`clear()` 아님).
4. 키: 공유 키는 Kernel이 신원을 모두 만드는 곳만 — `['menu', gen, spec.id, projected, params, idle]`, `['entity', gen, ref, pageInputs, idle]`, `['audit', gen, ref, idle]`(`idle`은 늘 붙고 목적지 조회에서는 `false`). 호출자가 `run`을 주는 `usePlatformQuery`·`useAdapterRequest`는 인스턴스별 `useId()`를 키에 넣어 공유하지 않는다.
5. 기본값: `staleTime: 0`, `gcTime: 5분`, `retry: false`, `refetchOnWindowFocus/Reconnect: false`, `structuralSharing: false`.
6. 상태 매핑은 `QueryState` 그대로. 열린 인스턴스는 키의 결과를 보이고(조회 중이면 `refreshing`), 닫힌(`enabled=false`) 인스턴스는 자기가 열려 있을 때 수락한 결과만 보인다. 준비되지 않은 칸은 다른 칸이 같은 키를 가져도 `loading`이다.
7. 같은 공유 키의 열린 관찰자는 요청 하나를 나눈다. 조회 중(`fetching`·`paused`)에 열린 관찰자가 하나도 남지 않으면 취소한다(닫힌 관찰자가 남아 있어도 같다). 쓰기 무효화(8)와 세션 세대 교체(3)도 진행 요청을 취소할 수 있다. 다른 열린 관찰자가 남아 있으면 요청은 이어진다. queryFn은 Kernel 자신의 abort가 아닌 모든 거절을 `error` envelope로 바꾼다(#183).
8. 쓰기 뒤 새로고침: `refreshEpochs` 저장소는 그대로 두고(모듈 호스트가 `total()`을 쓴다), 공개 타입은 그대로(`bump/get/subscribe/total`)이고, Provider가 `useState` 초기화에서 클라이언트와 저장소를 함께 만들며 저장소가 만들어질 때 내부 sink를 받는다(어떤 bump도 엔진이 듣기 전에 일어나지 않는다 — 자손의 mount effect가 Provider effect보다 먼저 bump해도 같다). sink는 올라간 엔드포인트의 모든 `menu` 쿼리(세대 무관, predicate로 `queryKey[0]==='menu'`·`queryKey[2]`가 id)를 먼저 `cancelQueries`(진행 중 읽기를 abort하고 이전 상태로 되돌려, 첫 읽기가 쓰기 전 스냅샷으로 이기지 못하게 한다)한 뒤 `invalidateQueries({ cancelRefetch: false })`한다(취소 뒤 시작된 그룹 재시도 요청은 나누고 다시 끊지 않는다. 열린 것은 이전 결과를 두고 다시 읽고, 닫힌 것은 낡은 것으로 표시, 닫힌 게이트는 열리지 않는다).
9. `refetch()`와 `refreshEpoch`은 idle·닫힌 상태에서 무동작이고, 열린 상태에서는 `refetch({ cancelRefetch: false })`라 한 키의 여러 관찰자(OutcomeScope 그룹 재시도)가 요청 하나를 나눈다.
10. `enabled → false`는 오늘처럼 진행 요청을 취소한다: 훅은 닫힌 뒤 도착한 응답을 보이지 않고, 그 키에 열린 관찰자가 남지 않으면 Kernel이 `cancelQueries`한다. 이 규칙은 Provider의 쿼리 캐시 구독 하나가 맡는다: 관찰자가 빠지거나 옵션이 바뀔 때, 조회 중(`fetching`)이거나 오프라인으로 대기 중(`paused`)인 쿼리에 `enabled`인 관찰자가 없으면 취소한다(대기 요청이 복귀 때 어댑터를 부르지 않게)(열린 관찰자가 언마운트되고 닫힌 관찰자가 남는 경우 포함). idle 인스턴스는 결과를 즉시 가리고, 이전 열린 키에 관찰자가 없을 때 그 캐시를 제거한다(06 §19 "idle은 이전 결과를 가린다").
11. 클라이언트 수명: Provider effect가 `client.mount()`를, cleanup이 `client.unmount()`를 부른다(StrictMode에서도 QueryClient가 마운트를 센다). `QueryClientProvider`는 쓰지 않으므로 이 호출이 없으면 오프라인에서 멈춘 요청이 온라인 복귀 때 재개되지 않는다.
12. `useEntityAudit`의 붙인 쪽 읽기 세대는 첫 쪽 조회가 시작될 때(쿼리 캐시의 fetch 이벤트)와 신원(ref·세대)이 바뀔 때 오른다(ADR-0085).

## 결과

- 같은 메뉴·Context를 읽는 칸·컴포넌트는 요청 하나를 나눈다. 뒤로/앞으로/다시 마운트는 5분 안이면 이전 결과를 `refreshing`으로 보이고 다시 읽는다(`completedAt`은 그 결과의 시각). 06 §19를 이에 맞춰 고쳤다.
- TanStack은 관찰자를 `setTimeout(0)`으로 알린다. 미세 작업만 기다리던 테스트 flush는 매크로태스크를 기다린다 — `@ap/kernel/testing`의 `settleQueries()`(#907)가 이 대기를 맡는다. `notifyManager`의 스케줄러는 바꾸지 않는다(FO와 공유 모듈).
- 어댑터 객체가 바뀌면 새 세션 세대라 다시 읽는다(ADR-0071 §5). 테스트가 렌더마다 어댑터를 새로 만들면 매번 다시 읽는다.
- 새 런타임 의존 하나: SDK 소비자가 다른 버전의 react-query를 쓰면 두 벌이 번들된다. 공개 API 변화는 없다.

## 미룬 것 (구현 안 함, [백로그](../../.planning/backlog.md))

`selection-port-cache` 이전, FO와 한 QueryClient 공유, `staleTime > 0`·폴링(#165), `useMenuFetch` 표 쪽의 `useInfiniteQuery`, devtools, 모듈 호스트 `menuRequest` 경로(더 엄격한 호출별 `valid()`라 두 유효성 규칙이 섞인다), `usePlatformQuery`/`useAdapterRequest`의 명시적 키 인자를 통한 공유.
