# Condition 프리셋: 조회의 투영과 신원만 좁히고 전역 Condition은 그대로 둔다

- Status: Decided (2026-10-25)
- Decider: 코디네이터(사용자 위임), 되돌릴 수 있다. [ADR-0059](0059-app-injected-equipment-axes-and-condition.md) 결정 7(Condition 전체 유지·칸 복사)은 바꾸지 않는다.
- Scope: [#580](https://github.com/hjung3113/analytics-platform/issues/580) 노드 580b(계약 + 커널). 화면(전환기, 미적용 표시)은 580c. 관련: [06 §6.4](../contract/platform-ui-contract.md#64-url-계약-decided-필드명enum-문자열은-candidate), [ADR-0061](0061-query-draft-applied-address-and-required-gate.md), [ADR-0049](0049-analysis-context-belongs-to-a-pane.md).

## 맥락

한 메뉴가 같은 설비 Condition을 서로 다른 축 집합(예: 설비 기준 maker·model, 조직 기준 stgroup·team)으로 볼 수 있어야 한다. Condition은 전역 키(`equipmentGroup`)라 메뉴를 옮겨도 살아남는다. 프리셋을 바꿀 때 프리셋 밖 축의 값을 어떻게 할지가 문제다.

## 대안

- **A. 제거.** 프리셋 밖 축의 값을 Condition(URL)에서 지운다. 결과는 설명되지만 다른 메뉴가 쓰던 전역 값이 한 메뉴의 보기 전환으로 사라지고, ADR-0059 결정 7과 칸 복사를 바꾼다. 소유자 결정 사항이라 제안하지 않는다.
- **B. 세션 동안 보관.** 제거하되 화면 세션에 "보류 값"을 기억해 A→B→A에서 되살린다. 새 상태 저장소가 생기고, 새로고침·뒤로가기·칸 복사에서 값이 어긋난다. 숨은 상태는 URL이 소유한 상태라는 §6.4 원칙과 맞지 않는다.
- **C. 유지하되 투영하지 않는다(선택).** 전역 Condition과 URL은 그대로 두고, 그 메뉴의 조회 요청과 조회 신원에서만 활성 프리셋의 축을 남긴다.

## 결정

**C.** 커널이 메뉴 조회(`useMenuQuery`·`useMenuFetch`·모듈 호스트 `query`와 그 유효성 검사)에 넘기는 전역 Context의 `condition`을 활성 프리셋의 축만 남겨 `projectContext`에 건넨다. 남는 축이 없으면 `null`이다(`{}`가 아니다: `projectContext`는 non-null Condition을 있는 것으로 읽고 URL 코덱은 `{}`를 `null`로 정규화한다). `membershipBasis`는 기존 식을 좁혀진 값에 그대로 적용한다. `projectContext`는 순수하게 두고, 순수 helper `narrowCondition`을 `@ap/contracts`가 낸다.

- 활성 프리셋 = 선언한 page key의 값이 프리셋 id이면 그것, 아니면 `default`. 보드 칸은 그 칸의 메뉴와 page 상태로 정한다.
- 프리셋은 page key이므로 Apply 메뉴에서 `setDraftPage`는 초안만 바꾸고(조회 0회) `apply`가 다른 변경과 함께 한 번 조회한다. live 메뉴에서는 전환이 곧바로 투영을 바꾼다. 활성 프리셋이 그대로이면 프리셋 밖 축의 값이 바뀌어도 조회 신원이 같아 다시 조회하지 않는다. 명시한 page 키는 이를 보장한다. 키가 없는 동안에는 Condition 편집이 추론된 프리셋을 바꿀 수 있고, 그러면 요청도 바뀐다(아래 보충).
- 계약: `MenuMeta.conditionPresets`(`{ id; label; axes }` 2개 이상)와 `MenuMeta.conditionPreset`(`{ key; default }`) — 필드명 Candidate. `createRegistry`가 개수·id 유일·ko/en 이름·`axes` 비지 않음·default·key가 `pageKeys`·`condition` 능력(`apply`/`reference`)을 검사하고, 축 id가 `equipmentAxes`에 있는지는 레지스트리가 축을 보지 못하므로 `PlatformProvider`가 렌더에서 검사해 던진다.
- 결과: 서버 페이징 표(`PlatformDataTable`)의 조회 신원과 표 내보내기 머리말도 적용된 프리셋으로 좁힌 전역 Context(kernel `useQueryContext()`)를 따른다 — 프리셋 전환 뒤 적용하면 표가 다시 조회되고, 프리셋 밖 축의 변경은 (활성 프리셋과 다른 조회 입력 — page 필터·초기화 키 — 이 그대로일 때. 프리셋 키가 없어 조건 편집으로 추정 프리셋이 바뀌면 다시 조회한다) 표를 다시 조회하거나 선택을 버리지 않으며 내보내기 파일에 조건으로 나가지 않는다(#819).
- 셸용 읽기 전용 노출: `useConditionPreset()`(프리셋 목록, 초안/적용 활성 id, 프리셋 밖 축 id). UI는 580c.

## 이유

ADR-0059 결정 7과 칸 복사, 다른 메뉴에서 쓰는 전역 값을 한 메뉴의 보기 전환이 건드리지 않게 하기 위함이다(계획 리뷰 P1). 숨은 값이 결과를 설명할 수 없게 만드는 위험(조사 질문 1의 Power BI 숨은 slicer)은 계약이 아니라 화면에서 "이 보기에서 미적용"으로 드러낸다(580c).

## 되돌리기

A나 B로 바꾸려면 `narrowedGlobal` 한 곳과 `setDraftPage`의 프리셋 key 처리를 바꾸면 되고, 선언 필드는 그대로다. A는 ADR-0059 결정 7을 바꾸므로 소유자에게 올린다.

## 보충: 진입 규칙 (2026-10-25)

- Decider: 코디네이터(사용자 위임), 출처: 프로토타입 선택 리뷰 UX-3. 되돌릴 수 있다(`activeConditionPreset` 한 곳).
- 결정 "page 값이 없으면 선언된 기본값"을 다음으로 바꾼다. page 값이 없으면 현재 Condition의 비어 있지 않은 축을 모두 포함하는 첫 선언 프리셋, 없으면 선언된 기본값. 키가 없는 동안에는 이 판정을 라이브 Condition 편집마다 다시 하므로 첫 렌더에만 적용되지 않는다. 명시했지만 모르는 id는 이 규칙을 타지 않고 선언된 기본값을 쓴다. 조직 축 값만 들고 들어온 링크가 설비 기준 보기의 빈 화면으로 열리는 것을 막기 위해서다. 판정은 URL(전역 Condition + page)만 읽으므로 히스토리·새로고침이 정확하다(06 §6.4). 요청 투영과 `useConditionPreset()`이 같은 함수를 쓴다. 명시한 page 값은 항상 이긴다.
