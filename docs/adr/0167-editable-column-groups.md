# 열 묶음은 컬럼 팝오버에서 편집하고 사용자 열 설정에 저장

상태: **Decided (2026-11-17)**
- 결정자: 사용자, #2481 시안 A 및 개발자 선언 묶음 편집 승인. 아래 저장·적용 방식은 lane의 되돌릴 수 있는 결정이다.

## 결정

`PlatformDataTable.editableColumnGroups?: boolean`을 기본 `false`인 선택 옵션으로 추가한다. 켜면 «컬럼» 팝오버에서 최상위 열 묶음을 만들고, 개발자 선언 묶음도 이름·구성 열을 바꾸거나 풀 수 있다. 별도 선택 화면을 두어 보이기 체크박스와 묶음 구성원 선택을 구별한다. «기본값으로»는 개발자의 선언 묶음과 기존 열 설정 기본값으로 돌아간다. 세부 규칙은 [Components §15](../contract/components.md#사용자가-편집하는-열-묶음), 시각 규칙은 [DESIGN Tables](../../DESIGN.md#tables)가 소유한다.

[ADR-0166](0166-table-column-groups.md)의 «열 선언이 순서와 소속의 단일 원천»은 **편집 옵션이 켜지고 유효한 사용자 snapshot이 있을 때** 부분 대체한다. 기존 선언 모델·엔진·순서·핀·넘김·내보내기 경로는 유지하며, 순수 함수 `effectiveColumnGroups`에서 유효한 열·문구 쌍으로 한 번만 바꿔 전달한다. 병합 오류면 두 값 모두 선언으로 돌아가 화면과 전송이 갈라지지 않는다.

사용자 snapshot은 기존 `useColumnPreferences`의 브라우저/서버 열 설정 객체에 선택 키 `groups`로 저장한다. 선언 구조만 담은 `basis`는 선언 변경 후 이전 소속을 덮어씌우지 않기 위한 것이다. 첫 편집은 구성원만 복사해 선언 문구의 번역·코드 변경과 폭 기본값을 계속 따르며, 사람이 이름·폭을 바꿀 때만 override를 쓴다. 별도 version 필드는 두지 않는다. 미래 형식은 새 선택 키로 추가할 수 있고, 선언 변화는 이미 `basis`가 막는다.

## Alternatives / prior art

아래 비교는 #2481 lane의 제공 조사(`2481-survey.md`)를 요약한 **당시 기록**이다. 이번 작업은 네트워크 금지여서 제품 문서를 실시간 재확인하지 않았다. 현재 제품 기능에 대한 검증 결과로 인용하지 않는다.

- **AG Grid**: 조사에서는 `columnDefs.children`의 개발자 선언과 Columns 도구 패널의 이동·숨기기를 제공하고 UI에서 이름 붙은 열 묶음을 만들지는 않는 것으로 파악했다. `marryChildren`·구성원 핀 확장이 가까운 동작이다. Pivot/row grouping은 사용자 열 묶음과 다르다.
- **MUI X DataGrid**: `columnGroupingModel`은 개발자 선언이고 Columns 패널은 숨기기/보이기, `freeReordering: false`는 소속 유지에 해당하는 것으로 조사했다.
- **Excel**: 인접 열 선택 → Data ▸ Group(Shift+Alt+→)은 이름 없는 outline(+/−)이다. 이름은 병합 셀로 따로 만들고 비인접 선택은 지원하지 않는 것으로 조사했다.
- **Google Sheets**: 인접 열의 헤더 메뉴에서 Group/Ungroup을 하고 이름 없는 +/− 막대를 사용하는 것으로 조사했다.
- **Airtable / Notion databases**: 열 이동·숨기기 또는 행 그룹과 달리 이름 붙은 열 묶음은 없는 것으로 조사했다.
- **Carbon DataTable / Ant Design Table**: 전자는 묶음 헤더가 없고, 후자는 개발자의 중첩 `children`인 것으로 조사했다.
- **Handsontable / Syncfusion / DevExtreme**: 각각 `nestedHeaders` / stacked headers / bands를 개발자가 선언하며, DevExtreme 선택기는 band 이동을 제공하는 것으로 조사했다.

조사의 두 유사 경로는 그리드의 열 설정 패널(A)과 스프레드시트의 헤더 선택(B)이었다. 사용자가 A를 선택했고, 보이기와 선택을 구분하는 별도 선택 화면을 조건으로 삼았다. 비인접 열은 거절하지 않고 기존 `groupedOrder`의 첫 구성원 위치로 모은다. 조사 제품의 개발자 묶음 고정 관행보다 사용자의 편집 요구를 따른다.

## 검토한 대안

- **시안 B, 헤더 선택**: 거절. 사용자가 A를 골랐다. 도구줄 버튼·헤더 체크박스·헤더 메뉴를 추가하지 않는다.
- **개발자 묶음은 고정**: 거절. 사용자가 개발자 묶음의 이름·구성·풀기도 요구했다.
- **preferences 밖 별도 묶음 모델**: 거절. 계정 경계·서버 저장 seam·reset이 두 곳으로 갈린다. 기존 객체에 snapshot을 넣는다.
- **문구·폭까지 첫 편집에 복사**: 거절. 번역과 선언 기본값이 저장 언어·과거 코드에 고정된다. 명시적 편집만 override한다.
- **선언 변경에도 이전 snapshot 적용**: 거절. `basis`가 다르면 선언으로 돌아가고 저장값은 읽기만으로 고치지 않는다.

## 결과

- 기본 `false` 소비자는 새 컨트롤이 없고 저장된 묶음을 적용하지 않는다. 다른 열 설정 쓰기는 묶음을 보존하고 reset은 지운다. HW Time 원문 표와 dev-tools 예시만 켠다.
- 사용자 폭은 기존 폭 선언 묶음의 clip/pan 동작을 쓴다. 구성 열의 저장 폭은 보존해 묶음 폭을 해제하면 돌아온다. 폭 쓰기는 기존 열 폭과 같은 300 ms 지연을 쓴다.
- Saved Views의 저장·적용은 [ADR-0168](0168-saved-view-table-state.md)(#2492)이 추가한다. 사용자 열 설정의 snapshot을 메뉴 뷰에 담고 성공한 적용만 개인 설정에 쓴다.
