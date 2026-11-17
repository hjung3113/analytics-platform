# 역할 단계는 늘리지 않고, 이름 있는 권한 묶음(권한 그룹)을 템플릿으로 둔다

상태: **Decided (2026-11-16)**
- 결정자: 소유자(2026-11-16, [#2407](https://github.com/hjung3113/analytics-platform/issues/2407)) — 결정 1·2·4. 결정 3은 추천안을 소유자가 확정했고 뒤집을 수 있다. 선택기 모양(결정 ⑤)은 시안 V1–V3를 보고 소유자가 고르며 이 ADR의 범위가 아니다.
- Scope: `permission_group` 모델, 부여·신청과의 관계, 개인 그룹, 부서 규칙. 관련: [ADR-0154](0154-site-and-room-grants-are-platform-owned.md), [ADR-0155](0155-categorized-permission-list-checkbox-rows.md), [#98](https://github.com/hjung3113/analytics-platform/issues/98), [#150](https://github.com/hjung3113/analytics-platform/issues/150). 구현은 [#2406](https://github.com/hjung3113/analytics-platform/issues/2406)(여러 권한 한 번에 부여·신청)이 먼저다.

## 맥락

- 사용자가 "역할을 추가해 달라"고 할 때 실제 요구는 자주 쓰는 권한 조합을 한 번에 받는 것이다. 역할 단계(Admin > Developer > User)는 인가의 위계이고, 네 번째 단계를 더하는 일은 표 칸 수정이 아니라 연결 작업이다([09](../product/features/09-permission-access.md)).
- 판정은 capability 행이 한다. 부여·회수·만료·세션 버전·누출 시험이 모두 그 행 기준이므로 묶음이 판정에 끼어들면 모든 시험을 다시 써야 한다.
- 같은 말 «그룹»이 이미 둘이다: 저장된 뷰를 나누는 사람 묶음(공유 그룹)과 조회 대상 묶음(커스텀 조회 그룹). 권한 묶음에 그냥 «그룹»을 붙이면 셋이 섞인다.

## 결정

### 1. 역할 단계는 늘리지 않는다

"역할 추가"는 **권한 그룹**으로 푼다. 권한 그룹은 이름 있는 capability 묶음이다. Role Level은 Admin·Developer·User로 유지한다.

### 2. 그룹은 템플릿이고 소급하지 않는다

- `permission_group`: 이름, 설명, capability 집합, 만든 사람, 종류(운영자 / 개인), 개인 권한 그룹의 공유 대상. 시스템·Site 범위는 담지 않고 신청·부여할 때 고른다(소유자 2026-11-17, #2408). 이유: 범위까지 담으면 같은 권한 묶음을 시스템마다 따로 만들어야 한다.
- 부여·승인 때 그룹을 capability 행 N개로 **펼쳐** `permission_grants`에 기록하고, 행의 `permission_group_id`는 출처를 알리는 열일 뿐이다. 판정·회수·만료·누출 시험은 지금처럼 capability 행만 본다.
- 그룹을 고쳐도 이미 받은 부여는 바뀌지 않는다. 바꾸려면 새로 부여하거나 회수한다. 이유: 그룹 수정이 소급되면 한 번의 편집이 많은 사람의 권한을 조용히 늘릴 수 있고, 회수·감사가 행 기준인 원칙이 깨진다.
- 펼침은 행마다 기존 규칙(민감 사유 필수, `workspace.admin`은 거버넌스 모드만, 세션 전용 규칙)을 다시 검증한다. 묶음 부여·신청 API는 #2406이 소유한다.

### 3. 개인 그룹은 신청 템플릿까지다

- 누구나 그룹을 만들고 공유하고 «이 그룹으로 신청»할 수 있다. **부여는 운영자(`workspace.admin`)만** 한다.
- 개인 그룹에는 민감 capability와 `workspace.admin`을 넣을 수 없다(`validation.failed`). 신청은 운영자의 승인을 거친다.

### 4. 부서 규칙은 자동 부여다

- 부서 규칙은 운영자 그룹만 연결한다. 일치하는 사람에게 승인 없이 부여한다.
- 민감·관리자 capability가 든 그룹은 연결할 수 없다. 감사 사건은 `rule_grant`다.
- 이유: 승인 없는 부여는 민감 권한에 열려서는 안 되므로 연결 시점에 막는다.

### 5. 용어

«권한 그룹»은 capability 묶음이다. 저장된 뷰를 함께 보는 사람 묶음인 **공유 그룹**, 조회 대상 묶음인 **커스텀 조회 그룹**과 다르다([GLOSSARY](../../GLOSSARY.md)).

## 다시 여는 조건

- 소유자가 개인 그룹의 부여를 열기를 원하면 결정 3을 뒤집는다(민감 제외 규칙은 유지 권장).
- 소유자가 그룹 수정을 기존 부여에 반영하기를 원하면 결정 2를 뒤집어야 하고, 그때는 회수·감사 시험을 그룹 기준으로 다시 쓴다.
- 역할 소속(Admin/Developer/User)을 IdP claim으로 받을지는 [#98](https://github.com/hjung3113/analytics-platform/issues/98)의 남은 질문이다.
