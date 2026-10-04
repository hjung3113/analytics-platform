# 11. 생산성 분석 — 개요 요구사항·와이어프레임

상태: 화면 계약 노트. 구현은 `menus/analytics`(합성 데이터)이고 지표 정의는 승인되지 않았다. 원본의 Decided를 소비하며 새 공개 키는 Candidate다. 배치·시각은 구현과 [DESIGN](../DESIGN.md)이 기준이다.

소유 범위는 [07](07_app_shell_wireframe.md)의 content slot이다. [02](02_domain_menus.md)의 생산성 분석을 구체화한 대표 분석 Consumer다.

## 1. USER TASK

- 사용자: 공정/설비 엔지니어. 기간과 설비를 확인하고 네 지표의 요약·추세·신뢰도를 읽어 상세 분석에 들어갈지 판단한다.
- 대상: Scope 내 EquipmentID 집합에 대한 물리 점유율, 비Process 체류, 사이클타임 P50/P95, **Job 처리량**. Lot은 논리적 묶음이고 Job은 실행 인스턴스이므로 처리량의 표기·단위도 Job으로 구분한다([CONTEXT](../CONTEXT.md)).
- 주 결정: 해당 기간의 수치를 해석할 수 있는지, 사이클타임 상세를 더 확인할지. 임계값 기반 이상 판정·원인 진단은 이 화면에서 만들지 않는다.
- 반복 조회용 Desktop-first 화면. 실제 데이터량·조회 상한·이용 빈도는 미확정([열린 입력 질문 4](../.planning/inputs.md#q4)).
- 이 화면에 Wafer Journey, 실행 목록, occurrence 상세, 편집/CRUD, 수집 파이프라인 모니터링을 추가하지 않는다. SEMI E10 가동률·수율은 제외이며 대체 지표를 만들지 않는다(관련 개념을 논할 때도 **제한된 정의**임을 명시해야 함).

## 2. IA / SCREEN INVENTORY

[06](06_platform_ui_contract.md) §9의 생산성 분석 그룹. **Overview (§12.1)**를 선택한다.

- 개요 `/analytics/productivity`(그룹의 대표 목적지): 네 지표 요약(KPI 카드), 선택 지표의 추세(기본은 Job 처리량), 점유 구성(차트와 표), 확인할 항목(Attention List), Data Trust 요약
- 사이클타임 상세 → 느린 실행 → occurrence 상세: [12](12_cycle_time_drilldown_wireframe.md) 소유. 여기서는 진입점만 둔다

조건→선택→드릴다운→상세의 Analysis Workspace(§12.2)는 다음 화면 소유다. 여기에는 brush·annotation·실행 breakdown table·detail drawer를 두지 않는다. 차트의 데이터 표는 접근성 대체 표현이며 실행 탐색 테이블이 아니다.

## 3. SCREEN SPECIFICATION

로딩·빈 상태·오류는 위젯별로 격리하며 `06` §17/§19/§27이 기준이다. 아래 §3.1이 이 화면의 Context·page key 계약이다.

### 3.1 Context Capability / 상태 소유권 (매니페스트 `productivity-overview`)

[06](06_platform_ui_contract.md) §6의 Occupancy Analysis 예시를 참고하되, 네 지표를 함께 읽는 화면의 적용 범위를 별도로 선언한다. 선언은 `requiresScope: true`, `pageType: overview`, 내보내기 `export: true`다.

| Time | roomNames | Condition | Selection | Lot | PPID | Recipe | Metric |
| --- | --- | --- | --- | --- | --- | --- | --- |
| apply | apply | apply | apply | unsupported | apply | apply | reference |

- Time/Equipment는 메뉴 간 전달되는 직접 조회 조건. Equipment 선택지는 현재 Scope·권한으로 제한한다. Scope 선택기는 사이드바 머리 한 곳에만 둔다(06 §7).
- Lot은 이 화면이 지원하지 않는다. 전달된 Lot은 보존하고 미적용으로 표시한다. PPID와 Recipe는 분석 필터 축으로 받되 적용 가능한 지표와 조인 범위는 메뉴 정의 Candidate로 둔다. Recipe가 Job 전체를 포함할지 매칭 PRC 구간만 포함할지, 점유율 분모에 어떻게 적용할지는 이 화면의 분석 로직 담당자가 정하며 Kernel이 강제하지 않는다. 미지원 지표에는 미적용을 표시한다.
- **room_name은 Global Context**다. 공개 키 후보 `roomNames`를 소비하며 별도 `processIds` Page Filter를 만들지 않는다. 현재 Site·room_name 권한 범위 안에서 설비를 좁히며 다른 메뉴로 보존·전달한다. Line은 독립 축이고 room_name의 상위 계층이 아니다(`06` §6.1–6.2).
- **Equipment Group은 Global Context의 Condition/Selection 두 층**이다. StGroup / 분임조 / Maker+Model 중 한 축만 조건으로 사용한다. Condition(`equipmentGroup`)은 현재 결과를 재평가하고, 결과 안에서 사용자가 명시 선택한 설비만 Selection(`selectedEquipmentIds`, 기존 `equipmentIds` 대응)에 고정한다. 조건 적용과 설비 명시 선택을 구분하고 상세 열기만으로 선택을 바꾸지 않는다. [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md)를 모든 축에 동일 적용한다.
- **page-owned URL 키(등록: [06](06_platform_ui_contract.md) §6.1)**: `granularity=hour|day|week`는 기간과 다른 축이며 전역 Context로 전달하지 않는다. 미지정이면 조회 기간이 48시간 이하일 때 `hour`, 아니면 `day`로 본다(Candidate 기본값). bucket 경계/주 시작일/부분 bucket 규칙은 지표 계약으로 확정 전 Open. `kpi=occupancy|dwell|cycleTime|throughput`(추세에 보일 지표, 기본 `throughput`), `axis=room|stgroup`(점유 구성의 구성 축, 기본 `room`), `sort=key|occ|obs|pct|jobs:asc|desc`(점유 구성 표 정렬, 기본 `key` 오름차순)도 page-owned다. 등록된 값 밖의 값은 다른 값으로 바꾸지 않고 오류로 보인다.
- **지표별 버전 page key**(`occupancyVersion`·`dwellVersion`·`cycleTimeVersion`·`throughputVersion` 후보)는 매니페스트에 등록돼 있지 않다. 등록 여부는 결정 대기다. 구현의 지표별 버전 값(`METRIC_VERSIONS`)은 Candidate 상수이고 Context의 metric은 `reference`(전역 쌍 보존만)다. 버전 키를 등록한다면 각각 Registry에 등록된 해당 metricId와 결합해 서버 검증하고 P50/P95는 같은 사이클타임 정의 버전의 두 값으로 다룬다. 빠진 버전은 선택 상태이고 임의 최신값 적용은 없다. 전역 metricId/version이 해당 지표와 같으면 동일 버전만 허용하고 상충은 오류이며, 다른 지표면 전역 쌍을 미적용 보존한다. 전역 단일 버전을 네 지표 전체에 적용하지 않는다.

## 4. LAYOUT BOUNDARY

배치는 구현(`menus/analytics/src/pages/ProductivityOverview.tsx`)이 기준이다. Overview archetype(`06` §12.1) 순서로 KPI 요약, 추세, 구성, Attention을 두고 Data Trust 요약은 페이지 머리 슬롯에 둔다. 위젯마다 자체 조회를 가져 부분 실패가 그 위젯에 머문다. 셸 구조·치수는 [06 §7](06_platform_ui_contract.md#7-application-shell)/[07](07_app_shell_wireframe.md), 공유 색·폰트·primitive는 FeedbackOps 원본, 플랫폼 시각 확장은 [DESIGN](../DESIGN.md)이 소유한다.

## 5. OWNERSHIP

- Kernel: PageHeader, GlobalContextBar, Context Link, Scope/URL/권한/전달 정책([06](06_platform_ui_contract.md) §4–8/§17/§22), room_name·Equipment Group·PPID/Recipe Global Context. 조건 매칭·지표별 Recipe 조인 범위는 Domain/서버.
- Platform: `AnalysisChartFrame`/대체 표의 제목·단위·상태·접근성, `DataTrustIndicator`, Error Boundary. bucket 의미와 단위는 Domain([06](06_platform_ui_contract.md) §13–16/§26), 상태 판정과 계산 근거는 Backend/Data layer(§18–19).
- Domain(이 화면): KPI 카드·추세 series 구성, Attention List(신뢰 확인·상세 진입; 임계값 알림 엔진이 아님). 자유 위젯 엔진은 없다.

## 6. DATA REQUIREMENTS

- **허용 지표/정의(Open)**: 지표별 ID·grain·단위·분자/분모·기간 경계·null 의미·버전·coverage 정의가 필요하다. 점유 interval의 중복 제거/기간 clipping과 유효 관측시간 분모, 비Process 분류/체류 집계 통계, Job 사이클타임 시작·끝/미완료 제외, Job 처리량의 시작 또는 완료 귀속·중복 집계 방지는 원문에 없다. 구현의 수치는 합성 mock 값이고 이 세부 정의는 승인되지 않았다. 근거: [02](02_domain_menus.md) 생산성 분석/지표관리, [01](01_architecture_and_data_contract.md) 「대응」「집계 가능성 계약」, [CONTEXT](../CONTEXT.md) Lot/Job/Recipe.
- **소비 경계(Decided)**: API는 호환 view/mart를 소비하며 파서 원본 직접 조회를 하지 않는다. 조인/원천 정밀도·분류·품질은 서버가 소유한다. 여러 설비/날짜의 P95를 평균하지 않으며 비율은 분자·분모 각각 합산한다. 표시용 downsampling을 지표 계산으로 사용하지 않는다. 근거: [01](01_architecture_and_data_contract.md) 「전체 아키텍처」「집계 가능성 계약」.
- **Scope/Equipment(Decided)**: 단일 scopeId 필수, Site·room_name 기준으로 서버가 조회/옵션/링크마다 권한을 재검증한다. Site→room_name→StGroup→Equipment 관계와 독립 Line 축을 따르며 권한 상속 세부는 Open이다. 고정 Selection은 조용히 제거/대체하지 않는다. 명시적 공집합은 유효한 나머지 요청에 대해 empty이며 무제약과 다르다. 근거: [06](06_platform_ui_contract.md) §6.1–6.2/§17, [ADR-0005](adr/0005-scope-room-name-line-independent.md).
- **페이지 조회 계약(Candidate)**: page-owned 키는 `granularity`·`kpi`·`axis`·`sort`이며 Kernel에 등록돼 있다(지표별 버전 키 등록 여부는 결정 대기). roomNames/ppid/recipeIds 및 Equipment Group Condition/Selection은 전역 계약을 소비한다. 그룹 현재 결과와 평가 기준시각이 필요하다. 현재 조건의 결과 0건은 live Condition을 유지한 empty이며 고정 공집합으로 자동 바꾸지 않는다. 사용자가 명시한 선택 0건만 Selection 공집합 표식으로 표현한다. 근거: [06](06_platform_ui_contract.md) §6.1/§6.4, [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md).
- **시간(Decided)**: naive 초 정렬 `[from,to)`와 wall-clock을 소비하고 UTC 변환하지 않는다. 프리셋 1일/7일은 서버 defaultRangeTo에서 Δ24h/168h로 물질화하며 R이 있을 때 defaultRangeTo≤R 조건을 확인한다. 둘 다 없는 기간은 기본 Δ가 미정이면 선택 상태, 한쪽만 있으면 오류. 첫 기본 Δ는 Open; defaultRangeTo=Data through=now로 추정하지 않는다. 근거: [06](06_platform_ui_contract.md#ctx-time) §6.3/§6.4.
- **다중 설비 시간축(Decided/Open)**: 모든 설비의 요청 전체 기간을 동일 timeDomainId assertion이 덮어야 병합 가능. 공급자는 Open. 부재/불일치는 time_domain_unverified/time_domain_mismatch 오류 + Correlation ID이며 경고 후 합산하지 않는다. 단일 설비 또는 분리 조회 경로를 안내한다. 근거: [06](06_platform_ui_contract.md#ctx-time).
- **계산 세대(Decided)**: 카드·차트·대체 표가 같은 완료 세대/계산 기준시각을 사용해야 한다. Updated(결과 갱신), Data through(원천 데이터 진행 범위), calculation basis time(계산 기준)을 분리하고 각각 시간역·경계 의미를 제공한다. 다른 세대가 섞이면 새 조합을 완료 결과처럼 노출하지 않는다. 세대 ID/원자 교체 방식은 Candidate 구현 계약. 근거: [01](01_architecture_and_data_contract.md) 「mart 재계산 트리거」, [06](06_platform_ui_contract.md) §6.1/§18.
- **재계산/갱신(Decided/Open)**: 지연 완료, 마스터 소급 정정, module_class_map 재분류, 지표 정의 변경이 트리거다. H=1시간, 자동 창 `[R-H,R)` 밖은 식별 가능한 정정/backfill 후보로 보존하며 이 화면에 실행 UI는 만들지 않는다. R 부재는 자동 재집계 보류이고 autoRefreshClosed는 완전성 보장이 아니다. 300s 폴링은 완료된 계산 세대 정보로 캐시 재검증, watermark 이동만으로 결과를 완료 처리하지 않는다. 폴링 중단/워커 주기는 Open. 근거: [01](01_architecture_and_data_contract.md#late-arrival-policy), [01 갱신 정책](01_architecture_and_data_contract.md#refresh-policy).
- **Data Trust(Decided/Candidate)**: 지표별 Updated/Data through/Coverage/Metric version/Status·source/lineage·계산 기준시각이 필요하다. Coverage는 지표별 분자·분모·대상 모집단이 있어야 하며 한 지표의 Coverage를 전체 건강도로 확대하지 않는다. 확인되지 않은 지표는 Unknown이며 분모의 실제 검증 원천은 Open. 근거: [06](06_platform_ui_contract.md) §18–19, [02](02_domain_menus.md) 지표 정의 관리.
- **응답/Attention(Candidate 적용안)**: 위젯별 outcome과 적용 assessments 목록을 선언한다. 미수집/지연/coverage 부족/미확정의 적용 여부와 statusSource는 구현 전 확정 필요. 적용 kind의 근거가 없으면 unknown+이유를 반환하며 누락을 clear로 만들지 않는다. Attention List는 비Process 체류·P95 상위 설비의 랭킹이며 임계값 경보·이상 판정을 만들지 않는다. confirmed/clear는 statusSource·observedAt 필수이고 빈 결과 원인은 explainsEmpty 규칙으로만 설명한다. 근거: [06](06_platform_ui_contract.md) §18–19.
- **조회량(Decided/Open)**: 서버 집계·반환량 제한·timeout/취소를 지원하고 원본 로그 전체를 내려보내지 않는다. 실제 상한·bucket 제한·주별 정렬 정의는 Open이다. 근거: [06](06_platform_ui_contract.md) §27, [01](01_architecture_and_data_contract.md) 「확장성」, [열린 입력 질문 4](../.planning/inputs.md#q4).

## 7. INTERACTION RULES

| 규칙 | 상태 / 근거 |
| --- | --- |
| 기간/Equipment 변경 시 URL 갱신 후 새 조회; 이전 결과 숨김, 늦은 이전 응답 폐기. 동일 조건 새로고침만 기존 결과+Refreshing | Decided — [06](06_platform_ui_contract.md) §11/§19 |
| Scope/권한 변경은 결과 숨김 후 재검증. 무단 ID를 제거해 남은 설비만 자동 조회하지 않음 | Decided — [06](06_platform_ui_contract.md) §6.2/§17 |
| room_name·그룹 Condition·Selection·PPID/Recipe 변경은 명시 적용 시 전역 Context 변경. 조건 결과와 고정 선택을 구분 표시 | Decided 계약 / Candidate UI — [06](06_platform_ui_contract.md) §6/§11, [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md) |
| 집계 단위 변경은 page-owned URL과 차트 조회를 변경. 기간이나 원 지표 정의는 변경하지 않으며 세대 정합성 유지 | Candidate — [06](06_platform_ui_contract.md) §6.1/§16, [01](01_architecture_and_data_contract.md) 집계 가능성 |
| 지표별 버전 키가 등록되면: 버전 확인은 지표별 버전 목록·정의를 표시. 변경을 채택할 경우 해당 키를 명시적으로 바꾸고 재조회; 전역 동일 metric 쌍과 충돌하면 오류 | Candidate UI / Decided 검증 — [06](06_platform_ui_contract.md) §6.1 |
| 사이클타임 상세는 Context Link helper로 이동. Scope/Time/Equipment 및 미적용 전역 Context 보존. cycleTimeVersion을 동일 metricId/version 쌍으로 전달하려면 명시적 목적지 계약 필요; 기존 다른 전역 쌍을 덮어쓰지 않음 | Decided 경계 / Candidate 목적지 매핑 — [06](06_platform_ui_contract.md) §6.1/§6.4/§22 |
| room_name·PPID·Recipe·Equipment Group 두 층은 목적지 지원 여부와 무관하게 보존하고 지원하는 값만 적용. granularity/다른 지표 버전은 자동 복사하지 않음. 분석 복귀 시 진입 전 Context를 그대로 복원 | Decided — [06](06_platform_ui_contract.md) §6.4/§22 |
| Lot/다른 지표 쌍과 지표별 미지원 PPID/Recipe는 URL 보존+미적용 표시; 임의 제거 없음. back/forward는 등록된 URL 상태 재검증 후 복원 | Decided — [06](06_platform_ui_contract.md) §6.1/§6.4 |
| 표 보기/신뢰 근거 보기는 현재 영역을 펼치는 로컬 상태. KPI 카드 클릭은 page key `kpi`만 바꾸고(전역 Context 불변), 숫자 클릭/hover는 전역 필터를 바꾸지 않는다; 상세 진입 링크만 이동 | Candidate — [06](06_platform_ui_contract.md) §12.1/§16/§18/§24/§26 |
| 오류 영역 재시도+Correlation ID. too_large/timeout은 취소·기간 축소·집계 단위 변경 경로. 0값/결측/권한 없음은 별도 표현 | Decided — [06](06_platform_ui_contract.md) §17/§19/§27 |
| 상태/차트는 텍스트 병행, 버튼 키보드 포커스, 차트 제목·단위·합계와 동일 데이터 표 제공. 1024–1439는 sidebar collapse/카드 2열 후보; 작은 화면에서는 조회 중심 | Baseline / responsive Candidate — [06](06_platform_ui_contract.md) §25–26, [DESIGN](../DESIGN.md) interaction |

## 8. DESIGN DECISIONS / OPEN QUESTIONS

| 상태 | 결정 / 질문 |
| --- | --- |
| Decided 소비 | Scope/시간/URL/상태 근거/재집계 정책은 원본 [06](06_platform_ui_contract.md)/[01](01_architecture_and_data_contract.md) 유지 |
| 지시된 화면 범위 | Overview, 네 지표만, 다음 Analysis Workspace 제외 |
| Decided | Context 선언은 §3.1(Time·roomNames·Condition·Selection·PPID·Recipe `apply`, metric `reference`, Lot `unsupported`) |
| Decided | Global room_name·배타적 Group Condition/고정 Selection. page-owned 키는 `granularity`·`kpi`·`axis`·`sort` |
| Candidate | 점유율은 donut/gauge 없이 분자·분모가 있는 비율로 표시 |
| Open | 지표별 버전 page key(`occupancyVersion` 등) 등록 여부 — 결정 대기 |
| Open | 네 지표 계산식/지표별 grain(시간 기반 실행 분석은 Job)/coverage 분모/지표 ID 및 정의 버전. 실제 mart/품질 원천·lineage 서비스 |
| Open | room_name 공개 값 매핑, PPID/Recipe의 지표별 조인 범위, bucket 정렬/부분 bucket/주 시작일, 사이클 버전 전달 등록 계약 |
| Open 유지 | Scope 상속, 최초 기본 Δ, timeDomain assertion 공급, 다중 Site 날짜·교대일 의미, 조회 상한/timeout/폴링 중단 |

## OPEN QUESTIONS / RISKS

- **비교 모집단(Open — 이 화면 분석 로직 담당)**: 사이클타임 P95 및 느린 실행 비교에서 Recipe/PPID가 다른 Job을 어떤 기준으로 비교할지 명시해야 한다. 비교 가능성·분리/포함 기준은 메뉴 분석 로직의 정확성 문제이며 플랫폼/Kernel 통계 규칙으로 확정하지 않는다.
- 지표 정의와 실제 분모가 정해지기 전 합성 mock 값을 운영값으로 사용할 수 없다. 점유율은 허용된 물리 점유율이며 제외된 지표의 대체 명칭이 아니다.
- 다중 설비 시간역 증명과 계산 세대 정합성 없이는 집계 요약의 신뢰가 무너진다.
- source가 없는 상태를 Healthy나 Provisional로 추정하지 않는다.
- 지표별 버전 page-owned 키를 등록한다면 목적지 매핑까지 계약이 필요하다. 상충한 전역 metric 쌍을 조용히 교체할 수 없다.
