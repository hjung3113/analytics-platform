# 09. 설비관리 — 설비 마스터 목록/상세 요구사항·와이어프레임

상태: 설계 산출물. `.agents/skills/analysis-platform-wireframe/SKILL.md`의 설계 단계에서 종료한다. 프로토타입이나 시각 스타일 검증 결과가 아니다.

이 문서는 `06_platform_ui_contract.md` §9 "설비관리" 그룹의 첫 화면 — 설비 마스터 목록 + 상세 — 를 소유한다. App Shell(헤더·사이드바·Breadcrumb·전역 Context Bar)은 `07_app_shell_wireframe.md`의 범위이며 여기서 재정의하지 않는다. `PLATFORM_REQUIREMENTS.md` §2.1이 이 화면을 "첫 Consumer 후보"로 지정했다 — 계산 로직 없는 순수 CRUD+이력 화면이라 Kernel 계약(Menu Registry·Permission·Data Table·Detail Drawer·Audit)을 가장 적은 변수로 검증할 수 있다.

## 1. USER TASK

- 주 사용자: 공정/설비 엔지니어(조회 위주), 마스터데이터 관리자(속성 수정·사용중지/복원 권한 보유).
- 주 작업: 설비 목록에서 검색·필터로 대상을 좁히고, 행을 열어 속성·유효구간 이력·변경 감사를 확인한다. 관리자는 속성을 수정하거나 사용중지/복원을 실행한다.
- 분석 대상 객체: `equipment_id`로 식별되는 설비 마스터 레코드(Maker→Model→ChamberType→EquipmentID 분류 + room_name/StGroup 범위 + 유효구간 이력).
- 이 화면에서 내리는 결정: 어떤 설비를 볼지(검색/필터/딥링크), 무엇을 얼마나 신뢰할지(어떤 필드가 외부 동기화 값인지), 사용중지/복원 여부.
- 데이터 규모: 현재 Scope(Site 내 room_name 기준 단일 Scope, v1)에 속한 설비 수 — 정확한 볼륨은 Open(`PLATFORM_REQUIREMENTS.md` Open Questions 질문 4). 대량이면 서버 페이지네이션·가상화 필요(§27 성능 UX Baseline).
- 이용 빈도: 반복 조회·드릴다운 대상 화면(설비 상세는 다른 화면에서도 딥링크로 진입).
- Desktop-first(프로젝트 기본값).

## 2. IA / SCREEN INVENTORY

`06_platform_ui_contract.md` §9 "설비관리" 그룹의 첫 화면. Management archetype(§12.3)을 그대로 쓴다.

```
설비관리
├── 설비 마스터 목록                    [이 문서]
│   └── 행 클릭 → 설비 상세 Drawer       [같은 문서, §20 Drawer]
│       ├── 속성 탭
│       ├── 유효구간 타임라인 탭        [EquipmentValidityTimeline, `06` §13 Domain Component 예시]
│       └── Audit 탭                    [AuditTimeline, `06` §13 Platform Component]
└── (다른 화면에서 유입) equipment_id 딥링크 → 목록을 거치지 않고 바로 상세 Drawer 오픈 가능
```

다른 메뉴(생산성 분석의 occurrence 상세 등)에서 `equipment_id`로 들어오는 딥링크는 목적지 객체 ID이지 분석 Context가 아니다(`06` §6.1). 이 화면은 그 ID로 상세만 열며, 목록의 검색/필터 상태를 그 딥링크가 조용히 바꾸지 않는다. ID가 출발 선택 밖이어도 분석 복귀 시 진입 전 Context를 그대로 복원하며 Selection을 확장하거나 교체하지 않는다(`06` §6.4).

## 3. SCREEN SPECIFICATION

### 3.1 목록

