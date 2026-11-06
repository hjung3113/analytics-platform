# 페이지 입력만 바뀌는 조회는 화면이 고르면 이전 결과를 갱신 중으로 남긴다

상태: **Decided (2026-11-05)**. [ADR-0086](0086-kernel-query-engine-tanstack.md)의 결과 신원 규칙과 [kernel.md](../contract/kernel.md)의 「Context가 바뀌면 이전 결과를 가린다」는 그대로이고, 기본 동작도 그대로다.
- 결정자: 소유자 — 2026-11-05, 팀장을 통해 [#1365](https://github.com/hjung3113/analytics-platform/issues/1365) 조사에 대한 답.

## 배경

생산성 개요에서 KPI 카드나 축 탭을 누르면, 바뀐 입력으로 다시 조회하는 구역만 스켈레톤으로 바뀌었다가 새 차트 틀로 돌아온다. 측정(Playwright, mock 서버, 구역별 노드 생존 수): 헤더·KPI·점유 구성·확인할 항목은 그대로이고 주요 추세 구역만 72개 노드가 모두 교체되며 150–190ms 스켈레톤이 보인다. 원인은 페이지 리마운트가 아니라 `useQueryLifecycle`이 엔드포인트 `params`를 조회 키에 넣는 것이다. 새 키에는 결과가 없어 `shown`이 null, 상태는 `loading`이고 `QueryView`가 차트 틀 자리에 `LoadingBlock`을 그린다. `refreshing`(결과와 라벨 유지)은 같은 키를 다시 읽을 때만 나온다. 같은 원인이 mars 사이클타임 단위, HW 시간 드릴·행 선택, bravo 지표 상세 버전, 로그 지식 항목·리비전, clas 운영시간 설비에 있다(조사 기록: 이슈 #1365). 실서버처럼 응답이 느리면 이 상태가 요청 내내 이어진다.

## 결정

1. **`useMenuQuery(spec, params, enabled?, { keepPrevious })`를 더한다. 기본은 꺼짐이다.** 켠 화면에서, 그 엔드포인트의 페이지 입력 `params`만 바뀌고 세션 세대·투영 Context·엔드포인트가 같고 게이트가 열려 있으면, 마지막 `ok`·`empty` 결과를 새 응답이 올 때까지 `refreshing`으로 남긴다.
2. **Context·Scope·기간·세션·엔드포인트가 바뀌면 옵션과 관계없이 이전 결과를 가린다.** 각 경우를 단위 시험이 고정한다.
3. **새 `params`의 응답이 오면 어떤 결과든 남긴 결과를 바로 대체한다.** 오류 결과는 남기지 않는다. `params`가 A→B→C로 바뀌면 C의 응답만 받아들인다.
4. **남긴 동안 `completedAt`은 남긴 결과를 받아들인 시각이다.** 신선도 라벨이 「새 숫자」인 척하지 않게 한다.
5. **남긴 결과는 「이전 선택의 결과 · 갱신 중」 안내 행과 함께만 보인다.** 안내는 일반 흐름의 24px 행이고 본문 이동을 허용한다. 결과 필드(`resultParams`·`showingPrevious`)와 옵션 시작 시점(첫 렌더부터 켠다) 등 세부 규칙은 [components.md §19](../contract/components.md)와 [kernel.md](../contract/kernel.md) Context 변경 규칙이 소유한다.
6. **어느 화면이 켜는지는 이 ADR이 정하지 않는다.** 노드 b(#1365)가 화면별로 고른다.

## 대안과 버리는 이유

- **기본을 켜기:** 버전·종류 전환(지표 상세 버전, 차트 카탈로그 종류)은 `params`가 바뀌면 *다른 내용*이라 이전 결과가 새 내용처럼 보일 위험이 있고, 공개 동작이 모든 소비자에게 바뀐다. 화면이 「같은 내용의 다른 조각」임을 알 때만 켠다.
- **화면별 로컬 캐시:** 화면마다 「이전 결과를 들고 있다가 새 응답이 오면 교체」를 다시 짜면 늦은 응답·세션 변경·Scope 변경을 각자 처리해야 하고, 한 곳이라도 틀리면 옛 숫자가 새 Context 결과로 보인다. 결과 신원을 아는 Kernel 한 곳에 둔다.
- **`QueryView`에서 이전 `response`를 기억하기:** `QueryView`는 Context·세션 신원을 모르므로 가릴 때를 판정할 수 없다.

- **`QueryView`의 모서리 절대 배치:** 긴 결과에서는 안내가 화면 밖에 남고, 위쪽은 고정 헤더·패널 버튼을 침범하며, 아래쪽은 마지막 행의 숫자·본문을 덮을 수 있다. 일반 흐름 안내 행을 쓰고 이전 결과가 보이는 동안의 24px 이동을 허용한다.

## 결과

- 공개 추가: 타입 `MenuQueryOptions`(루트 export)와 `useMenuQuery`의 선택 4번째 인자, `QueryView`의 선택 prop `refreshNotice`. 옵션이 꺼진 조회의 동작·모양은 그대로다.
- 켠 화면(#1382): 생산성 개요, 사이클타임, HW 시간, 지표 상세, 로그 지식 Item 상세, CLAS 운영시간. 끈 화면: 차트 카탈로그 종류 선택, 로그 지식 카탈로그 탭(버전·종류 전환이라 다른 내용).

## 참고

- 계약 원본: [components.md §19](../contract/components.md), [kernel.md](../contract/kernel.md) Context 변경 규칙.
- 상위 결정: [ADR-0086](0086-kernel-query-engine-tanstack.md).
