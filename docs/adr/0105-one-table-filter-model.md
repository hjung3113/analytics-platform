# 표 필터는 하나의 모델이다: 페이지 필터와 열 필터를 합치고, 연산자·와이어 스펙을 Excel 수준으로 넓힌다

상태: **Decided (2026-11-01)**.
- 결정자: 사용자 — 2026-11-01, [#1217](https://github.com/hjung3113/analytics-platform/issues/1217). 실제 앱 위 프로토타입 R2를 컨펌했다([아티팩트](https://claude.ai/artifact/3h5DGvnsYmx14XbXbHXGA3), version 3). 부작용(아래 「결과」)을 들은 뒤 페이지 필터와 열 필터를 한 모델로 합치는 데 동의했다("ㅇㅋ ㄱㄱ"). 「링크에 다 담을 필요는 없다, 공유할 때만 담고 주소창에는 보이지 않으면 좋겠다」는 제안도 사용자가 냈다.

결정의 소유 계약은 Components §15(필터 모델·편집기·표 크기), Kernel §6(반복·숨은 page key), Layout §12(관리 레이아웃)다.

## 결정

1. **필터 모델 하나.** 필터 가능한 필드 = `filter`를 선언한 열 + 열이 아닌 `filterFields`. 상태는 `TableQuery.filters: ColumnFilter[]` 하나이고 필드당 조건 하나, 필드 사이는 AND, 열거형 `in`/`notIn`만 OR다. 빠른 검색(`q`)과 전역 Context(QueryBar)는 따로 둔다.
2. **연산자·와이어 스펙은 닫힌 합집합이고 추가만 한다.** 연산자 어휘, 필드별 `ops`·`caseSensitive`·`multiple`·`requires`, 새 종류 `instant`, 빈 값·부정 연산자 의미(부정 연산자는 빈 값도 제외, 빈 값은 `isEmpty`/`isNotEmpty`로 명시)는 [components.md §15](../contract/components.md)가 소유한다. 기존 연산자의 뜻은 바뀌지 않는다.
3. **서버가 거른다.** `validateFilters`가 선언 밖 필드·연산자·값 모양 위반을 `invalid`로 거부한다(무시하지 않는다). `@ap/contract-schemas`에 Zod 스키마와 동치 테스트를 둔다.
4. **적용은 조건 하나씩**(적용/Enter 한 번 = 조회 한 번). URL 키는 `filter` 하나이고, 옛 키는 한 릴리스(v0.22.0) 동안 별칭으로 읽고 그다음 릴리스에서 지웠다. 코덱과 상한은 `@ap/contracts`가 소유하고(components.md §15), Kernel은 반복 page key와 숨은 키 선언만 받는다.
5. **표 필터 조건은 주소창에 보이지 않는다.** 새로고침·뒤로/앞으로는 history state로, 저장된 메뉴 뷰와 `현재 조건 공유` 링크는 `filter` 키로 복원한다([kernel.md §6](../contract/kernel.md) page 키의 카디널리티와 숨김).
6. **페이지 필터를 밀어낸 자리.** 관리 화면 왼쪽 필터 레일(ADR-0022)과 form 전체 `적용 (n)`(ADR-0037)은 없앤다. 표 위는 한 줄 툴바와 「필터·결과 줄」이고, 조건 편집기는 필터 추가와 열 머리글 필터가 함께 연다. 레이아웃은 [layout.md §12](../contract/layout.md)가 소유한다.
7. **표 크기**는 세 상대 단계이고 밀도 기본값은 화면 맥락(분석·관리)에 상대적이다(세부는 components.md).
8. **관리 포트는 그대로.** 서버 포트(공지·감사·권한 등) 시그니처는 바꾸지 않고, 각 페이지가 `ColumnFilter[]` ⇄ 포트 입력 사이를 옮긴다.

## 다른 ADR과의 관계
- [ADR-0022](0022-management-filter-rail-analysis-two-column.md) — 관리 화면 필터 레일을 보충한다(표 위 필터 줄과 편집기 하나로).
- [ADR-0037](0037-table-filter-consistency.md) — 관리 표의 form 전체 적용을 조건 단위 적용으로, `@ap/ui` Input에 이름 있는 `inputSize="toolbar"`(32px, 네이티브 숫자 `size`는 그대로)를 더하도록 보충한다.
- [ADR-0104](0104-table-column-filters-selection-groups.md) — 열 필터가 URL로 공유되지 않던 제한을 푼다(숨은 페이지 상태 + 공유 링크). 서버가 의미를 소유한다는 원칙은 그대로다.

## 결과
- 사용자가 들은 부작용과 완화: (a) 옛 URL 키가 사라지면 북마크가 깨진다 → 별칭을 한 릴리스(v0.22.0) 읽고 그다음 릴리스에서 지웠다. (b) 연산자가 늘면 서버 비용이 는다 → 필드별 `ops` 화이트리스트와 서버의 `invalid` 거부, 체크리스트에 NULL 의미를 적는다. (c) 조건·값이 많으면 링크가 길어진다 → 상한을 코덱이 둔다. (d) 같은 조건이 Context가 바뀌어도 남는다 → Context 변경에서 유지하되(페이지는 1쪽) 메뉴가 달리 선언할 수 있다. (e) 주소창을 복사하거나 즐겨찾기하면 필터가 실리지 않는다 → 공유 버튼과 저장된 뷰가 대신 싣는다. 새 탭을 주소로 열어도 필터는 없다.
- 연산자 어휘의 확장은 추가형이다. 필드가 `ops`로 선언한 연산자만 쓰인다.
- 되돌리기: 확장은 모두 추가형이라 어휘를 쓰지 않으면 이전 동작과 같다.
- 개정(#1194 노드 s, 같은 모델의 필드 하나): enum 스펙에 선택 `cell?: 'scalar' | 'many'`(없으면 `'scalar'`)를 더한다. `'many'`는 행 값이 옵션 값 배열인 열(태그 목록)이며 `in` = 어느 요소든 포함, `notIn` = 요소가 있고 하나도 포함 안 함, `[]`/`null`은 빈 값이다. 와이어 `ColumnFilter`·URL 코덱·`validateFilters`는 그대로다.

## 참고

- 계약 원본: [components.md §15](../contract/components.md), [kernel.md §6](../contract/kernel.md), [layout.md §12](../contract/layout.md).
- 보충: [ADR-0112](0112-catalog-joins-table-filter-model-analysis-bar-keeps-apply-once.md) — 지표 카탈로그를 표 필터 모델로 합쳤다.
