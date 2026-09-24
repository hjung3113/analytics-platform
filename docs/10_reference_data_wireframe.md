# 10. 기준정보관리 — 마스터 데이터 목록 요구사항·와이어프레임

상태: 설계 산출물. `.agents/skills/analysis-platform-wireframe/SKILL.md`의 설계 단계에서 종료한다. 프로토타입이나 시각 스타일 검증 결과가 아니다. 공통 계약은 [06](06_platform_ui_contract.md), 도메인 범위는 [02](02_domain_menus.md)의 기준정보관리 행, 용어는 [CONTEXT](../CONTEXT.md)를 따른다. [09](09_equipment_master_wireframe.md)의 섹션 구조와 Management 패턴을 재사용하되 설비 객체·유효구간 정책은 복사하지 않는다.

## 1. USER TASK

- 주 사용자(Candidate): 공정 엔지니어와 기준정보 관리자. 유형별 레코드를 찾아 값과 출처를 확인하고, 권한과 원천 소유권이 허용하는 항목을 등록·수정·삭제한다.
- 주 작업: 공정/레시피/자재 선택 → 검색 → 상세 확인 → 허용 필드 편집 → 변경 감사 확인.
- 대상: 공정 room_name(Operation과 별개), 레시피 Recipe(`prc_name`), 자재의 기준정보. 자재의 정확한 도메인 용어·필드명·식별키는 원문에 없으며 Open이다.
- 판단: 현재 유형과 레코드가 맞는가, 각 필드의 원천은 어디인가, 플랫폼에서 바꿀 수 있는가. 유형 전체를 한 소유자로 단정하지 않는다.
- 규모·빈도: 반복 관리 업무를 가정하되 실제 유형별 건수와 이용 빈도는 Open. Desktop-first, 서버 조회·가상화 기준은 [06](06_platform_ui_contract.md) §15/§25/§27.

## 2. IA / SCREEN INVENTORY

[06](06_platform_ui_contract.md) §9 기준정보관리 그룹의 Consumer. **Management**(§12.3)를 선택한다. 아래 배치는 이 문서의 Candidate이며 새 archetype이 아니다.

```text
기준정보관리
└── 마스터 데이터 목록
    ├── 공정 / 레시피 / 자재 유형 탭 (동시에 한 유형의 목록만 표시)
    └── 해당 유형의 레코드 상세 Drawer
        ├── 속성 (등록/편집도 같은 표면 사용)
        └── Audit (who / when / before-after)
```

[07](07_app_shell_wireframe.md) §2의 “[엔티티별] 마스터 목록”을 유형별 조회·컬럼·폼으로 유지하면서 한 content slot 안에서 전환한다. 탭을 셸의 새 최상위 메뉴로 만들지 않는다. 유형별 카드/테이블 세 개를 동시에 늘어놓지 않아 §24 Card Soup를 피하고, 셸에 공정/레시피 분기를 넣지 않아 Domain Leakage를 피한다. 공통으로 재사용할 것은 Table/Drawer/Audit다. 유형 스키마 편집기·동적 플러그인·범용 엔티티 프레임워크는 만들지 않는다(§14/§24 Premature Platformization).

## 3. SCREEN SPECIFICATION

### 3.1 목록

