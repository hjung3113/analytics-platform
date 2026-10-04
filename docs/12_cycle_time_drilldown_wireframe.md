# 12. 생산성 분석 — 사이클타임 상세 → 느린 실행 목록 → occurrence 상세

상태: 화면 계약 노트. 구현은 `menus/analytics`의 `cycle-time`·`execution-detail`(합성 데이터)이고 배치·시각은 구현과 [DESIGN](../DESIGN.md)이 기준이다. 전역 결정의 원본은 [06](06_platform_ui_contract.md), 데이터 원본은 [01](01_architecture_and_data_contract.md), 용어는 [CONTEXT](../CONTEXT.md)다. 이 문서는 식별자·왕복 계약, Context 선언, 소유 경계, 남은 결정만 소유한다.

## 1. USER TASK

공정/설비 엔지니어가 [생산성 개요](11_productivity_overview_wireframe.md)에서 들어와 사이클타임 P50/P95와 느린 실행을 확인하고, 특정 occurrence의 공정 타임라인·품질 근거를 검토한 뒤 VOC로 전달하고 같은 occurrence로 돌아온다. 식별자·권한·리니지·차트를 함께 검증하는 대표 경로다.

이 화면의 KPI는 사이클타임 P50/P95 두 개뿐이다. Overview의 네 지표 가족 안에서 이 지표만 상세화하며 가동률·수율·원인 자동 진단·별도 Wafer Journey 화면은 추가하지 않는다. VOC 편집/등록 화면도 범위 밖이다.

## 2. IA / SCREEN INVENTORY

- 사이클타임 상세(`cycle-time`): Full Page · Analysis Workspace. KPI → 추세 → 분포 → 느린 실행 목록(Breakdown Table).
- occurrence 상세(`execution-detail`): Full Page. 느린 실행 목록의 행에서 열며 식별 정보 → 공정 타임라인 → 품질 표시 → 리니지를 보인다.
- VOC 생성/복귀: Cross-menu Context Link. occurrence 상세에서 VOC 메뉴로 나가고, 돌아오는 링크는 `returnTo`로 같은 occurrence와 출발 분석 조건을 복원한다.

| Surface | 선택 및 §20 근거 |
| --- | --- |
| 사이클타임 상세 | Full Page. 조건 설정·차트·실행 비교의 복잡한 Analysis Workspace([06](06_platform_ui_contract.md) §12.2/§20) |
| 느린 실행 목록 | 같은 페이지의 Breakdown Table. 별도 Management 화면/route를 만들지 않음 |
| occurrence 상세 | **Full Page**. 행에서 출발하지만 긴 anchor, 여러 공정 구간과 정확한 시각 표, 품질 원천, 리니지, VOC 직접 복귀를 함께 검토하는 deep-link 상세 작업. Drawer의 좁은 폭보다 전체 폭과 독립 URL이 적합(§20). 새 archetype을 만들지 않고 Analysis Workspace의 상세 surface로 구성 |
| VOC 생성/복귀 | **Cross-menu Context Link**. 생성 액션은 VOC 메뉴의 생성 진입점으로 이동하며 여기서 폼·Modal을 만들지 않음. 단일 확인인 소수초 구간 정렬 확인만 공통 Modal 사용 가능(§20/§22) |

## 3. SCREEN SPECIFICATION

| Surface | 사이클타임 상세 | occurrence 상세 |
| --- | --- | --- |
| Route | `/analytics/cycle-time` | `/analytics/executions/:equipmentId` — 설비 ID만 경로 segment이고 `entityType`·`anchor`는 page key다 |
| page-owned 키 | `granularity`(`hour\|day\|week`, 미지정이면 조회 기간 48시간 이하는 `hour`, 아니면 `day`), `percentile`(`p95\|p50\|all`, 기본 `p95` — 느린 실행 기준), `sort`(`<열>:asc\|desc`, 기본 `cycleMin:desc`), `page`, `bucket`(집계 단위 경계에 정렬된 naive 시각), `bin`(분포 구간 ID 또는 `from..to`). Global Context가 바뀌면 `page`·`bucket`·`bin`을 지운다 | `entityType`, `anchor`, `returnTo` |
| 등록 값 밖의 값 | 다른 값으로 바꾸지 않고 오류로 보인다 | 키가 없거나 `entityType`이 `job`이 아니거나 anchor 형식이 틀리면 조회하지 않고 이유를 보인다(Lot·가까운 시각으로 복원하지 않음) |

