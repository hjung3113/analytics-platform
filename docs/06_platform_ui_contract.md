# 06. Platform UI Contract

> Status: 절마다 Decided / Candidate / Open / Deferred로 표기한다(문서 전체 상태 없음).  
> Scope: Analytics Platform UI / Platform Shell / Extension Contract  
> Related: `00_overview.md`, `02_domain_menus.md`, `04_frontend_ui_ux.md`, `05_roadmap_and_open_questions.md`

## 문서 소유권과 결정 상태

이 문서는 플랫폼 전역 UX / Scope / Context / URL / Menu Extension / Shell Slot / navigation IA의 단일 authoritative source다. `02_domain_menus.md`는 도메인 capability catalog, `04_frontend_ui_ux.md`는 구현 후보·리서치·화면 패턴, `05_roadmap_and_open_questions.md`는 결정 상태·미결 질문 및 Deferred 구현 가설, `07_app_shell_wireframe.md`는 이 계약을 소비하는 셸 설계다. 외부 디자인 참고자료와 에이전트 스킬은 제품 계약의 근거가 아니다.

- **Decided**: 플랫폼 책임 경계와 명시적인 계약 규칙. 구현 완료를 뜻하지 않는다.
- **Candidate**: 별도로 Decided라고 명시하지 않은 배치·토큰·페이지 예시와 기술 선택. 아래에 명시한 셸 치수·테이블 밀도 결정은 제외한다. 독립 초안끼리 일치해도 승인으로 간주하지 않는다.
- **Open**: Scope 부모·자식 상속, 최초 기본 Δ, timeDomain assertion 공급 근거, 다중 Site의 같은 날짜·교대일/영업일 등 각 절에 명시한 미결 입력. URL 메커니즘과 Site→room_name→StGroup→Equipment 관계의 Decided 상태 및 공개 필드명·enum의 Candidate 상태와 구별한다.
- **Deferred**: 저장된 뷰 등 후속 구현 범위. 이 설계가 기능 제공 시점을 확정하지 않는다.

§5~6, §8~9, §11, §17, §19의 책임·행동 규칙은 Decided다. §7 셸 구조·치수는 2026-10-04 [ADR-0011](adr/0011-design-direction-feedbackops-shell.md)로 FeedbackOps AppFrame 구조(레일 52px·사이드바 240/56px·상단 바 없음·페이지 머리 50px)로 Decided됐다. 치수 값의 단일 원본은 `packages/ui/src/styles/tokens.css`의 레이아웃 토큰이다(FeedbackOps `a8d768b8`에서 이전). §15 테이블 밀도(최소 32px)는 2026-09-21 `DESIGN.md` canonical 값으로 Decided다. §23 토큰 값의 원본은 ADR-0011로 Decided이며, 나머지 §23 정책·§25 반응형 정책은 아직 Candidate다. 구현 순서와 남은 일은 [`.planning/README.md`](../.planning/README.md)가 관리하며 이 문서의 계약 상태와 별개다.

구현 순서·배치 시점은 Deferred이며, 이 문서의 계약은 각 기능이 구현될 때 따라야 할 조건이다. 와이어프레임에 표현됐다는 이유만으로 해당 기능의 구현이 승인되지는 않는다. 구체 셸 배치·사용자 작업·상태 시나리오는 `07_app_shell_wireframe.md`가 관리한다.

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

단, 플랫폼을 목표로 한다는 이유만으로 처음부터 범용 위젯 엔진·외부 플러그인 SDK·저코드 빌더를 만들지는 않는다. **메뉴에서 나온 책임은 실제 메뉴 2~3개에서 반복이 확인된 뒤에만 플랫폼 기능으로 승격**한다. §4 Platform Kernel 책임은 이 반복 기준의 대상이 아니다(§24 적용 범위).

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
- 라우트 단위 Error Boundary(메뉴 화면 렌더 실패를 콘텐츠 슬롯에 가두고 Correlation ID를 표시한다. 보고는 어댑터 `reportClientError`에 식별 필드만 보낸다)
- Toast / Modal infrastructure (확인 대화상자 헬퍼는 후보)
- Theme / Design Token
- 공통 Keyboard Shortcut: ⌘/Ctrl+K 명령 팔레트, `[` 사이드바 접기/펼치기(입력 중 제외), Esc로 상세 패널(패널 안)·팝오버 닫기. 셸은 본문 바로가기 링크를 제공한다
- 메뉴 활용률 계측(진입·체류 이벤트는 어댑터로 전송하고, 콘솔은 집계만 읽는다)

현재 구현: 즐겨찾기·최근 방문(12건)·마지막 Scope 제안·사이드바 접힘·언어·표 열 설정은 브라우저 localStorage에만 저장된다(기기 간 동기 없음). 서버 보존 여부는 결정 대기(`.planning/README.md`).

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

메뉴·그룹이 선언하는 개념적 정보(Decided — 그룹 표시 행만 Candidate):

| 정보 | 책임 |
| --- | --- |
| 식별자·그룹·이름·경로·아이콘 | 메뉴 탐색과 현재 위치 표시 |
| 필요한 권한·Scope | 플랫폼의 노출 판단과 서버의 접근 검증 |
| 지원 Context | 기간·설비·Equipment Group의 두 층·room_name·Lot·PPID·Recipe·지표 버전의 지원 여부 명시 |
| 페이지 유형 | overview / analysis / management / catalog / workflow |
| 선택 기능 | 내보내기·저장된 뷰·주석·비교 지원 여부 |
| 조회 엔드포인트 (2026-10-01) | 메뉴가 부르는 서버 조회마다: 식별자·소유 메뉴·허용 입력 키·데이터 접근 권한(메뉴 권한과 달라도 됨)·Scope 요구·적용 Context(메뉴가 적용하는 키의 부분집합)·적용 assessment kind(§19)·조회 한도·시간역 병합 가드 적용 여부(`mergeTimeDomain`, §6.3). 요청에는 적용 Context와 입력만 실리고, 서버는 요청이 아니라 자기 선언 사본으로 권한·kind·한도를 판정한다. 선언과 다른 요청 모양(적용하지 않는 Context 키, 적용 키 누락, 선언 밖 입력 키)은 오류다. Scope를 요구하지 않는 조회는 site에 묶인 Context(room_name·Condition·Selection·Lot·Recipe·PPID, §22)를 적용할 수 없다 |
| 쓰기 동작 (2026-10-20) | 서버 쓰기는 메뉴가 동작마다 선언하고(`ActionSpec`: 식별자·소유 메뉴·허용 입력 키·권한·Scope 요구·동시성 방식 `none`/`version`·성공 뒤 다시 읽을 조회) 포트의 범용 `menuAction` 하나로 보낸다. 요청에는 동작 id·`scopeId`만 든 `context`·`input`·멱등 키·(버전 방식이면) `expectedVersion`이 실린다. 답은 조회 `ApiResponse`가 아니라 쓰기 전용 `ActionResponse`(`outcome` `ok`·`invalid`·`conflict`·`forbidden`·`not_found`·`error`·`unknown`, 필드 오류, `replayed`)다. 서버 판정 순서·멱등 기록·버전 충돌은 [ADR-0054](adr/0054-write-port-declared-actions-idempotency-version.md)와 [실서버 체크리스트](integration/real-server-checklist.md) §3. 구현 형식(Candidate): `packages/contracts/src/action.ts`. Kernel 훅은 #502. |
| Sidebar 그룹 표시 (`hideLabelWhenSingle`, Candidate) | 그룹이 선언하면 확장된 사이드바에서 보이는 메뉴가 하나일 때 섹션 제목을 생략한다. 기본값은 생략하지 않음 |

**열린 메뉴 어휘(Decided, [ADR-0072](adr/0072-open-menu-vocabulary-app-declared-branded-ids.md)):** 그룹 id·공간 id·메뉴 권한은 `@ap/contracts`의 브랜드 문자열이고(`groupId('…')`·`spaceId('…')`·`menuPermission('…')`로 만든다), SDK는 그 값 목록을 갖지 않는다. 닫힌 목록은 앱이 선언한다 — 공간·그룹은 `SPACES`·`GROUPS`, 메뉴 권한은 `createRegistry({ permissions })`에 넘기는 목록이다. `createRegistry`는 선언되지 않은 그룹·공간·권한과 모양이 틀린 id를 `RegistryError`로 거부하고, Kernel 고유 권한(`KERNEL_PERMISSIONS`)과 앱이 선언한 권한의 `:` 앞부분을 모듈 id가 쓸 수 없는 예약 네임스페이스로 본다. 전체 목록은 `registry.permissions`다. 새 그룹·공간·권한은 계약 패키지가 아니라 앱 조립 파일을 고친다.

메뉴와 그룹이 선언하고 Shell이 소비한다. 필드명·TypeScript 타입·등록 방식은 구현 설계에서 구체화한다(그룹 표시 행의 필드명 `hideLabelWhenSingle`은 Candidate). 조회 엔드포인트 선언의 구현 형식(Candidate)은 `packages/contracts/src/menu-query.ts`의 `EndpointSpec`이고, 결정과 이유는 [ADR-0019](adr/0019-menu-query-endpoint-declaration.md)다.

페이지 키(`pageKeys`·`contextResetKeys`), 상세 경로(`parent`·`navHidden`), Scope 필요 여부(`requiresScope`), 지표 초기화(`initializesMetric`), 그룹 대표(`primary`, 그룹당 정확히 하나)도 메뉴가 선언한다. `createRegistry`가 시작 시 중복·충돌·공간 규칙을 검증한다([패키지 경계](integration/platform-packages.md) §5). 필드명은 Candidate다.

화면(`component`) 없이 manifest만 등록한 메뉴도 허용한다. 사이드바·팔레트에 '예정'으로 표시되고 선언(권한·pageType·Context capability)만 보여 준다.

**조회 실행 선언(Decided, [ADR-0061](adr/0061-query-draft-applied-address-and-required-gate.md)):** 선택적 `query: { mode: 'apply', required?: { context?: ContextKey[], page?: {key,label: Text}[] } }`로 일괄 적용을 선택한다. 부재는 live 모드다. Apply는 time capability가 apply여야 하며 필수 Context는 메뉴가 apply하는 알려진 키, 필수 page는 `pageKeys`와 비어 있지 않은 ko/en label이어야 한다. Scope는 `requiresScope`로 선언한다. 엔드포인트의 선택적 `requiredContext`도 그 엔드포인트가 apply하는 키만 받는다. Apply 메뉴와 엔드포인트가 함께 apply하는 키의 명시적 required 선언은 일치해야 한다(등록 검증). 보조 엔드포인트의 작은 투영에는 메뉴의 다른 필수 키를 강요하지 않는다. 서버는 [ADR-0019](adr/0019-menu-query-endpoint-declaration.md)의 모든 투영 필드 구조적 존재 검사에 더해 required의 의미적 존재를 검사한다. 초안 API·실행은 §11, 서버 표본은 [연결 체크리스트](integration/real-server-checklist.md) §4를 따른다.

### 금지

- 신규 메뉴 추가 때 Sidebar JSX 직접 수정
- 메뉴마다 Breadcrumb 수동 구현
- 페이지마다 별도의 Date Picker 구현
- 페이지가 권한에 따라 메뉴 숨김 로직을 직접 구현
- 메뉴별 임의 query parameter 규칙 생성

---

## 6. Context Capability Contract

