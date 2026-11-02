# 표 필터는 하나의 모델이다: 페이지 필터와 열 필터를 합치고, 연산자·와이어 스펙을 Excel 수준으로 넓힌다

상태: **Decided (2026-11-01)**.
- 결정자: 사용자 — 2026-11-01, [#1217](https://github.com/hjung3113/analytics-platform/issues/1217). 실제 앱 위 프로토타입 R2를 컨펌했다([아티팩트](https://claude.ai/artifact/3h5DGvnsYmx14XbXbHXGA3), version 3). 부작용(아래 「결과」)을 들은 뒤 페이지 필터와 열 필터를 한 모델로 합치는 데 동의했다("ㅇㅋ ㄱㄱ"). 「링크에 다 담을 필요는 없다, 공유할 때만 담고 주소창에는 보이지 않으면 좋겠다」는 제안도 사용자가 냈다.

결정의 소유 계약은 Components §15(필터 모델·편집기·표 크기), Kernel §6(반복·숨은 page key), Layout §12(관리 레이아웃)다.

## 결정

1. **필터 모델 하나.** 필터 가능한 필드 = `filter`를 선언한 열 + 열이 아닌 `filterFields`. 상태는 `TableQuery.filters: ColumnFilter[]` 하나이고 필드당 조건 하나, 필드 사이는 AND, 열거형 `in`/`notIn`만 OR다. 빠른 검색(`q`)과 전역 Context(QueryBar)는 따로 둔다.
2. **연산자(닫힌 합집합, 추가만).** text `contains notContains startsWith endsWith equals notEquals isEmpty isNotEmpty`; number `eq neq gt gte lt lte between isEmpty isNotEmpty`; date `between before after isEmpty isNotEmpty`(wall-clock `YYYY-MM-DD`, `before` = `<` 그날, `after` = `>=` 다음 날, `between`은 `to` 제외 그대로); enum `in notIn isEmpty isNotEmpty`. 기존 연산자의 뜻은 바뀌지 않는다.
3. **와이어 스펙 조각(범용).** 필드마다 `ops?`(서버가 지원하는 부분집합, 없으면 종류의 전부), text `caseSensitive: true`, enum `multiple: false`(`in`은 값 정확히 하나), 새 종류 `instant`(ISO 순간 반열림 범위 `{ from?, to? }`, 감사 시간처럼 wall-clock이 아닌 값), `requires: string[]`(나열한 필드에 조건이 있을 때만 유효). 필드 id에는 `:`를 쓰지 않는다. `pinned`·`label` 같은 표시 관심사는 contracts가 아니라 components가 소유한다.
4. **빈 값·부정 의미.** 빈 값은 text `null | undefined | ''`, 그 밖은 `null | undefined`. 부정 연산자(`notContains notEquals neq notIn`)는 빈 값도 **제외**한다(SQL `NOT x`가 NULL에서 참이 아닌 것과 같다). 빈 값은 `isEmpty`/`isNotEmpty`로 명시한다.
5. **서버가 거른다.** `validateFilters(filters, specs)`가 선언 밖 필드·연산자, 값 모양, `:` 든 id, `requires`, `multiple: false` 위반을 `{ ok:false, reason, filter }`로 돌려주고 mock·서버는 `invalid`로 거부한다(무시하지 않는다). `filterRows`는 옛 호출자를 위해 관대하게 둔다. `@ap/contract-schemas`에 `columnFilter`·`columnFilterSpec` Zod 스키마와 동치 테스트를 둔다.
6. **적용·URL.** 적용은 조건 하나씩(적용/Enter 한 번 = 조회 한 번, 칩 ×·모두 지우기는 바로). URL 키는 하나(`filter`, 조건마다 반복, `<id>:<op>:<값>`)이며, 옛 키(`status`·`maker`·감사·권한 키)는 한 릴리스(v0.22.0) 동안 별칭으로 읽고 `filter`로 바꿔 쓴 뒤 그다음 릴리스에서 지웠다(#1217 후속). 코덱은 `@ap/contracts`(`encodeFilterParam`·`parseFilterParams`)가 소유한다: 형식은 `<id>:<op>[:<값>]`을 앞의 `:` 둘로만 나누고, 목록(`in`/`notIn`)·범위(`between`)의 하위 구분자는 `~`이고, 값 안의 `%`·`~`·`\`·`#`·`/`·제어 문자는 `%XX`(대문자 16진 두 자리)로 쓴다 — Kernel의 같은 출처 경로 검사가 주소 안의 `\`·`#`·`//`·제어 문자를 거부하므로, 코덱이 그 글자를 직접 피해서 Kernel은 범용으로 둔다. 콤마 결합은 쓰지 않는다. 상한(`FILTER_PARAM_LIMITS`): 조건 20개, `in`/`notIn` 값 50개, 조건들이 주소·공유 링크와 같은 직렬화(`URLSearchParams`, 키 `<key>=`와 `&` 포함) 뒤 차지하는 길이 합 2400자 — 한글 한 글자가 9자가 되므로 개수가 아니라 이 길이 합이 복사 링크 4000자(`SHARE_LINK_MAX_LENGTH`) 안에 경로·전역 Context·짧은 키를 남기는 장치다. 다른 Context가 크면 링크 전체 상한이 최종 판정이다. 상한을 넘는 링크는 고치거나 줄이지 않고 거부한다.
7. **숨은 페이지 상태.** 표 필터 조건은 주소창에 보이지 않는다. 같은 탭의 새로고침·뒤로/앞으로는 history state로, 저장된 메뉴 뷰와 `현재 조건 공유` 링크는 `filter` 키로 복원한다. 링크를 열면 조건을 읽고 검증해 history state로 옮긴 뒤 주소를 바꿔 쓴다. 전역 Context와 짧은 키(`page`·`sort`·`focus`)는 그대로 URL에 둔다. Kernel이 반복 page key와 이 「숨은 키」를 선언으로 받는다.
8. **페이지 필터를 밀어낸 자리.** 관리 화면 왼쪽 필터 레일(ADR-0022)과 form 전체 `적용 (n)`(ADR-0037)은 없앤다.
9. **화면(R2).** 표 위는 한 줄 툴바 하나와 「필터·결과 줄」이다. 결과 줄은 필터가 없어도 항상 있고 활성 조건 칩을 싣는다. 조건 편집기는 하나이고 필터 추가와 열 머리글 필터가 같은 편집기를 연다.
10. **표 크기.** 표 크기는 세 상대 단계이고 머리글·본문·가상 스크롤러가 같은 행 높이를 쓴다. 체크박스는 고정 14×14, 열 너비 배율은 기본(저장 전) 너비에만 적용하며, 선택은 사용자 선호 하나로 모든 표에 같다. 밀도 기본값은 화면 맥락(분석·관리)에 상대적이다.
11. **코덱과 소유 경계.** URL/공유 링크 코덱(`<id>:<op>:<값>`, escape, 상한)은 `@ap/contracts`가 소유하고, 표 상태 `TableUrlState.filters`는 `@ap/components`가 소유한다. Kernel은 반복 page key와 숨은 키 선언만 받고 필터의 뜻을 모른다.
12. **관리 포트는 그대로.** 관리 화면의 서버 포트(공지·감사·권한 등) 시그니처는 바꾸지 않는다. 각 페이지가 `ColumnFilter[]` ⇄ 포트 입력 사이를 옮긴다(페이지 쪽 매핑).

## 다른 ADR과의 관계
- [ADR-0022](0022-management-filter-rail-analysis-two-column.md) — 관리 화면 필터 레일을 보충한다(표 위 필터 줄과 편집기 하나로).
- [ADR-0037](0037-table-filter-consistency.md) — 관리 표의 form 전체 적용을 조건 단위 적용으로, `@ap/ui` Input에 이름 있는 `inputSize="toolbar"`(32px, 네이티브 숫자 `size`는 그대로)를 더하도록 보충한다.
- [ADR-0104](0104-table-column-filters-selection-groups.md) — 열 필터가 URL로 공유되지 않던 제한을 푼다(숨은 페이지 상태 + 공유 링크). 서버가 의미를 소유한다는 원칙은 그대로다.

## 결과
- 사용자가 들은 부작용과 완화: (a) 옛 URL 키가 사라지면 북마크가 깨진다 → 별칭을 한 릴리스(v0.22.0) 읽고 그다음 릴리스에서 지웠다. (b) 연산자가 늘면 서버 비용이 는다 → 필드별 `ops` 화이트리스트와 서버의 `invalid` 거부, 체크리스트에 NULL 의미를 적는다. (c) 조건·값이 많으면 링크가 길어진다 → 상한을 코덱이 둔다. (d) 같은 조건이 Context가 바뀌어도 남는다 → Context 변경에서 유지하되(페이지는 1쪽) 메뉴가 달리 선언할 수 있다. (e) 주소창을 복사하거나 즐겨찾기하면 필터가 실리지 않는다 → 공유 버튼과 저장된 뷰가 대신 싣는다. 새 탭을 주소로 열어도 필터는 없다.
- 연산자 어휘의 확장은 추가형이다. 필드가 `ops`로 선언한 연산자만 쓰인다.
- 되돌리기: 확장은 모두 추가형이라 어휘를 쓰지 않으면 이전 동작과 같다.
- 개정(#1194 노드 s, 같은 모델의 필드 하나): enum 스펙에 선택 `cell?: 'scalar' | 'many'`(없으면 `'scalar'`)를 더한다. `'many'`는 행 값이 옵션 값 배열인 열(태그 목록)이며 `in` = 어느 요소든 포함, `notIn` = 요소가 있고 하나도 포함 안 함, `[]`/`null`은 빈 값이다. 와이어 `ColumnFilter`·URL 코덱·`validateFilters`는 그대로다.