| 항목 | 내용 |
| --- | --- |
| Purpose | 요청 Scope에서 접근 가능한, 선택한 한 유형의 기준정보 조회 |
| Primary task | 유형 선택 → 검색/관리 출처 필터 → 상세 보기 |
| Input | 유형 탭, 해당 유형의 식별값/명칭 검색, 필드 관리 출처 필터, 정렬·컬럼 설정·다중 선택 |
| Output | 유형별 목록, 현재 선택 내보내기(CSV, Candidate) |
| Primary action | 상세 보기; 쓰기 권한·등록 정책이 확인된 유형에서는 Page action “등록” |
| Secondary actions | 검색/필터 초기화, 컬럼 설정, 선택 내보내기 |
| Navigation | 레지스트리 대표 목적지. 초기 유형 선택 규칙은 Open; mockup은 공정이 선택된 예시 |
| Data requirements | §6; 유형별 키/스키마를 동일하다고 가정하지 않음 |
| Empty state | 성공 0건은 No matching result. 권한 제한·Scope 미선택·유형 모델 미정은 각각 별도 안내 |
| Loading state | 최초 목록 skeleton. 유형/필터가 바뀌면 이전 결과 숨김; 동일 조회만 Refreshing 허용 |
| Error state | 조회 오류와 Correlation ID, 재시도. timeout/too_large에는 취소·검색/Scope 범위 축소. 기간 미지원 화면에 기간 축소를 요구하지 않음 |

### 3.2 상세 Drawer

| 항목 | 내용 |
| --- | --- |
| Purpose | 레코드 값·필드 원천·수정 가능 여부와 변경 감사 확인 |
| Primary task | 허용된 필드 편집·저장, Audit 조회 |
| Input | 검증된 목적지 식별자, 유형별 폼. 등록 시에는 해당 유형의 생성 정책·필수 필드 |
| Output | 서버가 확인한 생성/수정/삭제 결과 및 Audit. 외부 MES 값을 플랫폼에서 덮어쓰지 않음 |
| Primary action | 저장(수정/생성 권한과 소유권 확인 후) |
| Secondary actions | 닫기/취소, 삭제 요청 후 확인 Modal. 삭제 의미·참조 무결성 정책 확정 전에는 실행 불가 |
| Navigation | 행의 상세 버튼/키보드로 열기; 목적지 링크도 가능하도록 설계하되 정확한 키/경로는 Open |
| Data requirements | §6의 유형별 식별, 필드별 출처·편집 가능성, Audit |
| Empty state | Audit 성공 0건은 “변경 이력 없음”. 상세 대상 없음은 목록 0건과 별도; 권한 오류는 서버 판정대로 표시 |
| Loading state | 속성/Audit 각 조회를 독립 처리 |
| Error state | 실패한 탭만 재시도. 저장 실패는 입력 유지+인라인 오류/Toast; 확인된 저장 결과 없이 성공 처리하지 않음(Candidate) |

## 4. WIREFRAME (Candidate)

[07](07_app_shell_wireframe.md) §4 셸 배치를 그대로 유지한다(별도 고해상도 목업은 08/09가 이미 확립한 셸 시각 스타일을 재사용). **Step 2는 1440×900 두 artboard**(전체 root 1440×1824, 간격 24px): A 목록, B 동일 목록 위 속성 Drawer. 표본 데이터·출처 배정·권한은 전부 예시이며 실제 연동 결과가 아니다.