§6.1–6.4와 §19의 세부 판정 근거·반례·Candidate 필드명 전체 목록은 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md`를 따른다.

전역 Context를 모든 메뉴가 무조건 소비하는 것은 아니다.

각 메뉴는 어떤 Context를 지원하는지 선언한다.

예:

| Menu | Time | Equipment | Lot | Metric Version |
| --- | --- | --- | --- | --- |
| Equipment Master | △ | O | X | X |
| 생산성 개요 | O | O | X | △ |
| 사이클타임 | O | O | O | O |
| Wafer Journey | O | O | O | △ |
| Metric Catalog | X | △ | X | O |
| VOC | X | X | X | X |

`O`: 직접 필터로 적용  
`△`: 전달/참조 가능하지만 직접 조회 필터는 아닐 수 있음  
`X`: 미지원

코드 어휘(이름 Candidate): Context 키 10종 `time`·`roomNames`·`line`·`prcGroup`·`condition`·`selection`·`lot`·`ppid`·`recipe`·`metric`(`scopeId`는 별도 키), 지원 값 `apply`(O)·`reference`(△)·`unsupported`(X).

VOC 행: `/voc`(내 VOC)는 `myActivity` 그룹의 FeedbackOps 신고자 화면(다리, [ADR-0071](adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md), #654)이고 `/voc/:vocId`(내 VOC 상세)는 그 아래 navHidden 상세다. 세션 사용자 기준 읽기라 전역 Context를 모두 `unsupported`로 선언한다. 페이지 키는 `/voc`가 `q`·`status`·`sort`·`focus`(`focus`는 셸 상세 패널, 잘못된 값은 거부하고 보존, §6.4), 상세가 `returnTo`다. VOC 처리 워크플로는 FeedbackOps가 전담한다([ADR-0027](adr/0027-feedbackops-stays-standalone-entry-links.md)).

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
- URL은 요청한 `scopeId`, `from`/`to`, `roomNames`, `lineNames`, `prcGroups`, `equipmentGroup`(Condition)와 `membershipBasis`(소속 기준), `selectedEquipmentIds`(Selection; 기존 `equipmentIds` 대응), `lotIds`, `ppid`, `recipeIds`, `metricId`/`metricVersion`, 해당 화면의 탭/저장된 조회조건 식별자 및 해당하는 경우 occurrence anchor를 소유한다. 공개 필드명·조건 인코딩은 별도 결정이 없으면 Candidate다. `equipmentGroup` 맵 확장과 `membershipBasis`는 ADR-0059에서 Decided로 정했다(#552 1부 계약·호환 구현). 객체 ID는 목적지 경로/계약에 따라 별도로 전달한다.
- **`lotIds` / `ppid` / `recipeIds`(필드명 Candidate, 축은 Decided)**: Lot은 논리적 묶음, Job은 실행 인스턴스이며 1:1이 아니다. PPID는 LEH `FlowId`, Recipe(`prc_name`)는 PRC `RecipeId`다. Recipe를 Lot 전체의 고정값으로 가정하지 않는다. `lotIds`/`recipeIds`는 집합 정규화, `ppid`는 단일값 후보로 등록한다. Operation은 v1 필터/URL 축에서 제외한다. Recipe 필터가 Job 전체를 포함할지 매칭 PRC 구간만 포함할지는 **Candidate / 메뉴별 정의**이며 Kernel이 강제하지 않는다.
- **Equipment Group 두 층(Decided, 2026-10-21 — [ADR-0059](adr/0059-app-injected-equipment-axes-and-condition.md); #552 1부 계약·호환 구현)**: Condition은 앱이 주입한 axisId → 비어 있지 않은 value-id 배열의 맵이다. 서로 다른 축은 AND, 같은 축의 값은 OR이며 축 부재는 그 축 무제약이다. `equipmentGroup`은 단일 JSON 값으로 유지한다. Line·PRC 그룹은 Condition 축이 아닌 독립 전역 집합 키 `lineNames`/`prcGroups`다(2026-10-21 사용자 정정 — 소유자 #552·#513). v1 Maker+Model은 maker/model 단일값 AND 맵으로 읽는다(2026-10-21 구현에서 확정 — 코디네이터 결정, 사용자가 되돌릴 수 있음). Selection `selectedEquipmentIds`는 명시적으로 고른 **고정 EquipmentID 집합**이다. 조건만 선택했다고 결과 전체를 자동 물질화하지 않는다. [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md)의 두 층 분리는 유지한다.
- **주입 축과 소속 기준(Decided, 2026-10-21; #552 1부 계약·호환 구현)**: 앱은 안정 `id`, 표시 `label`, `membershipHistory: boolean`, 선택적 `dependsOn: axisId` descriptor를 공급한다. 플랫폼은 닫힌 축 union 대신 axis-id 문자열을 주입 descriptor에 대조한다. 공개 API는 특정 업무 시스템·SQL·SP 구조를 모른다. `membershipBasis` 부재는 `current`(지금 소속), `asOf`는 그 시점 소속이다. 사용한 모든 축이 이력을 지원해야 `asOf`가 유효하고 아니면 거부한다(자동 current 전환 금지). 사용자가 기준을 고르며 서버가 소속 이력을 공급한다. `roomNames`는 기존 독립 집합 키다. Maker→Model 같은 의존 축은 서버가 선택한 부모 값 안에서 평가하며 클라이언트가 자식 값을 조용히 지우지 않는다.
- **Line / PRC 그룹(Decided, 2026-10-21 사용자 정정 — 소유자 #552·#513):** `lineNames`/`prcGroups`는 Site에 묶인 독립 집합 키이며 Scope 변경 때 지운다. 부재는 무제약, `lineSelection=none`/`prcGroupSelection=none`은 명시 공집합이고 ID와 표식을 함께 쓰면 오류다. Line은 room_name에 걸칠 수 있으며 권한 수준이 아니므로 Scope·room grant 외 별도 grant를 요구하지 않는다. `membershipBasis=asOf`는 Condition 또는 PRC 그룹이 있을 때만 유효하다. PRC 그룹은 서버 소속 이력 지원 키이고 Condition은 사용 축 전체의 이력 지원을 검증한다. 기준은 Condition·PRC 그룹과 함께 복사·투영하며 두 값이 모두 없으면 serializer가 기준도 생략한다.
- **room_name은 Global Context(Decided)**: 공개 집합 키 후보는 `roomNames`이며 도메인 값 `room_name`과 매핑한다. 요청 Scope 안의 조회 범위를 좁히며 권한을 부여하지 않는다. 집합 정규화/공집합 규칙을 따르고 Page Filter `processIds`를 별도로 만들지 않는다.
- **page-owned URL 키의 예시로 `granularity`(Candidate 필드명, Decided — 메커니즘)**: 조회 기간(`from`/`to`)과 집계 단위(시간별/일별/주별로 뭉쳐 보기)는 다른 축이다. 모든 메뉴가 집계 단위 선택을 갖는 게 아니므로 전역 Context Bar가 아니라 `metricId`+`metricVersion` 쌍과 같은 방식으로 화면마다 선언·등록하는 page-owned 계약으로 둔다. 값 후보: `hour`/`day`/`week`.
- 딥링크 왕복은 조회조건·명시 선택·지표 버전을 재현한다. live Condition은 재방문 시 선언한 소속 기준의 멤버/매칭 결과를 재평가하므로 대상 집합이 달라질 수 있음을 표시한다. Selection은 고정이며, 지연 완료·마스터 정정으로 숫자는 달라질 수 있으므로 결과에는 계산 기준시각을 표시한다.
- 단순 차트 줌은 로컬 상태다. Brush 후 명시적인 분석 구간 적용만 전역 Context/URL로 전달한다.
- 미지원 Context는 조용히 버리지 않고 적용되지 않음을 표시한다. 보존·재적용 방식은 §6.4를 따른다.
- `savedViewToken`은 긴 URL을 대체할 후보 계약으로 예약한다(Deferred). 저장된 뷰 구현 전에는 토큰 생성이나 비활성 버튼을 셸 필수 요소로 두지 않는다.

**URL/JSON 케이싱과 매핑 소유 (Decided):** URL·JSON 공개 필드명은 camelCase, DB는 해당 스키마 관례(snake_case)를 유지한다. 컬렉션은 URL 반복 키(`equipmentIds=A&equipmentIds=B`), JSON은 배열로 직렬화한다(콤마 결합은 ID의 예약문자와 충돌할 수 있어 채택하지 않는다). 공개 계약(이름·타입·카디널리티·버전·지원 Context·page-owned 키 등록)은 플랫폼 Kernel이 소유하며 클라이언트 라우터와 서버 요청 검증은 같은 산출물을 소비한다. SQL 컬럼/조인/계산식 매핑은 서버 소비 계층이 소유하고 공개 필드가 DB 컬럼과 1:1이라고 가정하지 않는다. 구현 형식(OpenAPI/JSON Schema/codegen)은 Candidate.

**집합 키 정규화와 공집합 표식 (Decided):** 집합 키(`selectedEquipmentIds`; 기존 `equipmentIds` 대응, `roomNames`, `lotIds`, `recipeIds`)가 URL에 부재하면 해당 명시 집합의 제약은 없다(Scope·권한·다른 조건·조회량 제한은 유지). Selection 부재는 Condition이 있을 때 그 소속 기준의 평가 결과 전체를 조회한다는 뜻이지 Condition까지 무제약으로 바꾸는 뜻이 아니다. 유효 ID 1개 이상이면 선택 집합이며 중복은 제거하고 순서는 무의미하다(정규 URL은 Unicode 코드 포인트 사전식 정렬, trim/대소문자 변환/유니코드 정규화로 서로 다른 ID를 합치지 않는다). 빈 문자열/공백만 있는 ID는 형식 오류다(반복 키는 항목이 0개면 키 자체가 사라지므로 `equipmentIds=`는 "빈 ID 1개"이지 "선택 0개"가 아니다). **명시적 공집합**은 집합 키마다 등록되는 단일값 표식으로 표현한다(필드명 Candidate, 예: Selection 집합의 `equipmentSelection=none`). 표식만 있으면 명시적 공집합, ID 키와 표식이 동시에 있으면 오류다. 공집합을 지원하는 메뉴는 나머지 요청이 유효할 때 `outcome=empty`로 처리하고, 공집합 때문에 잘못된 Scope/기간을 성공으로 바꾸지 않는다. **미지원 메뉴는 공집합을 미적용으로 보존할 뿐 자기 결과를 강제로 empty로 만들지 않는다.** 표식과 ID 집합은 한 논리 Context로 함께 전달·제거한다.

**Condition의 null / 빈 배열(Decided, 2026-10-21; #552 1부 계약·호환 구현):** 내부 `condition=null`은 URL `equipmentGroup` 부재이며 축 제약 없음이다. 맵 `{}`도 제약 없음으로 정규화해 키를 생략한다. URL의 JSON `null`·배열, 맵의 축 값 `null`·`[]`·빈 ID는 `invalid_condition`이며 보정하지 않는다. 값 배열은 기존 ID 집합처럼 중복 제거·정렬하되 ID를 변형하지 않는다. Condition 축에는 명시적 공집합 표식을 만들지 않는다. 기존 `roomNames=null`/`selection=null`은 키 부재, `[]`는 각각 `roomSelection=none`/`equipmentSelection=none`을 뜻한다. 이 변경은 다른 기존 집합 키의 표식도 바꾸지 않는다.

**단일값 키 중복 (Decided):** `scopeId`/`from`/`to`/`v`/`equipmentGroup`/`membershipBasis`/`ppid`/`metricId`/`metricVersion`/목적지 ID 등 카디널리티 1인 키가 반복되면 같은 값이어도 형식 오류다. 클라이언트와 서버가 첫 값/마지막 값을 다르게 해석하는 것을 금지한다.

**전역 지표 Context: `metricId` + `metricVersion` 쌍 (Decided):** v1의 전역 지표 Context는 단일 `metricId`와 단일 `metricVersion`의 쌍이다. 두 필드는 공개 스키마에 함께 등록하고 함께 보존·적용·제거한다(전역 반복 키나 지표별 맵은 v1에 없음). 완성/초기화 불변식:
  - query에 둘 다 있음 → 완성된 전역 Context. 서버가 그 `metricId`에 그 `metricVersion`이 속하고 유효한지 검증하고, 실패하면 오류로 처리하며 최신 버전으로 대체하지 않는다.
  - query에 ID만 있음 → 초기화를 선언한 진입점에서만 미완성 입력으로 허용하고, 서버가 확인한 게시 버전을 URL에 기록한 뒤 조회한다. 확인 불가면 선택 상태, 초기화 미지원 경로는 계약 오류다.
  - query에 버전만 있음 → 목적지 경로 계약이 소유 `metricId`를 유일하게 정의할 때만 경로 ID를 query로 복사해 쌍을 완성한다. 세션·이전 화면·화면 이름으로 ID를 추정하지 않는다.
  - query에 둘 다 없음 → 전역 지표 Context 없음. 경로가 지표 하나를 유일하게 식별하고 초기화를 선언했다면 물질화 가능하고, 아니면 선택 상태다.
  - 목적지 객체의 지표 ID와 전역 `metricId`는 역할이 다를 수 있다(지표 A 문맥을 들고 지표 B 상세로 이동). 목적지 ID로 전역 쌍을 몰래 덮어쓰지 않는다. 같은 지표를 요구하는 경로인데 ID가 다르면 오류다.
  - Context Link helper는 대상이 **동일한 `metricId`의 해당 버전**을 조회에 쓸 때만 쌍을 적용한다. 다른 지표·미지원 메뉴는 쌍을 보존하되 미적용으로 표시한다. 사용자가 명시적으로 바꾸거나 제거할 때만 쌍 전체를 변경한다.
  - 여러 지표 버전이 필요한 화면은 page-owned 계약으로 선언·등록·검증한다. 전역 단일값을 모든 위젯의 버전으로 확대 해석하지 않으며, 같은 지표에 전역 값과 page-owned 값이 상충하면 오류로 처리한다(묵시적 우선순위 없음).

**줌 vs 명시적 구간 적용, v1 소수초 처리 (Decided):** v1에서 URL/전역 Context로 적용되는 구간은 초 정렬 `[from, to)`뿐이다. 판정 기준은 구간 길이가 아니라 **선택한 양 경계가 초에 정렬돼 있는가**다. 미정렬이면 외향 정렬(시작은 이전 초로 내림, 끝은 다음 초로 올림) 미리보기를 보여주고 사용자가 확인해야 URL/전역 Context가 바뀐다. 확인 전에는 조회·URL을 바꾸지 않고, 취소하면 로컬 브러시만 유지한다. v1은 소수초 정확 구간 공유를 지원하지 않는다.

### 6.2 Scope와 권한 (Decided / Open)

- Scope는 사용자가 요청하는 조직·데이터 접근 범위다. `scopeId`는 URL에 담지만 권한 증명이 아니다. 서버는 **매 요청마다** 사용자 권한과 요청 Scope를 재검증한다.
- 접근할 수 없는 Scope는 명시적 오류/선택 상태로 처리하며 다른 Scope로 조용히 대체하지 않는다. 같은 URL이 다른 사용자에게 같은 접근 권한을 부여하지 않는다.
- 세션·최근방문 값은 미검증 후보이며, 재적용 전에 현재 Scope에서 설비·Lot 선택과 권한의 유효성을 다시 검증한다.
- **요청 `scopeId`는 하나다(Decided).** 부재는 명시적 선택 상태이며 임의 Scope로 대체하지 않는다. Scope 선택지 조회와 분석 데이터 조회는 구분한다. 사용자가 명시한 무단 ID는 조용히 제거하지 않으며, 전체 권한 실패는 `outcome=forbidden`이다(§19).
- **권한·조회 범위는 Site → room_name → StGroup → Equipment 관계를 따른다(Decided, 2026-09-24).** 실무 권한 부여 축은 Site 내 room_name이다. room_name과 StGroup은 여러 Line에 걸칠 수 있으며 Line은 독립 생산·조회 축이다. Factory는 별도 Scope 레벨로 모델링하지 않는다. [ADR-0005](adr/0005-scope-room-name-line-independent.md)가 ADR-0001의 Line 중심 Scope 주장을 대체한다.
- 설비 분류(Maker → Model → ChamberType → EquipmentID)는 위 접근 범위와 별개다. StGroup은 room_name·Site 경계를 넘지 않는 설비 능력 묶음이며 분임조는 엔지니어 조직 묶음이다. 둘의 소속은 외부 공급값이다. Group 조건이나 Line 선택이 room_name 권한을 대신하거나 넓히지 않는다. 근거: [GLOSSARY](../GLOSSARY.md).
- **요청 `scopeId`는 v1에서 단일 선택만 허용한다(Decided, 2026-09-22).** 복수 Scope 선택은 이후 확장 후보로 남기되 v1 범위 밖이다.
- **부모·자식 권한 상속 및 조회 필터 자동 포함의 세부 규칙은 Open domain decision이다.** room_name이 실무 권한 축이라는 결정과 구별한다. Site 선택만으로 모든 room_name에 대한 접근이 허용된다고 해석하지 않으며, 셸에 고정 다단 선택기를 요구하지 않는다.
- **Site는 물리 DB 경계다(Decided).** Site 선택은 컬럼 필터가 아니라 연결 대상을 정한다. 설비 ID 사용 전에 활성 Scope의 Site가 확립돼 있어야 한다. URL에 없는 `scopeId`를 세션에서 몰래 채우거나 EquipmentID로 Site를 역산하지 않는다([ADR-0004](adr/0004-site-is-db-partition-not-column.md)).
- **Scope 확인 상태(현재 코드 어휘, 이름 Candidate):** `none`·`validating`·`valid`·`forbidden`·`unknown_scope`(서버가 모르는 id — 권한 거부가 아니다)·`error`(확인 요청 실패). `error`는 자동 재시도 없이 사용자가 '다시 시도'하며, 현재 세션에서 `valid`가 되기 전에는 Scope가 필요한 조회를 보내지 않는다.

<a id="ctx-time"></a>
<a id="63-시간-계약-decided-tz-값다중-사업장-같은-날짜는-open-domain-decision"></a>
### 6.3 시간 계약 (Decided; 다중 사업장 같은 날짜·교대일/영업일은 Open domain decision)

> **참조 `CTX-TIME` — 이 절이 전역 Context·URL 시간 계약의 원본이다.** 문서 탐색용 식별자이며 공개 API 버전이 아니다. 결정 상태·예외·미결은 아래 해당 문단을 읽는다. 위 두 anchor는 안정 참조와 과거 제목 링크 호환용이며 제목 변경 때도 유지한다.
>
> **의존:** [03 시간 계약](03_backend_stack.md#시간-계약-중요--2차-리뷰에서-발견된-실수)의 원천 wall-clock, §6.1의 초 정렬·원천 정밀도 및 §6.2의 Scope, [01 R/H 정책 원본](01_architecture_and_data_contract.md#late-arrival-policy). `defaultRangeTo`의 의미는 이 절, `R`/`H`의 의미는 01이 소유한다.

기간은 파서 원본과 같은 시간대 없는 설비 wall-clock으로 전달하며 임의로 UTC로 변환하지 않는다. 시간의 원천 의미는 `03_backend_stack.md`를 따른다. 아래는 이 wall-clock 계약 위에서 **메커니즘 수준으로 확정한** 항목이다. TZ 실제 값은 한국(Asia/Seoul) 단일값으로 우선 확정했다(2026-09-22, 해외 사업장인 중국 시안·미국 오스틴 실존은 확인됐으나 확장은 아직 미착수). 다중 사업장이 실제로 편입될 때의 "같은 날짜" 의미와 교대일/영업일 의미는 여전히 Open domain decision이다.

**구간 경계와 datetime 문자열 (Decided):** 공통 조회 경계는 half-open `[from, to)`이며 `from < to`를 요구하고 잘못된 날짜는 보정하지 않고 거부한다. v1 URL의 `from`/`to`는 정확히 `YYYY-MM-DDTHH:mm:ss`(naive, `Z`/offset·소수초·날짜-only는 형식 오류)다. 원천값·조인 키·occurrence anchor의 정밀도는 축소하지 않으며, 경계 비교는 원천 전체 정밀도로 한다(`to=10:00:00`이면 `10:00:00.000`과 `10:00:00.500` 모두 제외). v1의 초 단위 입력 제한은 원천 정밀도 축소가 아니라 **신규 제품 제한**이다.

**날짜만 선택한 경우 (Decided):** URL에는 datetime만 허용한다. 달력에서 고른 양끝 포함 구간 `[D1, D2]`는 UI에서 `[D1T00:00:00, (D2+1일)T00:00:00)`으로 변환해 URL에 쓴다("다음 날"은 naive 달력 연산이지 UTC instant+24시간이 아니다). 교대일·영업일·다중 사업장 같은 날짜 의미는 이 결정 밖(Open domain decision)이다.

**원천 시간대 미확인 시 처리 (Decided):** 단일 설비, 또는 동일 wall-clock 기준이 확인된 설비 집합은 절대 TZ를 몰라도 naive 범위로 조회할 수 있다. 임의의 기본 TZ를 가정하거나 URL `from`/`to`를 UTC 필터로 바꾸거나 확인 안 된 다른 시간역과 축을 병합하지 않는다. TZ 미확인은 Data Trust에 표시한다. 확인된 TZ 이름이 있어도 DST 등으로 변환이 항상 가능한 것은 아니므로, 확인된 이름 ≠ 변환 가능이다. 이 결정이 향후 별도 UTC 분석 API 자체를 영구 금지하는 것은 아니다.

**복수 설비 시간축 병합 가드 (Decided):** 서로 다른 설비를 같은 시간축/버킷으로 병합하는 조회는 **서버 소유 assertion**이 있을 때만 허용한다(비보장을 "경고 후 허용"으로 약화하지 않는다). `scopeId`나 클라이언트가 보낸 시간역 id는 증명이 아니다. 최소 assertion 계약: `(equipmentId, timeDomainId, validFrom, validTo)`, 범위 `[validFrom, validTo)`(해당 설비의 naive wall-clock, 내부 정밀도 유지 — 지금 특정 테이블·마이그레이션을 요구하지 않는다). 실제 조회 대상 설비 전체에 대해 요청 `[from, to)` 전체가 빈틈없이 덮이고, 그 구간들의 `timeDomainId`가 모두 같을 때만 병합을 허용한다(한 설비가 요청 중간에 도메인을 바꿔도 v1 병합은 거절). 덮이지 않은 구간이 있으면 `time_domain_unverified`, 확인된 도메인 불일치가 있으면 `time_domain_mismatch`이며, 둘 다 `outcome=error`(요청 검증 오류, correlation id)로 처리하고 `empty`/`unknown`/경고 후 병합으로 위장하지 않는다. 이력 없는 현재 스냅샷으로 과거 구간을 소급 증명하지 않는다. 서로 다른 시간역의 **분리** 조회는 계속 허용한다.

**Apply 모드 기본 기간 예외(Decided, ADR-0061):** 아래 물질화 시계와 범위 계산은 재사용하지만 기간 양쪽이 없는 유효 주소에서는 기본 기간을 초안에만 둔다. 적용 URL에는 쓰지 않고 조회하지 않는다(§11). live 메뉴의 URL 물질화는 유지한다. 부분·잘못된 기간은 두 모드 모두 오류로 거부하며 보정하지 않는다.

**기본 구간 물질화 시계 `defaultRangeTo` (Decided):** 브라우저 로컬 now, 서버 UTC 문자열 절단, "watermark = now = Data through" 등식은 모두 쓰지 않는다. 서버가 해당 시간역·데이터셋의 기본 조회 상한 `defaultRangeTo`(배타적 초 경계, wall-clock)를 제공한다. `defaultRangeTo`는 half-open 구간의 상한이므로 그 값 자체는 §6.3의 경계 규칙에 따라 항상 제외된다. 서버가 이 값을 정할 때 "포함"이 뜻하는 것은 **포함하려는 마지막 실제 데이터 시각이 `defaultRangeTo`보다 항상 이전이 되도록**(그 시각이 필터로 잘리지 않도록) 상한을 잡는다는 것이지, 상한 이전 데이터가 모두 도착했거나 집계가 완전하다는 뜻이 아니다 — 예를 들어 포함하려는 마지막 시각이 `10:00:00.000` 또는 `10:00:00.500`이면 `defaultRangeTo`는 최소 `10:00:01`이어야 한다. 기본 구간은 `[defaultRangeTo − Δ, defaultRangeTo)`(naive 길이 산술, 자정 비정렬)로 물질화하며, 산출 불가 시 자동 물질화하지 않고 기간 선택을 요구한다. 현재 포트(`defaultRangeTo(): string`)는 항상 값을 준다 — 산출 불가 분기는 실서버 연결(#154) 때 포트에 더한다(결정 대기, `.planning/README.md`). 한 번 물질화한 URL 기간을 데이터 갱신만으로 자동 이동시키지 않는다. 사용자가 명시적으로 고르는 기간 프리셋(`1일/7일/사용자 지정`)은 이 메커니즘을 그대로 재사용해 Δ=24h/168h로 확정했다(2026-09-22). 최초 진입 시 자동 물질화되는 기본 Δ 숫자 자체는 별도로 Open이다.

**조회 바 달력 프리셋(Decided, 2026-10-21, #553 위임 결정):** Apply 모드의 최근 24시간·최근 7일은 같은 서버 앵커에서 24h·168h를 뺀다. 오늘은 `defaultRangeTo`의 날짜 D, 기준일은 사용자가 고른 날짜 D로 `[D 00:00:00, D+1 00:00:00)`를 만든다. 브라우저 now·UTC 변환을 쓰지 않으며 직접 범위는 초 정렬 naive 시각을 그대로 유지한다. 이 명시적 선택은 최초 기본 Δ의 Open 결정을 바꾸지 않는다.

`defaultRangeTo`와 자동 재집계 창의 원천 진행 경계 `R`(정의는 [01 지연 완료 허용 시간](01_architecture_and_data_contract.md#late-arrival-policy) 참조)은 서로 다른 계약 필드이며 항상 같은 값은 아니다. **`R`이 존재할 때만** 같은 시간역·대상 조건에서 `defaultRangeTo ≤ R`인 경우에만 그 기본 구간을 자동 물질화하고, 만족하는 값이 없으면 마지막 점을 버리거나 `R`을 올리지 않고 기간 선택을 요구한다(L2). `R`이 아직 없는 경우(첫 mart 세대 생성 전, 워커 일시 중단 등)에는 이 비교를 적용하지 않는다 — `defaultRangeTo`가 독립적으로 유효하면 그대로 자동 물질화하고, 자동 재집계만 보류한다([01 정책](01_architecture_and_data_contract.md#late-arrival-policy) 참조).

**실제 시점은 wall-clock이 아니다 (Decided, 2026-09-28):** 설비 업무 시각이 아닌 실제 시점(epoch·timestamptz — 예: 메뉴 활용률 마지막 사용, FeedbackOps VOC 접수 시각)은 이 절의 wall-clock 계약 대상이 아니다. 화면에는 `@ap/contracts`의 `formatInstant`로 보는 사람의 시간대에 맞춰 표시하고, `formatDateTime`(naive wall-clock 전용)으로 표시하지 않는다. `formatInstant`는 offset 없는 문자열을 거부해 두 종류가 섞이지 않게 한다(#88).

### 6.4 URL 계약 (Decided; 필드명·enum 문자열은 Candidate)

배포 하위 경로는 주입된 위치 어댑터의 브라우저 경계에서만 붙고 떼며, 앱 내부 URL·`returnTo`·저장 URL은 base 없는 앱 상대 경로다([ADR-0030](adr/0030-location-adapter-base-path.md)).

**Equipment Group / Context Capability (Decided; 공개 표현 Candidate, ADR-0059 확장 Decided·#552 1부 계약·호환 구현):** 메뉴는 Condition과 Selection의 적용/참조/미지원 범위를 선언하고 두 층을 전달·보존한다. 주입된 사용 축 전체와 소속 기준을 유지하며 다른 축으로 역추정하지 않는다. Condition만 있으면 선언한 소속 기준으로 재평가하고, 명시 Selection이 있으면 그 고정 ID 집합을 분석 대상으로 사용한다. 재평가된 Condition에서 빠졌다는 이유로 선택을 자동 교집합·확장·대체하지 않는다. 권한/Scope 검증 실패는 명시적으로 처리한다. 조건 편집 시 기존 선택의 처리 UI는 Candidate이며 조용한 선택 변경은 허용하지 않는다.

**`equipmentGroup` v1 호환 확장(Decided, 2026-10-21; #552 1부 계약·호환 구현):** URL 버전을 올리지 않는다. 새 표현은 배열 맵 `{"stgroup":["A"]}`이고 serializer는 배열 맵만 쓴다. v1 tag는 축 이름을 모르는 구조 규칙으로 읽는다 (2026-10-21, 코드 리뷰 C2 — SDK에 구체 축 이름을 두지 않는다는 사용자 규칙). 문자열 `axis`가 있는 객체는 v1 tag이며, 정확히 `{axis: X, id: Y}`인 문자열 쌍은 `{[X]: [Y]}`로 읽는다. `id` 없이 문자열 필드가 하나 이상 있으면 각 필드 이름을 축으로 하는 단일값 배열 맵으로 읽고, 그 밖의 tag 모양은 `invalid_condition`이다. 이 구분을 위해 축 id `axis`는 예약한다. 기존 Maker+Model 두 ID도 필드 이름에 따라 `{maker:[X], model:[Y]}`로 읽어 AND 의미를 보존한다. 단일축 소비자는 같은 한 값 조건으로 동작해야 한다. `membershipBasis=asOf`는 §6.1의 이력 지원 검증을 거치며 생략은 current다. 미주입 축은 오류로 거부하고 검증된 조회에 쓰지 않는다. 주입된 축이 대상 메뉴에서 미지원인 경우는 전체 Condition과 기준을 보존하고 미적용으로 표시한다. 보드 복사도 Condition 전체와 기준을 함께 전달하며 칸 소유권([ADR-0049](adr/0049-analysis-context-belongs-to-a-pane.md))은 유지한다.

**옵션·Selection 평가 포트(Decided, 2026-10-21):**

- `listAxisOptions({ scopeId, axisId, query?, parents?: Record<axisId,string[]>, membershipBasis?, period?, cursor?, limit }, signal)` → `{ items: {id,label}[], nextCursor: string|null }`.
- `listAxisOptions.axisId`는 주입된 Condition 축 외에 SDK 전역 집합 키 `lineNames`·`prcGroups`도 받는다. 두 키는 도메인 축 id가 아니며 descriptor 주입이 필요 없다. 요청 Scope의 부여된 행에서만 값을 도출하고 같은 검색·페이징·커서·오류 규칙을 적용한다. 이 전역 옵션의 `parents`는 자신을 제외한 `roomNames`·`lineNames`·`prcGroups`만 받으며 키 사이는 AND, 같은 키 값은 OR다. 생략은 무제약, `[]`는 빈 옵션이다. 부여 밖 room 부모는 부여된 행과의 교집합이므로 값을 노출하지 않는다.
- `searchEquipment({ scopeId, roomNames, lineNames, prcGroups, condition, membershipBasis, period?, query?, cursor?, limit }, signal)` → `{ items: EquipmentSummary[], nextCursor: string|null, total? }`. `EquipmentSummary`는 `{equipmentId,room,axes:Record<axisId,string[]>}`다. `axes`에는 서버가 정한 분류 축과 별도로 `lineNames`·`prcGroups` 키의 소속 배열을 포함한다(Condition descriptor와 독립). `total` 부재는 0이 아니다. 세 집합 키의 `null`(무제약)과 `[]`(명시적 공집합)를 유지한다. 검색은 ID/표시명에 대소문자 무관 부분 일치를 적용한다.
- `resolveSelection({scopeId,ids},signal)` → `{items:({id,status:'ok',summary:EquipmentSummary}|{id,status:'forbidden'|'not_found'})[]}`. 입력의 첫 출현 순서로 중복을 제거한다. 같은 Site의 부여 안 된 room ID는 forbidden(제출 ID·상태만), 다른 Site에만 있는 ID와 없는 ID는 모두 not_found다. 검색 페이지 밖 선택을 삭제·대체하지 않는다. 선택 확인은 분석 허가가 아니며 최종 분석 판정은 **Scope → room grant → Condition → Selection** 순서다.
- 세 포트는 인증된 세션과 해당 Scope·room 부여만 필요하며 특정 메뉴 권한을 요구하지 않는다. 매 페이지·해석 요청에서 다시 검사한다. 모르는 Scope는 unknown_scope, 부여 없는 Scope는 scope_forbidden, 명시적 room 필터에 부여 밖 값이 있으면 요청 전체가 room_forbidden으로 거부된다. 옵션·표시명·축·커서·total은 부여된 행에서만 도출한다.
- 비 envelope 비동기 포트다. 성공한 빈 페이지는 `{items:[],nextCursor:null}`이고 ID별 판정은 성공 데이터다. 실패는 세 갈래 규칙의 원본인 [실서버 체크리스트 §2](integration/real-server-checklist.md#2-platformadapter-메서드별로-지킬-것)를 따른다 — 판정 코드 목록 원본은 `@ap/contracts`의 `PORT_ERROR_CODES`이고 판별은 `isPortError`다([ADR-0074](adr/0074-port-failures-three-surfaces-structural-port-error.md)).
- limit는 유한 정수만 받고 서버가 1–200으로 제한한다. ID의 결정적 문자열 순서로 자른다(mock: UTF-16 사전식). 커서는 opaque이며 포트·정규화한 입력(커서·limit 제외)·Scope·세션/권한 세대에 묶인다. 입력/세션 불일치·잘못된 커서는 invalid_cursor다. mock은 서버에 보관한 토큰+마지막 ID의 keyset이며 만료 없음, limit 변경 가능이다. 페이지 사이 앞쪽 삭제·삽입에 offset을 쓰지 않아 기존 남은 행을 건너뛰거나 앞서 반환한 ID를 반복하지 않는다. 경계 앞에 새로 삽입/재분류된 행은 새 검색에서 보인다. 실서버는 이 보장을 유지하는 keyset/스냅샷 또는 명시적 실패·재시작 정책과 데이터 버전/만료를 정해야 한다.
- asOf에는 정확한 wall-clock YYYY-MM-DDTHH:mm:ss, 실재 달력 값, from < to인 완전한 period가 필요하다. 의미는 반개방 [from,to) 기간 중 소속된 적이 있는 값의 합집합이며 다중축 AND와 부모도 기간 중 소속 합집합에 적용한다. 옵션은 대상과 제공한 모든 부모의 이력을 요구한다. 현재 모드의 유효한 선택적 period는 검증 후 소속 평가에서 무시한다. mock은 이력 가능 descriptor의 현재 소속으로만 대신 평가하며 이력 없는 대상/부모/Condition과 PRC-only asOf는 membership_basis_unsupported로 거부한다. **실제 이력 평가는 미구현**이며 실제 원천 연결 때 기간 중 소속 변경을 검증하고 다시 연다.
- mock descriptor는 서버 소유 `createMockAdapter({equipmentAxes?})`로 받는다(기본값은 mock 소유). Condition 옵션은 dependsOn의 모든 상위 축만 parents에 허용하고 미등록 축·무관한 부모는 거부한다. 부모 생략은 무제약, 부모의 []는 빈 옵션이다. 다단계 부모는 AND로 좁히며 기존 선택을 지우지 않는다. Condition은 서버 descriptor의 축만 허용한다.
- Kernel useAxisOptions·useEquipmentSearch는 기본 pageSize 50, `status/items/error/retry/hasMore/loadMore/loadingMore/loadMoreError/total?`을 제공한다. 가장 가까운 화면의 **보존된 global**을 쓰며 context는 전체 PortContext 스냅샷으로만 덮어쓴다(부분 병합/다른 Scope 허용 없음). 활성화·동일 세션의 Scope 검증·유효 Context·asOf period 준비 전에는 요청하지 않는다. 다른 Scope override는 scope_forbidden 오류, disabled는 idle과 빈 결과다. 입력 변경 프레임에 이전 데이터를 숨기고 요청을 abort하며 늦은 응답을 버린다.
- useResolvedSelection(ids,{enabled?,scopeId?})은 `status/byId/summaries/error/retry`를 주며 Condition/기간/검색 페이지와 독립이다. 전송 실패를 ID별 not_found로 위장하지 않는다. `PortFailure={code:PortErrorCode|null,message,retryable}`에서 전송 실패는 재시도 가능, 판정 실패는 invalid_cursor만 재시도 가능이다. 페이지 실패는 앞 페이지를 유지하고 실패 커서를 재시도한다. invalid_cursor 재시도는 이전 페이지를 지우고 첫 페이지부터 시작한다. loadMore는 single-flight이고 페이지 중복 ID는 합친다.
- 메모리 캐시는 PlatformProvider의 어댑터·세션·revision 세대 안에서 **화면 소유자 + 포트 + 정규화한 모든 유효 입력**을 키로 쓴다. 소유자마다 비구독 항목은 최근 사용 순서(구독 해제·ensure 시 갱신)로 최대 50개를 보관하고 초과분은 오래된 순으로 버린다. 구독 중인 항목은 퇴출하지 않는다(가역적인 메모리 예산 선택). main은 라우트 변경에도 유지하고 각 paneId는 독립이며 선택 칸의 context-bar Provider는 같은 소유자를 공유한다. 칸 제거 시 캐시를 버리고 재사용은 새로 시작한다. 세션/권한/마스터 subscribe 변경이나 어댑터 교체 시 전체 캐시를 무효화한다. 페이지 커서는 base 입력 항목 곁에 따로 둔다.
- contextOptions·evaluateSelection은 deprecated 호환 포트로 유지한다. 셸 바와 모든 소비자가 새 포트로 전환하고 호환 검증을 마친 뒤 제거를 다시 연다.

기존 `equipmentIds` 목록 필터와 `selectedEquipmentIds`는 같은 EquipmentID 명시 집합을 나타내는 공개 표현이다. 새 이름은 Selection의 역할을 드러내는 후보이며 두 개의 독립 필터가 아니다. 기존 이름의 동등 별칭/버전 이행은 아래 `v` 규칙으로 등록한다. 동시 입력은 후보 스키마에서 거부하여 우선순위 추정을 피한다. 상세의 단일 `equipment_id`도 **같은 식별자 개념**이며, 집합 조회와 객체 목적지라는 사용 역할만 다르다.

**분석으로 돌아가기 (Decided):** 상세/드릴인 진입 직전의 분석 Context(Condition·Selection·미적용 값 포함)를 그대로 복원한다. 목록 `equipmentIds=[A,B]`에서 목적지 C를 보았어도 복귀는 `[A,B]`이며 C를 합치거나 C 하나로 바꾸지 않는다. 상세에서 본 객체나 상세의 변경된 조건으로 출발 Context를 덮어쓰지 않는다. 복귀 시 권한·Scope는 재검증하며 실패해도 원래 선택을 조용히 축소하지 않는다. 복원은 원래 조건의 복원이지 live Condition 결과나 계산 숫자의 동결이 아니다. 출발 페이지의 등록된 URL 상태도 보존하되 로컬 줌/brush의 복원 보장은 추가하지 않는다. 상세에서 사용자가 전역 Context를 바꾼 뒤 복귀하면 출발 Context로 돌아가며, 되돌린 Context 항목을 화면에 알린다(조용히 되돌리지 않는다). 되돌린 항목에는 Scope도 포함한다. 상세에서 바꾼 Context를 유지한 채 이동하는 길은 메뉴 위치(breadcrumb·사이드바)다.

**`returnTo`(page key; 메커니즘 Decided, 필드명 Candidate):** 상세 목적지 메뉴는 `pageKeys`에 `returnTo`를 선언해 출발 화면의 전체 URL을 받는다. 값은 앱 내 상대경로여야 하며(`//`·`\`·`#`·제어문자·경로 안 `:`은 거부, 절대 URL은 항상 거부) 등록된 비상세 메뉴 경로로 매칭되고 그 메뉴의 `pageKeys`로 파싱될 때만 채택한다. 아니면 `parent` 메뉴(없으면 홈)로 복귀한다.

