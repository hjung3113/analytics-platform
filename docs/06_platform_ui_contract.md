# 06. Platform UI Contract

> Status: Draft  
> Scope: Analytics Platform UI / Platform Shell / Extension Contract  
> Related: `00_overview.md`, `02_domain_menus.md`, `04_frontend_ui_ux.md`, `05_roadmap_and_open_questions.md`

## 문서 소유권과 결정 상태

이 문서는 플랫폼 전역 UX / Scope / Context / URL / Menu Extension / Shell Slot / navigation IA의 단일 authoritative source다. `02_domain_menus.md`는 도메인 capability catalog, `04_frontend_ui_ux.md`는 구현 후보·리서치·화면 패턴, `05_roadmap_and_open_questions.md`는 결정 상태·미결 질문 및 Deferred 구현 가설, `07_app_shell_wireframe.md`는 이 계약을 소비하는 셸 설계다. 외부 디자인 참고자료와 에이전트 스킬은 제품 계약의 근거가 아니다.

- **Decided**: 플랫폼 책임 경계와 명시적인 계약 규칙. 구현 완료를 뜻하지 않는다.
- **Candidate**: 별도로 Decided라고 명시하지 않은 배치·토큰·페이지 예시와 기술 선택. 아래에 명시한 셸 치수·테이블 밀도 결정은 제외한다. 독립 초안끼리 일치해도 승인으로 간주하지 않는다.
- **Open**: Scope 부모·자식 상속, 최초 기본 Δ, timeDomain assertion 공급 근거, 다중 Site의 같은 날짜·교대일/영업일 등 각 절에 명시한 미결 입력. URL 메커니즘과 Site→room_name→StGroup→Equipment 관계의 Decided 상태 및 공개 필드명·enum의 Candidate 상태와 구별한다.
- **Deferred**: 저장된 뷰 등 후속 구현 범위. 이 설계가 기능 제공 시점을 확정하지 않는다.

§5~6, §8~9, §11, §17, §19의 책임·행동 규칙은 Decided다. §7 셸 치수(사이드바 270px·헤더 54px)와 §15 테이블 밀도(최소 32px)는 2026-09-21에 `DESIGN.md` canonical 값으로 Decided됐다 — 이 문서는 그 값을 인용만 하고, 실제 값의 단일 원본은 `DESIGN.md`다. §23 토큰 스케일·§25 반응형 정책·§31은 아직 Candidate다. 구현 일정은 아직 확정하지 않았으며 `05_roadmap_and_open_questions.md`의 Phase 표는 non-authoritative 가설이다.

## 1. 문서 목적

이 문서는 개별 메뉴의 화면 디자인을 정의하는 문서가 아니다.

이 프로젝트의 1차 목적은 **설비관리·분석·지표·VOC 같은 개별 기능을 만드는 것보다, 서로 다른 업무 메뉴가 같은 규칙으로 올라갈 수 있는 분석 플랫폼 자체를 만드는 것**이다.

따라서 UI 설계의 우선순위도 다음 순서를 따른다.

1. Platform Kernel
2. Platform-wide UX Contract
3. Menu Extension Contract
4. Shared Components / Patterns
5. Domain-specific Pages

개별 메뉴는 플랫폼을 검증하는 대표 Consumer다. 첫 분석 화면이나 설비관리 화면을 잘 만드는 것 자체가 성공 기준이 아니라, 그 과정에서 만든 계약을 두 번째·세 번째 메뉴가 재사용할 수 있어야 한다.

단, 플랫폼을 목표로 한다는 이유만으로 처음부터 범용 위젯 엔진·외부 플러그인 SDK·저코드 빌더를 만들지는 않는다. **실제 메뉴 2~3개에서 반복이 확인된 책임만 플랫폼 기능으로 승격**한다.

---

## 2. Product Design Direction

이 플랫폼은 마케팅형 SaaS가 아니라 **고밀도 Enterprise Analytics / Operations SaaS**다.

시각적으로는 다음 성격을 결합한다.

| 영역 | 참고할 UX 성격 |
| --- | --- |
| Application Shell | 운영 SaaS처럼 빠른 탐색, 명확한 내비게이션 |
| Analytics | BI처럼 재현 가능한 필터·드릴다운·지표 문맥 |
| Time-series | Ops 도구처럼 시간범위·Brush·주석·상태 가시성 |
| Master Data | Admin 도구처럼 고밀도 Table·Drawer·Audit |

핵심 인상은 **Professional / Technical / Calm / Dense / Precise**다.

### 디자인 원칙

1. **Platform before Page** — 페이지마다 새 패턴을 만들지 않는다.
2. **Context First** — 현재 기간·설비·Lot·Metric Version·Scope를 항상 식별 가능하게 한다.
3. **State is Visible** — Freshness, Coverage, Permission Scope, Filter, Version을 숨기지 않는다.
4. **Dense, not Crowded** — 정보 밀도는 높게, 장식 밀도는 낮게 유지한다.
5. **Progressive Disclosure** — 세부 정보는 Drawer/Popover/Drill-through로 확장한다.
6. **Reproducible Navigation** — 화면 이동은 분석 문맥을 잃지 않아야 한다.
7. **Partial Failure Tolerance** — 한 위젯 실패가 전체 페이지 실패가 되지 않게 한다.
8. **No Silent State Change** — 사용자가 모르는 사이 필터·지표 버전·Scope가 바뀌지 않는다.

---