```text
A — 목록
┌─ 54px 공통 헤더: Logo / Scope: Site A / 메뉴 검색 / 사용자 ─────────┐
│ 270px 공통 Sidebar │ 기준정보관리 > 마스터 데이터                  │
│ 기준정보관리 활성  │ 마스터 데이터                         [등록] │
│                    │ 공정·레시피·자재의 기준정보와 필드 출처 확인   │
│                    │ 전달 Context: Equipment EQP-013 · 미적용      │
│                    │ Candidate · 예시 데이터 / 필드 소유권 미확정 │
│                    │ [공정] [레시피] [자재]                        │
│                    │ 공정 · room_name                              │
│                    │ [공정 검색] [관리 출처: 전체] [초기화] [컬럼] │
│                    │ ☐ 공정(room_name) │ 필드 관리 출처 │ 작업     │
│                    │ ☑ ETCH            │ 혼합 · 예시    │ 상세     │
│                    │ ☑ CVD             │ 외부 · 예시    │ 상세     │
│                    │ ☐ CMP             │ 플랫폼 · 예시  │ 상세     │
│                    │ ☐ DIFF            │ 미확인         │ 상세     │
│                    │ ☐ PHOTO           │ 외부 · 예시    │ 상세     │
│                    │ ☐ CLEAN           │ 혼합 · 예시    │ 상세     │
│                    │ 선택 2건                         [내보내기]  │
│                    │ 6건 · 예시 / 모든 예시 행 표시               │
│                    │ Source: 미확인 · Updated: 미확인             │
└───────────────────────────────────────────────────────────────────┘

B — A의 목록 조건/선택 유지 + 우측 480px 상세 Drawer
┌─────────────────────────────────────────────────────┐
│ 공정 · ETCH                                [닫기]   │
│ Candidate · 필드 배정은 예시입니다                   │
│ [속성] [Audit]                                      │
│ 공정 (room_name)                  [외부 동기화 · 예시]│
│ ETCH (읽기 전용)                                    │
│ 외부 관리 필드는 여기서 수정할 수 없습니다           │
│ 설명 (추가 필드 후보)              [플랫폼 관리 · 예시]│
│ 식각 공정 구역 (편집 입력)                          │
│ room_name은 드물게 변경되며 ID는 유지됩니다.                   │
│ 이 편집은 설비의 공정 재배정이 아닙니다.             │
│ [삭제: 정책 미확정]                                 │
│ 참조 관계·삭제 방식 확정 후 실행 가능                │
│                              [취소] [저장]          │
└─────────────────────────────────────────────────────┘
```

A의 등록 버튼은 유형별 생성 모델 미확정 상태를 이유 텍스트와 함께 비활성으로 그린다. 이는 모델이 결정된 제품의 영구 제한이 아니다. B의 저장은 **해당 설명 필드가 플랫폼 소유이며 사용자에게 수정 권한이 확인된 경우**를 가정한 예시다. 원천 미확인 필드는 읽기 전용 Candidate로 처리한다. 필드 소유권 설정 UI는 추가하지 않는다.

유형별 대체 상태의 동일 영역 규격(Candidate):

| 영역 | 공정 | 레시피 | 자재 |
| --- | --- | --- | --- |
| 유형 설명 | room_name · 공정 구역 | Recipe(`prc_name`) · PRC 단계의 Recipe 값 | 자재 · 용어/식별키 미확정 |
| 도메인 컬럼 | 공정(`room_name`) | 레시피(`prc_name`) | 식별값/명칭(표시 개념 후보; DB/API 필드명 아님) |
| 검색 | 공정 검색 | 레시피 검색 | 자재 검색(실제 대상 필드는 Open) |
| 공통 후속 컬럼 | 필드 관리 출처 요약, 상세 | 동일 | 동일 |
| 모델 미확정 안내 | 공정 마스터 키/등록·삭제 정책 미확정 | PRC 단계의 Recipe 값과 마스터의 연결 계약 미확정 | 자재 모델·원천 미확정 |

모델 미정은 “0건”으로 표현하지 않는다. 유형 모델이 확정되지 않은 구현 단계에서는 해당 조회/쓰기 대신 미정 안내를 표시한다. mockup은 공정 목록이 공급된 가상의 검토 상태만 그린다. 등록 폼은 유형별 필수값/소유권 확정 후 같은 Drawer를 사용하며, 상세 키를 사용자 입력 필드와 같다고 가정하지 않는다. Audit 탭은 who/when/대상 필드/before-after 목록과 독립 Empty/Error를 사용한다. **유효구간 탭·valid_from/valid_to·설비 사용중지/복원·KPI·차트는 배치하지 않는다.**

전달 Context는 셸이 보존·미적용 표시하며 위 예시는 Equipment 하나가 전달된 경우다. 다른 지원하지 않는 값이 전달되면 같은 공통 패턴으로 모두 표시한다. 검색/관리 출처 입력은 Page Filter로 배치하여 전역 Context chip과 구분한다. Source/Updated는 원천 메타데이터 미확인 예시이며 목록 6건이라는 사실로 동기화 정상·Coverage 100%를 주장하지 않는다.

