# 표 열 묶음은 열별 id 경로로 선언하고 다단 헤더로 표시

상태: **Decided (2026-11-17)**
- 결정자: 코디네이터(사용자 위임), #2418 N1. 선택 옵션이며 되돌릴 수 있다.

## 결정

기존 `PlatformColumn`에 `columnGroup` 경로, 표에 문자열 라벨 사전 `columnGroups`를 선택적으로 추가한다. 열 선언이 순서와 소속의 단일 원천이다. 엔진은 기존 TanStack v8을 유지하며 중첩 정의로 변환한다. 기본 동작과 저장 형식을 바꾸지 않는다. 세부 동작은 [Components §15](../contract/components.md#열-묶음-decided-adr-0166-2418), 모양은 [DESIGN Tables](../../DESIGN.md#tables)가 소유한다.

묶음은 하나의 이동·고정 단위이고 열은 부모 묶음 안에서 이동한다. 흩어진 저장 순서는 공용 `groupedOrder`로 읽으며 읽기만으로 저장하지 않는다. 부분 저장 핀은 보이는 구성원 기준으로 전체 묶음으로 확장한다. 헤더와 내보내기의 같은 순서를 보장하기 위해서다. 실제 메뉴 모습은 바꾸지 않고 mock dev-tools 예시로 검증한다.

## Alternatives / prior art

- **AG Grid**: `children` 묶음, 정렬·필터 없는 묶음 라벨, 자기 span 안 sticky 이름, `marryChildren`, 구성원 단위 핀 확장, Excel 병합 헤더(`skipColumnGroupHeaders`로 제외), `aria-colspan`·헤더 `aria-rowindex`. 묶음 헤더 크기 조절은 자식 폭을 비례 조절한다.
- **MUI X DataGrid**: 열과 별도인 `columnGroupingModel`, 정렬·크기 조절 없는 묶음 헤더, 기본 `freeReordering: false`, Premium Excel `includeColumnGroupsHeaders` 병합, `aria-colspan`.
- **Ant Design Table**: 중첩 `children`, native `<th colSpan>`, 고정 열과 함께 사용 가능. 열 이동은 없다.
- **Carbon DataTable**: 내장 묶음 헤더 없음.
- **TanStack Table v8 (채택)**: 중첩 `columns`와 `getHeaderGroups()`의 `isPlaceholder`·`colSpan`. 이미 사용하는 엔진이므로 교체 없이 확장 가능하다.
- **WAI**: native table은 `<th scope="colgroup" colspan>`. div `role=table`의 `aria-colspan`만으로 다단 헤더 연결이 화면 낭독기마다 안정적이지 않아 실제 열 이름에 sr-only 경로를 붙인다.
- **묶음 안 넘김**: 위 제품에 같은 동작은 없다. 가장 가까운 AG Grid `columnGroupShow`는 열 수를 줄이는 접기다. 사용자 고유 상호작용이므로 N2에서 캡처로 확인한다.

## 검토한 대안

- **AG Grid식 묶음 헤더 크기 조절**: 거절. 폭은 실제 열 또는 명시한 묶음 폭의 소유이며 자식 폭을 비례 변경하는 의미가 아니다.
- **MUI식 별도 묶음 모델**: 거절. 소속과 순서의 원천이 열 정의와 나뉘어 모순 가능성이 커진다. 열별 경로를 채택한다.
- **묶음 밖 자유 이동**: 거절. 경로 선언과 화면 소속이 달라지고 내보내기 병합도 깨진다.

## 결과

- 공개 API는 추가만 한다. 엔진 타입과 묶음 id는 사용자 저장값에 노출하지 않는다. 기존 표는 도입할 필요가 없다.
- 중첩 헤더·행·행 그룹은 공용 표시 단위 helper를 사용해 후속 묶음 래핑 경계를 둔다.
- 범위 밖: 묶음 넓이·묶음 넘김 (#2418 N2). **미구현**: N1은 문자열 라벨까지만 제공한다. N2 착수 시 폭 선언·넘김 동작과 사용자 캡처 확인을 추가한다.
