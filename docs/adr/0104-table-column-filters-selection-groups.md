# ADR-0104: 표 열 필터·전체 선택·그룹 소계 — 범용 SDK 조각

- Status: **Decided** (2026-11-01)
- Decision maker: lead(조율자), 사용자의 #556 지시("MARS 컴포넌트 이슈는 SDK 성격대로 범용으로 만든다", 2026-11-01)에 따름. 되돌릴 수 있는 결정이다.

## Decision

`PlatformDataTable`의 고급 기능은 도메인을 모르는 **선택(opt-in) 조각**으로 SDK가 제공한다. 선언하지 않은 표는 지금과 똑같이 그린다. 필터·그룹·소계의 **의미는 서버가 소유**한다. 표는 서버 쪽을 클라이언트에서 흉내 내지 않고 요청만 만든다. 이 문서는 노드별로 절이 늘어난다(556b 열 필터 → 556c 전체 선택 → 556d 그룹·소계).

### 열 필터 (#556b)

- 열이 `PlatformColumn.filter`로 종류를 선언한다: `text` · `number` · `date` · `enum`(`options: {value,label}[]`). 선언한 열의 머리글에만 필터 단추가 생기고, 팝오버에서 종류별 고정 연산자와 값을 입력하고(적용/지우기), 적용된 필터는 표 위 칩으로 보인다(칩마다 해제, 「필터 모두 해제」).
- 와이어 모양은 `@ap/contracts`의 `ColumnFilter`(`{ id, op, value }` 타입 합집합)이다. text `contains`·`equals`(대소문자 무시, 로케일 독립 소문자), number `eq`·`gte`·`lte`·`between`(양 끝 포함), date `between`(`{ from?, to? }` wall-clock `YYYY-MM-DD`, `from` 포함·`to` 제외, 06 §6.3 — 순간(instant)이 아님), enum `in`(`string[]`). UI의 「~까지(포함)」는 와이어에서 +1일 제외 경계로 바뀐다.
- `PageQuery`는 바꾸지 않는다. `loadPage`는 `TableQuery = PageQuery & { filters?: ColumnFilter[] }`를 받고(`PageQuery`로 쓰던 기존 loader는 그대로 컴파일), `filters`는 **비어 있지 않을 때만** 키로 보낸다. 선택한 엔드포인트(EquipmentMaster)만 `paramKeys`에 `filters`를 선언한다. 목 서버는 `filterRows(rows, filters, accessor)`(순수, `sortAndPage` 앞)로 구현한다.
- **두 가지 필터 체계.** 페이지 필터(`filterKey`/`filters` 슬롯, [ADR-0037](0037-table-filter-consistency.md))는 페이지의 업무 조건이며 URL 키를 가진다. 열 필터는 표 안에서 좁히는 표 로컬 상태다. 둘은 AND로 함께 적용되고, 같은 필드를 둘 다에 선언하지 않는다. 페이지 필터가 바뀌어도 열 필터는 유지되지만 1쪽·선택 해제는 일어난다.
- 열 필터는 `usePagedRows`의 `contextIdentity`에 들어가므로 바뀌면 1쪽으로 돌아가고 선택을 비우며 진행 중인 내보내기·복사를 취소한다. 제어형 표(`urlState`)는 같은 때 `onChange({ page: null }, 'reset')`을 부른다.
- 내보내기: `exportRows` 요청 최상위에 `filters?: ColumnFilter[]`(`scope` 안이 아님)가 `filtered`·`all` 범위에서 실린다(`selected`는 ids 자체가 대상이라 싣지 않는다). XLSX 「조회 정보」 시트는 활성 열 필터를 `열 필터 · <열>` 줄로 적는다.
- 열 필터의 URL 공유(`urlState.filters` 코덱)는 이번에 하지 않았다(`.planning/backlog.md`).

### 전체 선택 (#556c)

- 표가 `selectAllResults`를 켜면(기본 꺼짐) 현재 쪽 행이 모두 체크되고 결과가 쪽보다 많을 때 표 위 막대가 「이 쪽의 N행을 선택했습니다 · 필터 결과 전체 M행 선택」을 낸다. 고르면 선택이 **제외 모델**이 된다: `TableSelection = { kind: 'ids'; ids } | { kind: 'all'; excludedIds; total }`. `all`은 id 목록을 만들지도 보내지도 않는다 — 상태 크기는 쪽 수와 무관하게 제외 id 수뿐이다. 모든 쪽의 행이 제외되지 않은 한 체크로 그려지고, 체크를 풀면 `excludedIds`에 더하고 다시 체크하면 뺀다. 머리글 체크박스는 체크(제외가 있으면 indeterminate)이며 누르면 선택을 지운다. 문구는 「필터 결과 전체 M행을 선택했습니다 · 선택 해제」, 제외가 있으면 「전체 M행 중 K행 제외」다. 제외가 M행 전부가 되면 선택이 풀린다.
- **서버 의미.** `total`은 사용자가 고른 시점의 **표시용 스냅샷**이다. 동작 시점에 서버가 Context + 페이지 필터 + 열 필터 − `excludedIds`로 집합을 **다시 계산**하고 권한·Scope를 다시 확인한다 — 클라이언트가 들고 있던 집합이나 개수를 믿지 않는다. 내보내기 요청은 `scope: { kind: 'all'; excludedIds }`를 최상위 `sorting`·`filters`와 함께 보낸다.
- 정렬·쪽 이동은 선택을 유지하고, 열 필터·페이지 필터·Context·`filterKey` 변경은 기존 초기화 경로(`usePagedRows` `contextIdentity`)로 선택을 지운다.
- 「복사」는 `all`에서 이유를 달아 비활성이다(복사는 불러온 행만 읽는다). 내보내기 메뉴는 「선택 M-K행」으로 `all` 범위를 보낸다.
- `bulkActions(selectedIds)`는 `ids` 선택에서 그대로 동작하고 `all`에서는 숨는다. `bulkSelectionActions(selection: TableSelection)`을 주면 두 선택 모두에서 그려지고 `all`에서도 보인다.
- **내보내기 요청 확장(expand → contract).** `@ap/components`가 `TableExportRequest`를 공개하고 `exportRows`가 이를 쓴다. 메뉴의 내보내기 도우미는 `exportScopeIds(scope)`(`{ mode: 'ids'; ids | null } | { mode: 'all-except'; excludedIds }`)로 범위를 읽는다 — `.ids`만 읽고 `excludedIds`를 무시하는 도우미는 컴파일되지 않는다. 전체 선택을 켜지 않는 메뉴(metrics·cycle-time·hw-time)는 `all-except`를 명시적으로 거절하고, EquipmentMaster는 `excludedIds` 파라미터로 지원한다.
- 참고한 패턴: Gmail 「모두 선택」 배너, MUI X Data Grid v8 `{ type: 'exclude', ids }`, AG Grid 서버사이드 행 모델 `{ selectAll, toggledNodes }`.