### 3.1 Context Capability와 상태 계층

[06](06_platform_ui_contract.md) §6/§6.1/§6.4를 소비한다. 아래는 매니페스트가 선언한 값이다.

| Surface | Time | roomNames | Condition | Selection | Lot | PPID | Recipe | Metric |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 사이클타임 상세 | apply | apply | apply | apply | apply | apply | apply | apply |
| occurrence 상세 | reference | reference | reference | reference | reference | reference | reference | reference |
| VOC 메뉴(`voc`) | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |

두 분석 화면 모두 `requiresScope: true`, `pageType: analysis`다. 사이클타임 상세는 `initializesMetric: true`라 id만 있는 전역 metric 쌍을 게시 버전으로 완성할 수 있다. 전역 metric이 없으면 이 화면의 기본 지표 쌍(Candidate 상수)으로 계산하고, 같은 지표의 전역 쌍이면 그 버전을 적용하며, 다른 지표의 쌍은 보존·미적용 표시한다. VOC 메뉴에는 occurrence page key가 없어 전역 Context만 전달된다.

Scope는 항상 단일 요청·권한 검증 대상이며 사이드바 머리에만 선택기가 있다(06 §7). Site→room_name→StGroup→Equipment 관계, 실무 room_name 권한 기준, 독립 Line 축을 따른다. 상속 세부는 Open이며 Maker→Model→ChamberType→EquipmentID 분류와는 구별한다([ADR-0005](adr/0005-scope-room-name-line-independent.md)).

- **Global**: Scope, Time, roomNames, Equipment Group Condition/고정 Selection, Lot/PPID/Recipe/metric 쌍을 보존한다. 사이클타임 조회는 room_name·Equipment Group을 적용하며 PPID/Recipe도 필터 축으로 받는다. Recipe의 Job 전체/매칭 PRC 구간 조인 범위는 메뉴 정의 Candidate다. occurrence 상세에서는 이 값들을 출발 분석 참조로 보존하고 객체 구간을 자르지 않는다. 동일 지표의 전역/페이지 버전 충돌은 오류다.
- **Page Filter**: 위 표의 page-owned 키다. 이전 문서 후보였던 `cycleTimeVersion`·`slowSelection`·`lotSearch`·`selectedOccurrence`는 등록돼 있지 않다 — 사이클 버전은 전역 metric 쌍이, 느린 실행 기준은 `percentile`이 맡는다. room_name·PPID/Recipe는 해당 메뉴의 정의에 따라 모집단에 적용하고, `percentile`·`bucket`·`bin`은 목록에 적용하며 KPI P95의 모집단을 재귀적으로 줄이지 않는다.
- **Visualization**: zoom, 시간 brush 초안, hover, series visibility. URL 복원 보장 밖이다. P95 꼬리 선택은 시간 구간이 아니라 목록 predicate이므로 전역 from/to로 변환하지 않는다.
- **Annotation**: Selection 영역만 이 문서에서 사용. 영속 주석 객체/범용 편집기를 이번 화면에 만들지 않는다([06] §14).

Overview의 room_name·PPID·Recipe·Equipment Group 두 층은 Global Context로 보존·검증하며 지원 범위에 따라 적용한다(11 §7). 그룹 축은 StGroup / 분임조 / Maker+Model 중 배타적으로 하나이며 Selection은 어떤 축에서도 고정 EquipmentID 목록이다. Overview의 granularity와 다른 지표 버전은 자동 복사하지 않는다. 다른 전역 metric 쌍을 덮어쓰지 않는다.