**URL vs 세션/최근방문 우선순위, 누락값 (Decided):** URL에 있는 키는 항상 이긴다. URL에 없는 키를 세션/최근방문으로 채우지 않는다(세션은 제안값일 뿐이며, 적용하는 순간 URL에 기록한다). 키 부재는 공개 스키마가 정의한 "선택 없음 / 기본 의미 / 필수 누락" 중 하나로만 해석하고, 필수값을 임의 Scope나 떠다니는 최신 지표 버전으로 대체하지 않는다. 시간을 요구하는 메뉴에서 기간 양쪽이 모두 없으면 기본 구간이 정의·검증 가능할 때만 절대 `from`/`to`를 URL에 물질화하고(불가하면 기간 선택 요구), **한쪽만 있으면 형식 오류로 거부한다**(보정하지 않음). 상대적인 "최근 기간"이 물질화되기 전의 URL은 시점 의존 진입점이며 재현 가능한 분석 링크가 아니다.

**Apply 모드 URL 소유 예외(Decided, ADR-0061):** URL(보드에서는 칸 주소)은 적용한 global/page만 소유하고 초안은 소유하지 않는다. 위 기본 기간 URL 물질화는 live 메뉴에 해당하며 Apply에서는 §6.3의 초안 예외를 따른다. 명시적 유효 기간과 필수값이 있는 deep link·Back/Forward·저장된 칸은 세션의 과거 실행 여부와 무관하게 같은 조건을 실행한다. 초안 복원(#554)은 이 주소 복원과 다르며 자동 실행하지 않는다. 기존 링크·드릴·returnTo와 setGlobal·setPage는 적용된 값과 주소만 사용한다.

**URL 계약 버전 `v` (Decided):** 양의 정수 query `v`, 생략은 `v=1`로 해석한다. 인바운드 URL은 그 버전 디코더로만 해석하며 북마크의 `v`를 자동으로 최신으로 rewrite하지 않는다(조회 신원을 바꾸지 않기 위함). helper가 **새로** 만드는 정규 URL은 동등 요청을 새 버전으로 표현할 수 있는지 검증한 뒤에만 현재 `v`를 명시하고, 불가능하면 지원 중인 원래 버전을 보존하거나 전환 불가를 알린다. 미지원 `v`(미래 또는 sunset 이후)는 부분 추측 없이 전체 거부한다. `v`는 `metricVersion`·DB 마이그레이션·메뉴 구현 버전과 별개다. 같은 `v` 안에서 등록된 의미-동등 별칭만 허용하고, 별칭으로 기존 값의 의미를 바꾸지 않는다. sunset 날짜/기간은 별도 공지·정책으로 정하며 이 결정에 포함하지 않는다.

**잘못된 값 / 미등록 키 / 미지원 Context (Decided):** 등록된 키의 형식 오류(잘못된 날짜, `Z` 접미사, 빈 필수 ID, 잘못된 `v`, 한쪽만 있는 `from`/`to` 등)는 조회를 거부하고 명시적 오류를 표시하며 clamp/보정하지 않는다. 유효한 형식이지만 없거나 권한 없는 객체는 자동 대체하지 않는다. **등록된** 전역 Context가 대상 메뉴에서 미지원이면 URL에 남기고 미적용으로 표시하며, 지원 메뉴로 복귀하면 재검증 후 적용한다. **미등록** 키도 현재 URL에는 남기되 검증된 조회조건으로 넘기지 않고 전역 Context로 승격하지 않는다. 새 키가 조회 의미를 필수로 바꾸면 `v` breaking change로 처리한다.

**뒤로가기 복원 범위와 셸 내비게이션 (Decided):** 플랫폼이 보장하는 복원 범위는 **URL이 소유한 상태**(전역 Context + 그 페이지가 URL에 쓰기로 한 탭/뷰 id + 선언됐지만 미적용인 등록 Context + §6.1 공집합 표식)로 한정한다. 줌/브러시/시리즈 가시성은 보장 밖이다(로컬 저장 자체가 금지되는 것은 아니나 제품 복원 계약에는 넣지 않는다). **셸의 사이드바/메뉴 레지스트리를 통한 메뉴 전환도 Context Link helper와 같은 규칙을 따른다**: 전달 집합은 등록된 전역 Context뿐이며 대상의 지원 여부와 무관하게 보존한다. 적용은 대상이 지원하고 검증한 값에만 한다. page-owned 상태와 미등록 키는 자동 복사하지 않는다. helper는 **보존할 Context**와 **적용할 Context**를 구분해야 하며, "지원 키만 골라 쓴다"는 동작이 URL에서 나머지를 지운다는 뜻이면 안 된다(보존 약속과 충돌). **Context 변경 시 초기화할 page 키 (Candidate 필드명 `contextResetKeys`, #45):** 결과 집합에 묶인 page 키(표 페이지 번호, 선택 구간 등)는 메뉴 manifest가 `pageKeys`의 부분집합으로 선언하고, Kernel이 사용자의 전역 Context 변경(`setGlobal`·초기화)과 **같은 내비게이션 안에서** 지운다. 뒤로/앞으로 가기와 URL 진입은 아무 키도 지우지 않는다(복원은 정확해야 한다). 페이지가 Context 변경을 감지해 뒤따르는 replace로 지우는 방식은 뒤로가기에서도 발동해 복원을 깨므로 쓰지 않는다.

**드릴다운 단계 (Decided, [ADR-0025](adr/0025-drilldown-level-page-keys-path-bar-layout.md); 필드명 Candidate):** 화면 안에서 단계별로 좁혀 들어가는 메뉴는 manifest `drill.levels`에 단계 순서(page key와 표시 이름)를 선언한다. 단계 키는 `pageKeys`와 `contextResetKeys`에 함께 등록해야 하고(Registry가 검사) 단계는 1개 이상이며 상한 없이 메뉴가 선언한다([ADR-0063](adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md)). 단계 값은 page 소유 ID·마스터 값이며 전역 Context로 승격하지 않는다(공정으로 들어가도 Context 바의 room_name은 그대로다). 앞 단계 키 없이 뒤 단계 키만 있는 URL은 형식 오류로 거부하고 조회하지 않는다. 형식이 맞지만 지금 범위의 결과에 없는 값은 그 단계에서 거부를 보이고 다른 값으로 바꾸지 않는다. 새 단계 진입·앞 단계로 올라가기·같은 단계의 다른 값으로 바꾸기는 history push이며, 바꾼 단계 뒤의 키를 같은 내비게이션에서 지운다. 사용자의 전역 Context 변경은 위 `contextResetKeys` 규칙으로 단계 키를 모두 지우고, 뒤로/앞으로 가기와 URL 진입은 지우지 않는다. 단계 안의 다른 page key(정렬·축 등)의 기록 방식은 이 계약이 바꾸지 않는다. 화면 모양은 §12.7, 다른 메뉴로 넘어갔다 돌아오는 복귀는 §22.

**복수 Scope와 시간 계약이 해결되기 전 허용할 조회 범위 (Decided):** §6.2의 `scopeId` 단일 원칙과 §6.3의 시간역 병합 가드로 닫힌다. TZ 매핑이 끝날 때까지 분석을 전면 금지하지는 않는다(단일 설비 naive 조회는 계속 허용). 프로토타입에서 무제한 조회를 허용하는 것은 거부한다.

완성된 URL API나 프로토타입 검증을 이 결정만으로 주장하지 않는다 — 구현·필드명 확정은 별도다.

### 6.5 분석 Context의 범위 — 칸 (Decided, [ADR-0049](adr/0049-analysis-context-belongs-to-a-pane.md))

이 절의 "전역 Context"는 **현재 칸의 분석 Context**를 뜻한다. 본 화면은 칸이 하나뿐인 경우이고, 분석 보드([16](16_analysis_board.md))는 칸마다 분석 Context를 하나씩 가진다. 구현은 #421 — #496(Kernel 칸 Context), #497(보드 화면), #498(메뉴 보드 지원)로 끝났다(v0.14.0).

- **값의 위치:** 본 화면의 칸은 §6.1–6.4대로 URL이 소유한다. 보드의 칸은 보드 상태가 소유하고 URL에 쓰지 않는다. 메뉴는 어느 쪽인지 모르고 Kernel 훅으로만 읽고 쓴다. 메뉴·모듈 코드는 URL을 직접 읽거나 쓰지 않는다.
- **시작과 독립:** 새 칸은 기본 조건을 복사해 시작한다. `분석 보드에 열기`로 넣으면 누른 화면의 분석 Context, 보드에서 바로 넣으면 마지막으로 본 본 화면의 분석 Context다. 그 뒤로 칸끼리, 그리고 본 화면과 연결이 없다. 일괄로 맞추는 것은 명시적 동작(시트의 모든 칸에 적용, 다른 시트에 복사)뿐이고 한 번 복사한다.
- **같은 규칙을 칸 단위로:** 지원하지 않는 Context의 보존·미적용 표시(§6.4), `contextResetKeys` 초기화, 드릴다운 단계 키는 칸마다 같은 규칙을 따른다. page 키는 칸 상태에 산다.
- **Scope:** 칸 하나는 언제나 단일 `scopeId`다(§6.2). 칸마다 서버가 권한을 다시 판정하고, 거부된 칸만 권한 상태가 된다. 여러 칸의 Scope를 한 조회로 합치지 않는다.
- **Context 바:** 바는 늘 지금 선택된 칸 하나의 분석 Context를 편집한다. 본 화면에서는 지금과 같다.
- **구현 위치:** Kernel `PaneScreenProvider`(`@ap/kernel`)가 칸 하나의 화면 상태를 준다. `usePlatform()`은 가장 가까운 화면의 상태를 읽고 `screenMode`(`'main'`·`'pane'`)·`paneId`를 더한다. 쓰기와 메뉴 이동은 URL 대신 칸의 `onChange`·`onLeave`로 간다(#496).

---

## 7. Application Shell

Desktop-first를 기본으로 한다.

구조는 FeedbackOps AppFrame을 따른다(Decided, 2026-10-04, [ADR-0011](adr/0011-design-direction-feedbackops-shell.md)). 셸은 플랫폼 `@ap/shell`이 그리며 FeedbackOps 앱 코드를 가져오지 않는다.

셸 배치도(레일·사이드바·페이지 머리·Context 바·콘텐츠 슬롯, 상세가 열린 상태 포함)는 [07 §4](07_app_shell_wireframe.md#4-wireframe-decided-구조-2026-10-04--adr-0011)에 하나만 둔다.

- **레일** (위 → 아래): `시스템 및 플랫폼 메뉴` 전환기(맨 위, §9.1, ADR-0070) → 현재 시스템의 섹션 버튼(그룹 단위, 공간 밖 화면에서는 비어 있음) → 공통 도구(명령 팔레트 §10) → 앱이 주입하는 도구 슬롯(`topBarTools`, ADR-0009 이름 유지), 도움말, 사용자 메뉴(언어·`FeedbackOps 전체`를 품는다, ADR-0070). 공통 도구는 시스템을 바꿔도 같은 자리다. 배치·치수 원본은 [15 §3.2](15_multi_workspace_ui.md#32-시스템별-레일-decided-2026-10-19-adr-0042), 방향은 [ADR-0042](adr/0042-system-switcher-and-system-owned-rail.md)다.
- **사이드바**: 머리에 공간 이름과 현재 섹션 이름(같으면 한 줄)과 접기. 그 아래 Scope 선택기와 검증 상태가 있고, 현재 섹션(그룹)의 메뉴, 즐겨찾기·최근이 이어진다(§9). 미등록 경로·공간 진입 거부의 fallback 사이드바는 접근 가능한 공간의 모든 그룹을 그대로 그린다.
- **상단 바는 없다.** 페이지 머리는 한 줄에 위치·제목·설명·동작을 둔다(§8 슬롯).

Scope는 개념적으로 Global Context에 포함되지만 선택기는 **사이드바 머리에 하나만** 둔다. Context Bar에 두 번째 Scope 선택기를 만들지 않는다. 예외: 분석 보드([16](16_analysis_board.md))에는 업무 시스템 사이드바가 없으므로, 보드 Context 바의 Scope가 **선택된 칸의 Scope이자 그 화면의 유일한 Scope 선택기**다(§6.5, [ADR-0051](adr/0051-analysis-board-pane-header-signal-chips-numbered-selection.md)). 구체 셸 배치는 `07_app_shell_wireframe.md`를 따른다.

### Context 바 우선순위 넘침 (Decided, 2026-10-04 — #56, [ADR-0015](adr/0015-context-bar-priority-overflow.md))

- Context 바는 모든 폭에서 **한 줄 48px**을 유지한다. 뷰포트가 아닌 바 자체 폭을 측정해 상세 슬롯·사이드바 변화에도 반응하며, 측정용 레이어는 inert·접근성 제외·중복 데이터 조회 없음으로 유지한다. 재측정 조건 등 구현 세부는 [ADR-0015](adr/0015-context-bar-priority-overflow.md)를 따른다.
- 기간은 항상 보인다. 폭이 부족하면 먼저 "전역 Context" 라벨을 숨기고, 그래도 부족하면 기간 프리셋(1일/7일/사용자 지정)을 기간 팝오버로 옮긴다. 기간 버튼은 축약할 수 있으나 전체 범위를 접근 이름과 title로 제공한다.
- 표시 대상인 나머지 키는 `roomNames → condition → selection → lot → ppid → recipe → metric` 순서로 남기며 뒤쪽부터 하나의 넘침 팝오버로 옮긴다. B안은 예외인 참조만·미지원 capability만 배지로 표시하고 적용 상태 배지는 생략하며, 팝오버에서도 동일한 전체 편집기를 제공한다.
- 넘침 버튼은 `조건 N개 더` / `N more`다. 숨은 키 중 기본값이 아닌 값이 M개 있으면 ` · M개 적용 중` / ` · M applied`를 붙이고 M=0이면 생략한다. 명시적 빈 선택은 기본값과 다르므로 센다.
- 좁을 때 링크 복사·초기화는 아이콘만 보이고 접근 이름과 title을 유지한다. 편집·초기화·링크·URL·권한·미지원 보존 의미는 §6을 그대로 따른다.

### Baseline (Decided, 2026-10-04 — FeedbackOps 레이아웃 토큰)

```text
Rail                 52px   (--rail-width)
Sidebar expanded    240px   (--sidebar-width)
Sidebar collapsed    56px   (--sidebar-width-collapsed)
Detail slot         440px   (--detail-panel-width; 미제공 시 440px, 360–520px clamp; 비어 있으면 0)
Top header           없음
Page header          50px   (--toolbar-height)
Global context bar   48px
Content padding      FeedbackOps PageShell 기준 (좌우 32px / 위 28px / 아래 36px)
Section gap          24px
Component gap        12~16px
```

치수 값의 단일 원본은 FeedbackOps `packages/ui/src/styles/tokens.css`의 레이아웃 토큰이다. 셸은 이 토큰과 같은 값을 쓴다(페이지 머리 50px·Context 바 48px는 코드 리터럴). DESIGN은 [셸 시각 보완](../DESIGN.md#shell-visual-rules)만 소유하며 이 Baseline을 재정의하지 않는다.

50px 페이지 머리와 live 모드 Context Bar는 스크롤되는 main 안에서 하나의 sticky 래퍼로 유지한다. Apply 모드는 페이지 머리만 이 래퍼에 두며 펼친 조회 편집기는 래퍼 밖에서 본문과 함께 스크롤한다. 접힌 조회 요약·동작 행만 페이지 머리 바로 아래에 sticky로 유지하며, sticky offset에는 이 접힌 행의 높이만 더한다. 본문은 FeedbackOps `PageShell`의 여백을 사용하며 분석 페이지에 폭 제한은 추가하지 않는다. 페이지 머리는 한 줄을 유지하고, 머리 자신 폭이 줄면 설명·Data Trust 요약·잠정 배지·제목 말줄임 순으로 양보하며 주 동작은 남긴다. 보조 동작은 ⋯ 팝오버의 이름 있는 동작 그룹에 둔다. 모든 양보 뒤에도 들어가지 않을 때(예: 1024px + 펼친 사이드바 + 상세 패널)만 머리가 가로로 스크롤된다. 주 동작은 Tab 포커스나 스크롤로 닿으며, 포커스한 컨트롤은 머리의 보이는 범위로 스크롤된다. 시각 스크롤바는 감추지 않는다. 정상 폭(1280px 이상 + 상세 패널)에서는 스크롤이 생기지 않는다(시각 순서는 [DESIGN 셸 시각 보완](../DESIGN.md#shell-visual-rules), [ADR-0035](adr/0035-page-header-yield-order.md)).

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
├─ contextNotes
├─ contextExtension
├─ content
├─ dataTrustSummary
└─ detail (셸 소유 오른쪽 고정 슬롯, §13)
```

`contextNotes`(`ReactNode[]`, 요소 하나가 안내 하나; `null`·`false` 요소는 세지도 그리지도 않는다)는 `contextExtension` 위에 그리는 설명 안내 슬롯이다. 페이지가 필터 컨트롤(`contextExtension`)과 설명 문장을 한 덩어리로 섞어 넘기면 접힌 줄이 안내 개수를 알 수 없고 안내만 따로 위·아래로 둘 수도 없다 — 그래서 별도 슬롯으로 둔다(#680, [ADR-0075](adr/0075-page-head-one-line-fold-thin-outcome-strip.md)). 머리 영역은 `(contextNotes가 비어 있지 않음 || contextExtension) && 게이트 없음`일 때 그린다. flow 페이지는 안내를 확장 위에 항상 그리고(접기 없음), fill 페이지는 §12.8의 머리 접기를 쓴다.

이 Slot 외의 위치에 페이지가 직접 전역 UI를 삽입하지 않는다. 상세 내용은 등록 경계로 넘기고, 셸이 main 옆의 전체 높이 오른쪽 aside 배치를 소유한다(§13).

**VOC 등록 패널(Decided, 2026-10-22, [ADR-0070](adr/0070-global-features-platform-menu-and-voc-drawer.md)):** 셸이 소유하는 오른쪽 자리이고 페이지 슬롯이 아니다. 레일 `VOC 등록`이 연다. 상세 슬롯처럼 본문을 밀어내는 도킹 패널이며 overlay·scrim·본문 inert를 쓰지 않는다. 열 때 지금 화면의 Context를 고정해 지울 수 있는 칩으로 보인다 — 시스템·메뉴, 등록된 URL page key, 집계 단위, 시각까지 쓴 기간, Global Context(Condition·Selection 포함), 열려 있는 상세 엔티티, 보이는 Correlation ID. 지운 칩은 첨부하지 않는다(첨부되는 주소에서도 빠진다). Managed System·Analytics Area는 [ADR-0068](adr/0068-permission-scope-and-business-system-link.md)의 연결에서 채우고, 연결이 없으면 사용자가 고른다. 화면 이름으로 추정하지 않는다. 내용이 있는 초안을 닫으면 패널 안에서 `작성 중인 내용을 버릴까요?`를 묻는다. Esc는 포커스가 패널 안에 있을 때만 받고, 닫히면 포커스가 트리거로 돌아간다. 모달이 열리면 맨 위 포커스·Esc는 모달이 갖는다. 열 때 초안이 없으면 Context를 고정하고(초안이 남아 있으면 같은 고정 Context·같은 내용 인스턴스를 다시 보인다), 칩을 지우면 칩 목록과 첨부 주소(`href`)가 그 칩의 키를 함께 뺀다 — 주소는 고정한 원본 Context와 page 쌍에서 남은 칩만으로 다시 만들고 `extras`는 붙이지 않는다. Kernel 세션이 바뀌거나 `vocCompose` 슬롯이 사라지면 고정 Context·초안을 버리고 닫힌 채 시작하며, 끝난 초안의 `Compose` 콜백(`onSubmitted`·`onCancel`·`onDirtyChange`)은 무시한다. 보이는 Correlation ID 칩은 Kernel이 읽는 값을 내기 전까지 고정하지 않는다([백로그](../.planning/backlog.md)). 내용(#656, `@ap/menu-my-activity`의 `vocCompose` 구현)은 FeedbackOps 작성 화면이고, 남은 칩을 설명 끝 `화면 정보` 블록(굵은 문단·목록·`화면 열기` 링크)으로 붙인다([ADR-0045](adr/0045-feedbackops-entry-link-mapping-and-scope.md) 개정). 에디터 첨부와 첨부 영역을 합쳐 10개를 넘으면 제출하지 않고 안내한다. 성공하면 내용이 `접수 완료: <VOC 번호>` 토스트를 내고 셸이 닫으며, 제출 중 401은 토스트 없이 세션 종료로 간다. 상세 슬롯과의 관계는 §13. `feedbackOps` 슬롯의 전체 링크는 레일 대신 사용자 메뉴에 그린다(구현 #594).

앱이 조립 때 주입하는 셸 슬롯은 `PlatformSlots`의 `contextBar`(PlatformPage가 페이지 머리 아래에 그린다), `topBarTools`(레일 아래 도구), `feedbackOps`(공간별 FeedbackOps 진입과 전체 링크, [ADR-0027](adr/0027-feedbackops-stays-standalone-entry-links.md)·[ADR-0028](adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)), `plannedSpaces`(전환기의 `준비 중` 행 `{ id, label, subtitle?, icon }[]`), `boardEntry`(보드 지원 메뉴의 본 화면 페이지 머리 `⋯`에 PlatformPage가 덧붙이는 `분석 보드에 열기…` 항목, [16 §6](16_analysis_board.md#6-메뉴-쪽-요구-decided) — 컴포넌트가 셸을 import하지 않도록 앱이 넘긴다. 슬롯이 없거나 메뉴가 보드를 지원하지 않거나 열 수 없거나 칸 안이면 항목도 `⋯`도 만들지 않는다. 항목의 대화상자는 `⋯` 메뉴가 닫혀도 남도록 머리가 들고 있다), `notifications`(`{ menuId, UnreadCount, Recent }` — 레일 `알림` 종과 플랫폼 메뉴 배지(전환기·플랫폼 사이드바). 셸이 버튼·팝오버 틀·배지·접근 이름을 그리고 슬롯은 건수(`children(count)` 렌더 함수, `null`이면 배지 없음)와 팝오버 본문(`Recent`)만 준다. 넘기지 않으면 종과 배지를 그리지 않는다. [ADR-0070](adr/0070-global-features-platform-menu-and-voc-drawer.md) 결정 4, #652)다. `vocCompose`(`{ Compose }` — 레일 `VOC 등록` 드로어의 본문. 위치·고정 Context 칩·초안 유지·닫기 확인·Esc·포커스는 셸이, 폼과 제출은 슬롯이 가진다. `Compose`는 `{ context, onSubmitted, onCancel, onDirtyChange }`를 받고 `context`는 지우지 않은 칩 `items`와 그 칩으로 다시 만든 절대 주소 `href`(보드이거나 `menu` 칩을 지우면 null)와 기본값 전용 `spaceId`·`menuId`다. 슬롯인 이유: 셸은 메뉴를 import하지 않고([ADR-0071](adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md) 결정 6) 폼은 메뉴 패키지가 가진다. 넘기지 않으면 레일 버튼도 없다, [ADR-0070](adr/0070-global-features-platform-menu-and-voc-drawer.md) 결정 5, #655). 앱이 `feedbackOps`를 넘기지 않으면 셸은 블록과 사용자 메뉴의 전체 링크를 그리지 않는다. `plannedSpaces`는 아직 들어갈 수 없는 업무 시스템을 알리는 표시용이라 Registry에 넣지 않는다(공간·메뉴·권한이 없고 이동하지 않는다). 앱이 넘기지 않으면 전환기는 `준비 중` 영역을 그리지 않는다([ADR-0042](adr/0042-system-switcher-and-system-owned-rail.md), 15 §3.2). 페이지는 `crumbs`로 현재 위치(부모 메뉴 뒤 추가 경로)를 확장할 수 있다. 새 슬롯은 이 절에 근거를 먼저 적는다.

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

이 7그룹을 navigation IA의 단일 기준으로 둔다(Decided). 표시명은 운영 개요 / 설비관리 / 기준정보관리 / 생산성 분석 / 지표관리 / 공지·VOC / 관리·감사다. 이 그룹들은 §9.1의 워크스페이스 층 아래에서 배치된다. 관리·감사는 운영 콘솔로 이동한다. 나머지 그룹의 업무 공간 귀속은 §9.1에서 Decided다([ADR-0028](adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)). `02_domain_menus.md`의 6개 도메인 중 공지와 VOC가 한 그룹을 공유하고, 운영 개요·관리·감사는 플랫폼 기능이다. 도메인 개수와 내비게이션 그룹 개수를 같게 맞출 필요는 없다. 하위 화면 배치와 표시명 변경은 별도 설계 결정이다.

Sidebar 기능(셸 구조는 §7, ADR-0011):

- Collapse / Expand(240px ↔ 56px, `[` 단축키)
- 그룹은 기본적으로 섹션 제목, 메뉴는 그 아래 목록. `hideLabelWhenSingle` 그룹은 보이는 메뉴가 하나일 때 확장된 사이드바에서 제목을 생략한다(06 §5, Candidate)
- Favorite
- Recent (최근 URL로 복귀; 접근성 이름에 “최근 방문” 맥락을 포함)
- Permission-aware visibility
- 메뉴 검색은 레일의 Command Palette(§10)로 한다. 사이드바 안에 별도 메뉴 필터를 두지 않는다.

메뉴가 늘어날수록 평면적인 Sidebar 확장은 금지한다.

### 9.1 워크스페이스 (Decided, 2026-09-26)

메뉴가 많은 여러 업무 시스템이 한 사이드바에 평면으로 쌓이지 않도록, 그룹 위에 **워크스페이스(공간)** 층을 둔다. 공간은 **업무 시스템 단위**다(**공간 구성 개정 Decided, 2026-10-08, [ADR-0026](adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)**). 모든 공간은 같은 App Shell·Kernel·전역 Context·권한 계약을 공유하며, 공간은 사이드바에 표시할 그룹 집합과 진입 권한만 나눈다. 화면 설계 상세는 [15 멀티 워크스페이스](15_multi_workspace_ui.md)다.

| 공간 | 대상 | 그룹 / 화면 |
| --- | --- | --- |
| MARS (생산성 분석) | 분석 엔지니어 | 개요·분석 대시보드, Cycle Time·Wafer/Job·드릴다운과 관련 상세 |
| BRAVO (지표관리) | 지표 관리자 | 지표 카탈로그·정의/버전·발행/이력·사용처 |
| CLAS (생산성 분석) | 분석 엔지니어 | 메뉴가 MARS와 다른 별도 생산성 분석 시스템. 이 플랫폼에는 견본 메뉴 설비 동작시간(TopN 가로 막대·LaneTimeline 소비자, #590)이 있고 기존 CLAS 화면 이전은 계획이다. 권한은 `analytics:view`를 쓴다 |
| 표준 로그 개발 | 로그 개발 담당자 | 모델별 개발 현황·단계, 검증 Round·규칙/결함·협력사 검토(도메인 구현은 별도 제품이 소유) |
| 개선 실행 | 개선 담당자 | 개선 과제·대상 설비·현장 적용·성과 입력/검증(도메인 구현은 별도 제품이 소유) |
| 운영 콘솔 (지원) | 개발자·운영자 | 시스템 모니터링, 개발자용 파이프라인 트레이스, 메뉴 활용률([05 계측](05_roadmap_and_open_questions.md#메뉴-활용률-계측-decided--v1-범위-포함-2026-09-22-grilling-round-2)), 관리·감사(권한/역할, 변경 감사), Menu Registry 조회 |

- **시스템 이름과 부제(Decided, 2026-10-20, #472):** 공간 `label`은 시스템 이름(MARS·BRAVO·운영 콘솔)이고 선택적 `subtitle`(`SpaceDef`·`PlannedSpace`, 있으면 ko·en 모두 비어 있지 않아야 하며 Registry가 거부한다)은 그 성격을 한 줄로 설명한다(MARS는 `생산성 분석`, BRAVO는 `지표관리`, 운영 콘솔은 없음). 공간 id·경로·권한은 이름과 무관하다. 시스템을 설명하는 목록 — 플랫폼 홈 런처 카드(부제 아래에 `description` 유지)와 전환기의 실제·준비 중 행 — 만 이름 아래 둘째 줄에 부제를 보인다. 짧은 자리 — 레일, 전환기 버튼 이름·툴팁, 사이드바 머리 시스템 이름, 팔레트 시스템 경로, breadcrumb, FeedbackOps 머리, 즐겨찾기·최근 소속, 경로 거부 문구, 관리 화면의 공간 이름 — 는 이름만 쓴다. 메뉴 그룹 제목(`GroupDef.label`)은 사이드바 섹션이지 시스템이 아니라 바뀌지 않는다.
- **플랫폼 홈:** 접근 가능한 공간을 고르는 시스템 런처다(카드 → 최근 방문·즐겨찾기 → 공지, [ADR-0028](adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)). 모든 메뉴를 중복 나열하지 않는다. 홈 링크는 전환기 머리의 `플랫폼 홈`이다(`/` 메뉴를 열 수 있을 때만, 15 §3.2·§8). 레일 로고는 링크가 아니다. (ADR-0070: 홈 링크는 전환기 팝오버 `플랫폼 메뉴` 구역과 전역 화면 사이드바의 `홈`이 맡고, 홈 순서는 카드 → `내 할 일` → 즐겨찾기·최근 방문·공지다. 15 §3.2)
- **전역 유틸리티 메뉴(Decided, 2026-10-09, [ADR-0028](adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)):** 플랫폼 홈·공지·내 VOC는 어떤 공간에도 속하지 않는다. 자기 메뉴 권한(`platform:view`·`notice:view`·`voc:view`)으로만 판정하고 공간 진입 권한을 거치지 않으며, 접근 가능한 공간 수에 들지 않는다. 이 화면에서는 업무 공간 사이드바를 붙이지 않고 레일의 공간 표식도 끈다. 명령 팔레트에서는 공간이 아닌 별도 묶음(플랫폼)으로 보인다. Registry 표현: `GroupDef.space: null`(명시 필수). 다른 메뉴를 전역으로 올리려면 이 규칙을 개정한다. **개정(Decided, 2026-10-22, [ADR-0070](adr/0070-global-features-platform-menu-and-voc-drawer.md)):** 전역 메뉴에 알림·설문·권한 요청을 더한다(각자 자기 메뉴 권한, 알림·설문·권한 요청은 #594의 뒤 PR이 자기 권한을 정하기 전까지 `platform:view`를 쓴다 — `PERMISSIONS`는 서버 읽기와 함께 추가한다, ADR-0068). 전역 화면에는 업무 공간 사이드바 대신 플랫폼 사이드바(`홈` / `내 활동` / `공지`)를 붙인다. 업무 공간 안에서는 전환기 팝오버의 `플랫폼 메뉴` 구역이 같은 목적지를 연다. `플랫폼`을 공간으로 만들지 않는다(15 §3.2).
- **FeedbackOps(협업):** 별도 공간이 아니고, 화면을 플랫폼으로 옮기지도 않는다([ADR-0027](adr/0027-feedbackops-stays-standalone-entry-links.md)). 각 공간 사이드바에 그 시스템의 Managed System으로 좁힌 FeedbackOps 진입(VOC·Task·설문)을 두고 새 탭으로 연다. 공간에 대응하는 매핑이 없으면 진입을 그리지 않는다. 전체 협업 허브는 FeedbackOps 자체 화면이며 플랫폼은 시스템 범위 없는 진입 링크만 둔다(링크 노출 권한은 Candidate, 내용 판정은 FeedbackOps). 진입은 사이드바 바닥 고정 블록이고, 전체 링크는 레일 하단 도구 영역 맨 위다([ADR-0028](adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md), 15 §3.1). (ADR-0070: 블록의 `VOC 등록`은 레일로 옮기고, 전체 링크는 #595 전까지 사용자 메뉴에 둔다)
- **기존 메뉴 귀속(Decided, 2026-10-09, [ADR-0028](adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)):** 운영 개요(플랫폼 현황)는 홈 런처에 합친다. 설비관리·기준정보관리는 생산성 분석 공간(분석 그룹 다음), 관리·감사는 운영 콘솔, 공지·내 VOC는 전역 유틸리티다. 경로와 메뉴 권한은 바꾸지 않는다. 가공 상태 조회처럼 아직 없는 메뉴는 만들 때 정한다. 사용자용 VOC·설문의 1단계 읽기·원본 화면 쓰기 규칙은 [저장소 연결 문서](integration/repository-layout.md#feedbackops-통합-방식-decided-2026-09-26)를 따른다.
- **공간별 마지막 화면 복원(Decided, 2026-10-09, [ADR-0028](adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)):** 레일·홈 카드로 공간에 들어가면 그 공간의 마지막 화면으로 간다. 사용자+공간별로 탭 세션 범위에 저장하고(기기·세션 간 동기화 없음), 가기 전에 경로·메뉴 권한·공간 진입·등록 page key를 다시 확인한다. 실패하면 공간 홈, 공간 홈을 열 수 없으면 그 공간에서 열 수 있는 첫 메뉴(사이드바 순서)로 간다. 현재 공간을 다시 누르면 아무 일도 하지 않는다. 전역 Context는 지금 값을 쓰고 공간마다 과거 값을 되살리지 않는다.

- **노출:** 공간 전환은 레일 맨 위 업무 시스템 전환기(팝오버 카드, 15 §3.2·ADR-0042, 2026-10-19)로 한다. 카드를 고르면 사이드바와 레일 섹션이 대상 공간 것으로 바뀌고 포털 재진입을 강제하지 않는다. 카드는 `accessibleSpaces` 중 `spaceEntry`가 있는 것만 레지스트리 순서로 그리고, 보조 문구는 `이어서: <메뉴>`(검증된 마지막 화면) 또는 `시작: <메뉴>`다. 현재 공간 카드를 다시 고르면 이동 없이 닫고 전환기 버튼으로 포커스를 돌린다. 전환기는 레일 하나에만 둔다 — 사이드바 머리 전환기나 사이드바 탭을 두지 않는다(ADR-0028). 접근 가능한 공간이 하나여도, 공간 밖 화면에서도 전환기는 있다(공간 밖에서는 현재 표식이 없다). 공간이 하나뿐인 사용자는 카드 하나와 `플랫폼 홈`을 본다. 공간 안에서는 레일 섹션 버튼(그룹 단위)이 같은 공간의 다른 섹션으로 보내며 현재 섹션을 누르면 아무 일도 없다. 현재 섹션은 `aria-current="true"`다(`page`는 현재 메뉴만). 공간 진입 권한도 §17 규칙을 따른다(비노출 + 직접 URL은 서버 검증).
- **Context:** 공간 전환은 §6.4의 셸 내비게이션과 같은 규칙을 따른다. 등록된 전역 Context(Scope·기간·설비 선택 등)는 전부 보존하고, 대상 화면이 지원·검증한 값만 적용한다. 예: 사용자용 가공 상태 조회에서 본 설비·기간으로 개발자용 트레이스를 바로 연다.
- **Registry:** 소속 공간은 메뉴가 아니라 **그룹이** 선언한다(`GroupDef.space`, **필드명 Decided, 2026-09-27**). 현재 공간은 매칭된 라우트의 메뉴에서 유도하며 공간용 URL 키는 없다(§6.4: 경로가 이미 공간이다). 위 표의 **공간별 배치**는 Decided다. **공간별 그룹 수 상한은 두지 않는다(Decided, 2026-09-27)** — 새 그룹은 공간 추가보다 먼저 기존 그룹에 흡수할 수 있는지 검토하고, 공간당 7개 이하를 권장한다. 표 항목 중 무엇이 그룹이고 무엇이 그 아래 화면인지는 각 공간을 구현할 때 정한다.
- **운영 콘솔 권한(Decided, 2026-09-27):** '운영 콘솔 접근' 한 역할로 시작한다. 개발자·운영자 모두 운영 콘솔 전 화면에 들어간다. 메뉴 활용률 열람은 05 결정(개발자·운영자 기본 + 개별 부여)을 따른다. 역할 분리가 필요해지면 그때 나눈다. 권한/역할 화면(`/admin/roles`, #49)은 **조회 전용**이다 — 사용자별 보유 권한, 그 권한이 여는 메뉴(Registry `permission` 기준 클라이언트 조인이며 권한 증명이 아니다), 사이트별 부여 room_name을 보여 준다. 부여·회수(05의 개별 부여 포함)의 원천은 **분리(2026-09-29 Decided, 절반 확정, #98)**: room_name 부여와 메뉴 활용률 열람 개별 부여는 플랫폼 메타 DB가 소유하고, 역할 소속(누가 운영 콘솔 접근자인가)의 원천은 IdP 그룹 claim 사양이 나올 때까지 Open이다(claim을 주면 IdP, 안 주면 메타 DB). 쓰기 포트·화면은 아직 만들지 않는다.
- **Command Palette:** 사용자가 접근 가능한 모든 공간의 메뉴와 전역 유틸리티를 검색한다. 결과는 공간별로 묶고(레일 순서, 전역 유틸리티는 별도 묶음 — 플랫폼 메뉴의 목적지 전부, ADR-0070), 행 보조줄은 `<시스템> › <섹션> › <메뉴>` 전체 경로이며 연속해서 같은 이름은 한 번만 쓴다(전역 유틸리티는 `플랫폼 › <그룹> › <메뉴>`). FeedbackOps 외부 링크는 넣지 않는다.
- **범위 밖:** 공간별 테마·별도 로그인·공간별 Scope는 두지 않는다. FeedbackOps 화면은 플랫폼으로 옮기지 않는다([ADR-0027](adr/0027-feedbackops-stays-standalone-entry-links.md), 단계는 [저장소 연결 문서](integration/repository-layout.md)). (ADR-0066이 ADR-0027을 대체했다. 모든 사용자가 쓰는 FeedbackOps 기능의 전역 배치는 ADR-0070) 공간 `id`, FeedbackOps `Managed System`, 데이터 Scope(Site·room_name)는 서로 다른 식별 층이며 1:1을 가정하지 않는다(매핑은 #81·#213 Open). 현재 Registry에는 MARS·BRAVO·CLAS·운영 콘솔·표준 로그 개발·개선 실행 여섯 공간이 있다. 운영 개요·공지·VOC는 전역 유틸리티다. 표준 로그 개발·개선 실행은 내 작업 우선 메뉴 구성이고 메뉴는 모두 예정이다([ADR-0065](adr/0065-log-dev-and-improvement-spaces-work-queue-first.md), #252). 멀티 워크스페이스 이전은 [#249](https://github.com/hjung3113/analytics-platform/issues/249)가 추적한다.

---

## 10. Command Palette as Platform Navigation

메뉴 수가 증가하면 Sidebar만으로 탐색하지 않는다.

Command Palette는 플랫폼 공통 기능으로 둔다.

지원 후보:

```text
Go to 사이클타임
Go to Equipment EQP-013
Open Metric "Cycle Time P95"
Open recent view
Open saved view
Create VOC from current context
```

메뉴 이동을 기본 책임으로 둔다. Entity Search와 Action Command는 수요 검증 후 채택할 Deferred 후보이며 구현 시점은 정하지 않는다. 플랫폼 메뉴의 목적지(홈·알림·내 VOC·설문·권한 요청·공지)는 메뉴 이동 대상으로 팔레트에 나온다(ADR-0070, §9.1). VOC 등록은 레일 버튼이 연다. `Create VOC from current context`는 여전히 Deferred 후보다.

---

## 11. Global Context Bar

플랫폼에서 가장 중요한 공통 UI 중 하나다.

대표 Context: Time Range · room_name · Line · PRC 그룹 · Equipment Group(Condition·Selection) · Lot · PPID · Recipe · Metric(ID+버전 쌍). Scope는 Global Context에 속하지만 선택기는 사이드바 머리에 하나만 둔다(§7).

**다중축·소속 기준(Decided, 2026-10-21; Apply 모드 구현 — [ADR-0059](adr/0059-app-injected-equipment-axes-and-condition.md)):** 바는 앱이 주입한 여러 축과 축별 여러 값을 표시·편집하고 축 간 AND / 축 안 OR의 적용 조건을 요약한다. “그 시점 소속 / 지금 소속” 선택과 현재 적용한 기준을 표시하며 이력 없는 축을 쓰면 지금 소속만 허용한다. 미지원 축·무효 조합·옵션 갱신 시 기존 값을 조용히 지우지 않고 사유를 표시한다. 후보의 서버 검색·페이징과 고정 선택의 페이지 밖 보존은 §6.4를 따른다. Apply 모드는 아래 조회 바를 쓰고 live 모드는 기존 즉시 적용 바를 유지한다.

Apply 모드의 Line·PRC 그룹은 독립 전역 키 옵션 포트로 편집하며 live 바는 전달값 요약·제거를 유지한다(2026-10-21 사용자 정정 — 소유자 #552). Condition 요약은 주입 descriptor 순서의 축 이름과 값, `asOf`일 때 “그 시점 소속”을 표시하고 PRC 그룹에도 같은 기준 표시를 붙인다.

### 일괄 적용 조회(Decided, ADR-0061)

- `GlobalContextBar`는 메뉴 `query.mode: 'apply'`일 때 SDK `QueryBar`로 전환하며 기존 live 메타데이터 effect를 마운트하지 않는다. 펼친 조회 바는 기간·공정·Line·PRC와 주입 축·소속 기준·EquipmentID 두 그룹, 미지원·참조 전달값 제거 영역, 단일 적용 동작을 제공한다. 전역 Scope 선택은 기존 즉시 동작을 유지한다. 접힌 요약은 실제 초안값과 적용값을 구별하고 전체값 열기를 제공하며 유효한 초안은 펼치지 않아도 적용한다.
- `null`은 전체 후보, `[]`는 명시적 빈 선택이다. Condition 축의 마지막 값 제거는 키를 지운다. 후보 페이지에 없는 값은 보존하며 조합 판정은 서버가 한다. 조회 바는 필수 누락뿐 아니라 Scope·유효성·메뉴 page 오류·커밋 대기 사유를 설명한다.
- `PageFilterBar mode="draft"`는 제어된 필드 API를 유지하고 자체 Apply/form 제출만 없앤다. 메뉴는 초안 page·기간에서 값·기본값·요약·오류를 계산하고 `PlatformPage.queryBarExtension`으로 전달한다. 결과·차트·목록·내보내기·드릴 링크는 적용값을 유지한다. 첫 소비자는 cycle-time(기간·공정 필수)이고 다른 메뉴는 live다.
- `PlatformPage.queryResult`는 메뉴가 고른 권위 있는 요약 쿼리의 `status/completedAt`이다. 정상 머리 아래(칸은 본문 안) 적용 조건 스트립에 적용값과 `요약 조회 완료` instant를 표시하며 viewer 시간대로 포맷한다. idle/loading/null은 완료를 숨기고 같은 신원의 refreshing은 기존 완료를 유지한다. 오류 응답의 완료도 성공 주장 없이 표시한다. cycle-time은 KPI 쿼리를 원천으로 쓰고 다른 위젯 오류는 기존 OutcomeScope로 남긴다. SDK는 쿼리를 추가·집계하지 않는다.

- `useQueryDraft()`는 `{ mode, draft: {global,page}, dirty, setDraftGlobal, setDraftPage, apply, revert, reset, missing, canApply, applying }`를 제공한다. live에서는 적용값을 비추고 setter가 기존 API로 통과한다. dirty는 비어 있고 apply/revert/reset은 no-op이다.
- 초안은 논리적 화면마다 하나다. 본 화면·다른 칸은 격리하고 같은 칸의 본문·Context 바는 시트 수명 소유자 `PaneQueryDraftProvider screens` 아래서 같은 저장소를 읽는다. 칸 선택·숨김·접힘·편집기 재마운트는 초안을 보존한다. 칸/시트 제거, 메뉴·경로 params·세션 교체는 폐기한다.
- 초안 setter는 URL·조회·적용 결과를 바꾸지 않는다. global setter는 codec·주입 축·소속 기준을 검증하며 실제 의미 변경 시 `contextResetKeys`를 즉시 초안 page에서 제거한다. page setter는 선언된 키만 받고 null/빈 문자열은 삭제한다. 미지원 등록 Context와 extras는 Apply의 한 번의 push에도 보존한다. 잘못된 기간·지표 쌍·축·이력 미지원 asOf는 명시적 오류이며 자동 보정하지 않는다. 초기화는 Scope와 기본 기간만 가진 초안 + 빈 page, 되돌림은 적용 global/page다.
- dirty는 정규화한 의미가 바뀐 GlobalContext 필드명과 page 키 목록이다. 집합·Condition 순서 변경은 dirty가 아니다. Apply는 정확히 최종 후보의 required와 Scope를 검사하며 global 변경으로 제거될 required page도 누락으로 본다. 불가·동일 후보는 no-op이다. 초기화 경로의 초안 id-only 지표는 서버 발행 버전을 먼저 채워 한 번에 커밋한다. 미등록·미발행은 거부하며 비초기화 경로의 incomplete 쌍 오류는 유지한다. URL id-only 확인 replace는 초안 기본 기간을 적용하지 않는다.
- 주소의 실제 변경은 다른 writer·링크·history·보드 일괄 적용 모두 초안을 새 적용값으로 rebase한다. 같은 주소 이동은 유지한다. Scope 선택은 기존 즉시 API로 Site 경계 필드를 지운 뒤 rebase한다. 자체 Apply의 지연 반영은 클릭 뒤 편집을 보존하고 중복 호출을 동기 억제한다. `applying`은 현재 turn의 커밋 전달 중이며 조회 loading과 별개다. 전달 뒤 false로 정착하고 미확인 제안은 중복 억제만 유지한다(주소 확인/다른 주소 이동 때 해제).
- 실행 게이트는 주소의 명시적 유효한 from/to + 선언 필수값이다. bare route, v/extras만, Scope만, page만, 미지원 Context만 있는 주소는 idle이다. 필수 Scope는 현재 세션에서 검증해야 요청할 수 있다. 시간 없는 Apply opt-in은 실행 여부를 주소로 재현할 표현이 없어 Registry 오류로 거부한다. 실행 marker나 세션 hasApplied flag를 추가하지 않는다.
- 필수 Context의 대응은 time→from+to, roomNames→roomNames, line→lineNames, prcGroup→prcGroups, condition→condition, selection→selection, lot→lotIds, ppid→ppid, recipe→recipeIds, metric→metricId+metricVersion이다. null/undefined는 누락, 기간·지표는 유효한 완전한 쌍이어야 한다. 집합 `[]`는 존재이며 기존 원천 조회 없는 empty 응답을 유지한다. 빈 page는 누락이다. `missing`은 `{key,label: Text}[]`이고 Context에는 CONTEXT_LABELS, page에는 선언 label을 사용하며 queryMissing 사전으로 선택 사유를 번역한다. 필수값 없이 실행 전이면 missing=[]와 일반 조회 전 문구를 쓴다.
- 분석 요청(useMenuQuery, 공유 menuRequest를 쓰는 useMenuFetch·ModuleHost.query)에 게이트를 적용한다. fetch.ready는 false이며 직접 호출도 adapter 대신 기존 not_ready envelope로 답한다. raw usePlatformQuery·목적지/entity·감사·주석은 보조 요청으로 유지한다. Scope·session·투영 검증은 유지하고 required는 서버 검증을 대신하지 않는다. 조회 바와 cycle-time opt-in은 #553에서 제공하며 최근 조건 저장·복원은 아래 계약을 따른다.

### 최근 조회 조건(현재 견본 구현, 저장 위치 Open — #554)

- SDK `QueryHistoryStore`는 `{userId, menuId, scopeId}`별 `list/record/remove/clear` 비동기 포트다. `PlatformProvider queryHistory`가 없거나 live 메뉴이면 기능과 UI를 제공하지 않는다. 현재 견본 호스트는 `platform:query-history:v1:` + JSON 튜플 `[1,userId,menuId,scopeId]`의 브라우저 저장소를 주입한다. 이는 현재 구현이며 저장 위치의 최종 계약은 아니다. local-only와 서버 동기화 중 선택은 파일럿 전에 결정한다(#554 §5); Saved View는 이 범위에 포함하지 않는다.
- 저장 항목은 `{id, query, schemaVersion:1, lastAppliedAt, count}`뿐이다. `query`는 codec으로 정규화한 적용 global과 선언 page 키의 코드포인트 정렬이며 extras·returnTo·초안·결과·인증정보는 저장하지 않는다. id는 UTF-16 코드 단위에 대한 32비트 FNV-1a 8자리 16진수이며 병합에는 query 일치도 필요하다. 명시적 Apply 제안이 적용 주소로 확인될 때 클릭 당시 후보·사용자·메뉴·Scope로 정확히 한 occurrence(count=1)를 보낸다. 실패·동일값·미확인/대체된 제안·직접 이동·Back/Forward·기본값 물질화·초안 편집은 기록하지 않으며 분석 응답 실패는 기록을 취소하지 않는다.
- 저장소가 병합·횟수·시각·20건 보존을 소유한다. 플랫폼은 Web Locks로 같은 origin의 탭·호출자를 직렬화한다. lock 미지원과 저장소 읽기/쓰기 실패는 고정된 비민감 오류로 거부한다. Kernel은 오류를 잡아 `disabled | loading | ready | unavailable` 상태로 제공하며 일반 조회는 계속한다. 성공한 빈 목록은 ready다. schemaVersion·문자열·현재 query 문법·유한 비음수 시각·양의 safe-integer 횟수를 검사한다. 손상된 현재 envelope는 빈 목록으로 읽고 성공한 record 전에는 덮지 않는다(명시적 clear는 삭제). 미래 envelope는 모든 변경을 거부하며 migration을 요구한다. 지원하지 않는 query 버전은 일반 무효 행으로 남겨 삭제할 수 있다.
- 정렬은 lastAppliedAt 내림차순 → count 내림차순 → id 코드포인트 오름차순 → query 코드포인트 오름차순이다. SDK `useQueryHistory()`는 상위 10행·restore/remove/clear·상태와 열기 검증을 제공한다. 최근 조건은 상대 시각과 실제값 요약을 표시하며 옵션 선택은 초안만 복원한다. 삭제는 복원 옵션 밖에 두고 모두 지우기는 팝오버 안에서 확인한다. Escape는 연 버튼으로 돌아간다.
- 값 표시·복원 전에 현재 메뉴 권한과 검증된 Scope, 저장 Scope 일치, room grant, 현재 주입 축·asOf 지원·완전한 지표 쌍·codec·선언 page 키를 검사한다. 팝오버를 열면 표시할 행의 고정 EquipmentID 합집합을 기존 resolveSelection으로 한 번 확인하며 ok만 허용한다. 실패/진행 중/권한 회수는 값·원문·오류 내용을 노출하지 않는 일반 상태와 시각·삭제만 표시한다. Line·PRC·page 값은 사용자의 이전 입력이며 별도 권한 포트를 신설하지 않는다. 세션 객체·revision·저장 포트·논리적 화면·Scope가 바뀌는 첫 렌더부터 이전 행을 숨기고 늦은 완료·붙들린 동작을 무효화한다. 이력은 목록·복원 검사마다 validateScope로 현재 room grant를 독립 확인하며, 진행 중 검사는 세션/revision 변경·해제 때 취소한다. 화면 Scope 상태와 다시 시도 수명주기는 이 검사로 바꾸지 않는다.
- 재방문 자동 초기화는 논리적 초안 저장소에서 한 번 수행하며 별도 pane Provider가 공유한다. 성공적으로 해석한 주소에 Scope/version 이외 전역값과 선언 page가 없을 때만 최신 한 건을 검증해 복원한다(extras는 유지하되 복원하지 않음). 최신이 무효이면 이전 건으로 대체하지 않는다. 조회 시작 이후 편집·되돌림·초기화·Apply·주소 변경이 있었으면 덮어쓰지 않으며 되돌린 편집도 revision으로 감지한다. 유효 deep link·부분/잘못된/미지원 전달 조건은 항상 우선한다.
- 수동·자동 복원은 같은 원자적 초안 전체 교체를 쓴다. 저장 항목에 없는 page 키는 지우며 저장 global과 page를 검증된 한 쌍으로 복원한다. 이 명시적 경로에서는 contextResetKeys도 그 global 소속으로 보존해 다음 Apply에서 제거하지 않는다. 이후 일반 global 편집의 reset 규칙은 유지한다. 적용값·extras·URL·분석 게이트·결과는 복원으로 바뀌지 않고 사용자가 Apply해야 실행한다. ModuleHost·FeedbackOps/반환 링크는 계속 적용값만 읽는다.
- page 표시명·유효 기본값은 소비자의 순수 `historyPageSummary(global,page)` 메타데이터가 제공하며 현재 초안/결과 요약을 다른 행에 빌려 쓰지 않는다. history 내용은 usage·오류 보고로 보내지 않는다. 실기기 동기화·서버 저장·공유 정책은 이 포트의 별도 구현 범위다.

### Context 변경 규칙

- 사용자가 명시적으로 바꾼 값만 전역 상태를 변경한다.
- 단순 Chart Zoom은 Global Context를 변경하지 않는다.
- Brush 후 `Analyze selected range` 같은 명시적 Action이 있어야 Global Context로 승격한다.
- Scope·설비·기간 등 Context가 바뀌면 이전 결과를 새 조건의 결과처럼 표시하지 않는다. 이전 요청이 늦게 완료돼도 새 Context 결과로 채택하지 않는다. 동일 Context 재조회에서만 이전 결과와 갱신 중 표시를 함께 유지할 수 있다. 권한 변경/Scope 전환에서는 이전 결과를 숨기고 현재 권한을 재검증한다.
- 지원하지 않는 Context는 명시적으로 표시한다.
- 초기화는 분석 Context만 지우고 요청 Scope는 유지한다(같은 내비게이션에서 `contextResetKeys`도 지운다, §6.4). 링크 복사는 현재 URL을 그대로 복사하며 받는 사람의 권한으로 서버가 다시 검증한다(§6.2).

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

### 12.6 pageType의 현재 계약과 레이아웃 슬롯 (#104, #156)

**지금 pageType이 강제하는 것:** manifest의 `pageType`(5종 중 하나)과, 생성기(`pnpm gen:menu --page-type`)가 만드는 화면 뼈대의 콘텐츠 슬롯(위 12.1–12.5의 슬롯 이름, 읽는 순서 그대로)이다. Page Header·Global Context는 셸 슬롯(§8)이라 `PlatformPage`·셸이 이미 그리므로 뼈대에 다시 넣지 않는다. Data Trust는 12.1·12.2가 슬롯으로 적으므로 뼈대에 `trust` 슬롯으로 넣는다 — `PlatformPage`는 소비자가 넘긴 `dataTrustSummary`만 그리므로 신뢰 정보를 가진 화면이 그 슬롯을 채워야 한다. 슬롯 이름은 12.1–12.5의 영문 표기 그대로다. Management 공통 레이아웃은 `ManagementLayout`, Analysis 공통 레이아웃은 `AnalysisLayout`으로 제공한다. Management 뼈대는 filter·table 자리표시를 공통 레이아웃 안에, actions·drawer·history를 레이아웃 아래에 렌더한다. Analysis 뼈대는 kpi·chart·breakdown 자리표시를 공통 레이아웃 안에 렌더하며, annotation은 chart 노드 안에서 chart 자리표시 바로 뒤에, trust는 레이아웃 아래에 두어 kpi → chart → annotation → breakdown → trust 읽는 순서를 유지한다. 나머지 archetype 뼈대는 점선 구획으로 렌더한다.

**Management — Decided ([ADR-0022](adr/0022-management-filter-rail-analysis-two-column.md)):** `ManagementLayout`은 `filter`/`table`/`drawer` 슬롯을 제공한다. 자기 폭 960px 이상에서는 260px 왼쪽 필터 레일과 표를 16px 간격으로 나란히 둔다. 레일은 페이지 sticky 머리 아래에 머물고 본문만 스크롤한다. 접기·펼치기와 공통 접힘 기억을 제공하며, 접힘·좁음에서는 표 툴바의 `필터 · N` 버튼(적용 수 0이면 숫자 생략)으로 접근한다. 좁음에서는 팝오버로 필터를 편집하며 접힘 기억을 바꾸지 않는다. 필터 필드는 [PageFilterBar](adr/0016-page-filter-bar.md)의 column 배치로 소비하고, 상세는 셸 슬롯(ADR-0013)에 둔다. 드로어 열림은 URL page key(§6.1)다. **필터 적용 (Decided, [ADR-0037](adr/0037-table-filter-consistency.md)):** 관리 화면 필터는 텍스트와 Select 모두 초안이고 `적용`(`적용 (n)`: 적용된 값과 다른 필드 수, 바뀐 것이 없으면 꺼짐)으로 `setPage` 한 번에 반영한다. 초안은 `ManagementLayout` 위의 화면이 소유해 레일·팝오버 이동과 접힘에서도 남고, 적용된 URL 값이 바뀌면(이동·뒤로/앞으로·초기화) 초안을 다시 맞춘다. 접힌·좁은 `필터 · N` 버튼에는 `미적용 n` 글 표식과 "적용된 필터 N개, 미적용 변경 n개" 설명이 붙고, 레일 머리에는 `· 미적용 변경 n개`가 붙는다. `필터 초기화`는 적용된 필터가 있을 때만 보인다. 카탈로그·분석 막대의 필터는 즉시 반영을 유지한다.

**Analysis — Decided ([ADR-0022](adr/0022-management-filter-rail-analysis-two-column.md)):** `AnalysisLayout`은 `kpi`/`chart`/`breakdown` 슬롯을 KPI 띠·차트·분해 표 순서로 16px 간격으로 배치한다. 기본 `density: 'regular'`에서는 자기 폭 960px 이상이고 펼친 차트가 2개 이상이면 차트는 2열이며 홀수 개의 마지막 차트는 전체 폭을 쓴다. 좁거나 펼친 차트가 하나면 1열이다. 같은 행의 차트는 머리·범례 높이를 공유하여 그림 영역 윗변을 맞추고 카드가 행 높이를 채운다. KPI·분해 표는 전체 폭이다. KPI 띠·각 차트·분해 표를 각각 접을 수 있으며 접은 단위는 배치에서 빠지고 맨 위 “접힌 항목” 칩으로 원래 순서에 복원한다. 접으면 칩으로, 펼치면 접기 버튼으로 포커스가 이동한다. 접힌 단위 id는 메뉴별 localStorage `platform:analysis-collapsed:<menuId>`에 기억하고 모르는 id는 무시한다. 조회 중단은 보장하지 않으며 펼칠 때 차트·표 로컬 상태는 초기화될 수 있다. 사내에서 분석 메뉴를 새로 만드는 플랫폼 목적에 따라 사용자 결정으로 §24의 반복 기준(소비자 2–3곳)보다 먼저 공통 레이아웃으로 올린다.

**크기·밀도 선택지 (Decided, #547):** 기본 2열(A)은 그대로이며, 차트 섹션의 `span: 'full'`은 열 수와 무관하게 행 전체를 쓰는 hero(B)다. `AnalysisLayout`의 `density: 'compact'`(C)는 자기 폭 640px 미만 1열, 640px 이상 2열, 960px 이상 3열, 1280px 이상 4열이고 마지막 홀수 차트를 늘리지 않는다. 명시한 full 섹션은 compact에서도 전체 열을 쓴다. 읽는 순서를 유지하며 빈 칸을 앞선 항목으로 메우지 않는다. 같은 행은 머리·범례와 본문의 두 행을 공유하고 그림 영역 윗변·최소 폭 보호, KPI·분해 표 전체 폭, 접기·복원 순서·포커스·메뉴별 기억은 모든 밀도에서 유지한다.

`AnalysisChart`·`AnalysisChartFrame`의 `size`는 명시한 값 → 차트 섹션의 명시한 full이면 hero → compact 레이아웃이면 compact → regular 순서로 정한다(KPI·분해 표·독립 차트는 상속하지 않는다). 그림 기본 높이는 hero 360px, compact 200px, regular는 각각 280px·260px다. 명시한 `height`는 그림 높이만 덮어쓰며 상속한 compact 콘텐츠 처리는 유지한다. compact는 ReactNode 설명을 이름 있는 정보 버튼의 hover·키보드 포커스 Tooltip으로 제공하고 지표 버전은 계속 표시한다. 범례 글자는 `text-tiny`로 줄이되 기호·선 패턴·Compare 기간 구분과 동작 이름·보이는 글자는 유지한다. 크기·밀도 변경은 차트 로컬 상태와 포커스를 보존하며 접어서 언마운트하는 기존 의미는 그대로다. 모든 크기에서 §16 상호작용과 §26 접근성 계약을 따른다.

승격 판단은 §24(실제 소비자 2–3곳 반복)를 따르고, 패턴별 소비자 현황은 이슈 #104·#156에서 추적한다.

### 12.7 드릴다운 레이아웃 (Decided, [ADR-0025](adr/0025-drilldown-level-page-keys-path-bar-layout.md))

`DrillLayout`은 페이지 본문 맨 위에 경로 바(`DrillPath`)를 두고 그 아래에 현재 단계의 본문을 그린다. 단계가 바뀌면 본문을 통째로 바꾸며, 앞 단계 본문을 아래로 쌓거나 옆 열로 남기지 않는다. 0단계(단계 키 없음)에서는 경로 바를 숨기고 메뉴의 요약 본문을 그대로 둔다. 형식 오류(§6.4)와 결과에 없는 값은 `DrillLayout`이 본문 자리에 명시적 상태로 그린다.

- 경로 바는 `전체 › <단계 이름>: <값> › …` 칩이고 마지막 칩이 현재 단계(`aria-current="step"`)다. 앞 칩을 누르면 그 단계로 올라간다. 칩이 5개 이상(깊이 4 이상)이면 `전체`와 마지막 2개만 두고 가운데를 `…` 메뉴로 접는다.
- 메뉴가 같은 단계의 다른 값 목록을 주면 그 칩 옆 ▾ 메뉴로 바로 바꾼다(형제 비교).
- 경로 바는 `PlatformPage`의 고정 breadcrumb(메뉴 위치)과도, 다른 메뉴로 돌아가는 복귀 버튼(§22)과도 다른 요소다.
- 단계 진입은 행 끝 들어가기 버튼(접근 이름 `<값> 들어가기`)처럼 눈에 보이는 동작으로 한다. 메뉴가 §16의 `pointActivation`을 선택하고 키보드로 같은 동작을 실행할 수 있으면 차트 지점 활성화로도 진입할 수 있다. 행 전체 클릭은 진입 동작으로 쓰지 않는다(교차 필터와 구분).
- 객체 하나인 마지막 단계는 오른쪽 상세 슬롯(ADR-0013)으로 연다. 슬롯을 닫으면 바로 앞 단계로 올라간다.

### 12.8 PanelWorkspace (Candidate, [ADR-0067](adr/0067-dockview-layout-engine-board-v2.md) 결정 3–9·18–22)

패널이 4개 이상인 밀집 분석 메뉴가 쓰는 선택 레이아웃이다. 메뉴가 패널·프리셋·기본 패널을 선언하고, 탭·끌기·나누기·최대화·숨긴 패널 목록·기본 배치·브라우저 로컬 선호는 플랫폼이 소유한다. 그 밖의 메뉴는 `AnalysisLayout`(§12.6)을 그대로 쓴다. `@ap/components` 루트의 `PanelWorkspace`이고(메뉴는 `@ap/components/dock`을 import할 수 없다), 소비자가 둘 이상 확인될 때까지 Candidate다(§24). 휠: 탭 줄은 넘치지 않으면 세로 휠을 바깥으로 넘기고([16 §4.1](16_analysis_board.md)), 그림은 수정키 없는 휠을 막지 않으며(§16), 패널 안 표 행 영역은 끝에서 휠을 넘긴다(§15)(#700).

- **props:** `panels`(`id`·`title`·`render`·`primary?`·`minWidth?`·`minHeight?` — 기본 패널은 정확히 하나, 숨길 수 없고 비는 자리를 먼저 얻는다), `presets`(`id`·`label`·`layout`: 그룹 `{type:'group', panels, active?}` 또는 `{type:'branch', dir, sizes(비율), children}`)·`initialPreset`·`compactPreset?`·`persistKey`·`label`·`compactBelow?`(기본 900px, 컨테이너 폭). 패널 id와 `persistKey`는 `^[a-z][a-z0-9._-]{0,63}$` 정적 식별자다(저장 키에 데이터 값이 들어가지 않게).
- **리마운트 0:** 프리셋 전환·`기본 배치`·이동·나누기·탭 선택·최대화는 이미 마운트된 패널을 재배치하므로 상태와 조회가 유지된다. 숨긴 패널의 하위 트리는 내려가므로 숨겨도 살아야 하는 상태는 workspace 위에 둔다.
- **도구줄 또는 호스트 명령:** 단독이면 프리셋 선택(`SegmentedRadio`)·높이 방식 선택(`화면 맞춤`/`아래로 쌓기`, 아래 "높이 방식")·`숨긴 패널 n`(0이면 꺼짐, 누르면 다시 보기 목록)·`기본 배치` 한 줄이 위에 붙는다. `WorkspaceCommandsHost`(`@ap/components/dock`, 호스트 전용) 안이면 도구줄이 없고 같은 명령이 `useWorkspaceCommands()`로 호스트의 메뉴(보드 칸 메뉴)에 간다. 라디오 명령은 `WorkspaceCommand.group`(없으면 프리셋, `'mode'`는 높이 방식)별로 독립 묶음이 되고 도구줄과 칸 메뉴 모두 묶음마다 하나의 라디오 그룹·체크 하나로 그린다(`radioGroupsOf`). 패널 그룹 띠는 보드의 확정 띠(칩 C)와 같다: 최대화 토글과 `<제목> 동작` `⋯`(최대화·복원, 그룹에 패널 둘 이상이면 나누기, `<제목> 묶음으로 옮기기`, `숨기기` — 기본 패널은 없음). 메뉴 항목 계산은 보드와 공유하는 `dockLayoutMenu`다. 이동·나누기·숨기기·다시 보기를 메뉴로 실행하면 메뉴가 닫힌 뒤 포커스는 옮긴 패널의 탭으로(숨기기는 그 그룹에서 활성이 된 탭, 그룹이 없어졌으면 기본 패널의 탭) 간다. `다시 보기`는 기본 패널을 가리지 않는다: 현재 프리셋에서 같은 그룹이던 패널 중 보이는 것의 그룹(그 그룹이 기본 패널의 그룹이면 기본 패널이 활성으로 남는다) → 없으면 읽기 순서 첫 비기본 그룹 → 그것도 없으면 기본 패널 오른쪽 분할. 보드 칸 메뉴에서는 작업 영역 묶음 위에 `화면 배치` 이름표(항목 아님)가 붙는다.
- **좁은 폭:** `compactBelow`보다 좁으면 `compactPreset` 배치를 메모리에서만 그린다(그 사이 한 변경은 저장하지 않고 넓어지면 저장된 배치로 돌아온다). `compactPreset`이 없으면 한 탭 그룹으로 쌓아 보이기만 한다. 쌓여 보이는 동안 프리셋 선택은 꺼지고(`title`·`aria-describedby`·명령의 `disabled`) 이유 `좁은 폭에서는 한 묶음으로 보입니다`를 보인다. `숨긴 패널`·`기본 배치`는 그대로 쓴다. 패널의 `minWidth`·`minHeight`는 separator의 방향키·Home/End 한계에도 쓰인다(묶음의 한계는 탭 중 가장 큰 값).
- **로컬 선호:** `platform:workspace:v1:<사용자>:<메뉴>:<persistKey>`(`{v, preset, layout, hidden, mode?, rows?}`; 최대화는 저장하지 않음. `mode`는 `'stack'`이거나 없음(= 화면 맞춤), `rows`는 쌓기의 최상위 줄 px — 아래 "높이 방식"). 마운트 때 한 번 읽고(조회 없음) 변경 300ms 뒤 쓰며 언마운트·`pagehide`에 즉시 쓴다. 저장소 접근은 모두 try/catch이고 사용자·메뉴가 없으면 메모리에만 둔다. 같은 메뉴·키를 보이는 두 칸은 하나를 공유하고 마지막 쓴 쪽이 이긴다. 깨진 값은 고쳐서 쓴다(`normalizeWorkspaceState`).
- **높이 방식 (Decided, 사용자 2026-10-23, #686 C안, [ADR-0077](adr/0077-workspace-stack-mode-rows-keep-own-height.md)):** 라디오 묶음 `높이 방식`(`화면 맞춤` 기본 / `아래로 쌓기`)을 도구줄과 호스트 `⋯` 메뉴에 둔다. 작업 영역마다 고르고 레이아웃과 함께 저장한다. 모드를 바꿔도 패널은 리마운트되지 않고 조회도 없다.
  - **화면 맞춤:** 위 "높이 채움" 그대로다.
  - **줄 모델(쌓기):** 최상위 레이아웃은 줄의 열이다(루트가 열이 아니면 루트 전체가 한 줄). 줄마다 px 높이를 갖고 페이지가 스크롤된다. 작업 영역은 엔진 상자(줄 px의 합 + 줄 사이 간격, 아래 "경계")와 그 아래 띠(`여기에 놓으면 아래에 새 줄`, 72px, 위 여백 8px)로 이뤄진다. 줄 px가 원본이고 최상위 비율은 그 투영이다. 쌓기로 들어갈 때 줄 px = `round(비율 × max(화면 맞춤 높이, 줄 수 × 360))`(화면 맞춤 높이 = 맞춤 모드가 레이아웃에 주는 높이, 직접 잰 값 또는 마지막으로 잰 값; 쌓기만 본 적 없으면 보이는 영역 − 도구줄로 가늠). 줄 최소 = `max(200, 줄 안 재귀 최소 + 그룹마다 띠 40px)`, 줄 최대 = 보이는 영역 높이(가장 가까운 스크롤 컨테이너 높이 − 같은 페이지에서 그 위에 고정되는 머리 `[data-page-sticky-header]` 높이 − 접힌 조회 조건 줄 `[data-query-bar][data-query-bar-collapsed]` 높이(Apply 페이지는 이 줄이 머리 밖에서 따로 고정된다, 펼치고 접으면 최대도 따라 바뀐다), 보드 칸에서는 둘 다 없는 칸 본문 높이; `visibleArea.ts`, `--page-sticky-offset`과 같은 합). 줄의 최소가 보이는 영역보다 크면 최소를 지키고 넘친다(예외). 들어갈 때·복원(보이는 영역을 처음 잰 순간 한 번)·`기본 배치`·새 줄·크기 조절은 [최소, 최대]로 맞추지만 그 뒤 창 크기 변화는 저장된 px를 다시 쓰지 않는다. 그래서 보이는 영역이 줄어든 뒤의 줄은 최대보다 클 수 있고, 그 줄의 경계는 실제 한계로 `max(줄 최대, 지금 px)`를 쓴다(`aria-valuemax`, End, 끌기 한계가 같다). 줄이기는 언제든 된다. `기본 배치`·프리셋은 쌓기에서도 마지막 화면 맞춤 높이로 줄 px를 다시 정하므로 반복해도 높이가 쌓이지 않는다.
  - **경계:** 최상위 줄마다 그 아래에 `role="separator"`가 있다(마지막 줄 아래 포함). 이름은 줄 사이면 `<위 줄 제목> · <아래 줄 제목> 사이 높이`, 마지막 줄 아래면 `<위 패널 제목> 아래 높이`다. 끌기(포인터)와 키가 그 위 줄만 바꾸고 아래 줄은 px를 지키며 작업 영역이 같은 만큼 늘거나 준다. 방향키 ±24px, Home=최소, End=최대, `aria-valuenow`·`min`·`max`는 px다. 엔진 자체의 최상위 가로 sash는 이 모드에서 비활성이다(줄 사이에서 높이를 주고받지 않음). 줄 안 경계는 오늘처럼 비율·5%다. 끄는 도중 건드리지 않은 줄의 px는 변하지 않는다(높이와 비율을 한 프레임에 적용). 작업 영역 상자는 줄 px의 합에 엔진이 최상위 줄 사이에 두는 간격(테마 gap 6px × (줄 수 − 1))을 더한 높이라서 각 그룹이 자기 px로 그려진다. 엔진의 최상위 sash 비활성은 작업 영역 자신의 격자에만 적용되고 패널 안에 중첩된 레이아웃의 sash는 그대로다.
  - **아래 새 줄:** 마지막 줄 아래 띠에 탭 하나를 놓거나(묶음 전체·다른 작업 영역/보드의 탭·바깥 데이터는 거절) 그룹 `⋯`의 `아래 새 줄로 옮기기`(이미 마지막 줄에 혼자면 숨김)를 쓰면 그 패널이 360px 새 마지막 줄이 된다(경계 안으로 맞춤). 줄의 마지막 패널이 나가면(이동·숨김) 줄이 사라지고 다른 줄은 px를 지킨다. 줄은 출신으로 맞춘다: 편집이 만든 줄(새 줄로 옮기기·띠에 놓기·위/아래로 나누기, 엔진 끌기로 그룹 가장자리에 놓아 혼자 선 탭)은 항상 새 줄(360px)이고 살아남은 줄의 px를 가져가지 않으며, 같은 패널 구성이 먼저, 그다음 겹침이 큰 순서로 이어받는다. 띠가 하나이므로 놓는 탭이 끌린 것인 경우 띠는 그 드래그를 소비해 위쪽 레이아웃(보드)이 같은 놓기를 받지 않는다. 다시 보기는 줄을 만들지 않는다(기존 규칙대로 묶음에 붙음).
  - **저장:** `v:1`·키 그대로, 선택 필드 `mode?: 'stack'`·`rows?: number[]`. 정규화는 `mode`가 `'stack'`이 아니면 화면 맞춤으로 읽고 `rows`를 버리며, `rows`가 유한한 양수가 아니거나 최상위 줄 수와 다르면 `rows`만 버리고(다시 잰다) 각 줄을 최소로 올린다. 던지지 않는다.
  - **좁은 폭:** `compactBelow` 미만(compact 배치 또는 한 묶음 표시)에서는 쌓기가 꺼져 화면 맞춤으로 보이고 페이지 흐름·띠도 없으며 모드 라디오는 이유(`좁은 폭에서는 화면 맞춤으로 보입니다`)와 함께 비활성이다. 저장된 모드와 줄 px는 compact 편집에 덮이지 않고 넓어지면 돌아온다.
  - **페이지:** `PlatformPage layout="fill"`에서 쌓기 작업 영역이 보이는 동안 페이지는 흐름 크기(루트 `min-h-full`, 본문 슬롯은 작업 영역 크기)로 바뀌어 main이 스크롤된다. 머리 접기·얇은 띠는 `layout="fill"` 조건 그대로 켜 둔다(ADR-0075). 연결은 내부 등록 컨텍스트이며(공개 prop 없음) 가장 가까운 페이지가 받고, 작업 영역이 쌓기를 멈추거나 사라지면 고정 fill로 돌아온다. dock 패널은 이 연결의 경계다: 패널 안에서 렌더되는 내용은 바깥 페이지의 등록을 받지 않고(안쪽 `PlatformPage`는 자기 것을 낸다), 패널 안 쌓기 작업 영역은 바깥 fill 페이지의 크기를 바꾸지 못한다. 보드 칸 안에서는 칸 본문(이미 `overflow-auto`)이 스크롤된다.
  - **이 단계에서 하지 않는 것(#701, `.planning/backlog.md`):** 포커스·이동한 줄 스크롤, 보이는 영역으로 최대화 한계, 끌기 중 가장자리 자동 스크롤, 끌기 중 띠 고정, 패널 선호 높이·표 채움, 기본값 전환. 쌓기의 최대화는 오늘처럼 쌓기 전체를 채운다.

- **높이 채움:** `PlatformPage layout="fill"`이면 페이지가 컨테이너(본 화면 main, 보드 칸 본문) 높이를 채우고 본문이 머리 아래 남은 높이를 차지하되 최소 520px(그림 300px + 카드 머리)을 지킨다(머리가 펼쳐져 뷰포트를 채우면 작업 영역이 찌그러지는 대신 페이지가 스크롤된다 — 머리는 아래 접기로 한 줄이 기본이며, 사용자가 펼치거나 펼침 선호를 복원하거나 잘못된 페이지 키 때문에 처음부터 펼쳐질 때 생긴다; `data-page-layout="fill"`, 기본 `flow`는 그대로). 차트의 `size="fill"`은 그림 상자가 컨테이너가 남기는 높이(최소 320px — 남는 높이가 모자라면 그림 상자 안이 아니라 카드가 커지고 패널 본문이 스크롤된다, 측정 전 320px — 단 TopN 막대는 측정 전 `max(120, 행 수·28+24)`px를 쓰고 측정되면 같은 규칙으로 채운다)를 쓴다. 패널 안에서는 카드·차트 제목 `<h2>`가 탭과 겹치므로 시각적으로만 숨긴다(`sr-only`, 접근 이름 유지).

- **머리 한 줄 접기 (Decided, 사용자 2026-10-23, #680 B안, [ADR-0075](adr/0075-page-head-one-line-fold-thin-outcome-strip.md)):** `layout="fill"` 페이지에 `contextExtension`이나 비지 않은 `contextNotes`가 있으면(게이트 없음) 머리 영역(안내 + 확장)이 접기를 갖는다. 둘 다 없으면 접기도 빈 줄도 그리지 않고, flow 페이지는 접기 없이 그대로다.
  - **접힌 줄(기본):** 왼쪽부터 `queryBarExtension.appliedPageSummary`의 요약 칩(없을 때만 `pageSummary` — 접힌 줄은 결과 위에 있어 초안 라벨이 결과를 설명하면 안 된다), 그리고 줄어들지 않고 잘리지 않는 `미적용 변경 있음`·`확인 필요 N`·`안내 N`·`펼치기`. 넘치면 칩 목록만 줄어든다. 칩은 항목 단위이고, 줄이 칩보다 좁으면 목록이 가로로 스크롤되되 스크롤바는 숨기고 넘칠 때만 오른쪽 가장자리에 페이드를 보인다 — 가장자리가 마지막 항목을 자를 수 있다. 전체 요약은 `title`이고 펼치기 버튼의 `aria-describedby`가 가리킨다(§13, ADR-0029).
  - **버튼:** 펼치기(보이는 글 `펼치기`, 접근 이름 `페이지 머리 펼치기`, `aria-expanded=false`, `aria-controls` → 머리 내용)와 접기(펼친 상태, 내용 아래 오른쪽 정렬, 보이는 글 `접기`, 접근 이름 `페이지 머리 접기`, `aria-expanded=true`). 누르면 포커스가 반대 토글로 간다.
  - **마운트 유지:** 접어도 머리 내용은 `hidden`으로 마운트돼 같은 id와 소비자 상태가 남는다. 토글은 안내하지 않고, 접힌 동안 요약·미적용·확인 필요 표식이 바뀌면 항상 마운트된 polite 영역이 한 번 안내한다(PageFilterBar와 같은 규칙).
  - **기본·기억:** fill 페이지의 기본은 접힘이고 메뉴별로 localStorage `platform:page-head-collapsed:<menuId>`(boolean JSON)에 기억한다. 보드 칸도 같은 접기를 그리고 같은 키를 공유한다.
  - **상태를 숨기지 않는다:** (1) 적용된 버킷·분포 칩은 `appliedPageSummary`로 접힌 줄에 칩으로 보인다. 그 해제(×)는 펼친 뒤에 닿는다. 칩 줄을 두 번 그리지 않는다. (2) 이 메뉴의 `pageKeys` 중 하나라도 초안과 적용이 다르면(`queryDraft.dirty`) `미적용 변경 있음`을 보인다 — 전역 Context 변경은 조회 바가 이미 보인다(`적용 안 된 변경 N개`). 즉시 반영 메뉴는 `dirty`가 비어 표식이 없다. (3) `queryBarExtension.issues`가 비지 않으면(잘못된 페이지 키) 접힌 줄에 `확인 필요 N`을 보이고 저장값과 무관하게 펼친 채 마운트한다(저장값은 덮어쓰지 않는다) — 본문 메시지가 가리키는 `페이지 조건 기본값`이 머리 안에 있기 때문이다. (4) Data Trust(머리)·조회 바·권한/Scope 게이트는 머리 영역 밖이라 그대로다. 응답 오류는 머리 영역 밖(§19)이다.
  - PageFilterBar의 `collapsible`(자기 접기)은 머리 안에서 그대로 쓴다(두 단계).

- **첫 소비자:** 사이클타임 드릴다운(`CycleTimeDrilldown`)이 `PanelWorkspace`(`persistKey="drilldown"`, 프리셋 `balanced`·`focus`·`column`(`세로`: 추세 / 요약 | 분포 / 느린 실행, 쌓기의 자연스러운 시작))를 쓴다(ADR-0067 3b, ADR-0077). `balanced`는 행 `[추세 68, 열[요약 38, 묶음[분포·느린 실행(분포가 앞) ] 62] 32]`로 추세가 작업 영역 전체 높이와 가장 넓은 폭을 갖고, `focus`는 추세 70 | 나머지 한 묶음 30이다. 엔진이 그룹 컨테이너에 다는 `region`·`aria-label`은 지워 패널 안 카드와 이름이 겹치지 않게 하고 그룹의 탭 패널은 탭 이름으로 읽힌다. 보드 칸 안에서는 도구줄 없이 프리셋·숨긴 패널 다시 보기·`기본 배치`가 칸 `⋯` 메뉴의 내용 그룹과 배치 그룹 사이에 붙는다.

---

## 13. Shared Component Layers

> 디자인 시스템 원본 소유는 [ADR-0043](adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)(2026-10-19)으로 플랫폼으로 바뀌었다. 코드를 SDK로 옮기기 전까지 이 절의 FeedbackOps 원본·재수출 규칙대로 동작한다.


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

shadcn/ui + Radix 조합은 [04 프론트엔드 기술 스택](04_frontend_ui_ux.md#프론트엔드-기술-스택-decided-2026-09-25)에서 Decided(2026-09-25)다. 구현은 FeedbackOps `@fops/ui` 원본을 `@ap/ui`가 재수출한다(복사·이식하지 않는다, [ADR-0010](adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md)·[0011](adr/0011-design-direction-feedbackops-shell.md)). 예외: 탭 선택 표식을 위해 `TabsList`·`TabsTrigger`만 `@ap/ui`가 FeedbackOps 부품을 감싸 정의한다([ADR-0023 개정](adr/0023-feedbackops-primitive-shapes-and-sizes.md#개정--탭-선택-표식-2026-10-15)). 아래 primitive 역할 예시는 그 구체 컴포넌트 매핑까지 확정하는 것은 아니다.

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

- GlobalContextBar (`@ap/shell`)
- PlatformPage (페이지 머리·슬롯, §8. 별도 PageHeader 컴포넌트는 없다)
- PageFilterBar
- DataTrustIndicator
- AnalysisChartFrame
- AnalysisChart (종류별 데이터·로컬 선택·표·CSV 프레임, [§16](#16-analysis-chart-contract), [ADR-0058](adr/0058-analysis-chart-spec-union.md))
- LegendTree (계층 범례의 보이기·단일 현재 항목·키보드 행 이동, [§16](#16-analysis-chart-contract), [ADR-0057](adr/0057-legend-tree-arrow-key-row-navigation.md))
- PlatformDataTable
- DetailDrawer
- AuditTimeline
- QueryView / OutcomeView / StateMessage (응답 상태, EmptyState 역할), PlatformPage-provided shared outcome scope / banner (§19)
- StatCard / Panel
- DrillPath / DrillLayout (드릴다운 경로 바와 단계 본문, §12.7)
- ReturnLink (다른 메뉴에서 출발 화면으로 돌아가는 버튼, §22)

후보(미구현): `PermissionGuard`(현재는 셸 `RouteOutlet`의 권한 게이트), `SavedViewSelector`(Deferred, §21).

`PageFilterBar`는 메뉴가 전달한 검색·정확 일치 텍스트·분류 선택·맞춤형 필드를 라벨과 함께 한 줄에 배치하고 공간이 부족하면 줄바꿈한다. 입력은 `@ap/ui` `Input`(40px), 분류 값은 `Select`를 사용하며 높이를 덮어쓰지 않는다. `onApply`를 주면 막대가 `<form>`이 되어 submit(적용 버튼·텍스트 입력의 Enter)만 적용으로 보낸다. 한글 조합 중 Enter는 적용하지 않는다. 필드 의미·URL page key·값 변경·초기화·draft 적용은 소비 화면이 소유하며, 알 수 없는 현재 Select 값은 선택 가능한 표시값으로 남긴다(ADR-0016).

row 방향 소비자는 opt-in `collapsible`로 입력 영역만 접을 수 있다(ADR-0029). 접힘 줄은 소비자가 제공한 `summaryItems`(필드명+현재값) 전체를 담은 펼치기 버튼 하나와 독립된 접힘 액션이며, 공통 부품은 조건을 생략·요약하지 않는다(말줄임·`+n` 금지, 폭이 부족하면 항목 단위 줄바꿈). 요약값은 펼친 입력과 같은 표시 모델에서 만들고 잘못된 값·미확정 상태도 사실대로 보인다. 접힘 기억(`preferenceKey`별 저장)·펼침/접힘 포커스 이동·disclosure aria는 공통 부품이 소유하고, column 레일 소비자는 이 접기를 켜지 않는다.

`AuditTimeline`이 보이는 이벤트 타입은 `@ap/contracts`의 `AuditEvent`다. `at`은 실제 시점이라 `formatInstant`로 표시한다(§6.3). `target`은 목적지 참조(§22)이지 분석 Context가 아니다. 전역 감사 조회(`auditTrail`)와 목적지 감사 — 설비 상세 감사 탭, 지표 상세 변경 이력(`entityAudit`, 지표는 `scopeId: null`) — 는 같은 저장소를 어댑터 포트([패키지 경계](integration/platform-packages.md) §4)로 읽으며 셸 위젯이 아니다(#50, #90). 메뉴가 소유한 대상의 감사 기록은 mock에서 메뉴가 시드로 내고 앱 조립이 넣는다([ADR-0048](adr/0048-menu-audit-seeds-join-shared-mock-audit-store.md)); 사유·값은 기록된 문자열 그대로다.

### DetailDrawer — docked shell slot (Decided, ADR-0013)

- 이름과 props는 유지하고 렌더 대상은 셸 소유 오른쪽 고정 상세 슬롯이다. 이름 있는 `aside` landmark 안에 제목으로 이름 붙인 비모달 상세 dialog를 둔다. 본문은 폭을 양보하며 목록을 계속 조작할 수 있다. scrim·본문 inert·overlay·페이지 머리 아래 fixed 배치는 쓰지 않는다.
- 폭은 §7 Baseline을 따른다. 열림/닫힘은 페이지가 등록한 `focus` 키로 결정하고 `tab`으로 탭을 복원한다. close 버튼·패널 안 Esc는 페이지의 `onClose`를 호출해 `focus`를 지운다. 딥링크·새로고침·Back/Forward 복원과 `전체 화면` 이동 동작을 유지한다. `전체 화면`은 보던 탭을 목적지에 같은 탭이 있으면 `tab`으로 넘긴다.
- 열리면 닫기 버튼으로 포커스를 옮긴다. URL 도착(링크·팔레트·공간 전환·복귀·첫 로드·새로고침)으로 함께 열린 패널은 포커스를 가져가지 않고 §26의 제목 규칙을 따른다([ADR-0032](adr/0032-arrival-focus-wins-over-restored-detail-panel.md)). 닫힐 때 패널에 포커스가 남아 있으면 연결된 트리거로 복귀하고, 트리거가 없거나 제거됐으면 main으로 복귀한다. 사용자가 이미 목록으로 옮긴 포커스는 빼앗지 않는다. 포커스 trap은 없으며 패널 밖 Esc는 상세를 닫지 않는다. 탭 전환으로 포커스된 컨트롤이 사라지면(§26) 선택된 탭 트리거로, 트리거가 없으면 패널로 옮긴다.
- 한 셸에 상세 슬롯은 하나이며 마지막 등록이 이기고 개발 환경에서 중복 등록을 경고한다. 등록자가 unmount되면 해제하고, 이전 등록자가 살아 있으면 그 내용이 다시 보인다. 분석 보드에서는 다른 칸의 상세가 슬롯을 차지하면 앞 칸의 상세는 복귀하지 않고 닫힌다([16 §6](16_analysis_board.md#6-메뉴-쪽-요구-decided)). 내용 갱신만으로 등록 우선순위를 바꾸지 않는다. 등록 방식은 둘(DOM host에 직접 portal / 노드를 맡기는 `useDetailPanelContent`, 셸 `detailPanel` prop)이지만 활성 등록자는 하나다([ADR-0047](adr/0047-detail-panel-slot-single-registrant-model.md)). 등록 primitive는 `@ap/ui`에 있으며 DetailDrawer는 AppShell(또는 같은 슬롯 Provider·host) 아래에서 사용한다.
- 오른쪽 자리는 한 번에 하나다. 상세와 VOC 등록 패널(§8)은 서로 바꿔 열린다. 바꿔 열어도 등록 초안과 상세 선택(`focus`)은 남고, 돌아오면 다시 보인다. 상세에 저장하지 않은 편집이 있을 때의 처리는 #594 구현에서 정한다([ADR-0070](adr/0070-global-features-platform-menu-and-voc-drawer.md)). 상세가 **새로 보이게 되면**(새 등록자, 닫힘→열림; 열려 있는 상세의 재렌더·닫힘·해제·복귀는 아니다. 호스트 hook의 `activation`) 그 상세가 오른쪽 자리를 가져가고 열려 있던 VOC 패널은 초안을 둔 채 숨는다. 레일 버튼이 다시 패널을 보이고 상세를 숨긴다.

결정과 비교 선택지는 [ADR-0013](adr/0013-detail-panel-shell-docked-slot.md), 배치는 [07](07_app_shell_wireframe.md), 시각 규칙은 [DESIGN](../DESIGN.md#shell-visual-rules)을 따른다.

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
- Export entry — 표 소유 내보내기(#173): `PlatformDataTable`이 `exportRows`·`exportNote` 계약으로 직렬화·파일·토스트까지 소유한다([ADR-0008](adr/0008-table-owned-export-fixed-toolbar.md)). 선택 행 복사(#174)도 같은 게이트·직렬화를 쓰는 내보내기다. 아래 "표 내보내기·복사 구현 계약"

Baseline (Decided — `DESIGN.md` `table-density` 토큰과 일치):

```text
Row height       32px (최소, 데스크톱 기본)
Header height    32px (최소)
Cell padding     4px 12px
```

행 높이는 줄바꿈·포커스·24px 최소 타겟에 따라 32px보다 늘어날 수 있으며, coarse-pointer(터치) 행은 44px 타겟까지 커진다. 동작 열 버튼은 `toolbar`(32px) 크기라 동작 열 셀은 위아래 여백이 없고 행은 32px에 머문다.

표 높이·열 규칙([ADR-0037](adr/0037-table-filter-consistency.md)): 행 영역은 내용 높이만큼이고 최대 `max(240px, R)`까지만 커진다(R = 스크롤 컨테이너 가시 높이 − 고정 머리 − 표 위쪽 내용 − 표 아래 쪽 넘김·형제 내용·본문 아래 여백, 맨 위로 스크롤한 상태 기준). 명시한 `height`는 분석 표의 상한이다. 선택 열은 선택을 읽는 기능(내보내기·복사, `bulkActions`)이 있는 표에만 있다. `rowAction`이 있으면 동작 열은 오른쪽에 고정하고(불투명 배경·왼쪽 경계선), 스크롤 영역이 사용자 왼쪽 고정 열 + 동작 열(128px) + 120px보다 좁아도 사용자 왼쪽 고정 열 + 72px + 120px 이상이면 동작 열은 72px 아이콘 전용 compact 형태로 계속 고정한다(`rowAction(row, { compact })`; 모든 동작은 같은 접근 가능한 이름의 아이콘 버튼·링크이고 툴팁이 가린 글자를 hover와 키보드 포커스에서 보인다, 공통 부품 `RowAction` — 같은 요소를 두 형태로 그려 compact ↔ 일반 전환에도 DOM 노드와 포커스가 유지된다). 그보다 좁으면 고정하지 않고 일반(글자) 형태로 스크롤에 섞인다. 동작 열은 사용자가 고정할 수 없고 저장되지 않는다. 행 영역은 기본으로 휠을 가둔다(`overscroll-contain`, 흐름 페이지·서랍). 작업 영역 패널이나 보드 칸 안에서는 본문도 스크롤하므로 행 영역 끝에서 휠이 바깥 컨테이너로 이어진다(`overscroll-auto`, #700).

숫자는 오른쪽 정렬하고 `tabular-nums`를 사용한다.

대규모 데이터에서는 브라우저에 전체 데이터를 전달하지 않는다. 서버가 선언 행 상한(`limits.maxRows`)으로 판정한다 — [실서버 연결 체크리스트](integration/real-server-checklist.md) §3(#175).

표 URL 상태: 페이지 키 `page`는 1부터이며 생략=1, 정렬 키는 `<열 id>:asc|desc` 한 개다. 허용 열·키 이름은 페이지가 소유하고, 형식 오류는 보정하지 않고 거부한다(§6.4). 성공 응답(`ok`·`empty`)이 범위 밖 페이지이면 표가 마지막 페이지로 맞추고 페이지는 URL `page`를 replace로 고친다(0건이면 첫 페이지, 실패 응답은 맞추지 않음 — §19). 결정: 사용자, 2026-10-15, #314.

### 표 내보내기·복사 구현 계약

툴바 순서·메뉴 항목·거절 문구·시트 구성·파일 이름·복사 라벨·단축키 조건은 `PlatformDataTable` 테스트(`PlatformDataTable.test.tsx`·`PlatformDataTable.copy.test.tsx`·`PlatformDataTable.export-abort.test.tsx`·`tableExport.test.ts`)가 원본이다. 테스트가 고정하지 않는 다음 규칙을 함께 지킨다.

- 진행 안내용 sr-only `role="status"` 영역은 **항상 마운트해 두고 글자만 바꾼다**(채워진 채 나타나는 영역은 스크린리더가 읽지 않는다). 복사 안내와 내보내기 안내는 따로 두고, 한쪽이 끝나도 다른 쪽을 지우지 않는다.
- 내보내기 메뉴 항목은 그림자 없는 메뉴 전용 모양 + inset 초점 링을 쓴다. 공유 Radix primitive는 바꾸지 않는다. 복사 중에는 `aria-busy`와 함께 스피너를 보인다.
- 클립보드 경로는 오류 폴백이 아니라 **기능 감지**(`isSecureContext && navigator.clipboard.write && ClipboardItem`)로 고른다. 보안 컨텍스트는 클릭·keydown 안에서 `clipboard.write([ClipboardItem({ text/plain, text/html: Promise<Blob> })])`를 부르고 내용은 `exportRows`가 끝난 뒤 채운다(여러 페이지 선택도 전부 복사). Promise 값 `ClipboardItem`을 동기적으로 거부하는 브라우저는 비보안 경로(현재 페이지에 불러온 선택 행만)로 내려가며, 버튼과 단축키가 같은 경로를 쓴다.
- 비보안 경로는 클릭·keydown 안에서 document 수준 일회성 capture `copy` 리스너(text/plain·text/html 설정 + `preventDefault`)를 걸고 `execCommand('copy')`를 부르며, `finally`에서 리스너를 반드시 제거한다. 표 `section`에 리스너를 달지 않는다(Chromium은 이 이벤트를 selection 노드나 `<body>`로 보낸다).
- 글자만 복사하는 곳(상세 패널 링크 복사 등)은 `@ap/ui`의 `copyText`를 쓴다. 같은 기능 감지 규칙이다: 보안 컨텍스트는 `writeText`가 resolve해야 성공이고 거절은 실패로 알린다(폴백 없음). 비보안 컨텍스트는 위 capture `copy` 리스너 + `execCommand('copy')`이고, 리스너가 실제로 글자를 채워야 성공이다(#673).

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

페이지 필터 행과 입력 primitive는 `PageFilterBar`가 공통화하고 초안 값·변경 수는 `useFilterDraft`가, 적용의 `page: null`과 초기화 배선은 `useManagementFilters`가 맡지만, 메뉴는 필터 의미·URL page key·초기화 키 목록·적용 patch 구성(검증 포함)을 소유한다. 이 경계는 표 툴바의 컬럼·복사·내보내기 동작을 바꾸지 않는다(ADR-0016).

---

## 16. Analysis Chart Contract

Primary candidate는 `04_frontend_ui_ux.md`에 따라 Apache ECharts다.

플랫폼은 Chart의 비즈니스 정의가 아니라 **Chart Frame과 Interaction Contract**를 소유한다.

`AnalysisChartFrame`의 그림 위에서 수정키 없는 휠은 가장 가까운 스크롤 컨테이너를 그대로 스크롤하고(프레임이 막지 않는다), Shift+휠이 확대이며 키보드·포인터 대안은 툴바 `확대` 버튼이다(#700).

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

### 메뉴가 조립하는 차트 조각 (Decided, #541·#580 S4)

`AnalysisChartFrame`의 선택 API는 메뉴가 의미를 정하고 프레임은 지점·행·시리즈 표시만 제공한다([ADR-0063](adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md)). 기본 소비자는 새 prop 없이 기존 동작을 유지한다.

- `pointActivation?: { on: 'click' | 'dblclick'; onActivate(point) }`, `pointActions?: readonly { id; label; onSelect(point); disabled? }[]`의 `point: ChartPoint`는 `{ x: string; seriesId: string; value: number | null }`이다. 시간 x는 원래 wall-clock 문자열, 범주는 소비자 문자열 그대로다. 프레임은 단계·목적지를 알지 못하며 URL·Global Context를 쓰지 않는다. 메뉴가 콜백에서 `useDrill` 등 자신의 이동을 실행한다.
- 클릭은 지점을 선택한다. `dblclick` 활성화를 선택한 경우 클릭은 선택만 하고 `onPointClick`을 실행하지 않으며, 네이티브 더블클릭은 활성화 콜백만 실행한다. OS·브라우저마다 다른 더블클릭 판정 시간을 타이머로 추정하지 않는다. 이 선택이 없으면 기존 `onPointClick(x, seriesId)`는 즉시 실행한다.
- 선택기는 보이는 시리즈의 지점을 키보드로 고르고 `선택 지점 실행`으로 같은 활성화를 실행한다. `지점 동작`은 선택 지점의 메뉴를 열며 오른쪽 클릭은 해당 지점을 선택한 뒤 같은 메뉴를 연다. 포커스된 차트에서 Shift+F10·ContextMenu 키도 같은 메뉴를 연다. 선택 전에는 첫 지점을 기본으로 사용한다. 메뉴를 이동 없이 닫으면 실제로 연 차트 또는 툴바 버튼으로 포커스가 돌아가며, 동작이 이동을 실행하면 목적지 포커스를 유지한다. Brush 모드에서는 지점 선택·실행·동작 메뉴를 끄고 이유를 표시한다. 경로 바의 이전 단계 칩·가운데 단계 메뉴·전체 버튼은 차트 없이도 키보드로 이동할 수 있다(§12.7).
- `orientation?: 'vertical' | 'horizontal'`은 기본 vertical이다. horizontal은 `xType='category'`에서만 적용하며(time에서는 무시), 범주를 입력 순서대로 위→아래 행, 값을 가로축, 시리즈를 막대로 그린다. 라벨은 소비자가 준 문자열 그대로이고 그룹·계층을 추론하지 않는다. 범주축은 첫 입력 시리즈의 서로 다른 범주를 첫 등장 순서대로 사용하며, 각 시리즈의 중복 범주 값은 첫 값을 쓴다. 축에 없는 범주는 지점 선택기·콜백·표·내보내기에서도 제외하며 누락 값은 null이다. `stacked`는 한 행에 여러 시리즈의 세그먼트를 쌓는다. Zoom·Brush는 세로 범주축을 대상으로 하며 선택 요약·주석·표·내보내기·Trust는 같은 데이터를 사용한다.
- `visibleSeriesIds?: readonly string[]`이 있으면 현재·비교 시리즈의 표시는 이 prop만 따른다. 범례는 `onVisibleSeriesChange?(ids: string[])`로 다음 표시 집합을 요청하고 자체 표시를 바꾸지 않는다. 없으면 기존 로컬 표시 상태를 쓰며 콜백은 변경을 알린다. Reset은 현재 범례의 모든 ID를 요청하고, controlled 소비자는 수락 여부를 정한다. 모든 시리즈를 끈 상태는 `표시할 시리즈를 모두 껐습니다`로 표시하며 데이터 없음으로 취급하지 않는다.

### 종류별 상호작용

`AnalysisChart`의 `ChartSpec`은 종류와 입력 데이터의 유효 조합을 고정한다([ADR-0058](adr/0058-analysis-chart-spec-union.md)). 기존 line/bar `AnalysisChartFrame` 소비자는 그대로 유지한다.

| 종류 | Zoom | Brush·선택 | Reset | Compare | Annotate | Export | Drill | 표로 보기 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| heatmap | — | 클릭·사각 끌기·표 체크박스로 셀 다중 선택 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 같은 셀 데이터·선택·상세 |
| donut | — | 클릭·표 체크박스로 한 항목 선택, 재클릭 해제 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 같은 구성비 데이터·선택·상세 |
| scatter | — | 클릭·사각 끌기·표 체크박스로 점 다중 선택 | 선택·끌기 영역 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | ID·그룹·양축 값과 단위·미확인·선택·상세 |
| boxPlot | — | 박스·중앙값·이상치 클릭·표 체크박스로 한 그룹 선택, 재클릭 해제 | 선택 해제 | — | — | manifest `features.export` | 단일 선택 요약·표 행의 상세 버튼 | 그룹·다섯 통계·n·이상치·미확인·선택·상세 |
| pareto | — | 막대 클릭·표 체크박스로 항목 다중 선택, 누적선은 선택하지 않음 | 선택 해제 | — | — | manifest `features.export` | 단일 실제 항목 선택 요약·표 행의 상세 버튼, 기타는 없음 | 표시 순서의 값·누적 %·기타·선택·상세 |
| topNBar | — | 막대 클릭·표 체크박스로 항목 다중 선택 | 선택 해제 | — | — | manifest `features.export` | 요약·표 행의 명시적 상세 버튼 | 표시 TopN과 같은 순서·값·선택·상세 |
| LaneTimeline (별도 API) | Ctrl/⌘+wheel·버튼·키보드 확대, drag 이동 | 클릭·방향키/Enter 단일 선택, Escape 해제 | 시간 viewport 초기화 | — | — | — | — | 방향키/Home/End 탐색·DOM 텍스트 요약 |

선택은 URL·Global Context를 바꾸지 않는 Chart Local State다. Global Context 변경 시 선택을 지우고 spec 변경 시 사라진 키를 버린다. 캔버스 클릭은 드릴하지 않는다. 표의 체크박스와 상세 버튼이 키보드 경로이며, 선택은 체크 상태와 요약 글로도 표시한다. 합성 항목(기타·미분류)은 소비자 ID가 없으므로 상세 버튼이 없다. 눈에 보이는 데이터 요약을 차트 section의 `aria-describedby`로 연결하며, 표와 CSV는 같은 데이터 투영을 쓴다. 히트맵의 누락 좌표는 빈 자리로, null은 미확인 표식으로, 0은 값으로 구분한다. threshold 색은 승인된 실제 판정에만 쓰고 범례에 세 판정명을 함께 적는다.

scatter의 null 좌표는 표에 미확인으로 남기고 플롯에서는 제외한다. 그룹은 색과 기호로 함께 구분한다. boxPlot은 원자료 대신 호출자가 계산한 통계를 받으며 min/max는 그릴 수염 끝점이다(Tukey 모드도 실제 inlier 끝점을 호출자가 계산). 유효하지 않은 통계와 미제공 n은 미확인이다. Pareto는 유효한 원본 항목을 값 내림차순으로 안정 정렬하고 표시 한도(기본 10, 최소 2)에 기타를 포함한다. 기타는 항상 마지막이며 누적률은 유효한 원본 합계를 분모로 표시 순서를 따른다. 목표 도달 요약은 정렬한 원본 항목 수를 센다(목표 기본 0.8, 유효 범위 (0,1]). 합계 0이면 도달을 주장하지 않는다.

### TopN·Lane 시간선 (Decided, #576)

[ADR-0064](adr/0064-topn-bar-and-lane-timeline.md)의 `topNBar`는 소비자가 집계한 전체 항목을 받아 안정 내림차순·기본 상위 8개를 표시한다. 음수·비유한 값·잘못된 색·중복 ID는 제외(첫 유효 항목), 잘못된 N은 8로 복구하며 개발 진단을 남긴다. 0은 데이터다. 표시 토큰에 해당하는 소비자 범례만 토큰당 한 번 표시한다. 기본 접힘, controlled/uncontrolled 펼침, `hideWhenEmpty`(기본 false)를 제공한다. 명시 height가 없으면 플롯은 `max(120, 표시 수 × 28 + 24)`px이며 긴 라벨 전문은 툴팁·표로 확인한다. 막대 두께는 최대 24px로 제한한다. Pareto의 기타·누적률을 만들지 않는다.

누적/계열 차트의 범주 행에서 드릴이 가능한 가로 막대는 `AnalysisChartFrame orientation="horizontal"`을 써 최대 두께 18px과 잘리지 않는 전체 폭 라벨을 유지하고, 단일 측정값 순위에 상위 N 자르기·접기가 필요하면 `topNBar`를 써 112px 라벨 말줄임과 최대 두께 24px을 적용한다.

`LaneTimeline`은 `AnalysisChart` union 밖의 직접 Canvas 2D 시간선이다. §6의 시간대 없는 설비 wall-clock을 UTC getter 기반 epoch ms로 인코딩해 받고, 사용자 표시는 시간대 없이 한다. depth/rank·색 토큰·의미적 orphan/open 경계도 소비자가 제공한다. 112px gutter·24px 행·depth당 2px inset(최소 높이 2px)·최소 구간 폭 1.5px, 최소 전체 폭 352px 아래에서는 가로 스크롤한다. 축은 세로 스크롤 밖에 고정하고 backing canvas와 hit-test는 가시 행만 대상으로 한다. 가장 깊은 구간, 동률은 나중 입력이 우선한다. rank strong/weak/off는 원래 두께/절반 두께·alpha·점선/숨김이며 선택 강조는 독립이다. orphan은 꺾쇠, open은 점선 끝과 텍스트로 표현하며 viewport clip으로 만들거나 지우지 않는다.

확대·이동·scroll은 refs와 dirty rAF만 갱신하고 React render를 추가하지 않는다. modifier 없는 wheel은 네이티브 세로 스크롤이다. 확대는 포인터/키보드 중심을 기준으로 데이터 domain 내 최소 1ms부터 전체 폭까지다. `resetZoom`은 시간 범위만 복원하며 `reveal(index)`·`revealById(id)`는 유효 입력의 flatten 순서로 행·시간을 드러낸다. density는 데이터 변경 때 복사·정렬하고 viewport bin 이진 검색을 사용한다. 시간축 눈금은 UTC getter 기준 분·시·일 달력 간격을 쓰고 시간대 없이 시:분을 표시하며, 날짜는 첫 눈금과 wall-clock 날짜 경계(00:00)에 한 번 표시한다(`formatTick` 재정의 우선). ResizeObserver·DPR·테마 변경 redraw와 모든 구독/raf cleanup을 소유한다. DOM 툴팁과 키보드 요약은 시간·depth·rank·경계 의미를 글로도 제공한다. 잘못된 시간/역전/중복 ID는 제외, 잘못된 depth는 0, 빈/무효 palette는 기본 색으로 복구한다. 선택·viewport는 로컬이며 URL·Global Context를 쓰지 않는다. 공개 타입·사용 예는 [SDK 차트](integration/sdk-charts.md).

### 상태 분리

- Global Context
- Page Filter
- Chart Local State
- Persistent Annotation

차트마다 이 상태를 섞어 구현하지 않는다.

### Persistent Annotation과 선택 기능 (Decided, #103)

- **주석은 서버 소유이고 `(chartId, scopeId)`로 키한다.** Chart Frame은 `adapter.listAnnotations({ chartId, scopeId })`·`saveAnnotation({ chartId, scopeId, from, to, text })`로만 읽고 쓴다(모듈 전역 저장소·`chartId`만으로 행을 고르는 조회 금지). 서버는 요청 시점의 세션으로 권한(`analytics:view`)과 Site 경계(§6.2, ADR-0004)를 판정하고, 작성자·시각은 서버가 찍는다(입력에 두 필드가 없다). Scope가 없으면(`null`) 읽지도 쓰지도 않는다 — `null`은 "전체 사이트"가 아니다.
- **삭제는 작성자만 한다(Decided, #399, [ADR-0041](adr/0041-annotation-author-delete-audit.md)).** `adapter.deleteAnnotation({ chartId, scopeId, id })`는 목록·저장과 같은 관문을 지난 뒤 `(chartId, scopeId)` 안에서만 id를 찾는다 — 없으면 `empty`, 남이 쓴 주석이면 `forbidden`이고 다른 사이트·작성자의 행은 드러내지 않는다. 화면은 서버가 계산해 목록·저장 응답에 싣는 `mine`(작성자 id는 내보내지 않는다)이 true인 주석에만 "삭제: <문구>" 버튼을 그리고, 서버는 삭제 때 작성자를 다시 확인한다. 인라인 확인 한 단계(`window.confirm` 없음) 뒤 삭제하고 다시 조회하며, 실패하면 주석을 그대로 두고 고정 문구로 알린다. 성공한 삭제는 감사 행(`action: delete`, 대상 유형 `annotation`, 문구는 `reason`)을 남기고 콘솔 감사 화면에서 읽는다.
- **겹치는 범위의 주석 라벨은 줄을 나눠 그리고 영역 폭으로 줄여 그린다.** 같은 범위를 덮는 주석은 겹친 순서대로 한 줄씩 아래로 내려 서로 덮지 않고, 긴 문구는 영역 폭에서 말줄임표로 줄인다. 전문은 차트 아래 목록에 있다.
- **Scope는 조회 식별자에 들어간다.** 사이트를 바꾸면 이전 사이트의 주석은 즉시 숨겨지고 새 사이트의 주석을 읽는다. 저장이 거부·실패하면 입력 문구를 유지하고 행을 추가하지 않는다. 늦게 끝난 저장은 그 사이 취소·재열기·Scope 변경으로 바뀐 새 입력을 지우지 않는다. 주석 조회가 실패하면(error·timeout·forbidden) "없음"처럼 보이지 않고 차트는 그대로 둔 채 로컬 실패 문구와 다시 시도를 보인다(§19).
- **Compare·Annotate·Export는 현재 메뉴 manifest의 `features`(§5)를 따른다.** 선언하지 않은 메뉴의 차트는 그 버튼을 그리지 않고, Annotate가 꺼져 있으면 주석을 조회하지도 않는다. 라우트가 없는 곳에 놓인 차트는 세 기능 모두 제공하지 않는다. Zoom·Brush·Reset은 manifest와 무관한 Chart Local State다.
- Brush로 잡은 구간은 URL·전역 기간을 바꾸지 않는다. "분석 구간 적용…"의 확인을 거쳐야만 전역 기간이 바뀐다.
- **시간축 구간은 막대 경계로 바깥쪽에 맞춘 뒤, 비교 중이면 현재 조회 기간으로 자른다(맞춤 → 자르기).** 경계는 현재 기간 시리즈의 x(막대 시작, 정렬·중복 제거)와 조회 상한 `global.to`다. `global.from`이 첫 막대보다 앞이면 시작 경계에 넣는다. 현재 기간 시리즈 전체의 x를 쓰고, 줌·범례 숨김으로 경계 목록을 바꾸지 않는다. 이전 기간(Compare) 시리즈의 x는 제외한다. 요약은 `from <= x < to`라서 "전체"와 마지막 막대의 끝은 `global.to`여야 그 막대가 빠지지 않는다. 범주축은 가장 가까운 범주 그대로다. 조회 끝이 없으면 초 단위로만 맞추고 막대 간격을 지어내지 않으며, 아래 키보드 경로도 그리지 않는다. 잘린 부분이 있으면 선택 요약에 한 줄로 알리고, 고른 구간이 모두 현재 기간 밖이면 선택하지 않고 이유를 알린다. 비교를 켜면 이미 있는 선택과 열린 "분석 구간 적용…" 확인도 같은 순서로 다시 맞춘다. ([ADR-0036](adr/0036-chart-range-keyboard-snap-compare-clip.md))
- **키보드로도 같은 선택을 만든다.** 선택 요약의 시작·끝과 [선택], 구간 선택 옆의 `1시간`·`4시간`·`전체`(데이터 범위가 그 길이보다 짧거나, 맞춘 결과가 그 길이보다 넓으면 숨김)가 끌기와 같은 맞춤 함수를 쓴다. 끌기는 보조 경로로 남는다. 어느 경로도 URL·전역 기간을 바꾸지 않는다. 단 `size="fill"`은 시작·끝 입력과 빈 선택 안내를 `구간 선택`이 켜져 있거나 선택 구간이 있을 때만 그려 그림이 공간을 쓴다(ADR-0067 결정 21). 키보드로 `구간 선택`을 켜면 포커스가 시작 필드로 간다. 주석 목록·오류·적용 확인 행은 그대로이고 다른 크기는 항상 그린다.

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

원천이 확인한 문제가 없을 때 한 줄로 압축할 수 있다(`clear`는 '건강' 선언이 아니다, §19).

```text
● 확인된 이슈 없음 · Coverage 98.7% · Updated 10:32
```

상세는 Popover로 확장한다.

숫자를 보이지 않는 절(예: 지표 상세의 정의)에는 Data Trust를 그리지 않는다. 응답 봉투의 trust는 그 조회의 신뢰이지 절이 말하는 대상(버전의 게시·초안·폐기 상태)의 신뢰가 아니다(사용자 결정 2026-10-13, #299).

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
Idle (not yet queried / required conditions missing)
Loading
Refreshing same context
No matching result
Not collected
Processing delayed
Insufficient coverage
Permission restricted
Query too large
Query timed out
Partial widget failure
Server error
Unknown
```

### 규칙

- QueryState는 idle/loading/refreshing/done과 response, missing, completedAt(number|null), refetch를 제공한다. Apply 게이트의 idle은 중립적인 “아직 조회하지 않았습니다”와 번역된 누락 사유 목록이며 skeleton·empty·오류가 아니다. 이전 결과·시각을 즉시 가리고 진행 요청을 취소하며 늦은 응답을 버린다. refetch·refreshEpoch도 닫힌 게이트를 열지 않는다. 기존 enabled=false·Scope 검증·live 의미는 유지한다.
- completedAt은 현재 identity에 수락한 모든 종결 응답(오류·timeout·클라이언트 합성 오류 포함)의 클라이언트 epoch ms이며 trust.updatedAt(원천 갱신 시각)과 다르다. 동일 identity refresh는 이전 결과·시각을 유지하고 완료 때 갱신한다. identity 교체·idle에서는 둘 다 null이고 취소·stale 응답은 시각을 찍지 않는다. 초안 편집만으로 적용 결과·시각을 무효화하지 않는다.
- `Not collected`, `Processing delayed`, `Insufficient coverage` 등 원인을 주장하는 상태는 Backend/status source가 현재 요청 Context에 대해 그 원인을 확인한 경우에만 표시한다. 상태 원천과 관측 기준시각을 연결할 수 있어야 하며, UI가 행 수만으로 원인을 추론하지 않는다.
- 성공한 조회가 0건이라는 사실만 확인되면 `No matching result`를 표시한다. 원인/가용성 상태를 확인할 수 없으면 `Unknown`으로 표시한다. **0건 ≠ 수집 중단·미수집·파서 지연**이다. 권한 제한 역시 서버가 확인한 경우에만 그 사유를 표시한다.
- 상태 원천이 아직 없거나 원천 조회에 실패했다면 원인을 단정하지 않는다. taxonomy의 존재가 해당 상태 판정 기능의 구현을 뜻하지 않는다.

**사용자 문구 (Decided, 사용자 2026-10-15, #304, [ADR-0034](adr/0034-user-facing-copy-no-contract-vocabulary.md)):** 사용자에게 보이는 문구에는 계약 상태어(Candidate·Open·Deferred), 상태 enum 원문(`unknown`·`source_unavailable`·`clear`·`unsupported`·`apply`), 수식 표기(`[from, to)`, 초 정렬), 계약 문장(세션값을 자동 적용하지 않는다, 다른 Scope로 조용히 대체하지 않는다)을 쓰지 않는다. 이미 있는 번역 라벨(참조만, 이 화면에서 미사용)을 쓴다. 서버 `message`는 본문에 넣지 않고 Correlation ID 옆 세부(접근 가능한 이름)로만 보인다. 본문은 계약 오류 코드별 원인과 행동이며, 매핑되지 않는 코드는 일반 오류 문구다. 이 문단은 문구 원칙이고 §19 상태 분류와 `outcome` 분기는 바꾸지 않는다.

### 공유 위젯 응답 (Decided, 사용자 2026-10-04, #55 B안)

- 페이지에서 `outcome ∈ {error, timeout, empty}`·`message`·확정된 empty 설명(`explainsEmpty && state === confirmed`)의 근거 전체가 같은 위젯이 두 개 이상이면 한 그룹으로 묶는다. 평가 순서는 무관하며 원천·관측시각·설명이 다르면 묶지 않는다. `forbidden`, `too_large`, `ok`, 알 수 없는 상태는 묶지 않는다. 같은 응답에서 수집·상위 시스템 원인을 추론하지 않는다.
- 각 그룹은 본문 상단에 Callout 배너 하나를 표시한다: 의미 아이콘·§19 상태 제목·“위젯 N개에서 같은 응답(서버 오류)이 확인되었습니다” 형태의 한/영 요약·그룹의 모든 조회를 다시 실행하는 재시도 하나. 배너에는 Correlation ID를 표시하지 않는다. 여러 그룹이 있으면 모두 표시하며 큰 그룹이 먼저다.
- 그룹 위젯은 이름을 유지하는 중립 간결 상태로 표시한다. 제목·아이콘에만 의미 톤을 적용하고 본문(시간 초과 조언 포함)을 직접 노출한다. 개별 재시도와 Correlation ID는 위젯에 남긴다. 좁은 카드에서는 본문을 독립 행에 놓고 동작·ID는 다음 행에서 줄바꿈한다. Consumer가 같은 제목을 바로 위에 보여주면 중복 visible 제목은 생략하고 등록·접근 이름은 유지한다.
- **얇은 띠 (fill 페이지, Decided, 사용자 2026-10-23, #680, [ADR-0075](adr/0075-page-head-one-line-fold-thin-outcome-strip.md)):** `layout="fill"` 페이지의 배너는 한 줄 띠다 — 아이콘, 짧은 상태 접두(`서버 오류 ·`), 요약 문장(줄이면 `title`로 전체), `자세히`(Popover만: 클릭·Enter·Space — 상태 제목과 전체 요약을 보이고, Popover의 접근 이름은 그 상태 제목이다), `다시 시도`. 같은 `data-outcome-banner`·`role=group`·이름·live 안내·danger/neutral 톤·그룹당 하나(큰 그룹 먼저)·재시도 busy·중복 활성화 방지·포커스 복귀 규칙이다. 띠가 사라질 때 `자세히`가 열려 있으면 먼저 닫고 포커스가 그 띠 자신의 Popover 안에 있을 때만(다른 그룹의 Popover는 아니다) 아래 복귀 대상으로 간다. 요약 문장을 줄이고 `title`로 전체를 주는 것은 띠에서만 허용하고 전체 배너는 문장을 그대로 둔다. flow 페이지와 `DetailDrawer`는 전체 배너를 쓴다.
- error/timeout 배너는 danger, empty 배너는 neutral이며 보이는 배너는 non-live `role=group`이다. scope는 처음부터 빈 assertive/polite live region을 유지하고, danger 요약은 assertive 채널, neutral 요약은 polite 채널의 문구를 갱신해 한 번 안내한다. 보이는 배너와 위젯은 별도 live 채널을 만들지 않는다. 그룹 위젯은 live region 없는 이름 있는 group으로 두어 같은 응답을 반복 announce하지 않는다(§26). 한 위젯만 실패하면 배너 없이 기존 전체 StateMessage를 유지한다.
- 그룹 재시도 중에는 배너 버튼이 busy 상태를 표시하며 중복 활성화를 막고 폭·포커스를 유지한다. 그룹별 갱신 문구는 기존 알림 채널 한 곳에서 안내한다. 각 위젯의 `aria-busy`는 유지하되 반복 `role=status` 갱신 label은 표시하지 않는다. 배너가 사라질 때 포커스가 그 안에 있으면 이름 있는 상세 패널(dialog) 또는 `main` 랜드마크(셸 밖에서는 페이지 본문 요소)로 이동하며 다른 곳으로 이동한 포커스는 빼앗지 않는다. 페이지 본문 주위에 랜드마크를 더하지 않는다.
- 그룹에 속한 empty 위젯에는 개별 retry와 Correlation ID를 추가한다(확정된 사용자 결정). 한 개뿐인 empty 위젯은 기존 표시·emptyAction을 그대로 유지하며 retry·ID를 추가하지 않는다.
- DetailDrawer는 페이지와 독립된 scope 및 상세 상단 배너를 제공하며 두 표면의 위젯을 함께 묶지 않는다. 위젯 이름이 없으면 visible 이름·접근 이름을 발명하지 않는다. 보이는 이름은 non-heading label과 aria-labelledby로 연결하고 이름을 숨길 때만 aria-label을 사용한다.
- `PlatformPage`가 페이지별 scope와 배너 위치를 제공하고 `QueryView`가 현재 응답·refetch·선택적 위젯 이름을 가장 가까운 scope에 등록한다. scope 밖의 QueryView는 기존 동작을 유지한다. 등록 갱신·그룹 판정 방식과 결정 배경은 [ADR-0017](adr/0017-shared-outcome-banner.md)을 따른다.

### 가공 상태 원천과 트레이스 노출 수준 (Decided, 2026-09-26)

- **원천:** 설비·기간별 가공(수집→변환→파싱→적재→검증) 상태의 `statusSource`는 **적재 워커의 단계별 처리 결과 보고**다. 플랫폼이 적재 결과 행 수로 원인을 추론하지 않는다. 보고 스키마와 파서 저장소 변경은 [01 가공 상태 보고](01_architecture_and_data_contract.md#processing-status-report)를 따른다. 이 원천이 구현되기 전까지 07/08의 수집 상태 위젯 보류 결정은 유지된다.
- **사용자용 가공 상태 조회(분석 공간):** 단계별 상태, 원인 분류(예: 파일 미수신, 형식 오류, 처리 대기), 원천이 제공한 경우의 예상 해소 시점, 현재 Context를 담은 "VOC로 문의" 동작을 보여준다. 원시 오류 메시지·스택·단계 로그·재처리 동작은 노출하지 않는다.
- **개발자용 트레이스(운영 콘솔):** 같은 원천의 원시 오류, 단계별 로그, 재처리 동작까지 보여준다. 원문 로그·설정 파일 drill-through는 [05](05_roadmap_and_open_questions.md#결정-상태)의 defer 결정을 따르며 이 결정으로 열리지 않는다.
- **가공 실패는 별도 상태가 아니다(2026-09-28):** 적재 워커가 실패를 보고해도 사용자 화면은 `Processing delayed` + 원인 분류(예: 원천 형식 오류, 처리 오류)로 보인다. 사용자에게 실패와 대기는 모두 "아직 가공되지 않음"이고 대응 경로(VOC 문의)도 같다. 실패·재시도 구분은 개발자용 트레이스가 보인다. 원인 분류 목록은 [적재 워커 상태 기록 스키마](integration/ingest-status-schema.md) §4(초안)를 따른다.
- 두 화면은 같은 원천을 공유하고 표시 수준만 다르다. 사용자에게 보이는 상태와 내부 처리 상태를 자동으로 동일시하지 않는다(FeedbackOps ADR-0005 원칙과 같음).

### 응답 스키마 형태 (Decided; 필드명·enum 문자열은 Candidate)

위젯/조회 단위 응답은 두 층으로 구성한다.

1. **`outcome`(배타값):** `ok | empty | error | forbidden | too_large | timeout`. `empty`는 성공한 조회의 0건을 뜻하며, 본 조회 자체가 실패했다면 빈 배열 유무와 무관하게 `empty`가 아니라 `error`다. `error`는 나머지 구체 값에 해당하지 않는 잔여 실패다. `too_large`는 선언한 한도(`limits.maxHours`·`maxRows`)를 넘은 조회다 — 판정 기준과 순서는 [실서버 연결 체크리스트](integration/real-server-checklist.md) §3이다(#175).
2. **`assessments[]`(이름 Candidate):** 그 조회 계약이 선언한 **적용 kind**를 빠짐없이 1회씩 담는다. 각 항목은 `state = confirmed | clear | unknown`이다. 플랫폼이 kind **어휘**를 소유하고, 각 조회 계약(공개 스키마/메뉴 선언)이 그 조회에 **적용되는 kind 목록**을 선언한다. 원천이 아직 미구현이라는 이유로 적용 kind를 목록에서 빼지 않는다 — 그 경우 `unknown`으로 응답한다(의미상 해당하지 않는 kind만 목록에서 제외). 적용 목록의 누락·중복·잘못된 상태 조합은 응답 계약 위반이며, 클라이언트는 생략을 `clear`로 보정하지 않는다. **예외(2026-10-01):** 요청이 적용 집합 키에 명시적 공집합(§6)을 실어 원천 조회를 하지 않은 경우, 응답은 `outcome=empty`에 `assessments` 없음·Trust 없음이다(평가할 원천 결과가 없다). 클라이언트는 요청에 명시적 공집합이 있을 때만 이 모양을 계약 위반으로 보지 않는다. 현재 kind 어휘(이름 Candidate)는 `collection`·`processing_delay`·`coverage`·`time_domain`·`respondent_history`이며, 새 kind는 플랫폼 어휘 변경이다(메뉴 단독 추가 불가).

`clear`는 "그 kind가 표현하는 문제가 해당 Context에 없음을 원천이 실제로 확인했다"는 제한적 주장이며 전반적 데이터 건강/완전성 선언이 아니다(가짜 `clear` 금지). `confirmed`/`clear`는 논리적 `statusSource`(원천 서비스 id)와 `observedAt`이 필수다. `unknown`은 생략하지 않으며 `source_unavailable`/`check_failed`(현재 코드 어휘)와 `retention_expired`(원천 보존 기간 밖, 적재 워커 스키마 합의 뒤 추가 — 이름 Candidate) 같은 평가 불가 이유를 명시한다.

`Loading`/`Refreshing same context`는 이 응답 페이로드에 없다(클라이언트 요청 생명주기). `Partial widget failure`는 위젯 결과가 섞일 때 페이지가 종합해 도출한다.

`explainsEmpty`(이름 Candidate)는 `outcome=empty`이고 해당 평가가 `confirmed`이며 원천이 **그 요청 결과의 0건 원인**을 확인한 경우에만 true다(기본 false). UI는 배열 순서·행 수로 인과를 추론하지 않는다. 복수 원인이 확인되면 모두 유지한다. `No matching result`만 보이는 조건은 `outcome=empty`이고 표시할 `explainsEmpty=true` finding이 없을 때다 — 원인 원천이 없다는 것이 `empty`의 필수조건은 아니다.

개별 원천 서비스의 실제 구현·응답 스키마 세부는 Open이며, 이 계약이 그 구현을 뜻하지 않는다.

---

## 20. Detail Surface Contract

### Drawer

셸 고정 상세 슬롯과 상호작용은 §13 DetailDrawer 계약을 따른다.

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

을 공통 처리한다. 구현은 Kernel `resolveLink(menuId, options)`이며(`linkTo`는 그 `href`), 결과는 세 가지다.

- `href`: 전역 Context는 목적지 지원 여부와 무관하게 실어 보낸다(미지원 표시는 목적지 화면 몫). 목적지가 다른 Scope(site)면 이전 site에 묶인 값(room_name·Condition·Selection·Lot·Recipe·PPID)은 비우고 호출자가 명시한 값만 남긴다. page key는 목적지 manifest `pageKeys`에 있는 것만 싣는다.
- `allowed`: 목적지 메뉴 권한과 공간 진입 권한을 링크가 안다. 표시용이며 서버가 다시 검사한다. 호출자는 `false`면 링크 대신 사유를 보인다(임의로 숨기지 않는다).
- `droppedPageKeys`: 목적지가 받지 않아 버려진 page key.

상세에서 분석으로 복귀할 때는 §6.4에 따라 진입 전 Context를 그대로 복원하며, 목적지 ID로 출발 설비 선택을 변경하지 않는다. **CFG의 다른 메뉴와의 Context Link 연계는 Deferred**다. CFG 자체의 시각화·분석 범위와는 구분하며 이번 예시 경로에 CFG hop을 추가하지 않는다.

**복귀 버튼 (Decided, [ADR-0025](adr/0025-drilldown-level-page-keys-path-bar-layout.md); 이름 Candidate):** `returnTo`를 받는 목적지는 공통 `ReturnLink`로 돌아가는 버튼을 그린다. Kernel이 채택한 `returnTo`(§6.4)에서 출발 메뉴 이름과 그 메뉴의 드릴 단계 값을 읽어 `← 생산성 개요 (PHOTO › STG-PHOTO-A)`처럼 보이고, 누르면 출발 URL(단계 키 포함)로 돌아간다. `returnTo`가 없거나, 거부되거나, 현재 사용자가 그 메뉴나 공간을 열 수 없으면 parent 메뉴로 돌아간다. parent도 열 수 없으면 열 수 있는 홈(플랫폼 홈, 없으면 공간 홈)으로 돌아간다. 열 수 없는 출발 메뉴의 이름은 보이지 않는다. 표시용 판정이며 목적지가 다시 검사한다. 메뉴 이름은 manifest `label`이고 단계 값은 URL 값 그대로다(번역하지 않음, §23). 다른 메뉴로 넘길 때 단계 키는 목적지가 그 page key를 선언했을 때만 싣는다(`linkTo`의 기존 규칙).

FeedbackOps로 나가는 외부 hop은 `linkTo`가 아니라 [FeedbackOps 딥링크 계약](integration/feedbackops-deeplink.md)을 따른다(절대 URL · 새 탭 · phase-1 allowlist).

---

## 23. Design Tokens

> 디자인 시스템 원본 소유는 [ADR-0043](adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)(2026-10-19)으로 플랫폼으로 바뀌었다. 코드를 SDK로 옮기기 전까지 이 절의 FeedbackOps 원본·재수출 규칙대로 동작한다.


**한/영 지원 범위(Decided, 2026-09-24):** UI 문구와 정적 본문만 번역한다. VOC·공지의 사용자 입력 본문, EquipmentID·room_name·분임조 이름 등 마스터 값과 식별자는 번역하지 않는다. 언어 설정은 현재 브라우저 localStorage에만 저장한다(§4). 사용자 계정 선호값으로 서버에 보존하는 것은 Candidate이며 저장소/API는 구현 시 확정한다. 언어 변경이 Context 값이나 URL 식별자를 바꾸지 않는다. CJK 폰트는 FeedbackOps ADR-0058의 Inter + Pretendard Variable 소비 계약을 따른다.

### Token value source (Decided — ADR-0011)

공유 색·반경·간격·폰트·본문 값의 원본은 플랫폼이다: [tokens.css](../packages/ui/src/styles/tokens.css)·[semantic.css](../packages/ui/src/styles/semantic.css)·[theme.css](../packages/ui/src/styles/theme.css)·[compat.css](../packages/ui/src/styles/compat.css)는 FeedbackOps `a8d768b8`에서 `@ap/ui`로 옮겼고([ADR-0046](adr/0046-design-system-source-moves-to-platform-whole-package.md), #441) 값은 그대로다. 소비 순서·본문·레이어 없는 webfont 규칙은 [FeedbackOps ADR-0058](../products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md) §2(이전 시점의 설명)를 따른다. FeedbackOps `@fops/ui`는 소비 전환 전까지 FeedbackOps에 그대로 남는 별개의 사본이다. 플랫폼이 별도 값 스케일을 만들지 않는다([ADR-0011](adr/0011-design-direction-feedbackops-shell.md)).

플랫폼 전용 theme 키·차트/카테고리/아이콘 색·`t-*` 역할·반응형/detail-panel 확장과 label/control pairing의 설계 원본은 [DESIGN 플랫폼 확장](../DESIGN.md#platform-extension-layer) 및 [허용 전경/표면](../DESIGN.md#allowed-foregroundsurface-pairs)이다. `packages/ui/src/styles/`는 그 구현을 소유한다(플랫폼 확장 값은 `platform-tokens.css`). 제거된 어두운 navigation 확장은 다시 도입하지 않는다.

### Semantic Colors

Component에서 Tailwind primitive 색을 직접 의미로 사용하지 않는다. 의미 토큰 이름·값은 `packages/ui/src/styles/theme.css`와 [DESIGN](../DESIGN.md#platform-extension-layer) 플랫폼 확장 층이 소유한다.

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

**적용 범위(Decided, 2026-09-22):** "실제 소비자 2–3곳에서 반복될 때 승격"은 메뉴에서 나온 패턴을 공통 컴포넌트로 추출할 때의 기준이다. §4 Platform Kernel 책임(App Shell, Menu Registry, 전역 Context, 딥링크, 권한·Scope, 감사, 메뉴 활용률 계측)은 그 정의상 플랫폼 기능이므로 메뉴 반복을 기다리지 않고 Kernel 준비 순서에 따라 판단한다.

### Decorative Visualization

업무 판단에 기여하지 않는 Gauge, Gradient, 3D Chart를 사용하지 않는다. **경계(Decided, 2026-09-22):** 기본값은 분모가 있는 비율(예: 가동률, 완료율)에 한해 donut만 허용하고, 게이지·스피드미터류(3D/그라디언트 포함)는 기본적으로 쓰지 않는다. 전면·영구 금지는 아니다 — 특정 업무 판단에 실제로 기여한다는 근거가 확인되면 케이스별로 예외를 추가할 수 있다.

---

## 25. Responsive Strategy

이 제품은 Desktop-first다. **MVP는 데스크톱 웹만 지원한다(Decided, 2026-09-27, [05](05_roadmap_and_open_questions.md#mvp-지원-환경--데스크톱-웹만-decided-2026-09-27)).** 아래 `< 1024px` 항목은 MVP 이후 과제다.

### ≥ 1440px

Full experience.

### 1024–1439px

- Sidebar collapse — 구현 현황: 1440px 미만은 기본 접힘(사용자가 저장한 선택이 있으면 그 값).
- Secondary panel Drawer 전환은 Candidate; DetailDrawer는 이 폭에서도 §13 고정 슬롯 유지
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
- 메뉴 사이 이동(링크·팔레트·공간 전환·메뉴 사이 Back/Forward) 뒤 포커스는 새 화면 제목으로 간다. 같은 화면 안 상태 변경은 포커스를 옮기지 않는다. 그 도착(복귀 포함) URL에 `focus=`가 있어 상세 패널이 함께 열려도 패널은 포커스를 가져가지 않는다(§13)
- 같은 화면 안 상태 변경으로 포커스된 컨트롤이 사라질 때: 관리 필터의 `필터 초기화` 버튼이면 같은 컨테이너의 첫 필드로, 상세 패널 안(탭 전환 포함)이면 §13에 따라 선택된 탭(없으면 패널)으로, Scope 게이트 동작 버튼, 표 URL 경고의 `초기화` 버튼, 주소 오류 화면의 `조건 초기화`와 지표 확인 실패의 `이 지표 쌍 지우기`(#389), 관리 화면 필터 키 경고 안의 `필터 초기화`(#389)면 main 랜드마크(셸 밖에서는 페이지 본문 요소)로 간다. 드릴 형식 오류의 `잘못된 단계 지우기`는 드릴 포커스 규칙(현재 단계 칩, 없으면 제목)을 따른다(#389). 홈 즐겨찾기 목록의 `즐겨찾기에서 제거` 버튼이면 다음 행의 제거 버튼(없으면 이전 행의, 그것도 없으면 빈 상태 문단)으로 간다 (#398). 그룹 배너가 사라질 때는 §19를 따른다(상세 패널 안이면 패널, 아니면 main). 어느 경우든 사용자가 이미 옮긴 포커스는 빼앗지 않는다 (#353)
- 차트 주석 삭제 확인 행(§16)은 삭제가 끝나 다시 조회한 뒤 사라진다. 그때 포커스가 아직 그 확인 행에 있을 때만 다음 본인 주석의 삭제 버튼으로, 없으면 차트의 주석 컨트롤(꺼져 있으면 구간 선택)로 옮긴다. 사용자가 이미 다른 곳으로 옮겼으면 빼앗지 않는다 (#399)
- Modal Dialog는 focus trap; 비모달 DetailDrawer는 §13 포커스 진입·복귀와 목록 이동 허용
- Chart title / unit / textual summary 제공
- Chart와 동일 데이터의 Table 접근 경로 제공
- icon-only action에는 accessible label
- 오류 메시지는 원인/행동을 텍스트로 제공
- fill 페이지 머리 접기의 토글 이름·포커스 이동·안내 규칙은 §12.8이 소유한다(#680)
- 작업 영역 높이 방식(§12.8, #686): 라디오 묶음 이름 `높이 방식`(도구줄 `SegmentedRadio`, 호스트 메뉴에서는 보이는 이름표에 `aria-labelledby`)과 옵션 `화면 맞춤`/`아래로 쌓기`(툴팁이 하는 일을 설명), 좁은 폭에서 비활성이면 이유(`좁은 폭에서는 화면 맞춤으로 보입니다`)를 `aria-describedby`로 읽는다. 줄 경계 `role=separator`의 이름(줄 사이·마지막 줄 아래 두 형태)과 px 값은 §12.8 "경계"가 정하고, 그룹 `⋯`의 `아래 새 줄로 옮기기`는 끌지 않고 새 줄을 만드는 키보드 경로이며 아래 띠(`여기에 놓으면 아래에 새 줄`)는 끌기 전용이다
- §19 공유 응답은 배너 하나가 announce하며 그룹 위젯에는 중복 alert/status live region을 두지 않는다
- 선택 상태는 색 + shape/text 병행
- 입력 기준(Decided, 2026-10-12): 사용자는 Windows에서 키보드와 마우스를 함께 쓴다. 키보드 동작·단축키 표기·스크린리더 주장은 Windows 기준으로 설계·검증하고, macOS 확인은 Windows 스크린리더 동작의 증거가 아니다. 위 키보드 하한(Tab·Enter·Space·Escape로 모든 컨트롤 도달·조작, 끌기 같은 포인터 제스처는 끌지 않는 경로 유지)은 그대로다. 예외: 표 열 너비 조절은 마우스 끌기만 둔다([ADR-0024](adr/0024-table-column-controls-drag-width-pin-in-list.md)). `LegendTree`의 행 이동은 APG 트리 방향키를 쓰고, 나머지 조작은 Tab·Enter·Space로 제공한다([ADR-0057](adr/0057-legend-tree-arrow-key-row-navigation.md)). 단축키는 그 사용자의 잦은 일을 빠르게 할 때만 더하고, 기본 경로로 일을 끝낼 수 있으면 키보드 전용 모드·화면 단축키 안내를 따로 만들지 않는다
- 모션은 공유 FeedbackOps 모션 토큰(150/200/300ms, 표준·진입·퇴장 곡선)과 overlay 진입 모션을 그대로 쓰고(overlay는 진입만 — 닫히는 레이어가 남아 있으면 다음 Escape를 가로채므로 닫으면 바로 사라진다, FeedbackOps ADR-0063 개정·#312), `prefers-reduced-motion`에서는 공유 CSS가 지속 시간을 사실상 0으로 줄인다. 플랫폼에서 모션을 덮어쓰지 않는다

---

## 27. Performance UX Baseline

플랫폼의 성능 문제를 Skeleton으로 숨기지 않는다.

UI 계약:

- Query timeout / cancellation
- 장기 Query에는 취소/기간 축소/집계 수준 변경 경로 제공
- Progressive or partial rendering where meaningful
- large table virtualization
- server-side aggregation/downsampling
- stale data 여부 표시
- 동일 Context 재조회는 기존 데이터를 유지하며 `Refreshing` 표시 가능(§11)
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

## 30. Final Design Target

> 새 메뉴가 추가될 때 플랫폼 코드를 계속 고쳐야 한다면 플랫폼 설계가 실패한 것이다.

이 플랫폼은 **작은 Kernel + 명시적 Contract + 검증된 Shared Component + 독립적인 Domain Menu** 구조를 목표로 한다.