### 행 그룹·소계 (#556d)

- 열이 `PlatformColumn.groupable`을 선언하면 도구줄 「그룹」 선택(기본 「그룹 없음」, 「컬럼」 앞)이 생기고, 고르면 `TableQuery.groupBy`(열 id **하나**)를 보낸다. 한 단계다. 여러 단계가 필요하면 `groupBy: string[]` 같은 **새 선택 필드**를 더하고 이 필드의 타입은 바꾸지 않는다. 그룹을 바꾸면 1쪽으로 돌아가고 접힘을 모두 펼치며 선택은 유지한다(행 id 기준이고 그룹은 결과 집합을 바꾸지 않는다).
- **서버 의미.** 서버가 행을 그룹 키 순서 다음 요청 정렬 전체 키 순서로 내보내고, 응답 `groups`(`PageGroup = { key, label, count, subtotals? }`)는 이 쪽에 행이 있는 그룹마다 **필터 결과 전체** 기준 건수·소계를 말한다. 표는 쪽의 행으로 묶거나 더하지 않고 서버 값만 그린다. `groups`가 없거나 쪽의 행 그룹이 `groups`에 없으면 평평하게 그린다.
- **소계 어휘는 ADR-0082를 따른다.** `PlatformColumn.subtotal`은 표시 선언일 뿐이고, `sum` 재집계인 열에만 선언한다(비율·평균·`none`은 합칠 수 없다). `groupPage`(mock용)는 선언한 열만 더하고 값이 없으면 `null`이다.
- **접근성 모델.** 그룹 머리 행은 `role="row"`이고 맨 앞 `rowheader` 셀(접기 단추 `aria-expanded`, 이름 「‹label› 그룹 접기/펼치기」, 라벨, `N행 (전체 결과)`)과 소계 셀(「전체 결과 합계」)로 이뤄진다. 그룹 중에는 쪽 창이라 전체 행 수를 모르므로 `aria-rowcount="-1"`이고 `aria-rowindex`는 머리 행을 포함한 그려진 순서다. 접기 단추는 일반 Tab 정지점이고 Enter/Space로 조작한다. 접힌 그룹의 행은 쪽 선택에 그대로 들어가고 선택 막대가 「접힌 그룹의 N행 포함」으로 알린다.
- 쪽 경계에서 이어지는 그룹은 머리 행을 「(이어서)」로 다시 그린다. 이어짐 여부는 서버만 안다(쪽 경계 앞 행이 같은 그룹인지) — 서버가 `PageGroup.continued: true`로 답하고(선택 필드, 없으면 이 쪽에서 시작한 그룹), 표는 `continued === true`일 때만 표시한다. 행 수로 추정하지 않는다(쪽 경계에서 새로 시작한 큰 그룹을 이어진 것으로 잘못 표시한다).
- 내보내기는 그룹과 무관하게 평평한 행이다(요청에 `groupBy`를 싣지 않는다). 그룹 상태의 URL 공유는 하지 않았다.

## Alternatives and reasons

- `PageQuery`에 `filters`를 직접 넣기: 이 키가 없는 기존 엔드포인트의 `paramKeys` 계약과 모든 소비자 타입을 건드린다. 선택 조각이므로 확장 타입 `TableQuery`로 분리했다.
- 클라이언트에서 현재 쪽만 걸러 보이기: 서버 페이징에서 쪽 단위 숫자를 결과 전체의 숫자처럼 보이게 한다. 거절했다.
- 전체 선택을 id 목록으로 보내기: 결과가 수만 행이면 요청이 커지고, 목록을 만든 뒤 바뀐 결과를 반영하지 못한다. 제외 모델은 크기가 일정하고 서버가 동작 시점에 다시 계산한다.
- 클라이언트에서 쪽의 행만 묶고 더하기: 서버 페이징에서 쪽 단위 소계가 결과 전체의 숫자처럼 보인다. 거절했다. 서버가 전체 기준 `groups`를 준다.
- 날짜를 instant로 보내기: 시간대에 따라 하루가 밀린다. 06 §6.3의 wall-clock 규칙을 따랐다.

## Owning contracts

- [Components §15](../contract/components.md#15-platform-data-table-contract): 열 필터 선언·와이어·초기화·내보내기.
- [실서버 연결 체크리스트](../integration/real-server-checklist.md): 서버가 `filters`를 적용하는 규칙.