### 3.2 식별자 / 왕복 Link 계약

[06](06_platform_ui_contract.md) §6.1/§17/§22가 원본. 아래 envelope는 **의미 구분을 설명하는 Candidate**, 새 전역 URL 키나 완성 API가 아니다.

```text
C = analysisContext {
  scopeId: site-a,
  from: 2026-09-17T00:00:00, to: 2026-09-24T00:00:00,
  roomNames: absent, ppid: absent, recipeIds: absent,
  equipmentGroup: absent, selectedEquipmentIds: [EQ-0231], metricId: cycle_time, metricVersion: 4
}
P = sourcePageState {
  granularity: day, percentile: p95, sort: cycleMin:desc,
  bucket: absent, bin: absent, page: absent
}
D = destinationOccurrence {
  equipmentId: EQ-0231, entityType: job,
  anchor: 2026-09-23T08:12:00
}
```

값은 합성 예시다. 분석 grain은 Job으로 확정됐고 구현이 여는 `entityType`은 `job`뿐이다. 원천 entityType 목록과 매핑은 Open이다. Lot ID로 Job을 대체하지 않는다. anchor는 불투명 키로 **전체 정밀도/문자열을 보존**한다. UI 표시를 줄여도 전송·조인은 원본으로 한다. `lotId=LOT-240923-07`은 표시/검색용이지 D의 일부나 대체 키가 아니다. 동일 Lot 검색 결과가 여러 개면 개별 D를 선택한다. anchor 없는 행은 "식별 정보 부족"과 상세/VOC 진입 불가 이유를 표시하며 Lot으로 조인하지 않는다.

| Hop | 목적지 객체 / 전달·복원 |
| --- | --- |
| Overview → 사이클 상세 | C의 두 층/room_name/PPID/Recipe 보존; 사이클 버전은 전역 metric 쌍으로 매핑. 지표별 적용 범위 표시 |
| 차트 → 느린 실행 | 시간 brush는 local. 명시 적용만 C.Time 변경; P95 선택은 P.percentile. 목록은 C의 적용 모집단 ∩ 선택 predicate |
| 목록 행 → occurrence | D는 행에서 취득. C의 selectedEquipmentIds를 D.equipmentId로 교체하지 않음. P는 `returnTo`(출발 URL)로 별도 보존 |
| 개별 chart mark → occurrence | mark가 온전한 D를 가진 경우만 가능. `선택 occurrence: EQ-0231 / job / …` **Page Filter chip 생성** 후 D로 이동(chip은 Candidate, 미구현). 기존 P95/room_name/chip 유지. 집계 P95 점에는 D가 없으므로 단일 occurrence를 추정해 열지 않음 |
| occurrence → VOC 생성 | destination은 VOC 생성 진입점(아직 vocId 없음). relatedOccurrence=D, transferableContext=C, returnTarget={occurrence route, D, C, source route/P}. P는 VOC 검색필터나 전역 Context로 승격하지 않음 |
| VOC 저장 후 / 취소 → occurrence | VOC 객체는 **vocId**로 식별. 관련 분석/복귀 링크는 returnTarget의 D/C를 재검증해 복원; vocId로 occurrence를 추론하지 않음. 생성 성공을 분석 화면이 추정하지 않음 |
| occurrence → 느린 실행 / browser back | 진입 직전 등록된 URL 소유 C/P 그대로 재검증·복원. 상세에서 본 객체나 변경한 조건으로 출발 Context를 덮어쓰지 않음. chip, 정렬, 집계 단위 유지; 로컬 줌/brush 복원 약속 없음. 결과 숫자는 재계산으로 달라질 수 있음 |