## 3. Platform UI Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                     Platform Kernel                           │
│                                                               │
│  App Shell / Auth Context / Menu Registry / Route Contract   │
│  Global Context / Permission Scope / Command Palette          │
│  Saved View / Data Trust / Audit-aware UX                     │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    Platform UI Services                       │
│                                                               │
│  Page Layout / Filter Bar / Data Table / Chart Frame          │
│  Detail Drawer / State Feedback / Export / Context Link       │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    Menu Extension Contract                    │
│                                                               │
│  manifest + route + permission + supported context            │
│  page actions + data trust + deep-link behavior               │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                       Domain Menus                            │
│                                                               │
│  Equipment / Master Data / Analytics / Metrics / VOC / ...   │
└───────────────────────────────────────────────────────────────┘
```

페이지는 App Shell을 직접 수정하지 않는다. 플랫폼 기능은 개별 메뉴 import 관계를 알지 못해야 한다.

---

## 4. Platform Kernel Responsibilities

Platform Kernel이 소유해야 하는 UI 책임:

- Application Shell
- Workspace 전환(권한 기반 노출, §9.1)
- Menu Registry
- Route/Search Parameter Contract
- Global Context
- Permission / Scope Context
- Breadcrumb 생성
- Command Palette
- Favorite / Recent Menu
- Saved View 진입점
- Page-level Action Slot
- Data Trust 표시 표준
- 전역 Error Boundary / Correlation ID 표시
- Toast / Confirm / Modal infrastructure
- Theme / Design Token
- 공통 Keyboard Shortcut

### Kernel이 소유하지 않는 것

- Equipment-specific business logic
- 특정 지표 계산 로직
- 특정 분석 차트 configuration
- VOC 상태 전이 규칙
- 개별 메뉴만 사용하는 Form schema

Domain logic이 Kernel로 역류하지 않도록 한다.

---

## 5. Menu Extension Contract

초기에는 외부 설치형 플러그인이 아니라 **코드 내부 선언형 Menu Registry**로 시작한다.

메뉴가 선언하는 개념적 정보(Decided):

| 정보 | 책임 |
| --- | --- |
| 식별자·그룹·이름·경로·아이콘 | 메뉴 탐색과 현재 위치 표시 |
| 필요한 권한·Scope | 플랫폼의 노출 판단과 서버의 접근 검증 |
| 지원 Context | 기간·설비·Equipment Group의 두 층·room_name·Lot·PPID·Recipe·지표 버전의 지원 여부 명시 |
| 페이지 유형 | overview / analysis / management / catalog / workflow |
| 선택 기능 | 내보내기·저장된 뷰·주석·비교 지원 여부 |

메뉴가 선언하고 Shell이 소비한다. 필드명·TypeScript 타입·등록 방식은 구현 설계에서 구체화한다.

### 금지

- 신규 메뉴 추가 때 Sidebar JSX 직접 수정
- 메뉴마다 Breadcrumb 수동 구현
- 페이지마다 별도의 Date Picker 구현
- 페이지가 권한에 따라 메뉴 숨김 로직을 직접 구현
- 메뉴별 임의 query parameter 규칙 생성

---

## 6. Context Capability Contract

전역 Context를 모든 메뉴가 무조건 소비하는 것은 아니다.

각 메뉴는 어떤 Context를 지원하는지 선언한다.

예:

| Menu | Time | Equipment | Lot | Metric Version |
| --- | --- | --- | --- | --- |
| Equipment Master | △ | O | X | X |
| Occupancy Analysis | O | O | △ | O |
| Wafer Journey | O | O | O | △ |
| Metric Catalog | X | △ | X | O |
| VOC | △ | △ | △ | △ |

`O`: 직접 필터로 적용  
`△`: 전달/참조 가능하지만 직접 조회 필터는 아닐 수 있음  
`X`: 미지원

### 규칙

다른 메뉴에서 전달된 Context를 대상 메뉴가 지원하지 않으면 조용히 폐기하지 않는다.

예:

```text
Inherited context
Equipment: EQP-013
Lot: A1023   · Not used on this page
```

Global Context와 Page-local Filter를 같은 Chip 스타일로 혼용하지 않는다.

상태 계층은 다음처럼 분리한다.

1. **Global Context** — 메뉴 간 전달
2. **Page Filter** — 현재 메뉴 조회에만 적용
3. **Visualization State** — Zoom / Brush / Series visibility
4. **Persistent Annotation** — 저장되는 도메인 객체

### 6.1 식별자와 URL 소유 상태 (Decided)

- 목적지 객체 식별자와 전달하는 분석 Context를 분리한다. `(equipmentId, entityType, anchor)`는 **occurrence 전용 식별키**다. `lotId` 같은 업무 ID는 occurrence 검색 보조이며 anchor 없는 occurrence 조인에 쓰지 않는다.
- Site가 활성 Scope에서 확립된 상태에서 설비 마스터의 객체 키는 `equipment_id` 하나다(전역 유일 ID, [ADR-0004](adr/0004-site-is-db-partition-not-column.md)). EquipmentID로 Site DB를 추정하지 않는다. VOC는 `vocId`, 지표는 `metricId`와 `metricVersion`으로 식별한다. 도메인 객체에 occurrence 키를 강제하지 않는다.
- URL은 요청한 `scopeId`, `from`/`to`, `roomNames`, `equipmentGroup`(Condition), `selectedEquipmentIds`(Selection; 기존 `equipmentIds` 대응), `lotIds`, `ppid`, `recipeIds`, `metricId`/`metricVersion`, 해당 화면의 탭/저장된 조회조건 식별자 및 해당하는 경우 occurrence anchor를 소유한다. 새 공개 필드명·조건 인코딩은 Candidate다. 객체 ID는 목적지 경로/계약에 따라 별도로 전달한다.
- **`lotIds` / `ppid` / `recipeIds`(필드명 Candidate, 축은 Decided)**: Lot은 논리적 묶음, Job은 실행 인스턴스이며 1:1이 아니다. PPID는 LEH `FlowId`, Recipe(`prc_name`)는 PRC `RecipeId`다. Recipe를 Lot 전체의 고정값으로 가정하지 않는다. `lotIds`/`recipeIds`는 집합 정규화, `ppid`는 단일값 후보로 등록한다. Operation은 v1 필터/URL 축에서 제외한다. Recipe 필터가 Job 전체를 포함할지 매칭 PRC 구간만 포함할지는 **Candidate / 메뉴별 정의**이며 Kernel이 강제하지 않는다.
- **Equipment Group 두 층(Decided)**: Condition 키 후보 `equipmentGroup`은 사용한 축과 조건을 담는 단일 구조화 값이며 StGroup / 분임조 / Maker+Model 중 하나만 허용한다(축 간 조합 미지원). 현재 소속·속성을 재평가하는 live reference가 가능하다. Selection 키 후보 `selectedEquipmentIds`는 그 결과에서 명시적으로 고른 **고정 EquipmentID 집합**이다. 향후 그룹 축에도 같은 규칙을 적용한다. 조건만 선택했다고 결과 전체를 자동 물질화하지 않는다. 근거: [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md).
- **room_name은 Global Context(Decided)**: 공개 집합 키 후보는 `roomNames`이며 도메인 값 `room_name`과 매핑한다. 요청 Scope 안의 조회 범위를 좁히며 권한을 부여하지 않는다. 집합 정규화/공집합 규칙을 따르고 Page Filter `processIds`를 별도로 만들지 않는다.
- **page-owned URL 키의 예시로 `granularity`(Candidate 필드명, Decided — 메커니즘)**: 조회 기간(`from`/`to`)과 집계 단위(시간별/일별/주별로 뭉쳐 보기)는 다른 축이다. 모든 메뉴가 집계 단위 선택을 갖는 게 아니므로 전역 Context Bar가 아니라 `metricId`+`metricVersion` 쌍과 같은 방식으로 화면마다 선언·등록하는 page-owned 계약으로 둔다. 값 후보: `hour`/`day`/`week`.
- 딥링크 왕복은 조회조건·명시 선택·지표 버전을 재현한다. live Condition은 재방문 시 현재 멤버/매칭 결과를 평가하므로 대상 집합이 달라질 수 있음을 표시한다. Selection은 고정이며, 지연 완료·마스터 정정으로 숫자는 달라질 수 있으므로 결과에는 계산 기준시각을 표시한다.
- 단순 차트 줌은 로컬 상태다. Brush 후 명시적인 분석 구간 적용만 전역 Context/URL로 전달한다.
- 미지원 Context는 조용히 버리지 않고 적용되지 않음을 표시한다. 보존·재적용 방식은 §6.4를 따른다.
- `savedViewToken`은 긴 URL을 대체할 후보 계약으로 예약한다(Deferred). 저장된 뷰 구현 전에는 토큰 생성이나 비활성 버튼을 셸 필수 요소로 두지 않는다.

**URL/JSON 케이싱과 매핑 소유 (Decided):** URL·JSON 공개 필드명은 camelCase, DB는 해당 스키마 관례(snake_case)를 유지한다. 컬렉션은 URL 반복 키(`equipmentIds=A&equipmentIds=B`), JSON은 배열로 직렬화한다(콤마 결합은 ID의 예약문자와 충돌할 수 있어 채택하지 않는다). 공개 계약(이름·타입·카디널리티·버전·지원 Context·page-owned 키 등록)은 플랫폼 Kernel이 소유하며 클라이언트 라우터와 서버 요청 검증은 같은 산출물을 소비한다. SQL 컬럼/조인/계산식 매핑은 서버 소비 계층이 소유하고 공개 필드가 DB 컬럼과 1:1이라고 가정하지 않는다. 구현 형식(OpenAPI/JSON Schema/codegen)은 Candidate.

**집합 키 정규화와 공집합 표식 (Decided):** 집합 키(`selectedEquipmentIds`; 기존 `equipmentIds` 대응, `roomNames`, `lotIds`, `recipeIds`)가 URL에 부재하면 해당 명시 집합의 제약은 없다(Scope·권한·다른 조건·조회량 제한은 유지). Selection 부재는 Condition이 있을 때 그 현재 결과 전체를 조회한다는 뜻이지 Condition까지 무제약으로 바꾸는 뜻이 아니다. 유효 ID 1개 이상이면 선택 집합이며 중복은 제거하고 순서는 무의미하다(정규 URL은 Unicode 코드 포인트 사전식 정렬, trim/대소문자 변환/유니코드 정규화로 서로 다른 ID를 합치지 않는다). 빈 문자열/공백만 있는 ID는 형식 오류다(반복 키는 항목이 0개면 키 자체가 사라지므로 `equipmentIds=`는 "빈 ID 1개"이지 "선택 0개"가 아니다). **명시적 공집합**은 집합 키마다 등록되는 단일값 표식으로 표현한다(필드명 Candidate, 예: Selection 집합의 `equipmentSelection=none`). 표식만 있으면 명시적 공집합, ID 키와 표식이 동시에 있으면 오류다. 공집합을 지원하는 메뉴는 나머지 요청이 유효할 때 `outcome=empty`로 처리하고, 공집합 때문에 잘못된 Scope/기간을 성공으로 바꾸지 않는다. **미지원 메뉴는 공집합을 미적용으로 보존할 뿐 자기 결과를 강제로 empty로 만들지 않는다.** 표식과 ID 집합은 한 논리 Context로 함께 전달·제거한다.

**단일값 키 중복 (Decided):** `scopeId`/`from`/`to`/`v`/`equipmentGroup`/`ppid`/`metricId`/`metricVersion`/목적지 ID 등 카디널리티 1인 키가 반복되면 같은 값이어도 형식 오류다. 클라이언트와 서버가 첫 값/마지막 값을 다르게 해석하는 것을 금지한다.

**전역 지표 Context: `metricId` + `metricVersion` 쌍 (Decided):** v1의 전역 지표 Context는 단일 `metricId`와 단일 `metricVersion`의 쌍이다. 두 필드는 공개 스키마에 함께 등록하고 함께 보존·적용·제거한다(전역 반복 키나 지표별 맵은 v1에 없음). 완성/초기화 불변식:
  - query에 둘 다 있음 → 완성된 전역 Context. 서버가 그 `metricId`에 그 `metricVersion`이 속하고 유효한지 검증하고, 실패하면 오류로 처리하며 최신 버전으로 대체하지 않는다.
  - query에 ID만 있음 → 초기화를 선언한 진입점에서만 미완성 입력으로 허용하고, 서버가 확인한 게시 버전을 URL에 기록한 뒤 조회한다. 확인 불가면 선택 상태, 초기화 미지원 경로는 계약 오류다.
  - query에 버전만 있음 → 목적지 경로 계약이 소유 `metricId`를 유일하게 정의할 때만 경로 ID를 query로 복사해 쌍을 완성한다. 세션·이전 화면·화면 이름으로 ID를 추정하지 않는다.
  - query에 둘 다 없음 → 전역 지표 Context 없음. 경로가 지표 하나를 유일하게 식별하고 초기화를 선언했다면 물질화 가능하고, 아니면 선택 상태다.
  - 목적지 객체의 지표 ID와 전역 `metricId`는 역할이 다를 수 있다(지표 A 문맥을 들고 지표 B 상세로 이동). 목적지 ID로 전역 쌍을 몰래 덮어쓰지 않는다. 같은 지표를 요구하는 경로인데 ID가 다르면 오류다.
  - Context Link helper는 대상이 **동일한 `metricId`의 해당 버전**을 조회에 쓸 때만 쌍을 적용한다. 다른 지표·미지원 메뉴는 쌍을 보존하되 미적용으로 표시한다. 사용자가 명시적으로 바꾸거나 제거할 때만 쌍 전체를 변경한다.
  - 여러 지표 버전이 필요한 화면은 page-owned 계약으로 선언·등록·검증한다. 전역 단일값을 모든 위젯의 버전으로 확대 해석하지 않으며, 같은 지표에 전역 값과 page-owned 값이 상충하면 오류로 처리한다(묵시적 우선순위 없음).
- **근거:** 기존 문서가 지표를 `metricId`+`metricVersion`으로 식별하면서 URL 소유 목록에는 `metricVersion`만 두어, 메뉴를 넘어가면 버전 숫자만 남아 다른 지표로 재해석될 수 있었다(전역 URL 표현의 공백). 자세한 판정 근거는 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §1.

**줌 vs 명시적 구간 적용, v1 소수초 처리 (Decided):** v1에서 URL/전역 Context로 적용되는 구간은 초 정렬 `[from, to)`뿐이다. 판정 기준은 구간 길이가 아니라 **선택한 양 경계가 초에 정렬돼 있는가**다. 미정렬이면 외향 정렬(시작은 이전 초로 내림, 끝은 다음 초로 올림) 미리보기를 보여주고 사용자가 확인해야 URL/전역 Context가 바뀐다. 확인 전에는 조회·URL을 바꾸지 않고, 취소하면 로컬 브러시만 유지한다. v1은 소수초 정확 구간 공유를 지원하지 않는다.

세부 판정 근거, 반례, Candidate 필드명 전체 목록은 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md`를 따른다.

