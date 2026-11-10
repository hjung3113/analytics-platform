# ADR-0137 — 표는 `refreshOn`으로 쓰기 뒤 다시 읽고, 가진 행은 `rows`로 받는다

- 상태: Decided (2026-11-11, lane sdk, 되돌릴 수 있음). 이슈 [#1672](https://github.com/hjung3113/analytics-platform/issues/1672).
- 결정자: lane sdk (제안 방향 중 하나를 고르는 SDK 범위 결정이라 소유자 확인 없이 정했다. 소유자가 뒤집을 수 있다).
- 바꾸는 결정: [ADR-0054](0054-write-port-declared-actions-idempotency-version.md)의 "Kernel이 `invalidates`에 든 조회를 다시 읽는다"는 문장은 `refreshOn`을 선언한 표에도 적용된다. 그 밖의 결정은 바꾸지 않는다.

## 배경

`PlatformDataTable`은 `loadPage`만 받고 쓰기 `invalidates`를 듣지 않아서, 쓰기가 끝나도 표가 낡은 행을 보였다. 이미 행을 가진 메뉴는 응답 봉투를 손으로 만들고, 다시 읽게 하려고 `filterKey`에 버전을 넣었다. `filterKey`는 Context 정체성이라 1페이지로 돌아가고 선택이 지워졌다.

## 결정

1. **`refreshOn?: readonly { id: string }[]`:** 표의 `loadPage`가 읽는 엔드포인트 선언을 넘긴다. 표는 Kernel의 `useEndpointRefreshEpoch(ids)`(나열한 엔드포인트의 refresh epoch 합)를 요청 정체성 끝에 붙여, 그 엔드포인트를 `invalidates`로 가진 쓰기가 끝나면 같은 쪽을 다시 읽는다. Context 정체성에는 넣지 않으므로 쪽과 선택이 남고 이전 행은 `aria-busy`로 남는다.
2. **`rows: readonly T[]`(+ `rowsLoading`):** 표가 `rows`로 자기 로더를 만들어 거르기·묶기·정렬·쪽 나누기를 열의 값(`value ?? row[id]`)으로 한다. 응답 봉투도 표가 만든다. 새 `rows` 참조나 `rowsLoading` 변화는 같은 요청 정체성 입력(`dataVersion`)으로 들어가 다시 읽기와 같이 동작한다. `loadPage`와 `rows`는 서로 배타 입력이다(타입 합집합).
3. **`externalPagination`과 함께 쓰면** 창을 메뉴가 쥐므로 모든 행을 준 순서대로 보이고, 전체 결과가 필요한 `filter`·`filterFields`·`groupable`은 무시하며 개발 경고를 한 번 낸다.

이유: `loadPage`는 표에게 불투명해서 어떤 엔드포인트를 읽는지 알려 줘야 한다. 메뉴가 이미 가진 선언을 그대로 받으면 새 개념이 없다. `rows`는 봉투를 손으로 만드는 우회 5곳을 한 입력으로 없애고, 다시 읽기 정체성을 표가 한 곳에서 쥔다.

## 대안

- **`useMenuFetch`가 epoch을 내주기:** 표가 아닌 다른 `useMenuFetch` 소비자까지 epoch 계약을 떠안고, `loadPage`를 만드는 메뉴가 epoch을 표에 다시 넘겨야 해서 우회가 하나 더 생긴다.
- **`refreshKey` 입력:** 메뉴가 epoch을 직접 읽어 넘겨야 하고 `filterKey`에 버전을 넣는 우회와 모양이 같아진다.
- **공개 봉투 helper(`rows` 대신):** 봉투 만들기는 쉬워지지만 정렬·쪽·거르기·묶기와 다시 읽기 정체성을 메뉴가 계속 쥔다.

## 추천이 바뀌는 조건

`rows`로 거르기·묶기를 하는 표가 수천 행을 넘어 화면이 느려지면 서버 쪽 `loadPage`로 옮기는 기준을 계약에 적는다. 표가 두 개 이상의 엔드포인트 조합에서 부분 갱신을 요구하면 `refreshOn` 대신 엔드포인트별 epoch 입력을 다시 본다.