복귀는 `returnTo` page key로 한다([06](06_platform_ui_contract.md) §6.4): 출발 화면의 앱 내 상대경로 전체 URL이며, 등록된 비상세 메뉴 경로로 매칭되고 그 메뉴의 `pageKeys`로 파싱될 때만 채택하고 아니면 부모 메뉴로 복귀한다. 임의 외부 return URL을 받아 조립하지 않는다. 복귀 상태 직렬화·크기 제한은 Open; Deferred savedViewToken을 임시 해결책으로 쓰지 않는다. VOC 권한이 분석 권한을 부여하지 않으며 이동·저장·복귀 시 서버가 각각 검증한다. 대상 등록 전 "VOC 연결 준비 중", 권한 거부 시 "VOC 생성 권한 없음"으로 구분한다. 구현의 occurrence 상세는 `VOC 생성(예정)` 링크로 VOC 메뉴(내 VOC)에 전역 Context만 전달한다. VOC 생성은 FeedbackOps 연결(#85/#86) 뒤다.

KPI는 전체 기간 통계, 일별 값은 각 bucket 통계로 서로 단순 평균하지 않는다. P95 tail은 동일 계산 세대에서 C의 적용 모집단 기준이고 동률을 포함하는 `≥` 후보다. P95 정의/동률·미완료 정책은 Open이다. 빈 tail을 데이터 미수집으로 해석하지 않는다. 품질 표시와 Data Trust는 역할이 다르다. 전자는 occurrence에 대한 품질 근거 자리이며 후자는 조회 결과의 신뢰 정보다. `01`은 품질 필드 계약 필요성만 명시하고 `02`에는 특정 품질 필드·타임라인 상세 정의가 없다. 원문에 없는 불량률/결함수/품질점수는 만들지 않는다.

## 4. LAYOUT BOUNDARY

배치는 구현(`menus/analytics/src/pages`)이 기준이다. 셸 구조·치수는 [06 §7](06_platform_ui_contract.md#7-application-shell)/[07](07_app_shell_wireframe.md), 공유 표면·폰트는 FeedbackOps 원본, 수치 alignment·표 밀도·pairing은 [DESIGN](../DESIGN.md#tables)이 소유한다. 차트 데이터 표는 접근성 대체 표현이며 Breakdown Table과 다른 표다.

## 5. CONCEPTUAL COMPONENT MAP

| 영역 | Layer / 책임 |
| --- | --- |
| PageHeader / GlobalContextBar / PermissionGuard / Context Link | Platform/Kernel. Registry·Context·권한·내비게이션 ([06] §4–8/§17/§22) |
| AnalysisChartFrame / PlatformDataTable / DataTrustIndicator / StateFeedback | Platform. 상호작용·프레임·상태·접근성 ([06] §13/§15–19) |
| CycleTimeSummary / CycleTimeTrend / SlowExecutionColumns | Domain. 분위수·모집단·열 의미·row action |
| **OccurrenceProcessTimeline** | **Domain**. 해당 occurrence의 공정 관측 구간과 원천 관계. 설비 속성 유효기간을 그리는 유효구간 이력과 다른 책임이며 재사용하지 않음. `06` §13/§22는 `WaferJourneyTimeline`도 별도 Domain Component로 이미 나열한다 — 그 컴포넌트는 Wafer의 이송 경로/체류를 그리는 것으로 추정되며, 이 컴포넌트는 한 occurrence의 공정 관측 구간만 그린다. 둘이 같은 데이터를 다른 그레인으로 보여주는 관계인지, 완전히 분리된 관계인지는 원문에 명시가 없어 **Open**이다 — 대체·부분집합 관계를 이 문서가 임의로 가정하지 않는다 ([06] §13–14) |
| OccurrenceQualityRegion / OccurrenceIdentity / VOC 관련 실행 바인딩 | Domain. 품질 의미·키 표시·관련 객체 의미. Context 운반 자체는 helper 소유 |

이름은 개념적 Candidate이며 실제 React/API 선언이 아니다. 기존 공통 컴포넌트의 책임을 소비하되 이 한 화면의 타임라인을 Platform으로 승격하지 않는다.

## 6. DATA REQUIREMENTS

- **조회 계약**: API는 소비 계층 view/mart·occurrence_directory 조인 결과를 읽는다. 원천 DB 직접 조회 금지. D의 entityType별 조인과 관계 키를 서버가 검증하고 lotId fallback을 허용하지 않는다. 기간 밖 공정 구간을 단순 global clip으로 잃지 않는 occurrence 조회가 필요하다. 근거: [01](01_architecture_and_data_contract.md) 전체 아키텍처/대응, [06](06_platform_ui_contract.md) §6.1; 전체 상세 구간 표현은 이 문서 Candidate.
- **지표 정의 Open**: cycle-time metricId, Job grain의 시작/끝 이벤트, 기간 귀속(시작/완료), 미완료 제외, 분위수 알고리즘·동률, 단위·null·coverage 분모, bucket 경계가 확정돼야 한다. 구현의 버전·단위·완료 interval은 합성 값이다. 설비별/일별 P95를 평균하지 않으며 downsampling과 지표 계산을 분리한다. 근거: [01](01_architecture_and_data_contract.md) 집계 가능성/대응, [02](02_domain_menus.md) 생산성 분석/지표관리.
- **Context/URL**: C와 P의 등록된 공개 스키마, 무손실 D, Return 계약이 필요하다. 반복 집합 정규화·공집합 표식, 단일값 중복 오류, 미등록 키 비적용, v 디코더, 지표 쌍 원자성은 전역 계약 그대로다. URL 없는 값을 세션으로 보충하지 않는다. Equipment Group Condition은 사용한 축 그대로 보존하며 현재 결과를 재평가할 수 있고, Selection은 명시 ID 목록을 그대로 유지한다. 근거: [06](06_platform_ui_contract.md) §6.1/§6.4, [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md), [11](11_productivity_overview_wireframe.md) §3.1/§7.
- **시간**: naive 초 정렬 `[from,to)`와 원천 anchor 전체 정밀도를 분리한다. Z/offset/한쪽 경계 누락은 오류. 기본 기간 공급과 defaultRangeTo/R 조건은 [06 CTX-TIME](06_platform_ui_contract.md#ctx-time)을 소비하며 최초 Δ는 Open이다. 다중 설비 같은 축 집계는 요청 전체를 덮는 서버 timeDomain assertion 필요; 미확인/불일치면 error로 차단하고 단일 설비/분리 조회 안내. assertion 공급자는 Open이다.
- **타임라인/품질 Open**: 소비 계약의 공정 구간 이름·시작/끝·부모 occurrence 관계·겹침/null 의미·품질 필드와 statusSource가 필요하다. 빈 간격으로 대기나 불량을 추정하지 않는다. `01`/`02`만으로 구체 품질 스키마는 확정할 수 없다. 근거: [01](01_architecture_and_data_contract.md) 대응, [02](02_domain_menus.md) 허용 지표 경계.
- **Data Trust/정합성**: KPI·차트·tail 목록·CSV는 같은 완료 계산 세대/기준시각을 사용한다. occurrence의 별도 조회 세대가 달라졌으면 재계산 차이를 표시한다. Updated/Data through/계산 기준시각을 분리하고 원천 계약/지표 버전을 혼동하지 않는다. coverage 원천이 없으면 Unknown. 근거: [01](01_architecture_and_data_contract.md) mart 재계산 트리거, [06](06_platform_ui_contract.md) §18–19.
- **갱신**: 300s 폴링과 완료 세대 기반 재검증. 열린 occurrence는 완료 결과에 없을 수 있고 지연완료/마스터 소급/재분류/지표 변경으로 숫자가 변한다. R/H 정책(H=1h)과 창 밖 backfill 후보는 데이터 계층 소유; 이 화면에 새 실행 UI를 만들지 않는다. 근거: [01 갱신](01_architecture_and_data_contract.md#refresh-policy)/[지연완료](01_architecture_and_data_contract.md#late-arrival-policy), [02](02_domain_menus.md) 최신성/커버리지.
- **권한/성능**: 모든 조회·선택지·export·drill-through·VOC return은 서버 Scope 재검증. 지정한 무단 ID를 자동 제거하지 않는다. 서버 정렬/필터/페이지네이션·가상화·집계, timeout/cancel/기간 축소 필요. 실제 상한·분할 방식은 Open. 근거: [06](06_platform_ui_contract.md) §6.2/§15/§17/§27, [01](01_architecture_and_data_contract.md) 확장성, [02](02_domain_menus.md) VOC.

## 7. INTERACTION RULES

| 규칙 / 검수 시나리오 | 근거 |
| --- | --- |
| Zoom/hover/brush만 하면 URL·KPI·Breakdown 불변. `선택 구간 분석`으로만 Time 변경, P95를 새 모집단/세대에서 재계산하고 chip 임계값도 갱신 | [06](06_platform_ui_contract.md) §6.1/§11/§16/§24; tail 재계산 UI Candidate |
| 소수초 brush 적용은 외향 초 정렬 preview → 공통 확인 Modal. 확인 전 URL/조회 불변, 취소는 brush 유지. anchor는 절대 반올림하지 않음 | [06](06_platform_ui_contract.md) §6.1/§20 |
| P95 선택/해제는 명시 Page Filter chip으로 현재 C의 tail 목록을 조회. 단일 mark 진입은 selectedOccurrence chip 추가 후 상세; 집계 mark는 단일 D 진입 금지 | [06](06_platform_ui_contract.md) §6/§16/§24 및 사용자 명시 규칙; predicate Candidate |
| 목록 행 열기는 D만 목적지로 설정하고 C/P를 보존. C.selectedEquipmentIds=[A,B]에서 D.equipmentId=A를 열어도 [A,B] 유지. D가 선택 밖의 EQ-C여도 분석 복귀는 진입 전 [A,B] 그대로이며 EQ-C를 추가하지 않음. 불일치는 안내하고 허용 여부는 서버 Scope 검증; Context를 권한으로 사용하지 않음 | [06](06_platform_ui_contract.md) §6.1/§17 |
| anchor 누락/invalid D는 객체 조회 중단. Lot 검색 결과에서 온전한 D를 다시 선택하도록 안내. 누락을 Lot으로 복원하지 않음 | [06](06_platform_ui_contract.md) §6.1 |
| VOC 생성 진입은 D/C/검증된 returnTarget를 helper에 전달. 취소·저장 후 돌아가기는 동일 D/C, 목록 복귀는 P도 복원. VOC 열람 권한만으로 분석이 열리면 실패 | [06](06_platform_ui_contract.md) §6.1/§17/§22, [02](02_domain_menus.md) VOC |
| browser back/forward·새로고침은 URL 소유 상태만 복원. 미지원 Context 보존·미적용 표시. Site가 활성 Scope에 확립된 직접 D 링크라도 출발 분석 조건이 없으면 이를 추정하지 않고 '출발 분석 조건 없음' 표시. Site/필수 scopeId 부재는 별도 선택 요구이며 D에서 역산하지 않음 | [06](06_platform_ui_contract.md) §6.4; 직접 진입 안내 Candidate |
| Scope/Time/Equipment 변경은 이전 값 숨김·이전 응답 무시. 권한 변경은 상세/목록 모두 숨기고 재검증. 같은 조건 Refreshing만 기존 값 유지 | [06](06_platform_ui_contract.md) §11/§19 |
| 성공 0건은 No matching result. 원인 confirmed + statusSource/observedAt + explainsEmpty 근거가 있을 때만 미수집/지연을 원인으로 표시. source 부재는 unknown+이유, clear로 보정 금지 | [06](06_platform_ui_contract.md) §19 |
| outcome forbidden/too_large/timeout/error 구분. 권한 없음/키 없음/품질 Unknown은 다른 상태. 일부 위젯 실패는 성공 영역 유지·실패 영역 재시도/Correlation ID, 장기 요청 취소·기간 축소 제공 | [06](06_platform_ui_contract.md) §17/§19/§27 |
| 표 server-side sort/filter, 컬럼 resize/visibility/pin/preferences·다중선택/선택 CSV, 가상화. 표 최소 32px·터치 44px, 수치 우측 정렬. 단일 행 목적지 키는 선택 행 index가 아님 | [06](06_platform_ui_contract.md) §15, [DESIGN](../DESIGN.md) table-density |
| 차트 이름/단위/서술/동일 데이터 표, 선의 모양+텍스트, 키보드 focus, 링크 접근 이름. 1024–1439 sidebar collapse·표 가로 스크롤, 작은 화면 조회 중심 후보 | [06](06_platform_ui_contract.md) §25–26, [DESIGN](../DESIGN.md) focus |

## 8. DESIGN DECISIONS / OPEN QUESTIONS

| 상태 | 판단 / 소유 |
| --- | --- |
| Decided 소비 | occurrence 3중 키, lot 검색 보조, 목적지/Context 분리, 명시적 범위 적용, 서버 권한, URL 복원, 상태/시간 계약 — 06 |
| 지시된 범위 | Analysis Workspace와 그 Breakdown Table, 타임라인/품질 상세, VOC 왕복 진입점만 |
| Decided | Context 선언과 page-owned 키는 §3·§3.1(매니페스트 기준). occurrence 상세는 Full Page `/analytics/executions/:equipmentId`이며 복귀는 `returnTo` |
| Candidate | P95 ≥ predicate, 메뉴별 Recipe 조인 범위, 선택 occurrence chip(미구현). Kernel 등록/검증 필요 |
| Open — Domain/Data | Job 지표 세부/분위수·기간 귀속·버전 ID·timeline 관계·품질 원천/필드·coverage/assessment 공급자 |
| Open — Domain/Data | `OccurrenceProcessTimeline`과 `06` §13/§22가 이미 나열한 `WaferJourneyTimeline`의 관계(같은 데이터의 다른 그레인 vs 완전 분리) |
| Open — Platform | 복귀 상태 직렬화/크기 제한, Registry 권한명, timeDomain assertion 공급, Scope 상속, 첫 Δ, 실제 조회량 |
| Deferred | VOC 화면, 영속 주석 편집, 저장된 뷰, 자유 위젯 엔진 |

## OPEN QUESTIONS / RISKS

- **비교 모집단(Open — 이 화면 분석 로직 담당)**: "P95 이상 느린 실행"이 Recipe/PPID가 다른 Job을 어떤 비교 기준으로 묶는지 명시해야 한다. 혼합 Recipe 합성 행은 통계적 비교 가능성의 승인 근거가 아니다. 모집단 구성·분리/포함 기준은 이 메뉴가 정하며 Kernel 규칙으로 올리지 않는다.
- **Module/Slot 타임라인(Open — 이 화면 데이터/표현 계약)**: XFR/FNC/PRC 로그의 grain은 EquipmentID 하위 Module/Slot으로 확정됐다([CONTEXT](../CONTEXT.md)). 상세 구간과 데이터 표에 Module/Slot 참조 및 부모 Job occurrence 관계를 어떻게 표시·연결할지 정해야 한다. 현재 PRC 구간 중심 표현은 이 세부 단위를 표현하지 못하므로 완성된 타임라인 계약으로 보지 않는다. 화면 전체 재설계는 이번 범위에 포함하지 않는다.
- CFG는 설비 단위 기록이며 Module 대상 정보는 개별 값의 속성이다. 분석 설정은 Job 시작 시점 값으로 충분하다. CFG cross-menu 이동은 Deferred이며 이 화면에 신규 이동을 추가하지 않는다(`06` §22).
- anchor 전체 정밀도 보존은 계약이다. 현재 구현은 초 단위 anchor(`YYYY-MM-DDTHH:mm:ss`)만 열며 반올림·절단하지 않고 거부한다. 소수초 anchor의 무손실 왕복은 구현으로 확인하지 않았다.
