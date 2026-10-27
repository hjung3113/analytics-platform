# 메뉴의 정규 경로는 공간 id와 메뉴 id에서 유도하고, manifest 경로는 옛 별칭으로 남긴다

- Status: Decided (2026-10-27)
- Decider: 레인 소유자([#961](https://github.com/hjung3113/analytics-platform/issues/961) 코멘트, 2026-10-27). 되돌릴 수 있다 — 유도 규칙은 `createRegistry` 한 곳이다.
- Scope: [#961](https://github.com/hjung3113/analytics-platform/issues/961) 노드 961a–d(Registry, 리다이렉트, 소비자 이전, 테스트·경로 표). 노드 961e 공유 UX와 961f는 남았다. 관련: [ADR-0090](0090-repo-structure-by-branch.md)(공간 id), 계약 본문은 `docs/contract/kernel.md` §6.4·§9.1.

## 맥락

메뉴 URL은 각 manifest가 손으로 쓴 경로(`/hw-time/steps`, `/equipment/:equipmentId`)라 공간(`mars`·`bravo`…)이 주소에 드러나지 않고, 메뉴마다 첫 세그먼트를 따로 정해 충돌과 예약어 검사가 흩어져 있다. 공간 id는 #713m에서 정리됐고, 현재 공간은 이미 라우트의 메뉴에서 유도한다(§9.1).

## 대안

- A. manifest가 정규 슬러그를 직접 선언한다. 메뉴마다 값을 하나 더 쓰고 공간 접두사·중복·예약어를 메뉴 작성자가 지켜야 한다.
- B. 공간 id와 메뉴 id에서 유도한다(선택). 선언할 것이 없고, 같은 공간 안 슬러그 충돌만 Registry가 막는다.

## 결정

정규 경로 유도, 별칭, 플랫폼 홈과 검증의 계약은 [06 §6.4](../contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)를 따른다. 이 앱은 홈을 `/home`으로 선언하고 `/`를 별칭으로 둔다.

## 결과와 한계

- 옛 링크와 저장된 `returnTo`·마지막 화면은 계속 열리고, 메인 화면은 별칭 주소를 정규 주소로 한 번 `replace`한다(검색·해시 그대로, history 항목 추가 없음, 별칭에서는 화면·조회·계측·최근 방문 기록 없음). 저장된 옛 `returnTo`는 정규 형태로 맞춰 비교해 돌아가기 포커스를 받는다.
- 플랫폼 홈은 `home` 메뉴가 `path: '/home'`, `aliases: ['/']`를 선언해 정규 `/home`이 되고, `matchRoute('/')` 소비자는 `registry.platformHome`을 읽는다(홈 별칭도 manifest `aliases`를 쓰므로 메커니즘은 위 2와 같다). 설문은 정규 `/survey…`, 별칭 `/surveys…`다(노드 961b·c·d).
- 961a–d는 리뷰 PR에 포함됐으며 병합과 E2E 확인이 남았다. 961e 공유 UX와 961f도 남았다.
- 메뉴 id를 바꾸면 정규 주소가 바뀐다. 옛 주소는 manifest 경로가 별칭이라 계속 열리지만, id만 바꾼 이전 주소는 별칭으로 남기지 않는다.

## 되돌리기

유도 규칙을 manifest 선언(대안 A)으로 바꾸려면 `createRegistry`의 정규 경로 계산만 교체한다. 별칭·`viaAlias` 계약은 그대로다.