### 6.2 Scope와 권한 (Decided / Open)

- Scope는 사용자가 요청하는 조직·데이터 접근 범위다. `scopeId`는 URL에 담지만 권한 증명이 아니다. 서버는 **매 요청마다** 사용자 권한과 요청 Scope를 재검증한다.
- 접근할 수 없는 Scope는 명시적 오류/선택 상태로 처리하며 다른 Scope로 조용히 대체하지 않는다. 같은 URL이 다른 사용자에게 같은 접근 권한을 부여하지 않는다.
- 세션·최근방문 값은 미검증 후보이며, 재적용 전에 현재 Scope에서 설비·Lot 선택과 권한의 유효성을 다시 검증한다.
- **요청 `scopeId`는 하나다(Decided).** 부재는 명시적 선택 상태이며 임의 Scope로 대체하지 않는다. Scope 선택지 조회와 분석 데이터 조회는 구분한다. 사용자가 명시한 무단 ID는 조용히 제거하지 않으며, 전체 권한 실패는 `outcome=forbidden`이다(§19).
- **권한·조회 범위는 Site → room_name → StGroup → Equipment 관계를 따른다(Decided, 2026-09-24).** 실무 권한 부여 축은 Site 내 room_name이다. room_name과 StGroup은 여러 Line에 걸칠 수 있으며 Line은 독립 생산·조회 축이다. Factory는 별도 Scope 레벨로 모델링하지 않는다. [ADR-0005](adr/0005-scope-room-name-line-independent.md)가 ADR-0001의 Line 중심 Scope 주장을 대체한다.
- 설비 분류(Maker → Model → ChamberType → EquipmentID)는 위 접근 범위와 별개다. StGroup은 room_name·Site 경계를 넘지 않는 설비 능력 묶음이며 분임조는 엔지니어 조직 묶음이다. 둘의 소속은 외부 공급값이다. Group 조건이나 Line 선택이 room_name 권한을 대신하거나 넓히지 않는다. 근거: [CONTEXT](../CONTEXT.md).
- **요청 `scopeId`는 v1에서 단일 선택만 허용한다(Decided, 2026-09-22).** 복수 Scope 선택은 이후 확장 후보로 남기되 v1 범위 밖이다.
- **부모·자식 권한 상속 및 조회 필터 자동 포함의 세부 규칙은 Open domain decision이다.** room_name이 실무 권한 축이라는 결정과 구별한다. Site 선택만으로 모든 room_name에 대한 접근이 허용된다고 해석하지 않으며, 셸에 고정 다단 선택기를 요구하지 않는다.
- **Site는 물리 DB 경계다(Decided).** Site 선택은 컬럼 필터가 아니라 연결 대상을 정한다. 설비 ID 사용 전에 활성 Scope의 Site가 확립돼 있어야 한다. URL에 없는 `scopeId`를 세션에서 몰래 채우거나 EquipmentID로 Site를 역산하지 않는다([ADR-0004](adr/0004-site-is-db-partition-not-column.md)).

<a id="ctx-time"></a>
<a id="63-시간-계약-decided-tz-값다중-사업장-같은-날짜는-open-domain-decision"></a>
### 6.3 시간 계약 (Decided; 다중 사업장 같은 날짜·교대일/영업일은 Open domain decision)