| 항목 | 내용 |
| --- | --- |
| Purpose | 현재 Scope의 설비 마스터를 검색·필터로 좁혀 조회 |
| Primary task | 검색/필터 → 행 선택 → 상세 확인 |
| Input | 검색어(`equipment_id`), Global room_name·Equipment Group(StGroup / 분임조 / Maker+Model 중 한 축)와 Page 상태 필터, 정렬, 컬럼 설정, 다중 선택 |
| Output | 필터링된 설비 목록, 선택 행 내보내기(CSV) |
| Primary action | 행 클릭 → 상세 Drawer |
| Secondary actions | 필터 초기화, 컬럼 설정, 내보내기. 플랫폼의 설비 등록·관리 소유 목표는 Decided([ADR-0003](adr/0003-equipment-master-platform-owned-target.md)); 신규 등록 UI의 필수값·전환 절차는 Open |
| Navigation | 사이드바 "설비관리" 그룹의 대표 목적지(`08` §4/§8 Decided에 따른 그룹 클릭 목적지) |
| Data requirements | §6 참조 |
| Empty state | 성공한 조회의 0건은 `No matching result`(`06` §19). 접근 가능한 Scope가 아니면 `You do not have access to this scope`(§17) — 서로 다른 문구 |
| Loading state | 테이블 영역 스켈레톤. 기존 결과가 있는 상태에서 필터만 바뀌면 §19 `Refreshing same context`를 그 결과 위에 표시(이전 필터 결과를 새 필터 결과처럼 보여주지 않음) |
| Error state | `Server error`/`timeout`/`too_large`는 `06` §19 taxonomy를 따르고 Correlation ID를 포함한다. 대량 조회는 취소·기간/범위 축소 경로를 제공한다(§27) |

### 3.2 상세 Drawer

| 항목 | 내용 |
| --- | --- |
| Purpose | 설비 한 대의 속성·유효구간 이력·변경 감사를 한 곳에서 확인 |
| Primary task | 속성 확인(관리자는 수정), 유효구간 이력 확인, 변경 이력 확인 |
| Input | (관리자) 속성 편집 필드, 사용중지/복원 액션 |
| Output | 저장된 속성 변경(Audit 기록 생성), 사용중지/복원 상태 변경 |
| Primary action | 속성 저장(관리자), 탭 전환(조회자) |
| Secondary actions | 사용중지/복원(확인 필요, `06` §20 Modal), Drawer 닫기(목록 필터 유지) |
| Navigation | 목록 행 클릭, 또는 다른 화면의 `equipment_id` 딥링크로 직접 진입 |
| Data requirements | §6 참조 |
| Empty state | 유효구간 이력이 없을 수 없음(등록 시점 레코드가 항상 있음) — 해당 없음. Audit 탭은 변경 이력 없음 상태를 별도 안내 |
| Loading state | 탭별 독립 스켈레톤(속성/타임라인/Audit 각각 다른 조회) |
| Error state | 탭별 조회 실패는 그 탭만 오류 표시(다른 탭은 정상), 저장 실패는 Toast + 낙관적 갱신 금지 |

## 4. WIREFRAME (Candidate)

`07` §4 셸 프레임의 content slot을 아래로 채운다. Management archetype(§12.3: Page Header / Search+Filter / Data Table / Selection Actions / Detail Drawer / History-Audit) 순서를 그대로 따른다.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ (07 셸: 헤더/사이드바 — 이 문서에서 재정의하지 않음)                  │
├───────────────┬─────────────────────────────────────────────────────┤
│               │ 설비관리 > 설비 마스터                                │ ← Breadcrumb, 07 소유
│               ├─────────────────────────────────────────────────────┤
│               │ 전역 Context [기간: △ 참조만] [Equipment: O 목록 필터]   │ ← 07 소유, §6 선언 소비
│               │ (Lot·Metric Version 등 미지원 Context는 보존·미적용 표시)     │
│               ├─────────────────────────────────────────────────────┤
│               │ Global [room_name ▾] [그룹 축: StGroup/분임조/Maker+Model ▾] │
│               │ [조건 ▾] [명시 선택 EquipmentID 목록]                  │
│               │ Page [🔍 EquipmentID 검색] [상태 ▾] [필터 초기화]      │
│               ├─────────────────────────────────────────────────────┤
│               │ ☐ │EquipmentID│Maker│Model│room_name│StGroup│상태│유효시작│ │
│               │ ☐ │EQ-0231    │AAA  │M100 │ETCH   │G-1    │●사용중│2024-03│ │
│               │ ☐ │EQ-0232    │AAA  │M100 │ETCH   │G-1    │●사용중│2024-03│ │
│               │ ☐ │EQ-0240    │BBB  │M210 │CVD    │G-2    │○사용중지│2023-11│ │
│               │  … (서버 페이지네이션/가상화, §27)                     │
│               ├─────────────────────────────────────────────────────┤
│               │ 선택 2건  [내보내기(CSV)]                              │ ← Selection Actions
└───────────────┴─────────────────────────────────────────────────────┘

행 클릭 시 오른쪽에서 Drawer 오픈(목록은 배경에 남고 필터 상태 유지):