## 5. CONCEPTUAL COMPONENT MAP

| 영역 | 계층 / 책임 |
| --- | --- |
| PageHeader/전역 Context/Scope | Kernel 슬롯 소비. 메뉴 선언으로 렌더링하며 셸 도메인 분기 없음 — [06](06_platform_ui_contract.md) §4–8 |
| 유형 Tabs·유형별 검색/컬럼/폼 | Domain. 세 유형의 명시적 정의만 유지, 범용 스키마 엔진 없음 — §13–14/§24 |
| PlatformDataTable/툴바/선택 바 | Platform의 interaction·선택·컬럼 선호; 업무 컬럼/출처 요약 의미는 Domain — §15 |
| DetailDrawer/확인 Modal | Platform의 표면·포커스·닫기; CRUD 검증과 필드별 편집 정책은 Domain — §20/§26 |
| 필드 출처 배지 | [09](09_equipment_master_wireframe.md) §4의 패턴 재사용 Candidate. 두 화면 반복은 확인했으나 독립 컴포넌트 추출 방식은 미확정 — §14 |
| AuditTimeline/DataTrustIndicator | Platform 표시 표준; 감사 데이터와 원천 판정은 서버 소유 — §13/§18–19, [02](02_domain_menus.md) 공통 기능 |

## 6. DATA REQUIREMENTS

각 항목의 Candidate는 이 문서의 제안이며 원본의 Decided와 구분한다.