> **참조 `CTX-TIME` — 이 절이 전역 Context·URL 시간 계약의 원본이다.** 문서 탐색용 식별자이며 공개 API 버전이 아니다. 결정 상태·예외·미결은 아래 해당 문단을 읽는다. 위 두 anchor는 안정 참조와 과거 제목 링크 호환용이며 제목 변경 때도 유지한다.
>
> **의존:** [03 시간 계약](03_backend_stack.md#시간-계약-중요--2차-리뷰에서-발견된-실수)의 원천 wall-clock, §6.1의 초 정렬·원천 정밀도 및 §6.2의 Scope, [01 R/H 정책 원본](01_architecture_and_data_contract.md#late-arrival-policy). `defaultRangeTo`의 의미는 이 절, `R`/`H`의 의미는 01이 소유한다.
>
> **변경 시 직접 검토:** 이 문서 §6.4(기간 누락·URL 복원), §11(Context 전환), §18–19(시간역 오류·Data Trust), [03 시간 요약](03_backend_stack.md), [04 URL 구현 후보](04_frontend_ui_ux.md), [07 §6–8 기간 입력·시나리오](07_app_shell_wireframe.md#6-data-requirements), [DESIGN 기간 control/Date preset](../DESIGN.md#reference-component-bindings), [05 기간 프리셋](05_roadmap_and_open_questions.md#기간-프리셋과-집계-단위-decided-2026-09-22-grilling-round-2). R/H 변경을 동반하면 01의 관련 문서 경로도 따른다.
>
> **파생·후보 확인:** [REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) §1/§3/§6/Open Questions, [연동 후보 2](integration/component-contract-candidates.md)의 시간 매핑. 이 목록은 탐색 출발점이지 전수 의존성 그래프가 아니다. `defaultRangeTo`, `timeDomain`, `wall-clock`, `from`/`to`와 절 참조를 추가 검색하고, 작업 기록에 각 대상의 수정/대조/보류 이유와 실제 코드·검증 유무를 남긴다. 문서 대조를 런타임 검증으로 표시하지 않는다.

기간은 파서 원본과 같은 시간대 없는 설비 wall-clock으로 전달하며 임의로 UTC로 변환하지 않는다. 시간의 원천 의미는 `03_backend_stack.md`를 따른다. 아래는 이 wall-clock 계약 위에서 **메커니즘 수준으로 확정한** 항목이다. TZ 실제 값은 한국(Asia/Seoul) 단일값으로 우선 확정했다(2026-09-22, 해외 사업장인 중국 시안·미국 오스틴 실존은 확인됐으나 확장은 아직 미착수). 다중 사업장이 실제로 편입될 때의 "같은 날짜" 의미와 교대일/영업일 의미는 여전히 Open domain decision이다.

**구간 경계와 datetime 문자열 (Decided):** 공통 조회 경계는 half-open `[from, to)`이며 `from < to`를 요구하고 잘못된 날짜는 보정하지 않고 거부한다. v1 URL의 `from`/`to`는 정확히 `YYYY-MM-DDTHH:mm:ss`(naive, `Z`/offset·소수초·날짜-only는 형식 오류)다. 원천값·조인 키·occurrence anchor의 정밀도는 축소하지 않으며, 경계 비교는 원천 전체 정밀도로 한다(`to=10:00:00`이면 `10:00:00.000`과 `10:00:00.500` 모두 제외). v1의 초 단위 입력 제한은 원천 정밀도 축소가 아니라 **신규 제품 제한**이다.

**날짜만 선택한 경우 (Decided):** URL에는 datetime만 허용한다. 달력에서 고른 양끝 포함 구간 `[D1, D2]`는 UI에서 `[D1T00:00:00, (D2+1일)T00:00:00)`으로 변환해 URL에 쓴다("다음 날"은 naive 달력 연산이지 UTC instant+24시간이 아니다). 교대일·영업일·다중 사업장 같은 날짜 의미는 이 결정 밖(Open domain decision)이다.

**원천 시간대 미확인 시 처리 (Decided):** 단일 설비, 또는 동일 wall-clock 기준이 확인된 설비 집합은 절대 TZ를 몰라도 naive 범위로 조회할 수 있다. 임의의 기본 TZ를 가정하거나 URL `from`/`to`를 UTC 필터로 바꾸거나 확인 안 된 다른 시간역과 축을 병합하지 않는다. TZ 미확인은 Data Trust에 표시한다. 확인된 TZ 이름이 있어도 DST 등으로 변환이 항상 가능한 것은 아니므로, 확인된 이름 ≠ 변환 가능이다. 이 결정이 향후 별도 UTC 분석 API 자체를 영구 금지하는 것은 아니다.

**복수 설비 시간축 병합 가드 (Decided):** 서로 다른 설비를 같은 시간축/버킷으로 병합하는 조회는 **서버 소유 assertion**이 있을 때만 허용한다(비보장을 "경고 후 허용"으로 약화하지 않는다). `scopeId`나 클라이언트가 보낸 시간역 id는 증명이 아니다. 최소 assertion 계약: `(equipmentId, timeDomainId, validFrom, validTo)`, 범위 `[validFrom, validTo)`(해당 설비의 naive wall-clock, 내부 정밀도 유지 — 지금 특정 테이블·마이그레이션을 요구하지 않는다). 실제 조회 대상 설비 전체에 대해 요청 `[from, to)` 전체가 빈틈없이 덮이고, 그 구간들의 `timeDomainId`가 모두 같을 때만 병합을 허용한다(한 설비가 요청 중간에 도메인을 바꿔도 v1 병합은 거절). 덮이지 않은 구간이 있으면 `time_domain_unverified`, 확인된 도메인 불일치가 있으면 `time_domain_mismatch`이며, 둘 다 `outcome=error`(요청 검증 오류, correlation id)로 처리하고 `empty`/`unknown`/경고 후 병합으로 위장하지 않는다. 이력 없는 현재 스냅샷으로 과거 구간을 소급 증명하지 않는다. 서로 다른 시간역의 **분리** 조회는 계속 허용한다.

**기본 구간 물질화 시계 `defaultRangeTo` (Decided):** 브라우저 로컬 now, 서버 UTC 문자열 절단, "watermark = now = Data through" 등식은 모두 쓰지 않는다. 서버가 해당 시간역·데이터셋의 기본 조회 상한 `defaultRangeTo`(배타적 초 경계, wall-clock)를 제공한다. `defaultRangeTo`는 half-open 구간의 상한이므로 그 값 자체는 §6.3의 경계 규칙에 따라 항상 제외된다. 서버가 이 값을 정할 때 "포함"이 뜻하는 것은 **포함하려는 마지막 실제 데이터 시각이 `defaultRangeTo`보다 항상 이전이 되도록**(그 시각이 필터로 잘리지 않도록) 상한을 잡는다는 것이지, 상한 이전 데이터가 모두 도착했거나 집계가 완전하다는 뜻이 아니다 — 예를 들어 포함하려는 마지막 시각이 `10:00:00.000` 또는 `10:00:00.500`이면 `defaultRangeTo`는 최소 `10:00:01`이어야 한다. 기본 구간은 `[defaultRangeTo − Δ, defaultRangeTo)`(naive 길이 산술, 자정 비정렬)로 물질화하며, 산출 불가 시 자동 물질화하지 않고 기간 선택을 요구한다. 한 번 물질화한 URL 기간을 데이터 갱신만으로 자동 이동시키지 않는다. 사용자가 명시적으로 고르는 기간 프리셋(`1일/7일/사용자 지정`)은 이 메커니즘을 그대로 재사용해 Δ=24h/168h로 확정했다(2026-09-22, 실사용 패턴이 "보통 1일, 길면 7일, 드물게 그 이상"이라 참고 스크린샷의 `7D/30D/90D`를 대체 — [당시 기간 결정 기록](reviews/2026-09-23-decision-detail-history.md)). 최초 진입 시 자동 물질화되는 기본 Δ 숫자 자체는 별도로 Open이다.

선택 배경과 범위: 로그 자체의 1시간 단위는 조회 단위가 아니다. 30일/90일은 프리셋 버튼에서 제외했지만 사용자 지정 조회는 가능하다. 자주 쓰이는 수요가 확인되면 버튼 확장을 재검토한다.

`defaultRangeTo`와 자동 재집계 창의 원천 진행 경계 `R`(정의는 [01 지연 완료 허용 시간](01_architecture_and_data_contract.md#late-arrival-policy) 참조)은 서로 다른 계약 필드이며 항상 같은 값은 아니다. **`R`이 존재할 때만** 같은 시간역·대상 조건에서 `defaultRangeTo ≤ R`인 경우에만 그 기본 구간을 자동 물질화하고, 만족하는 값이 없으면 마지막 점을 버리거나 `R`을 올리지 않고 기간 선택을 요구한다(L2). `R`이 아직 없는 경우(첫 mart 세대 생성 전, 워커 일시 중단 등)에는 이 비교를 적용하지 않는다 — `defaultRangeTo`가 독립적으로 유효하면 그대로 자동 물질화하고, 자동 재집계만 보류한다([01 정책](01_architecture_and_data_contract.md#late-arrival-policy) 참조).

세부 판정 근거, 반례, Candidate 필드명 전체 목록은 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §3을 따른다.

### 6.4 URL 계약 (Decided; 필드명·enum 문자열은 Candidate)

**Equipment Group / Context Capability (Decided; 공개 표현 Candidate):** 메뉴는 Condition과 Selection의 적용/참조/미지원 범위를 선언하고 두 층을 전달·보존한다. StGroup·분임조·Maker+Model 중 사용한 축을 그대로 유지하며 다른 축으로 역추정하지 않는다. Condition만 있으면 현재 결과를 조회하고, 명시 Selection이 있으면 그 고정 ID 집합을 분석 대상으로 사용한다. 재평가된 Condition에서 빠졌다는 이유로 선택을 자동 교집합·확장·대체하지 않는다. 권한/Scope 검증 실패는 명시적으로 처리한다. 조건 편집 시 기존 선택의 처리 UI는 Candidate이며 조용한 선택 변경은 허용하지 않는다.

기존 `equipmentIds` 목록 필터와 `selectedEquipmentIds`는 같은 EquipmentID 명시 집합을 나타내는 공개 표현이다. 새 이름은 Selection의 역할을 드러내는 후보이며 두 개의 독립 필터가 아니다. 기존 이름의 동등 별칭/버전 이행은 아래 `v` 규칙으로 등록한다. 동시 입력은 후보 스키마에서 거부하여 우선순위 추정을 피한다. 상세의 단일 `equipment_id`도 **같은 식별자 개념**이며, 집합 조회와 객체 목적지라는 사용 역할만 다르다.

**분석으로 돌아가기 (Decided):** 상세/드릴인 진입 직전의 분석 Context(Condition·Selection·미적용 값 포함)를 그대로 복원한다. 목록 `equipmentIds=[A,B]`에서 목적지 C를 보았어도 복귀는 `[A,B]`이며 C를 합치거나 C 하나로 바꾸지 않는다. 상세에서 본 객체나 상세의 변경된 조건으로 출발 Context를 덮어쓰지 않는다. 복귀 시 권한·Scope는 재검증하며 실패해도 원래 선택을 조용히 축소하지 않는다. 복원은 원래 조건의 복원이지 live Condition 결과나 계산 숫자의 동결이 아니다. 출발 페이지의 등록된 URL 상태도 보존하되 로컬 줌/brush의 복원 보장은 추가하지 않는다.

**URL vs 세션/최근방문 우선순위, 누락값 (Decided):** URL에 있는 키는 항상 이긴다. URL에 없는 키를 세션/최근방문으로 채우지 않는다(세션은 제안값일 뿐이며, 적용하는 순간 URL에 기록한다). 키 부재는 공개 스키마가 정의한 "선택 없음 / 기본 의미 / 필수 누락" 중 하나로만 해석하고, 필수값을 임의 Scope나 떠다니는 최신 지표 버전으로 대체하지 않는다. 시간을 요구하는 메뉴에서 기간 양쪽이 모두 없으면 기본 구간이 정의·검증 가능할 때만 절대 `from`/`to`를 URL에 물질화하고(불가하면 기간 선택 요구), **한쪽만 있으면 형식 오류로 거부한다**(보정하지 않음). 상대적인 "최근 기간"이 물질화되기 전의 URL은 시점 의존 진입점이며 재현 가능한 분석 링크가 아니다.

**URL 계약 버전 `v` (Decided):** 양의 정수 query `v`, 생략은 `v=1`로 해석한다. 인바운드 URL은 그 버전 디코더로만 해석하며 북마크의 `v`를 자동으로 최신으로 rewrite하지 않는다(조회 신원을 바꾸지 않기 위함). helper가 **새로** 만드는 정규 URL은 동등 요청을 새 버전으로 표현할 수 있는지 검증한 뒤에만 현재 `v`를 명시하고, 불가능하면 지원 중인 원래 버전을 보존하거나 전환 불가를 알린다. 미지원 `v`(미래 또는 sunset 이후)는 부분 추측 없이 전체 거부한다. `v`는 `metricVersion`·DB 마이그레이션·메뉴 구현 버전과 별개다. 같은 `v` 안에서 등록된 의미-동등 별칭만 허용하고, 별칭으로 기존 값의 의미를 바꾸지 않는다. sunset 날짜/기간은 별도 공지·정책으로 정하며 이 결정에 포함하지 않는다.

**잘못된 값 / 미등록 키 / 미지원 Context (Decided):** 등록된 키의 형식 오류(잘못된 날짜, `Z` 접미사, 빈 필수 ID, 잘못된 `v`, 한쪽만 있는 `from`/`to` 등)는 조회를 거부하고 명시적 오류를 표시하며 clamp/보정하지 않는다. 유효한 형식이지만 없거나 권한 없는 객체는 자동 대체하지 않는다. **등록된** 전역 Context가 대상 메뉴에서 미지원이면 URL에 남기고 미적용으로 표시하며, 지원 메뉴로 복귀하면 재검증 후 적용한다. **미등록** 키도 현재 URL에는 남기되 검증된 조회조건으로 넘기지 않고 전역 Context로 승격하지 않는다. 새 키가 조회 의미를 필수로 바꾸면 `v` breaking change로 처리한다.

**뒤로가기 복원 범위와 셸 내비게이션 (Decided):** 플랫폼이 보장하는 복원 범위는 **URL이 소유한 상태**(전역 Context + 그 페이지가 URL에 쓰기로 한 탭/뷰 id + 선언됐지만 미적용인 등록 Context + §6.1 공집합 표식)로 한정한다. 줌/브러시/시리즈 가시성은 보장 밖이다(로컬 저장 자체가 금지되는 것은 아니나 제품 복원 계약에는 넣지 않는다). **셸의 사이드바/메뉴 레지스트리를 통한 메뉴 전환도 Context Link helper와 같은 규칙을 따른다**: 전달 집합은 등록된 전역 Context뿐이며 대상의 지원 여부와 무관하게 보존한다. 적용은 대상이 지원하고 검증한 값에만 한다. page-owned 상태와 미등록 키는 자동 복사하지 않는다. helper는 **보존할 Context**와 **적용할 Context**를 구분해야 하며, "지원 키만 골라 쓴다"는 동작이 URL에서 나머지를 지운다는 뜻이면 안 된다(보존 약속과 충돌).

**복수 Scope와 시간 계약이 해결되기 전 허용할 조회 범위 (Decided):** §6.2의 `scopeId` 단일 원칙과 §6.3의 시간역 병합 가드로 닫힌다. TZ 매핑이 끝날 때까지 분석을 전면 금지하지는 않는다(단일 설비 naive 조회는 계속 허용). 프로토타입에서 무제한 조회를 허용하는 것은 거부한다.

세부 판정 근거는 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §4를 따른다. 완성된 URL API나 프로토타입 검증을 이 결정만으로 주장하지 않는다 — 구현·필드명 확정은 별도다.

---

## 7. Application Shell

Desktop-first를 기본으로 한다.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Product / Workspace     Scope ▼    Search ⌘K        Help   User      │
├──────────────┬──────────────────────────────────────────────────────┤
│              │ Breadcrumb                                           │
│ Overview     │ Page Title                             Page Actions    │
│              ├──────────────────────────────────────────────────────┤
│ Equipment    │ Global Context Bar                                  │
│ Master Data  │ [Date] [Equipment] [Lot]                            │
│ Analytics    ├──────────────────────────────────────────────────────┤
│ Metrics      │                                                      │
│ Notice/VOC   │                   Page Content                       │
│ Admin        │                                                      │
│              │                                                      │
├──────────────┴──────────────────────────────────────────────────────┤
│ Data status / calculation basis / coverage                         │
└─────────────────────────────────────────────────────────────────────┘
```

Scope는 개념적으로 Global Context에 포함되지만 이 Candidate 배치에서는 헤더에만 선택기를 둔다. Context Bar에 두 번째 Scope 선택기를 만들지 않는다. 구체 셸 설계는 `07_app_shell_wireframe.md`를 따른다.

### Baseline (Decided — `DESIGN.md` canonical과 일치)

```text
Sidebar expanded   270px
Sidebar collapsed   64px
Top header           54px
Page header          56~64px
Global context bar   48px
Content padding      24px
Section gap          24px
Component gap        12~16px
```

`DESIGN.md`의 `sidebar-shell`/`top-bar` 컴포넌트 토큰(270px/54px)이 canonical이며, 이 값이 셸 치수의 단일 기준이다.

분석 페이지에는 임의의 좁은 `max-width`를 적용하지 않는다.

---

## 8. Shell Slots

페이지가 Shell과 결합하는 지점을 정해둔다.

```text
Page
├─ title
├─ description
├─ primaryAction
├─ secondaryActions
├─ contextExtension
├─ content
└─ dataTrustSummary
```

이 Slot 외의 위치에 페이지가 직접 전역 UI를 삽입하지 않는다.

### 이유

메뉴가 수십 개로 늘어나면 화면 자체보다 다음 문제가 먼저 발생한다.

- Action 위치 불일치
- Filter 위치 불일치
- Export 버튼 중복
- Help/설명 위치 불일치
- Data Freshness 표기 방식 불일치

Shell Slot은 이를 방지하는 플랫폼 계약이다.

---

## 9. Information Architecture

최상위 Navigation Group:

```text
Overview

Equipment
Master Data
Analytics
Metrics
Notice & VOC
Administration
```

이 7그룹을 navigation IA의 단일 기준으로 둔다(Decided). 표시명은 운영 개요 / 설비관리 / 기준정보관리 / 생산성 분석 / 지표관리 / 공지·VOC / 관리·감사다. **2026-09-26 개정:** 이 그룹들은 §9.1의 워크스페이스 층 아래에서 배치된다. 관리·감사는 운영 콘솔로 이동하고, 공지·VOC는 분석 공간에 사용자용 화면만 남긴다. `02_domain_menus.md`의 6개 도메인 중 공지와 VOC가 한 그룹을 공유하고, 운영 개요·관리·감사는 플랫폼 기능이다. 도메인 개수와 내비게이션 그룹 개수를 같게 맞출 필요는 없다. 하위 화면 배치와 표시명 변경은 별도 설계 결정이다.

Sidebar 기능:

- Collapse / Expand
- Search Menu
- Favorite
- Recent
- Permission-aware visibility
- Command Palette

메뉴가 늘어날수록 평면적인 Sidebar 확장은 금지한다.

### 9.1 워크스페이스 (Decided, 2026-09-26)

개발자·운영 메뉴와 FeedbackOps를 추가하면서 사이드바가 무거워지지 않도록, 그룹 위에 **워크스페이스(공간)** 층을 둔다. 모든 공간은 같은 App Shell·Kernel·전역 Context·권한 계약을 공유하며, 공간은 사이드바에 표시할 그룹 집합과 진입 권한만 나눈다. 근거: [2026-09-26 워크스페이스·운영 메뉴 인터뷰](reviews/2026-09-26-workspace-ops-interview.md).

| 공간 | 대상 | 그룹 / 화면 |
| --- | --- | --- |
| 분석 | 모든 사용자 | 운영 개요 / 설비관리 / 기준정보관리 / 생산성 분석 / 지표관리 / 공지·VOC(사용자용: 공지, 내 VOC 등록·상태 확인, 설문 응답, 가공 상태 조회) |
| 운영 콘솔 | 개발자·운영자 | 시스템 모니터링, 개발자용 파이프라인 트레이스, 메뉴 활용률(§05 계측), 관리·감사(권한/역할, 변경 감사), Menu Registry 조회 |
| 피드백 | 내부 담당자 | FeedbackOps의 VOC 분류·Finding·Task Request/Task·Milestone(FeedbackOps FR-TASK-004) |

- **노출:** 공간 전환기는 접근 가능한 공간이 2개 이상인 사용자에게만 좌상단 브랜드 영역에 표시한다. 일반 사용자는 분석 공간만 보며 전환기가 없다. 공간 진입 권한도 §17 규칙을 따른다(비노출 + 직접 URL은 서버 검증).
- **Context:** 공간 전환은 §6.4의 셸 내비게이션과 같은 규칙을 따른다. 등록된 전역 Context(Scope·기간·설비 선택 등)는 전부 보존하고, 대상 화면이 지원·검증한 값만 적용한다. 예: 사용자용 가공 상태 조회에서 본 설비·기간으로 개발자용 트레이스를 바로 연다.
- **Registry:** 메뉴는 소속 공간을 선언한다(필드명 Candidate: `space`). 공간별 그룹 수는 이 절의 표를 넘지 않게 유지하고, 새 그룹은 공간 추가보다 먼저 기존 그룹에 흡수할 수 있는지 검토한다.
- **Command Palette:** 사용자가 접근 가능한 모든 공간의 메뉴를 검색한다. 결과에 공간명을 표시한다.
- **범위 밖:** 공간별 테마·별도 로그인·공간별 Scope는 두지 않는다. FeedbackOps의 셸 편입 시점은 [저장소 연결 문서](integration/repository-layout.md)의 단계를 따른다.

---

## 10. Command Palette as Platform Navigation

메뉴 수가 증가하면 Sidebar만으로 탐색하지 않는다.

Command Palette는 플랫폼 공통 기능으로 둔다.

지원 후보:

```text
Go to Occupancy Analysis
Go to Equipment EQP-013
Open Metric "Cycle Time P95"
Open recent view
Open saved view
Create VOC from current context
```

메뉴 이동을 기본 책임으로 둔다. Entity Search와 Action Command는 수요 검증 후 채택할 Deferred 후보이며 구현 시점은 정하지 않는다.

---

## 11. Global Context Bar

플랫폼에서 가장 중요한 공통 UI 중 하나다.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Sep 01–17 × │ EQP-001 +3 × │ Lot: All │ + Filter │                │
│                                             Reset                   │
└────────────────────────────────────────────────────────────────────┘
```

대표 Context:

- Time Range
- Equipment
- Equipment Group (Condition / Selection)
- Lot
- room_name
- PPID / Recipe
- Metric Version
- Scope

### Context 변경 규칙

- 사용자가 명시적으로 바꾼 값만 전역 상태를 변경한다.
- 단순 Chart Zoom은 Global Context를 변경하지 않는다.
- Brush 후 `Analyze selected range` 같은 명시적 Action이 있어야 Global Context로 승격한다.
- Scope·설비·기간 등 Context가 바뀌면 이전 결과를 새 조건의 결과처럼 표시하지 않는다. 이전 요청이 늦게 완료돼도 새 Context 결과로 채택하지 않는다. 동일 Context 재조회에서만 이전 결과와 갱신 중 표시를 함께 유지할 수 있다. 권한 변경/Scope 전환에서는 이전 결과를 숨기고 현재 권한을 재검증한다.
- 지원하지 않는 Context는 명시적으로 표시한다.

---

## 12. Canonical Page Archetypes

플랫폼이 처음부터 모든 화면을 자유롭게 만들게 하지 않는다.

초기에는 아래 Archetype을 제공하고, 실제 반복이 확인되면 추가한다.

### 12.1 Overview

사용 목적: 상태 요약 + 다음 행동 진입.

```text
Page Header
Global Context
Primary KPI / Summary
Main Trend or Status
Attention List
Data Trust
```

### 12.2 Analysis Workspace

사용 목적: 조건 설정 → 시각화 → 선택 → Drill-down → Detail 검증.

```text
Page Header
Global Context
KPI Summary
Primary Chart
Selection / Annotation
Breakdown Table
Data Trust
```

### 12.3 Management

사용 목적: Master / 기준정보 / 사용자 / 설정 관리.

```text
Page Header
Search + Filter
Data Table
Selection Actions
Detail Drawer
History / Audit
```

### 12.4 Catalog

사용 목적: Metric처럼 정의·버전·사용처가 중요한 객체.

```text
Catalog List
Definition Detail
Version
Ownership
Coverage
Usage / Dependency
History
```

### 12.5 Workflow

사용 목적: VOC처럼 상태 전이가 있는 객체.

```text
Queue/List
Status/Priority/Owner Filter
Detail
Timeline
Comments
Related Context
```

Domain 메뉴는 가능하면 이 Archetype을 조합하고, 새로운 Page Type을 만들 때는 기존 패턴으로 표현할 수 없는 이유를 기록한다.

---

## 13. Shared Component Layers

컴포넌트는 세 층으로 나눈다.

```text
UI Primitive
    ↓
Platform Component
    ↓
Domain Component
```

예:

```text
Button
  ↓
PageActionButton
  ↓
EquipmentDeactivateButton
```

### UI Primitive

shadcn/ui + Radix 조합은 [04 프론트엔드 기술 스택](04_frontend_ui_ux.md#프론트엔드-기술-스택-decided-2026-09-25)에서 Decided(2026-09-25, FeedbackOps `packages/ui`의 실제 shadcn 컴포넌트 이식)다. 아래 primitive 역할 예시는 그 구체 컴포넌트 매핑까지 확정하는 것은 아니다.

예:

- Button
- Input
- Select
- Dialog
- Popover
- Tabs
- Badge

### Platform Component

여러 도메인에서 동일한 플랫폼 의미를 갖는 컴포넌트다.

예:

- GlobalContextBar
- PageHeader
- DataTrustIndicator
- AnalysisChartFrame
- PlatformDataTable
- DetailDrawer
- AuditTimeline
- EmptyState
- PermissionGuard
- SavedViewSelector

### Domain Component

업무 의미가 있는 컴포넌트다.

예:

- EquipmentValidityTimeline
- MetricVersionDiff
- WaferJourneyTimeline
- VOCStatusTimeline

Domain Component를 억지로 Platform Component로 승격하지 않는다.

---

## 14. Platform Component Promotion Rule

플랫폼 개발에서 가장 위험한 것은 **너무 늦은 공통화와 너무 이른 공통화** 둘 다다.

아래 규칙을 기본값으로 한다.

### 플랫폼이 소유하는 책임 (구현 시점과 별개)

플랫폼 계약에 해당하는 것:

- Page Header
- Navigation
- Global Context
- Permission Guard
- Data Trust
- Saved View Entry (기능 채택 시; 현재 Deferred)
- Error / Empty / Loading

### 2개 이상 메뉴에서 확인 후 공통화

- Table Toolbar 패턴
- 특정 Filter 조합
- Analysis Drill-down 패턴
- Detail Summary Layout

### 반복 수요 검증 전까지 Deferred로 둔다

- 자유 배치 Widget Framework
- Dashboard Builder
- Domain-independent Annotation Editor
- 외부 설치형 Plugin SDK

공통화를 위해 Domain 요구를 왜곡하지 않는다.

---

## 15. Platform Data Table Contract

Table은 플랫폼 핵심 UI다.

기본 기능:

- Server-side sort/filter
- Column resize
- Column visibility
- Column pin
- Multi-select
- Virtualization
- Saved column preference
- Row action
- Export entry

Baseline (Decided — `DESIGN.md` `table-density` 토큰과 일치):

```text
Row height       32px (최소, 데스크톱 기본)
Header height    32px (최소)
Cell padding     4px 12px
```

`DESIGN.md`의 25px 레퍼런스 행은 compact 시각 목표일 뿐, 구현 기본값이 아니다. 줄바꿈·포커스·24px 최소 타겟에 따라 32px보다 늘어날 수 있으며, coarse-pointer(터치) 행은 44px 타겟까지 커진다.

숫자는 오른쪽 정렬하고 `tabular-nums`를 사용한다.

대규모 데이터에서는 브라우저에 전체 데이터를 전달하지 않는다.

### Platform Table과 Domain Table의 경계

Platform이 소유:

- interaction
- loading/error
- column preference
- selection model
- toolbar layout

Domain이 소유:

- column definition
- cell business meaning
- row actions
- domain filter

---

## 16. Analysis Chart Contract

Primary candidate는 `04_frontend_ui_ux.md`에 따라 Apache ECharts다.

플랫폼은 Chart의 비즈니스 정의가 아니라 **Chart Frame과 Interaction Contract**를 소유한다.

공통 Toolbar vocabulary:

```text
Zoom
Brush
Reset
Compare
Annotate
Export
More
```

Chart Frame:

```text
Title                         Actions
Description / Metric Version
Legend
Plot
Selection Summary
Source · Updated · Coverage
```

### 상태 분리

- Global Context
- Page Filter
- Chart Local State
- Persistent Annotation

차트마다 이 상태를 섞어 구현하지 않는다.

---

## 17. Permission-aware UX Contract

권한은 메뉴 노출만의 문제가 아니다.

같은 권한/Scope 규칙이 다음에 모두 적용되어야 한다.

- Menu visibility
- Route access
- Filter option
- Query result
- Saved View
- Export
- Drill-through
- Context Link
- VOC related analysis link

### UI 규칙

권한 없음과 데이터 없음은 구분한다.

```text
No matching data
```

와

```text
You do not have access to this scope
```

는 같은 Empty State를 사용하지 않는다.

URL Context는 보안 경계가 아니며 서버가 항상 재검증한다.

---

## 18. Data Trust Contract

분석 플랫폼에서는 숫자 자체만큼 **숫자의 상태**가 중요하다.

필요할 때 다음 정보를 같은 Vocabulary로 표시한다.

```text
Updated       10:32
Data through  10:00
Coverage      98.7%
Metric        v3
Status        Provisional
```

상태가 정상이라면 한 줄로 압축할 수 있다.

```text
● Data healthy · 98.7% coverage · Updated 10:32
```

상세는 Popover로 확장한다.

### Data Trust를 페이지마다 새로 설계하지 않는다

플랫폼 공통 모델로 최소 다음 의미를 정의한다.

- freshness
- calculation basis time
- coverage
- completeness / provisional state
- metric version
- source / lineage entry

실제 값의 계산 책임은 Backend/Data layer에 있고 UI는 이를 표준적으로 표현한다.

---

## 19. Loading / Empty / Error Taxonomy

`No Data` 하나로 합치지 않는다.

최소 상태:

```text
Loading
Refreshing same context
No matching result
Not collected
Processing delayed
Insufficient coverage
Permission restricted
Query too large
Partial widget failure
Server error
Unknown
```

### 규칙

- `Not collected`, `Processing delayed`, `Insufficient coverage` 등 원인을 주장하는 상태는 Backend/status source가 현재 요청 Context에 대해 그 원인을 확인한 경우에만 표시한다. 상태 원천과 관측 기준시각을 연결할 수 있어야 하며, UI가 행 수만으로 원인을 추론하지 않는다.
- 성공한 조회가 0건이라는 사실만 확인되면 `No matching result`를 표시한다. 원인/가용성 상태를 확인할 수 없으면 `Unknown`으로 표시한다. **0건 ≠ 수집 중단·미수집·파서 지연**이다. 권한 제한 역시 서버가 확인한 경우에만 그 사유를 표시한다.
- 상태 원천이 아직 없거나 원천 조회에 실패했다면 원인을 단정하지 않는다. taxonomy의 존재가 해당 상태 판정 기능의 구현을 뜻하지 않는다.

### 가공 상태 원천과 트레이스 노출 수준 (Decided, 2026-09-26)

- **원천:** 설비·기간별 가공(수집→변환→파싱→적재→검증) 상태의 `statusSource`는 **적재 워커의 단계별 처리 결과 보고**다. 플랫폼이 적재 결과 행 수로 원인을 추론하지 않는다. 보고 스키마와 파서 저장소 변경은 [01 가공 상태 보고](01_architecture_and_data_contract.md#processing-status-report)를 따른다. 이 원천이 구현되기 전까지 07/08의 수집 상태 위젯 보류 결정은 유지된다.
- **사용자용 가공 상태 조회(분석 공간):** 단계별 상태, 원인 분류(예: 파일 미수신, 형식 오류, 처리 대기), 원천이 제공한 경우의 예상 해소 시점, 현재 Context를 담은 "VOC로 문의" 동작을 보여준다. 원시 오류 메시지·스택·단계 로그·재처리 동작은 노출하지 않는다.
- **개발자용 트레이스(운영 콘솔):** 같은 원천의 원시 오류, 단계별 로그, 재처리 동작까지 보여준다. 원문 로그·설정 파일 drill-through는 [05](05_roadmap_and_open_questions.md#결정-상태)의 defer 결정을 따르며 이 결정으로 열리지 않는다.
- 두 화면은 같은 원천을 공유하고 표시 수준만 다르다. 사용자에게 보이는 상태와 내부 처리 상태를 자동으로 동일시하지 않는다(FeedbackOps ADR-0005 원칙과 같음).

### 응답 스키마 형태 (Decided; 필드명·enum 문자열은 Candidate)

위젯/조회 단위 응답은 두 층으로 구성한다.

1. **`outcome`(배타값):** `ok | empty | error | forbidden | too_large | timeout`. `empty`는 성공한 조회의 0건을 뜻하며, 본 조회 자체가 실패했다면 빈 배열 유무와 무관하게 `empty`가 아니라 `error`다. `error`는 나머지 구체 값에 해당하지 않는 잔여 실패다.
2. **`assessments[]`(이름 Candidate):** 그 조회 계약이 선언한 **적용 kind**를 빠짐없이 1회씩 담는다. 각 항목은 `state = confirmed | clear | unknown`이다. 플랫폼이 kind **어휘**를 소유하고, 각 조회 계약(공개 스키마/메뉴 선언)이 그 조회에 **적용되는 kind 목록**을 선언한다. 원천이 아직 미구현이라는 이유로 적용 kind를 목록에서 빼지 않는다 — 그 경우 `unknown`으로 응답한다(의미상 해당하지 않는 kind만 목록에서 제외). 적용 목록의 누락·중복·잘못된 상태 조합은 응답 계약 위반이며, 클라이언트는 생략을 `clear`로 보정하지 않는다.

`clear`는 "그 kind가 표현하는 문제가 해당 Context에 없음을 원천이 실제로 확인했다"는 제한적 주장이며 전반적 데이터 건강/완전성 선언이 아니다(가짜 `clear` 금지). `confirmed`/`clear`는 논리적 `statusSource`(원천 서비스 id)와 `observedAt`이 필수다. `unknown`은 생략하지 않으며 `source_unavailable`/`check_failed` 같은 평가 불가 이유를 명시한다.

`Loading`/`Refreshing same context`는 이 응답 페이로드에 없다(클라이언트 요청 생명주기). `Partial widget failure`는 위젯 결과가 섞일 때 페이지가 종합해 도출한다.

`explainsEmpty`(이름 Candidate)는 `outcome=empty`이고 해당 평가가 `confirmed`이며 원천이 **그 요청 결과의 0건 원인**을 확인한 경우에만 true다(기본 false). UI는 배열 순서·행 수로 인과를 추론하지 않는다. 복수 원인이 확인되면 모두 유지한다. `No matching result`만 보이는 조건은 `outcome=empty`이고 표시할 `explainsEmpty=true` finding이 없을 때다 — 원인 원천이 없다는 것이 `empty`의 필수조건은 아니다.

세부 판정 근거는 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §5를 따른다. 개별 원천 서비스의 실제 구현·응답 스키마 세부는 Open이며, 이 계약이 그 구현을 뜻하지 않는다.
- 동일 Context 재조회라면 기존 데이터를 유지하며 `Refreshing` 표시 가능
- Equipment/기간/Scope가 바뀌었다면 이전 값을 새 Context 결과처럼 보여주지 않음
- Dashboard 한 영역 실패 시 나머지 영역 유지
- 오류에는 Query ID / Correlation ID 제공
- 장기 Query에는 취소/기간축소/집계수준 변경 경로 제공

---

## 20. Detail Surface Contract

### Drawer

사용:

- Table row 상세
- Context를 유지한 조회/수정
- Audit/History 확인

### Modal

사용:

- Confirmation
- 짧은 입력
- 단일 의사결정

### Full Page

사용:

- 복잡한 분석 Workspace
- Metric Definition
- 장시간 편집
- Deep-link 대상이 되어야 하는 상세 작업

큰 Form을 Modal에 넣지 않는다.

---

## 21. Saved View Contract

Saved View는 단순 Filter 저장 기능이 아니라 플랫폼 공통 자산이다.

최소 저장 대상 후보:

- route
- supported global context
- page filter
- table column state
- analysis display state 중 재현에 필요한 일부

저장하지 않는 기본값:

- 일시적 hover
- 단순 chart zoom
- modal open state

이 문서 §6.1의 `savedViewToken` 계약을 따른다. 기능 제공 순서는 Deferred이며 `05_roadmap_and_open_questions.md`의 가설은 구현 승인이 아니다.

Saved View가 권한을 우회하지 않도록 복원 시 서버 Scope를 다시 검증한다.

---

## 22. Cross-menu Context Link

플랫폼의 핵심 가치는 메뉴 수가 아니라 **메뉴 사이를 문맥과 함께 이동할 수 있는 것**이다.

예:

```text
Cycle Time P95
   ↓
Slow executions
   ↓
Execution detail
   ↓
Wafer / XFR·FNC·PRC timeline
   ↓
Create VOC with current context
```

각 메뉴가 서로의 URL 문자열을 직접 조립하지 않는다.

가능하면 Platform Context Link helper를 통해:

- destination
- transferable context
- unsupported context
- permission

을 공통 처리한다.

상세에서 분석으로 복귀할 때는 §6.4에 따라 진입 전 Context를 그대로 복원하며, 목적지 ID로 출발 설비 선택을 변경하지 않는다. **CFG의 다른 메뉴와의 Context Link 연계는 Deferred**다. CFG 자체의 시각화·분석 범위와는 구분하며 이번 예시 경로에 CFG hop을 추가하지 않는다.

---

## 23. Design Tokens

**한/영 지원 범위(Decided, 2026-09-24):** UI 문구와 정적 본문만 번역한다. VOC·공지의 사용자 입력 본문, EquipmentName·분임조 이름 등 마스터 값과 식별자는 번역하지 않는다. 언어 설정 저장은 사용자 계정 선호값으로 보존하는 Candidate를 두며 저장소/API는 구현 시 확정한다. 언어 변경이 Context 값이나 URL 식별자를 바꾸지 않는다. CJK 폰트·렌더 기준은 [DESIGN](../DESIGN.md)을 따른다.

### Radius

```text
sm   4px
md   6px
lg   8px
```

과도한 roundness를 사용하지 않는다.

### Spacing

4px 기반:

```text
4  8  12  16  20  24  32  40  48
```

### Typography

```text
Page Title       24 / 32 / 600
Section Title    18 / 28 / 600
Component Title  14 / 20 / 600
Body             14 / 20 / 400
Secondary        13 / 18 / 400
Caption          12 / 16 / 400
Primary KPI      30~36 / 600
Secondary KPI    20~24 / 600
```

### Semantic Colors

Component에서 Tailwind primitive 색을 직접 의미로 사용하지 않는다.

```text
--background
--surface
--surface-subtle
--text-primary
--text-secondary
--text-muted
--border
--border-strong
--accent
--success
--warning
--danger
--info
```

Shadow보다 Border를 기본으로 하고 Shadow는 Popover/Dropdown/Drawer/Modal 같은 floating surface에 제한한다.

---

## 24. Visual Anti-patterns

### Card Soup

모든 데이터를 독립 Card로 감싸지 않는다.

### Hidden Context

Equipment / 기간 / Metric Version / Scope가 분석 중 사라지지 않아야 한다.

### Silent Drill-down

차트 클릭이 모르게 Global Filter를 바꾸지 않는다.

### Filter Duplication

페이지별 Date Picker / Equipment Selector를 따로 만들지 않는다.

### Domain Leakage into Shell

`if menu === equipment` 같은 Domain 분기를 Shell에 추가하지 않는다.

### Premature Platformization

한 화면에서만 쓰이는 복잡한 도메인 컴포넌트를 범용 프레임워크로 일반화하지 않는다.

### Decorative Visualization

업무 판단에 기여하지 않는 Gauge, Gradient, 3D Chart를 사용하지 않는다. **경계(Decided, 2026-09-22):** 기본값은 분모가 있는 비율(예: 가동률, 완료율)에 한해 donut만 허용하고, 게이지·스피드미터류(3D/그라디언트 포함)는 기본적으로 쓰지 않는다. 전면·영구 금지는 아니다 — 특정 업무 판단에 실제로 기여한다는 근거가 확인되면 케이스별로 예외를 추가할 수 있다. 근거: [당시 시각화 채택 기록](reviews/2026-09-23-decision-detail-history.md).

---

## 25. Responsive Strategy

이 제품은 Desktop-first다.

### ≥ 1440px

Full experience.

### 1024–1439px

- Sidebar collapse
- Secondary panel Drawer 전환
- Grid column 축소

### < 1024px

조회/간단 관리 중심으로 제한할 수 있다.

복잡한 분석 Workspace를 억지로 모바일 UX로 재설계하지 않는다.

---

## 26. Accessibility Baseline

분석 UI라고 접근성을 후순위로 두지 않는다.

최소 원칙:

- 색만으로 상태 구분 금지
- Keyboard focus visible
- Dialog / Drawer focus trap
- Chart title / unit / textual summary 제공
- Chart와 동일 데이터의 Table 접근 경로 제공
- icon-only action에는 accessible label
- 오류 메시지는 원인/행동을 텍스트로 제공
- 선택 상태는 색 + shape/text 병행

---

## 27. Performance UX Baseline

플랫폼의 성능 문제를 Skeleton으로 숨기지 않는다.

UI 계약:

- Query timeout / cancellation
- Progressive or partial rendering where meaningful
- large table virtualization
- server-side aggregation/downsampling
- stale data 여부 표시
- route transition 중 Context 혼동 방지

차트에 원본 로그 전체를 내려보내고 프론트에서 DataZoom으로 해결하는 방식은 금지한다.

---

## 28. Platform Governance

새 메뉴 PR은 UI가 예쁜지만 보지 않는다.

다음을 리뷰한다.

### Platform Contract

- Menu Registry를 통해 등록됐는가?
- 지원 Context를 선언했는가?
- 공통 Page Slot을 사용하는가?
- Route/Deep-link 규칙을 따르는가?
- Permission Scope가 전 구간에 적용되는가?

### Reuse

- 기존 Platform Component로 해결 가능한가?
- 페이지 전용 구현이 플랫폼 기능을 중복하고 있지 않은가?
- 반대로 한 번만 쓰는 기능을 과도하게 일반화하지 않았는가?

### Data Trust

- 데이터 기준시각을 확인할 수 있는가?
- 필요한 지표 버전/coverage를 확인할 수 있는가?
- Empty/Error/Permission 상태가 구분되는가?

### Interaction

- Global / Page / Chart 상태가 분리됐는가?
- 메뉴 이동 시 Context 전달이 명시적인가?
- Browser back/forward 동작이 예측 가능한가?

---

## 29. Platform-first Definition of Done

새 기능의 완료를 다음 두 층으로 나눈다.

### Domain Done

- 해당 메뉴 요구사항이 동작함
- 숫자/CRUD/상태전이가 정확함

### Platform Done

- 공통 계약 위에 올라가 있음
- 다른 메뉴와 Context가 연결됨
- 권한/Scope가 일관됨
- 공통 Loading/Error/Data Trust 규칙을 사용함
- 재사용할 가치가 확인된 책임은 Platform Component로 추출됨
- 추출하지 않은 Domain-specific 책임도 명확함

**Domain Done만 만족하면 플랫폼 개발 관점에서는 완료가 아니다.**

---

## 30. 구현 계획과의 경계

구현 순서·배치 시점은 Deferred다. `05_roadmap_and_open_questions.md`는 설계 결정과 Open Questions를 추적하고 과거 Phase roadmap을 non-authoritative 가설로 보존한다. 이 문서의 계약은 각 기능이 구현될 때 따라야 할 조건이며, 와이어프레임에 표현됐다는 이유만으로 해당 기능의 구현이 승인되지는 않는다.

---

## 31. App Shell 설계 산출물

구체 셸 배치·사용자 작업·상태 시나리오는 `07_app_shell_wireframe.md`에서 관리한다. §7의 레이아웃은 Shell Slot 관계를 설명하는 Candidate 예시이며 독립적인 화면 명세가 아니다.

---

## 32. Final Design Target

목표는 특정 SaaS의 외관을 복제하는 것이 아니다.

최종 플랫폼은 다음 특성을 가져야 한다.

> **정돈된 SaaS Shell**  
> + **고밀도 운영 UI**  
> + **재현 가능한 분석 Context**  
> + **시계열 Interaction**  
> + **명시적 Data Trust**

그리고 가장 중요한 기준은 다음이다.

> 새 메뉴가 추가될 때 플랫폼 코드를 계속 고쳐야 한다면 플랫폼 설계가 실패한 것이다.

반대로 모든 것을 범용화하느라 첫 메뉴조차 느리게 개발된다면 그것도 실패다.

이 플랫폼은 **작은 Kernel + 명시적 Contract + 검증된 Shared Component + 독립적인 Domain Menu** 구조를 목표로 한다.
