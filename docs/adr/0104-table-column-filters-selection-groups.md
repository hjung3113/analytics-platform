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
- 내보내기: `exportRows` 요청 최상위에 `filters?: ColumnFilter[]`(`scope` 안이 아님)가 `filtered` 범위에서만 실린다. XLSX 「조회 정보」 시트는 활성 열 필터를 `열 필터 · <열>` 줄로 적는다.
- 열 필터의 URL 공유(`urlState.filters` 코덱)는 이번에 하지 않았다(`.planning/backlog.md`).

## Alternatives and reasons

- `PageQuery`에 `filters`를 직접 넣기: 이 키가 없는 기존 엔드포인트의 `paramKeys` 계약과 모든 소비자 타입을 건드린다. 선택 조각이므로 확장 타입 `TableQuery`로 분리했다.
- 클라이언트에서 현재 쪽만 걸러 보이기: 서버 페이징에서 쪽 단위 숫자를 결과 전체의 숫자처럼 보이게 한다. 거절했다.
- 날짜를 instant로 보내기: 시간대에 따라 하루가 밀린다. 06 §6.3의 wall-clock 규칙을 따랐다.

## Owning contracts

- [Components §15](../contract/components.md#15-platform-data-table-contract): 열 필터 선언·와이어·초기화·내보내기.
- [실서버 연결 체크리스트](../integration/real-server-checklist.md): 서버가 `filters`를 적용하는 규칙.