┌─────────────────────────────────────────┐
│ EQ-0231                          [✕]     │
│ AAA · M100 · ETCH · G-1 · ●사용중         │
├───────────────────────────────────────────┤
│ [속성] [유효구간 타임라인] [Audit]         │ ← 탭
├───────────────────────────────────────────┤
│ (속성 탭)                                  │
│ Maker      AAA          🔗 외부 동기화     │ ← 필드별 출처 표시, Candidate·Open
│ Model      M100          🔗 외부 동기화     │
│ room_name    ETCH          🔗 외부 동기화     │
│ StGroup    G-1            🔗 외부 동기화     │
│ 비고       (자유 입력)     ✎ 플랫폼 관리     │
│                                             │
│ [사용중지]                    [저장]        │ ← 사용중지는 확인 Modal(§20)
└───────────────────────────────────────────┘
```

- 전역 Context 행은 이 화면이 선언한 지원 여부(`06` §6 예시 표: Equipment Master = Time △ / Equipment O / Lot X / Metric Version X)를 그대로 보여주는 것이며, 이 문서가 새로 정의하지 않는다.
- room_name과 Equipment Group은 **Global Context**다. 그룹 조건은 StGroup / 분임조 / Maker+Model 중 한 축을 배타적으로 고르고 현재 결과를 조회한다. 그 결과에서 분석 대상으로 명시 선택한 설비는 `selectedEquipmentIds`에 고정한다(`equipmentIds`와 같은 ID 집합 개념, `06` §6.1/§6.4). 검색·상태만 Page Filter다. CSV용 행 체크와 분석 대상 선택은 사용 목적을 구분하며, 단순 상세 열기로 전역 Selection을 바꾸지 않는다.
- 필드별 "출처 표시"(외부 동기화 🔗 vs 플랫폼 관리 ✎)는 **이 문서의 Candidate 패턴이며 Open이다** — StGroup·분임조 소속의 외부 공급은 확정됐다. 그 외 미배정 필드가 외부 마스터 동기화 대상인지 플랫폼 직접관리인지는 `01_architecture_and_data_contract.md`가 아직 Phase 0로 미룬 결정이다(§6 참조). 와이어프레임은 그 구분이 **존재해야 한다**는 것만 보여주며, StGroup·분임조 이외의 미배정 필드 소유권을 확정하지 않는다.

## 5. CONCEPTUAL COMPONENT MAP

| 영역 | 책임 |
| --- | --- |
| 검색+필터 툴바 | Page Filter 입력(EquipmentID 검색/상태), 필터 초기화. room_name·Equipment Group은 셸 Global Context 선택기를 소비 |
| 데이터 테이블 | `PlatformDataTable`(`06` §13/§15) — server-side sort/filter, 가상화, 컬럼 설정, 다중 선택, 내보내기 진입점. 컬럼 정의·셀 의미·행 액션은 이 화면(Domain)이 소유 |
| 선택 액션 바 | 선택 행 수 표시, 내보내기(CSV). 일괄 사용중지 등 다른 일괄 액션은 Open(§8) |
| 상세 Drawer | `DetailDrawer`(`06` §13 Platform Component) — 탭 전환, Context 유지, 닫기 시 목록 필터 보존 |
| 유효구간 타임라인 | `EquipmentValidityTimeline`(`06` §13 Domain Component 예시로 명시된 컴포넌트) — 등록부터 현재까지 속성 유효구간을 시각화. "사용중지"는 물리 삭제가 아니라 구간 종료(`valid_to`)로 표현(`02_domain_menus.md` 설비관리 항목) |
| Audit 탭 | `AuditTimeline`(`06` §13 Platform Component) — who/when/before-after. 유효구간 이력과 별개 기능(언제 바뀌었는지 계산 vs 누가 바꿨는지 기록, `02_domain_menus.md`) |

React 컴포넌트 이름이나 API 선언이 아니다. Platform/Domain 경계는 `06` §13/§14를 따른다.

## 6. DATA REQUIREMENTS

- **식별자**: 목록·상세의 설비 키는 `equipment_id` 하나이며 모든 Site에서 유일하다. Site는 활성 Scope에서 이미 확립돼 있어야 하고 ID로 DB를 역조회하지 않는다([ADR-0004](adr/0004-site-is-db-partition-not-column.md)). 상세 목적지 `equipment_id`와 목록의 `equipmentIds`/`selectedEquipmentIds`는 같은 식별자를 단일/집합으로 쓰며, 상세 열기에 occurrence anchor는 필요 없다.
- **전역 Context 지원 선언**: `06` §6의 Equipment O는 설비 목록 필터의 적용을 뜻하며 상세 목적지 ID와는 역할을 구분한다. Time `△`(참조), Lot/Metric Version `X`. room_name과 Equipment Group의 Condition/Selection은 목록에 적용하고 상세에서는 출발 Context로 보존하는 선언이다. PPID/Recipe 등 미지원 값도 보존·미적용 표시한다. Scope는 항상 적용·재검증된다.
- **Scope 필터링**: 목록은 현재 요청 `scopeId`(Site 내 room_name 기준 단일 Scope, v1)에 속한 설비만 반환한다. Scope 선택지 조회와 데이터 조회는 구분한다(`06` §6.2).
- **Page Filter 상태**: 검색어·상태는 page-owned이며 URL 등록 세부는 Open이다. room_name(`roomNames`)·Equipment Group Condition(`equipmentGroup`)·Selection(`selectedEquipmentIds`, 기존 `equipmentIds` 대응)은 `06` §6.1의 전역 키 후보를 소비한다. 조건 축을 조합하거나 별도 page-owned 그룹 키를 만들지 않는다.
- **room_name/StGroup의 성격 차이**: room_name은 보통 등록 후 유지되지만 드물게 바뀔 수 있고 같은 EquipmentID를 유지한다. EquipmentName 변경이 다른 설비로 취급하는 재등록 기준이다. StGroup·분임조 소속은 외부 공급값이며 StGroup v1 조회는 현재 소속 기준이다. 현재 소속을 유효구간 타임라인의 과거 값으로 투영하지 않는다([CONTEXT](../CONTEXT.md)).
- **필드 원천 소유권(Decided/Open)**: As-Is 설비 마스터는 외부/사내 DB에 존재하며 로그에서 발견하는 속성이 아니다. To-Be는 플랫폼의 설비 등록·관리 소유이며 필드별 전환 순서·동기화/수동 수정 경계는 Open이다([ADR-0003](adr/0003-equipment-master-platform-owned-target.md)). StGroup·분임조 소속은 외부 시스템에서 공급받아 소비하며 플랫폼 직접 편집 대상으로 표시하지 않는다. 나머지 속성의 편집 가능성·출처 배지는 실제 소유권에 따라 결정한다.
- **사용중지/복원**: 물리 삭제가 아니라 유효기간 종료(`valid_to`)로 이력을 보존한다(`02_domain_menus.md`). EquipmentName 변경에 따른 새 ID 재등록과 기존 ID의 `valid_to` 종료·사용중지는 하나의 전환 동작이며 기존 ID는 이후 다른 용도로 재사용하지 않는다. 이 재등록으로 종료된 ID에는 복원을 적용하지 않는다. 일반 사용중지의 복원 허용 조건은 Open이다. room_name 변경은 이 동작의 사유가 아니다. 사용중지 액션은 확인 없이 즉시 실행하지 않는다(`06` §20 Modal 용도: Confirmation).
- **Audit**: who/when/before-after를 유효구간 이력과 별개로 기록한다(`02_domain_menus.md`, `06` §4 "변경 감사(Audit Trail) 공통 기반").

## 7. INTERACTION RULES

| 규칙 | 근거 |
| --- | --- |
| Scope에 접근 불가하면 목록 전체를 `You do not have access to this scope`로 표시하고, 성공한 조회의 0건과 다른 문구를 쓴다 | `06` §17 |
| 필터 변경 중에는 이전 필터의 결과를 새 필터의 결과처럼 보여주지 않는다. 동일 필터 재조회는 기존 결과 위에 `Refreshing` 표시 가능 | `06` §19 |
| 다른 화면에서 `equipment_id` 딥링크로 들어오면 목록 검색/필터를 조용히 바꾸지 않고 상세 Drawer만 연다 | `06` §6.1 목적지 ID와 분석 Context 분리 |
| Drawer를 닫아도 목록의 검색/필터/선택 상태는 유지된다 | `06` §20 Drawer 용도("Context를 유지한 조회") |
| 사용중지/복원은 확인 Modal을 거치며, 실행 후에도 레코드는 삭제되지 않고 유효구간으로 이력을 보존한다. EquipmentName 변경 재등록으로 종료된 기존 ID는 복원·재사용하지 않는다 | `02_domain_menus.md`, `06` §20 |
| 속성 저장 실패는 Toast로 표시하고, 저장 전 화면을 낙관적으로 먼저 바꾸지 않는다 | `06` §19 상태 규칙과 동일 원칙 |
| 대량 조회는 브라우저에 전체 데이터를 보내지 않고 서버 페이지네이션/가상화를 쓴다. 장기 조회는 취소·범위 축소 경로를 제공한다 | `06` §15/§27 |
| 권한 없는 사용자에게는 속성 편집 필드·사용중지/복원 버튼을 노출하지 않는다(서버 재검증 없이 클라이언트 숨김만으로 끝내지 않음) | `06` §17 |
| 필드 출처 표시(🔗 외부 동기화 vs ✎ 플랫폼 관리)에서 StGroup·분임조 소속은 확정된 외부 공급으로 표시한다. 그 외 미배정 필드는 두 값을 가정한 예시이며 임의로 소유권을 확정하지 않는다 | `01_architecture_and_data_contract.md`, 이 문서 §6 |

## 8. DESIGN DECISIONS / OPEN QUESTIONS

| 상태 | 결정/질문 | 소유자 |
| --- | --- | --- |
| Decided | Management archetype(Page Header/Search+Filter/Data Table/Selection Actions/Detail Drawer/History-Audit) 사용 | `06` §12.3 |
| Decided | 목록·상세 조인 키는 `equipment_id` 하나 | `06` §6.1, `02_domain_menus.md` |
| Decided | 사용중지는 물리 삭제가 아니라 유효기간 종료 | `02_domain_menus.md` |
| Decided | 전역 Context 지원: Time △ / Equipment O / Lot X / Metric Version X | `06` §6 예시 표 |
| Decided | room_name은 드물게 변경 가능·ID 유지, EquipmentName 변경 시 재등록·기존 ID 종료. StGroup은 현재 외부 소속 사용 | `CONTEXT.md` |
| Candidate(이 문서) | 검색+필터 툴바 구성, 테이블 컬럼 셋, Drawer 3탭(속성/유효구간/Audit) 구성 | 이 문서 |
| Candidate(이 문서) | 필드별 출처 배지(🔗/✎) UI 패턴 — 메커니즘은 제안이지만 실제 필드 배정은 아님 | 이 문서 |
| Open | StGroup·분임조 소속을 제외한 미배정 필드별 원천 소유자 배정 | `01_architecture_and_data_contract.md` Phase 0 |
| Open | Page 검색/상태를 URL에 반영할지, 어떤 page-owned 키로 등록할지 | 이 문서 — `06` §6.1 URL 소유 목록에 아직 없음 |
| Open | 설비 등록 UI의 필수 필드·외부 마스터에서의 전환 절차 | 이 문서 |
| Open | 일괄 사용중지 등 다중 선택 기반의 상태 변경 액션 지원 여부(현재는 내보내기만 다중 선택 액션으로 둠) | 이 문서 |
| Open | 데이터 볼륨·최대 조회량·timeout 구체 숫자 | `PLATFORM_REQUIREMENTS.md` Open Questions 질문 4 |

## 9. UX REVIEW (문서 단계)

- 밀도: 표는 exact value가 중요한 목록이라 카드가 아니라 테이블을 썼다(`wireframe-rules.md` "Tables when exact values matter"). 상세는 Drawer로 열어 목록 Context를 잃지 않는다(master-detail 투자 원칙).
- 숨은 Context 없음: room_name·Equipment Group은 Global, 검색/상태는 Page Filter로 명시하고 전역 Context와 시각적으로 분리했다(`06` §6 4층 분리).
- Traceability: 상세 Drawer의 Audit 탭과 유효구간 타임라인이 "지금 보이는 상태가 왜 이런지"를 항상 원본 이벤트까지 추적 가능하게 한다.
- 접근성: 사용중지/복원처럼 되돌리기 어려운 액션은 Modal 확인을 거치고(§20), 필드 출처 표시는 색만이 아니라 아이콘+텍스트 라벨을 함께 쓴다(`06` §26 색 외 구분).

## OPEN QUESTIONS / RISKS

- 필드 원천 소유권이 Open인 채로 속성 편집 UI를 먼저 만들면, 외부 동기화가 플랫폼의 수동 수정을 덮어쓰는 사고가 실제로 재현될 수 있다 — `01_architecture_and_data_contract.md`의 Phase 0 결정이 이 화면의 편집 기능 착수 전 선행 조건이다.
- 검색/상태의 page-owned URL 반영 여부가 Open이라, 목록 조건을 공유 링크로 재현할 수 있는지가 구현마다 달라질 수 있다.
- 데이터 볼륨이 아직 Open이라 서버 페이지네이션 방식(offset vs cursor)이나 가상화 임계치를 이 문서가 확정하지 않는다.
- StGroup이 "현재 소속만" 반영하므로, 유효구간 타임라인에서 과거 구간을 보다가 현재 StGroup 값을 그 시점 값으로 착각하지 않도록 UI에서 구분 표시가 필요하다 — 이 문서의 와이어프레임은 아직 그 구분을 구체화하지 않았다.
