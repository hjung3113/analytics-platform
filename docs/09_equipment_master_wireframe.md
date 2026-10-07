# 09. 설비관리 — 설비 마스터 목록/상세 요구사항·와이어프레임

상태: 화면 계약 노트. 구현은 `menus/equipment`(조회 전용)이고 배치·시각은 구현과 [DESIGN](../DESIGN.md)이 기준이다. 이 문서는 아래 계약·소유 경계·결정 상태만 소유한다.

이 문서는 `06_platform_ui_contract.md` §9 "설비관리" 그룹의 첫 화면 — 설비 마스터 목록 + 상세 — 를 소유한다. App Shell(헤더·사이드바·Breadcrumb·전역 Context Bar)은 `07_app_shell_wireframe.md`의 범위이며 여기서 재정의하지 않는다. 이 화면은 첫 Consumer 후보다 — 계산 로직 없는 순수 CRUD+이력 화면이라 Kernel 계약(Menu Registry·Permission·Data Table·Detail Drawer·Audit)을 가장 적은 변수로 검증할 수 있다.

## 1. USER TASK

- 주 사용자: 공정/설비 엔지니어(조회 위주), 마스터데이터 관리자(속성 수정·사용중지/복원 권한 보유 — 쓰기는 §8의 소유권 결정 뒤).
- 주 작업: 설비 목록에서 검색·필터로 대상을 좁히고, 행을 열어 속성·유효구간 이력·변경 감사를 확인한다.
- 분석 대상 객체: `equipment_id`로 식별되는 설비 마스터 레코드(Maker→Model→ChamberType→EquipmentID 분류 + room_name/StGroup 범위 + 유효구간 이력).
- 이 화면에서 내리는 결정: 어떤 설비를 볼지(검색/필터/딥링크), 무엇을 얼마나 신뢰할지(어떤 필드가 외부 동기화 값인지).
- 데이터 규모: 현재 Scope(Site 내 room_name 기준 단일 Scope, v1)에 속한 설비 수 — 정확한 볼륨은 Open([열린 입력 질문 4](../.planning/inputs.md#q4)). 대량이면 서버 페이지네이션·가상화 필요(§27 성능 UX Baseline).
- 이용 빈도: 반복 조회·드릴다운 대상 화면(설비 상세는 다른 화면에서도 딥링크로 진입).
- Desktop-first(프로젝트 기본값).

## 2. IA / SCREEN INVENTORY

`06_platform_ui_contract.md` §9 "설비관리" 그룹의 첫 화면. Management archetype(§12.3)을 그대로 쓴다.

- 설비 마스터 목록 `/equipment`(그룹의 대표 목적지): 검색·필터 + `PlatformDataTable`. 행의 [보기]로 상세 Drawer를 연다(`focus` page key).
- 상세 Drawer: 속성 · 유효구간 이력 · Audit 3탭(`tab`). 헤더의 [전체 화면]으로 이동한다.
- 설비 상세 전체 화면 `/equipment/:equipmentId`(목록의 자식, 사이드바에 노출하지 않음): 같은 탭에 "관련 분석"이 더해지고 `returnTo`로 이전 화면에 복귀한다.
- 다른 화면에서 `equipment_id` 딥링크로 들어오면 목록을 거치지 않고 바로 상세 전체 화면이 열린다.

다른 메뉴(생산성 분석의 occurrence 상세 등)에서 `equipment_id`로 들어오는 딥링크는 목적지 객체 ID이지 분석 Context가 아니다(`06` §6.1). 이 화면은 그 ID로 상세만 열며, 목록의 검색/필터 상태를 그 딥링크가 조용히 바꾸지 않는다. ID가 출발 선택 밖이어도 분석 복귀 시 진입 전 Context를 그대로 복원하며 Selection을 확장하거나 교체하지 않는다(`06` §6.4). 상세의 "관련 분석" 링크만 명시적으로 Selection을 이 설비 한 대로 교체한다.

## 3. SCREEN SPECIFICATION

입력·상태(Empty/Loading/Error) 규칙은 §7과 `06` §17/§19/§27이 소유한다. 구현은 조회 전용이다 — 속성 편집과 사용중지/복원은 §8의 필드 소유권 결정 뒤에 같은 Drawer·전체 화면에 더한다.

## 4. LAYOUT BOUNDARY

배치는 구현(`menus/equipment/src/pages`)이 기준이고 Management archetype(§12.3: Page Header / Search+Filter / Data Table / Selection Actions / Detail Drawer / History-Audit) 순서를 따른다. 전역 Context 행은 이 화면이 선언한 지원 여부(§6)를 그대로 보여 주는 것이며 이 문서가 새로 정의하지 않는다.

- room_name과 Equipment Group은 **Global Context**다. 그룹 조건은 StGroup / 분임조 / Maker+Model 중 한 축을 배타적으로 고르고 현재 결과를 조회한다. 그 결과에서 분석 대상으로 명시 선택한 설비는 `selectedEquipmentIds`에 고정한다(`equipmentIds`와 같은 ID 집합 개념, `06` §6.1/§6.4). 검색·상태·제조사만 Page Filter다.
- CSV용 행 체크와 분석 대상 선택은 사용 목적을 구분하며, 단순 상세 열기로 전역 Selection을 바꾸지 않는다. 분석으로 보내는 동작("선택 설비로 분석", 상세의 "관련 분석")만 Selection을 명시적으로 교체한다.

## 5. CONCEPTUAL COMPONENT MAP

| 영역 | 책임 |
| --- | --- |
| 데이터 테이블 | `PlatformDataTable`(`06` §13/§15) — server-side sort/filter, 가상화, 컬럼 설정, 다중 선택, 내보내기 진입점. 컬럼 정의·셀 의미·행 액션은 이 화면(Domain)이 소유 |
| 상세 Drawer | `DetailDrawer`(`06` §13 Platform Component) — 탭 전환, Context 유지, 닫기 시 목록 필터 보존 |
| 유효구간 | 등록부터 현재까지 속성 유효구간 이력. "사용중지"는 물리 삭제가 아니라 구간 종료(`valid_to`)로 표현(`02_domain_menus.md` 설비관리 항목) |
| Audit 탭 | `AuditTimeline`(`06` §13 Platform Component) — who/when/before-after. 유효구간 이력과 별개 기능(언제 바뀌었는지 계산 vs 누가 바꿨는지 기록, `02_domain_menus.md`). 이벤트는 `entityAudit` 포트로 읽고 유효구간에서 만들어 내지 않는다(#50) |

React 컴포넌트 이름이나 API 선언이 아니다. Platform/Domain 경계는 `06` §13/§14를 따른다.

## 6. DATA REQUIREMENTS

- **식별자**: 목록·상세의 설비 키는 `equipment_id` 하나이며 모든 Site에서 유일하다. Site는 활성 Scope에서 이미 확립돼 있어야 하고 ID로 DB를 역조회하지 않는다([ADR-0004](adr/0004-site-is-db-partition-not-column.md)). 상세 목적지 `equipment_id`와 목록의 `equipmentIds`/`selectedEquipmentIds`는 같은 식별자를 단일/집합으로 쓰며, 상세 열기에 occurrence anchor는 필요 없다.
- **Context capability 선언(매니페스트 `menus/equipment`)**: 둘 다 `requiresScope: true`, `pageType: management`, 권한 `equipment:view`이다. 목록(`equipment-master`)은 Time `reference`, room_name·Equipment Group Condition·Selection `apply`, Lot·PPID·Recipe·metric `unsupported`다. 상세(`equipment-detail`)는 Time·room_name·Condition·Selection을 모두 `reference`로 두어 출발 Context를 보존만 하고 목적지 ID와 역할을 구분한다. Scope는 항상 적용·재검증된다.
- **page-owned 키(등록: `06` §6.1 page-key registration)**: 목록 `q`(검색어)·`status`·`maker`·`focus`(열린 Drawer의 설비 ID)·`sort`·`page`·`tab`. Global Context가 바뀌면 `page`를 지운다(`contextResetKeys`). 상세 전체 화면은 `tab`·`returnTo`. room_name(`roomNames`)·Equipment Group Condition(`equipmentGroup`)·Selection(`selectedEquipmentIds`, 기존 `equipmentIds` 대응)은 `06` §6.1의 전역 키를 소비한다. 조건 축을 조합하거나 별도 page-owned 그룹 키를 만들지 않는다. 정렬 허용 열은 데이터 필드뿐이며 미등록 값은 다른 값으로 바꾸지 않고 오류로 보인다.
- **Scope 필터링**: 목록은 현재 요청 `scopeId`(Site 내 room_name 기준 단일 Scope, v1)에 속한 설비만 반환한다. Scope 선택지 조회와 데이터 조회는 구분한다(`06` §6.2).
- **room_name/StGroup의 성격 차이**: room_name(PHOTO·ETCH 같은 공정명)은 보통 등록 후 유지되지만 드물게 바뀔 수 있고 같은 EquipmentID를 유지한다. 설비를 가리키는 키는 EquipmentID 하나이며 별도 설비명은 없다. StGroup·분임조 소속은 외부 공급값이며 StGroup v1 조회는 현재 소속 기준이다. 현재 소속을 유효구간의 과거 값으로 투영하지 않는다([CONTEXT](../CONTEXT.md)).
- **필드 원천 소유권(Decided/Open)**: As-Is 설비 마스터는 외부/사내 DB에 존재하며 로그에서 발견하는 속성이 아니다. To-Be는 플랫폼의 설비 등록·관리 소유이며 필드별 전환 순서·동기화/수동 수정 경계는 Open이다([ADR-0003](adr/0003-equipment-master-platform-owned-target.md), [01 마스터 데이터 수정 권한의 원천](01_architecture_and_data_contract.md#마스터-데이터-수정-권한의-원천)). StGroup·분임조 소속은 외부 시스템에서 공급받아 소비하며 플랫폼 직접 편집 대상으로 표시하지 않는다. 나머지 속성의 편집 가능성은 실제 소유권에 따라 결정하며, 소유권이 정해지기 전에는 쓰기를 열지 않는다.
- **사용중지/복원**: 물리 삭제가 아니라 유효기간 종료(`valid_to`)로 이력을 보존한다(`02_domain_menus.md`). 사용중지된 ID는 이후 다른 용도로 재사용하지 않는다. 복원 허용 조건은 Open이다. room_name 변경은 사용중지의 사유가 아니다. 사용중지 액션은 확인 없이 즉시 실행하지 않는다(`06` §20 Modal 용도: Confirmation).
- **설비 상태 값**: 구현은 `active`·`idle`·`maintenance`·`retired` 네 값을 쓴다. 이 값들의 도메인 의미와 소유자는 정해지지 않았다.
- **Audit**: who/when/before-after를 유효구간 이력과 별개로 기록한다(`02_domain_menus.md`, `06` §4 "변경 감사(Audit Trail) 공통 기반").

## 7. INTERACTION RULES

| 규칙 | 근거 |
| --- | --- |
| Scope에 접근 불가하면 목록 전체를 `You do not have access to this scope`로 표시하고, 성공한 조회의 0건과 다른 문구를 쓴다 | `06` §17 |
| 필터 변경 중에는 이전 필터의 결과를 새 필터의 결과처럼 보여주지 않는다. 동일 필터 재조회는 기존 결과 위에 `Refreshing` 표시 가능 | `06` §19 |
| 다른 화면에서 `equipment_id` 딥링크로 들어오면 목록 검색/필터를 조용히 바꾸지 않고 상세만 연다 | `06` §6.1 목적지 ID와 분석 Context 분리 |
| Drawer를 닫아도 목록의 검색/필터/선택 상태는 유지된다 | `06` §20 Drawer 용도("Context를 유지한 조회") |
| 사용중지/복원은 확인 Modal을 거치며, 실행 후에도 레코드는 삭제되지 않고 유효구간으로 이력을 보존한다. 사용중지된 ID는 재사용하지 않는다 | `02_domain_menus.md`, `06` §20 |
| 속성 저장 실패는 Toast로 표시하고, 저장 전 화면을 낙관적으로 먼저 바꾸지 않는다(쓰기 구현 시) | `06` §19 상태 규칙과 동일 원칙 |
| 대량 조회는 브라우저에 전체 데이터를 보내지 않고 서버 페이지네이션/가상화를 쓴다. 장기 조회는 취소·범위 축소 경로를 제공한다 | `06` §15/§27 |
| 권한 없는 사용자에게는 속성 편집 필드·사용중지/복원 버튼을 노출하지 않는다(서버 재검증 없이 클라이언트 숨김만으로 끝내지 않음) | `06` §17 |

## 8. DESIGN DECISIONS / OPEN QUESTIONS

| 상태 | 결정/질문 | 소유자 |
| --- | --- | --- |
| Decided | Management archetype(Page Header/Search+Filter/Data Table/Selection Actions/Detail Drawer/History-Audit) 사용 | `06` §12.3 |
| Decided | 목록·상세 조인 키는 `equipment_id` 하나 | `06` §6.1, `02_domain_menus.md` |
| Decided | 사용중지는 물리 삭제가 아니라 유효기간 종료 | `02_domain_menus.md` |
| Decided | 전역 Context 지원: 목록은 Time `reference` / room_name·Condition·Selection `apply` / Lot·PPID·Recipe·metric `unsupported` | 이 문서 §6, `menus/equipment` 매니페스트 |
| Decided | 목록의 `q`·`status`·`maker`·`focus`·`sort`·`page`·`tab`은 page-owned URL 키로 등록한다 | `06` §6.1 |
| Decided | room_name은 공정명(PHOTO·ETCH 등)이며 드물게 변경 가능·ID 유지. 설비 키는 EquipmentID 하나(별도 설비명 없음, 2026-10-07 사용자). StGroup은 현재 외부 소속 사용 | `CONTEXT.md` |
| Open | StGroup·분임조 소속을 제외한 미배정 필드별 원천 소유자 배정. 속성 편집·사용중지/복원 쓰기 구현의 선행 조건 | `01_architecture_and_data_contract.md` 「마스터 데이터 수정 권한의 원천」 |
| Open | 설비 등록 UI의 필수 필드·외부 마스터에서의 전환 절차 | 이 문서 |
| Open | 일괄 사용중지 등 다중 선택 기반의 상태 변경 액션 지원 여부(현재 다중 선택 액션은 내보내기와 "선택 설비로 분석") | 이 문서 |
| Open | 설비 상태 값(`active`/`idle`/`maintenance`/`retired`)의 도메인 의미·소유자 | 도메인 담당 지정 필요 |
| Open | 데이터 볼륨·최대 조회량·timeout 구체 숫자 | [열린 입력 질문 4](../.planning/inputs.md#q4) |

## OPEN QUESTIONS / RISKS

- 필드 원천 소유권이 Open인 채로 속성 편집 UI를 먼저 만들면, 외부 동기화가 플랫폼의 수동 수정을 덮어쓰는 사고가 실제로 재현될 수 있다 — `01_architecture_and_data_contract.md`의 소유권 결정이 이 화면의 편집 기능 착수 전 선행 조건이다.
- 데이터 볼륨이 아직 Open이라 서버 페이지네이션 방식(offset vs cursor)이나 가상화 임계치를 이 문서가 확정하지 않는다.
- StGroup이 "현재 소속만" 반영하므로, 유효구간 이력에서 현재 StGroup 값을 그 시점 값으로 착각하지 않아야 한다 — 구현은 유효구간 탭에서 StGroup·분임조의 과거 소속을 추정하지 않는다고 안내한다.