- **유형별 객체 식별(Open)**: `room_name`과 Recipe `prc_name`은 확정 용어지만 유일키라고 쓰여 있지 않다. 자재는 필드명도 없다. 레코드 안정 키·중복 이름/Scope 내 유일성·타입 구분을 도메인 계약으로 정해야 한다. 서로 다른 유형에서 같은 문자열이 나와도 같은 객체로 합치지 않는다. occurrence의 `(equipmentId, entityType, anchor)`와 설비의 `equipment_id`를 이 메뉴 키로 재사용하지 않는다. 근거: [CONTEXT](../CONTEXT.md), [02](02_domain_menus.md) 기준정보관리, [06](06_platform_ui_contract.md) §6.1.
- **Context 선언(Candidate)**: `06` §6에 이 메뉴의 예시 행이 없으므로 다음을 제안한다. Time `X` / Equipment `X` / Lot `X` / Metric Version `X`; 추가로 Recipe(`recipeIds`)·PPID(`ppid`)·room_name·Equipment Group 두 층도 `X`. 현재 기준정보 목록을 분석 실행 조건으로 좁힐 근거가 없기 때문이다. Recipe 마스터 탭이라는 이유로 전역 `recipeIds`가 마스터 객체 ID가 되는 것은 아니다. Scope는 별도로 필수 적용. 미지원 Context는 보존·표시하고 지원 메뉴 복귀 시 재검증한다. 근거: [06](06_platform_ui_contract.md) §5/§6/§6.1/§6.4, [02](02_domain_menus.md) 기준정보관리.
- **Scope(Decided/Open)**: 단일 요청 `scopeId`와 매 요청 권한 검증을 소비한다. 부재는 선택 상태, 무단 값은 오류; Site→room_name 범위의 상속 및 유형별 레코드와 Scope의 귀속/공유 관계는 Open이다. Site 선택을 임의로 모든 room_name에 대한 접근 허용으로 해석하지 않는다. 근거: [06](06_platform_ui_contract.md) §6.2/§17, [ADR-0005](adr/0005-scope-room-name-line-independent.md). Equipment Group 필터를 이 화면에 새로 추가하지 않는다. 전달된 StGroup·분임조·Maker+Model의 Condition과 고정 Selection은 보존·미적용 표시한다. 향후 지원하면 축을 배타적으로 선택하는 동일 두 층 계약을 소비한다([ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md)).
- **목록·폼 데이터(Candidate/Open)**: 유형별 표시값, 안정 객체 참조, 필드별 원천 소유자/원천명/편집 가능성, 행별 출처 요약이 필요하다. 요약 “혼합”은 외부와 플랫폼 필드 공존, “미확인”은 배정 불완전/조회 불가를 뜻하는 후보 어휘다. 일부 원천이 불명확하면 순수 외부/플랫폼으로 단정하지 않는다. 상세 배지가 실제 판정 단위다. 설명은 mockup을 위한 추가 필드 후보이며 정식 컬럼이 아니다. 근거: [02](02_domain_menus.md) 기준정보관리, [01](01_architecture_and_data_contract.md) 「마스터 데이터 수정 권한의 원천」, [09](09_equipment_master_wireframe.md) §4.
- **room_name/Recipe 제약(Decided/Open)**: room_name은 보통 유지되지만 드물게 변경 가능하며 같은 EquipmentID를 유지한다. 새 EquipmentID 재등록 기준은 EquipmentName 변경이다. 마스터 설명 수정은 설비 재배정을 뜻하지 않는다. Recipe는 PRC 단계에 귀속되므로 설비 상세에 레시피를 귀속시키거나 PRC 실행의 `prc_name`을 이 CRUD가 소급 변경한다고 가정하지 않는다. 마스터와 실행값의 매핑·이름 변경·참조 정책은 Open. 근거: [CONTEXT](../CONTEXT.md), [02](02_domain_menus.md) 기준정보관리.
- **CRUD·소유권(Open/Candidate)**: 생성 필수값·외부 항목의 등록/삭제 책임·플랫폼 필드 수정 권한·참조된 항목 삭제 정책이 필요하다. 플랫폼 소유+쓰기 권한이 서버에서 확인된 필드만 편집하는 패턴을 제안한다. 삭제를 `valid_to` 종료나 사용중지로 치환하지 않으며 물리 삭제로도 확정하지 않는다. 근거: [02](02_domain_menus.md) 기준정보관리 CRUD, [01](01_architecture_and_data_contract.md) 「마스터 데이터 수정 권한의 원천」, [06](06_platform_ui_contract.md) §17/§20.
- **Page 상태·URL(Candidate/Open)**: 유형 탭은 page-owned URL 상태로 등록하는 후보. 상세 목적지는 유형과 안정 객체 참조로 구분하되 공개 이름·경로는 미정이다. 검색/출처 필터 URL 등록 여부도 Open; 미등록 키를 임의 API 조건으로 쓰지 않는다. 목적지 ID는 전역 분석 Context와 별개다. 근거: [06](06_platform_ui_contract.md) §5/§6.1/§6.4.
- **Audit(Decided)**: 생성·수정·삭제의 who/when/before-after를 기록한다. 유형/대상과 연결되어야 하며 유효구간 데이터가 없어도 감사는 필요하다. 구체 이벤트 API·시간대 표시는 Open; parser wall-clock을 감사 이벤트 시간이라고 추정하지 않는다. 근거: [02](02_domain_menus.md) 「변경 감사」, [06](06_platform_ui_contract.md) §13/§20.
- **Data Trust·상태(Decided/Open)**: 제공되는 원천·갱신시각을 공통 표준으로 표시한다. 원천 미확인 시 Unknown이며 동기화 성공으로 보정하지 않는다. 적용 assessment kind 목록과 실제 statusSource는 Open; 적용되지만 미구현인 kind는 unknown이고 의미 없는 분석 metric/coverage는 만들지 않는다. 근거: [06](06_platform_ui_contract.md) §18–19.
- **조회·갱신(Decided/Open)**: 서버 정렬/필터·반환량 제한·가상화·열 선호 저장을 소비한다. 폴링은 [01](01_architecture_and_data_contract.md#refresh-policy)의 300s 정책을 따르며 정지 조건은 Open. 유형별 볼륨/timeout은 [PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) Open Questions 4. 기준정보 CRUD가 mart 재계산을 일으키는 구체 의존관계는 미확정이므로 저장=모든 분석 갱신 완료라고 표시하지 않는다. `01`의 설비 소급 정정 트리거와 [지연완료 R/H](01_architecture_and_data_contract.md#late-arrival-policy)를 이 메뉴의 유효구간 정책으로 확대하지 않는다. 근거: [06](06_platform_ui_contract.md) §15/§27, [01](01_architecture_and_data_contract.md) 「mart 재계산 트리거」.

## 7. INTERACTION RULES

| 규칙 | 상태 / 근거 |
| --- | --- |
| 유형 전환 시 해당 유형만 조회하고 선택은 해제. 이전 유형 행/상세를 새 유형 결과처럼 표시하지 않음 | Candidate 적용안 — [06](06_platform_ui_contract.md) §11/§15/§19 |
| 유형/필터 변경은 새 조회, 동일 조건 재조회만 기존 결과+Refreshing 허용. Scope/권한 변경 시 이전 결과 숨김·재검증 | Decided 계약 소비 — `06` §6.2/§11/§19 |
| 검색·출처 필터는 page-local. 출처 필터는 필드 메타데이터 요약에 대한 조건이며 편집 권한을 부여하지 않음 | Candidate — `06` §6/§15/§17, [01](01_architecture_and_data_contract.md) 원천 소유권 |
| Drawer 닫기 시 같은 유형의 목록 조건·선택 유지. 분석 복귀는 상세 진입 전 Global Context를 그대로 복원하며 목적지 객체로 변경하지 않음. 편집 중 닫기/유형 이동은 변경 폐기 확인, 취소하면 편집 유지 | Candidate — `06` §20 Confirmation/Context 유지 |
| 미지원 Context와 공집합 표식은 URL에 보존하고 미적용 표시. 이 메뉴 목록을 강제 0건으로 만들지 않음 | Decided — `06` §6.1/§6.4 |
| 등록된 탭/목적지 링크는 back/forward로 복원 후 권한 검증. 미등록 검색조건·선택·미저장 입력의 복원을 보장하지 않음 | Decided 경계 + 등록 후보 — `06` §6.1/§6.4 |
| 외부 소유 필드는 읽기 전용. 미확인 소유권은 편집 차단·이유 표시. 확인된 플랫폼 필드만 쓰기 권한과 함께 편집 | Candidate 제어안 — [02](02_domain_menus.md) 기준정보관리, [01](01_architecture_and_data_contract.md) 원천 소유권, `06` §17 |
| 등록은 생성 정책 확인 후; 삭제는 참조·삭제 정책 검증과 확인 Modal 후. 정책 미정 예시에서는 실행 차단 | Candidate — `02` CRUD, `06` §17/§20. 설비 사용중지 정책 전용 금지 |
| 저장 실패는 입력 유지·실패 메시지. 성공 응답 후 목록/상세/Audit 재검증; 조회 갱신 실패와 쓰기 실패를 구분 | Candidate — `06` §19, `02` 변경 감사 |
| 조회 권한만 있으면 쓰기 액션 숨김, 원천 제한은 필드 옆 설명. 내보내기도 현재 Scope/선택/유형을 서버 재검증 | Candidate 표현 + Decided 권한 — `06` §15/§17 |
| 내보내기는 선택 행만, 일괄 삭제/일괄 수정은 제공하지 않는 Candidate. 선택 가능한 범위는 현재 로드된 행으로 명시 | Candidate — `06` §15 선택 모델; `02`의 CRUD만으로 일괄 작업을 확대하지 않음 |
| 키보드로 탭·상세·폼 조작, Drawer focus trap/Escape 및 트리거로 포커스 복귀. 의미 있는 색에 텍스트 동반 | §26 baseline; 포커스 복귀/Escape는 Candidate 상세 |

상태 검수: 성공 0건 → No matching result; 미수집/지연 원인은 근거 없으면 Unknown. 목록 오류 → 목록 재시도+Correlation ID. Audit 오류 → Audit만 오류. 모델 미정 → 미정 안내. 무단 Scope → Permission restricted. timeout/too_large → 취소·검색 범위 축소. 원본은 [06](06_platform_ui_contract.md) §17/§19/§27이며 위 UI 처방은 해당 계약을 적용한 Candidate다.

## 8. DESIGN DECISIONS / OPEN QUESTIONS

| 상태 | 결정/질문 | 근거·결정 주체 |
| --- | --- | --- |
| Decided 원문 | 기준정보 CRUD와 외부 MES/플랫폼 관리 구분 | [02](02_domain_menus.md) 기준정보관리 |
| Decided 원문 | 공정=room_name, Recipe=PRC 단계의 `prc_name` | [CONTEXT](../CONTEXT.md) |
| Candidate | Management, 하나의 content slot에 3유형 탭과 단일 표/Drawer | 이 문서; `06` §12.3/§24 |
| Candidate | Time/Equipment/Lot/Metric Version 및 Recipe/PPID/room_name/Equipment Group 두 층 Context X | 이 문서; `06` §6에는 해당 메뉴 행 없음 |
| Candidate | 출처 배지·관리 출처 요약/필터·설명 필드·선택 CSV | 이 문서, `09` 패턴 재사용 |
| Open | 유형별 안정 키/필수값/Scope 귀속, 자재 용어·원천 | 도메인 담당 지정 필요 |
| Open | 레시피 마스터와 PRC 실행값의 관계, 변경 전파/이름 변경 | 도메인·소비 데이터 담당 지정 필요 |
| Open | 공정 마스터 수정과 설비 room_name 변경의 참조 관계 | 도메인·소비 데이터 담당 지정 필요 |
| Open | 필드별 외부/플랫폼 소유자와 쓰기·생성·삭제 정책 | `01` 원천 소유권, REQUIREMENTS 질문 11; 담당 지정 필요 |
| Open | 타입 탭/상세/검색의 공개 URL 계약과 초기 선택 | Kernel/도메인 담당 지정 필요 |
| Open | 유효구간 요구의 존재 여부 | `01`/`02`는 설비 이력을 명시하지만 본 유형군에는 명시 없음; 현재 제외 |
| Open | CRUD와 mart 의존성·Trust statusSource/assessment·운영 수치 | 데이터/운영 담당 지정 필요 |
| Open | 마스터 필드 원천 소유권 설정 화면(이 목록의 출처 배지와는 별개인 전용 관리 화면) | [PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) §2.2 Must(정책)/Should(UI), Open Question 11; Deferred 아님 |
| Open | "공정/레시피/자재 **등**"(`02`)의 "등"이 가리키는 추가 유형 범위와 그 추가 방식 | `02`가 예시로 3유형만 들었을 뿐 목록을 닫지 않음 — 이 문서는 범위를 확정하지 않음 |
| Deferred | 저장된 뷰, 범용 엔티티 프레임워크(유형 스키마 편집기·플러그인) | `06` §14/§21/§24 |

## 9. UX REVIEW (문서 단계)

2026-09-24 인터뷰 반영 검수는 이 Markdown의 계약·용어·왕복 규칙을 대상으로 했다. 아래의 기존 HTML/Step 2 검증 기록은 수정 전 산출물의 이력이며, 이번 작업에서 HTML을 갱신하거나 다시 검증한 결과가 아니다.

- 1차 자기 검수 완료: `06`/`01`/`02`/`CONTEXT`와 대조했다. 기준정보 이름을 곧 유일키로 보지 않으며 room_name 변경 가능·ID 유지와 Recipe의 PRC 단계 귀속을 반영했다. `09`의 설비 이력·사용중지와 valid_to의 동치를 가져오지 않았다(설비의 동치 결정은 기준정보 유형의 삭제 의미를 정의하지 않음).
- 모든 §6 항목과 §7 규칙에 근거를 붙이고, 원문에 없는 배치·필드·정책 제안을 Candidate로 구분했다. 실제 필드 소유권과 Recipe 매핑, 자재 스키마는 Open으로 남겼다.
- 목록 1개와 Drawer로 고밀도 비교/관리 업무를 유지한다. 숫자 KPI, 카드 그리드, 타입 프레임워크가 없다. 유형 전환은 Domain이 소유하고 셸은 메뉴 선언만 소비한다.
- `DESIGN.md` 270px Sidebar/54px Header/32px 최소 행·헤더/4px 12px 셀 padding을 사용한다. 본문 13/18, 제목 24/32/600, 경계 중심·floating Drawer만 별도 표면. 색상만으로 출처를 구분하지 않는다.
- 반응형 구현 기준은 `06` §25 Candidate에 맞춰 1024–1439 Sidebar 축약, 좁은 화면은 조회/간단 관리 중심. 컬럼 숨김/수평 스크롤과 Drawer 폭 조절을 제안한다. 이 정적 1440px 산출물은 반응형·focus trap의 런타임 검증이 아니다.
- Step 1 문서 검수 후 Step 2를 작성한다. 정적 mockup은 §4 A/B만 그리며 API 연동·CRUD 실행·권한 검증 완료를 주장하지 않는다. 최종 compliance 승인은 후속 리뷰 소관이다.

## OPEN QUESTIONS / RISKS

- **Recipe 긴장**: `02`는 레시피 마스터 CRUD를 요구하지만 `CONTEXT`는 Recipe를 PRC 단계의 Recipe 값으로만 정의한다. 독립 마스터의 키·원천·PRC 실행값 참조/카디널리티·수정 영향은 미정이다. 이를 설비 속성이나 버전 관리 엔진으로 바꾸어 해결하지 않는다. 관계 결정 전 레시피 쓰기 계약은 확정할 수 없다.
- **유효구간 근거 부재**: `01`의 마스터 소급 정정은 설비 속성 문맥, `02`의 유효구간 명시는 설비관리 행에 있다. 공정/레시피/자재의 valid_from/valid_to 요구는 없다. 따라서 본 화면에는 Audit만 두고 유효구간 타임라인을 추가하지 않는다. 이후 도메인 요구가 확인되면 별도 검토한다.
- **소유권**: 외부 MES라는 항목 수준 설명만으로 모든 필드를 MES 전용으로 정하면 안 된다. 미배정 상태에서 쓰기를 허용하면 다음 동기화가 덮어쓸 수 있다. 담당자가 필드별 배정을 정할 때까지 출처 배지와 설명 필드는 예시다.
- **공정 참조 관계**: 마스터 명칭/삭제가 기존 설비의 `room_name` 변경을 유발하는지 불명확하다. 참조 무결성/이름 변경 정책을 정하기 전 이 화면이 설비를 재배정해서는 안 된다.
- **자재·삭제·Scope**: 자재 모델, 세 유형의 안정 식별, 공유/귀속, 참조 중 삭제의 보존 방식이 미정이다. 이 화면을 근거로 DB 스키마·물리 삭제·설비식 사용중지를 확정할 수 없다.
- **검증 한계**: 문서·정적 HTML 대조만 수행했으며 실제 서비스·브라우저 동작·외부 수용 상태의 증거가 아니다. 초안 작성 시 별도 CLI agent 의견은 사용하지 않았다(현재 자료로 독립 작성 가능했고 미결 도메인 결정을 외부 의견으로 대체할 이유가 없었음). 이후 Opus 5.5 컴플라이언스 리뷰(2026-09-24)를 거쳐 필드 소유권 설정 화면의 Deferred 오분류와 유형 목록("등")의 Open 누락 2건을 수정했다.
