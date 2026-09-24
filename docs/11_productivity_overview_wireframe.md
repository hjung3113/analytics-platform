# 11. 생산성 분석 — 개요 요구사항·와이어프레임

상태: 설계 산출물. `.agents/skills/analysis-platform-wireframe/SKILL.md`의 설계 단계에서 종료한다. 제품 구현·승인·실데이터 검증을 뜻하지 않는다. 원본의 Decided를 소비하며 이 화면의 배치·표현·새 공개 키는 Candidate다.

소유 범위는 [07](07_app_shell_wireframe.md)의 content slot이다. [02](02_domain_menus.md)의 생산성 분석 및 [PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) §2.1의 대표 분석 Consumer를 구체화한다. [10](10_reference_data_wireframe.md)은 문서 구조만 참조했다.

## 1. USER TASK

- 사용자: 공정/설비 엔지니어. 기간과 설비를 확인하고 네 지표의 요약·추세·신뢰도를 읽어 상세 분석에 들어갈지 판단한다.
- 대상: Scope 내 EquipmentID 집합에 대한 물리 점유율, 비Process 체류, 사이클타임 P50/P95, **Job 처리량**. Lot은 논리적 묶음이고 Job은 실행 인스턴스이므로 처리량의 표기·단위도 Job으로 구분한다([CONTEXT](../CONTEXT.md)).
- 주 결정: 해당 기간의 수치를 해석할 수 있는지, 사이클타임 상세를 더 확인할지. 임계값 기반 이상 판정·원인 진단은 이 화면에서 만들지 않는다.
- 반복 조회용 Desktop-first 화면. 실제 데이터량·조회 상한·이용 빈도는 미확정([PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) Open Questions 4).
- 이 화면에 Wafer Journey, 실행 목록, occurrence 상세, 편집/CRUD, 수집 파이프라인 모니터링을 추가하지 않는다. SEMI E10 가동률·수율은 제외이며 대체 지표를 만들지 않는다(관련 개념을 논할 때도 **제한된 정의**임을 명시해야 함).

## 2. IA / SCREEN INVENTORY

[06](06_platform_ui_contract.md) §9의 생산성 분석 그룹. **Overview (§12.1)**를 선택한다.

```text
생산성 분석
├── 개요                         [이 문서 / 단일 artboard]
│   ├── 네 지표 요약
│   ├── Job 처리량 추세 / 동일 데이터 표 접근
│   ├── 확인할 항목(Attention List)
│   └── Data Trust 요약 / 근거 펼치기
└── 사이클타임 상세 → 느린 실행 → occurrence 상세  [다음 화면 / 여기서는 진입점만]
```

조건→선택→드릴다운→상세의 Analysis Workspace(§12.2)는 다음 화면 소유다. 여기에는 brush·annotation·실행 breakdown table·detail drawer를 두지 않는다. 차트의 데이터 표는 접근성 대체 표현이며 실행 탐색 테이블이 아니다.

## 3. SCREEN SPECIFICATION

| 항목 | 내용 |
| --- | --- |
| Purpose | 허용된 네 지표의 요약·처리량 추세·Data Trust 확인 |
| Primary task | Scope/기간/Equipment 확인 → KPI·추세 읽기 → 신뢰 근거 확인 또는 상세 이동 |
| Input | Global Time/Equipment·Equipment Group 두 층/room_name/PPID/Recipe, page-owned 집계 단위/지표별 버전 |
| Output | 동일 계산 세대의 네 지표 요약·처리량 bucket 결과·신뢰 정보 |
| Primary action | 사이클타임 상세 보기(다음 화면으로 이동) |
| Secondary actions | 새로고침, 페이지 조건 적용, 지표 버전 확인, 차트 데이터 표 보기, 신뢰 근거 보기 |
| Navigation | 생산성 분석 대표 목적지 후보 `/analytics`; 실제 경로/권한 이름은 Registry 등록 대상 |
| Loading | 카드·차트별 skeleton. 다른 조건 조회는 기존 값을 숨김. 같은 조건만 Refreshing 허용 |
| Empty | 성공 0건은 No matching result. 빈 bucket과 확인된 0값을 구분하며 결측을 0으로 채우지 않음 |
| Error | 부분 위젯 실패는 해당 영역만 격리. 권한·시간역 검증 오류는 그 조회 차단. 오류 ID와 재시도/범위 축소 경로 |

### 3.1 Context Capability / 상태 소유권 (이 화면 선언 Candidate)

[06](06_platform_ui_contract.md) §6의 Occupancy Analysis 예시를 참고하되, 네 지표를 함께 읽는 화면의 적용 범위를 별도로 선언한다.

| Time | Equipment | Lot | Metric Version |
| --- | --- | --- | --- |
| O | O | △ | O — 동일 metricId에 한해 적용 |

- Time/Equipment는 메뉴 간 전달되는 직접 조회 조건. Equipment 선택지는 현재 Scope·권한으로 제한한다. Scope 선택기는 헤더 한 곳에만 둔다.
- Lot은 전달/참조만 하고 네 KPI에는 미적용이다. PPID와 Recipe는 분석 필터 축으로 받되 적용 가능한 지표와 조인 범위는 메뉴 정의 Candidate로 둔다. Recipe가 Job 전체를 포함할지 매칭 PRC 구간만 포함할지, 점유율 분모에 어떻게 적용할지는 이 화면의 분석 로직 담당자가 정하며 Kernel이 강제하지 않는다. 미지원 지표에는 미적용을 표시한다.
- **room_name은 Global Context**다. 공개 키 후보 `roomNames`를 소비하며 별도 `processIds` Page Filter를 만들지 않는다. 현재 Site·room_name 권한 범위 안에서 설비를 좁히며 다른 메뉴로 보존·전달한다. Line은 독립 축이고 room_name의 상위 계층이 아니다(`06` §6.1–6.2).
- **Equipment Group은 Global Context의 Condition/Selection 두 층**이다. StGroup / 분임조 / Maker+Model 중 한 축만 조건으로 사용한다. Condition(`equipmentGroup`)은 현재 결과를 재평가하고, 결과 안에서 사용자가 명시 선택한 설비만 Selection(`selectedEquipmentIds`, 기존 `equipmentIds` 대응)에 고정한다. 조건 적용과 설비 명시 선택을 구분하고 상세 열기만으로 선택을 바꾸지 않는다. [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md)를 모든 축에 동일 적용한다.
- `granularity=hour|day|week`는 **page-owned URL** 후보로 선언·등록한다([06](06_platform_ui_contract.md) §6.1). 기간과 다른 축이며 전역 Context로 전달하지 않는다. 미지정은 선택을 요구하는 후보 정책; mockup의 `day`는 사용자가 선택한 예시다. bucket 경계/주 시작일/부분 bucket 규칙은 지표 계약으로 확정 전 Open.
- 지표별 버전은 page-owned 단일값 후보 `occupancyVersion`, `dwellVersion`, `cycleTimeVersion`, `throughputVersion`으로 선언한다. 각각 Registry에 등록된 해당 metricId와 결합해 서버 검증한다. P50/P95는 같은 사이클타임 정의 버전의 두 값이다. ID 매핑/공개 이름 확정은 Open. 빠진 버전은 선택 상태; 임의 최신값 적용 없음. 전역 metricId/version이 해당 지표와 같으면 동일 버전만 허용하고 상충은 오류다. 다른 지표면 전역 쌍을 미적용 보존한다. 전역 단일 v3를 네 지표 전체에 적용하지 않는다.

## 4. WIREFRAME (Candidate)

한 장, 1440×900. 콘텐츠는 셸 본문에서 세로 스크롤하며 아래 영역을 축소하거나 겹치지 않는다. 헤더 54px·사이드바 270px·색/아이콘/검색/프로필은 08/09가 이미 확립한 셸 시각 스타일을 그대로 소비한다. 현재 메뉴 표시만 생산성 분석으로 옮긴다. 본문은 Overview의 6영역 순서다. 아래 숫자·버전·시각·statusSource는 모두 **합성 예시**이며 실제 계산 정의나 서비스 존재를 확정하지 않는다.

```text
[07 Header: Analytics Platform | Scope: Site A | 메뉴 검색 | 사용자]
[07 Sidebar]  생산성 분석 > 개요
              생산성 분석 — 개요               [새로고침] [사이클타임 상세 보기 →]
              파서 기반 네 지표 요약 · 예시 데이터 / 정의 Candidate

 Global       기간 [1일][7일][사용자 지정] [09.17 00:00 – 09.24 00:00)
 Context      Equipment [EQ-0231 ▾] · Selection: 명시 ID 목록
              room_name [전체] · PPID [전체] · Recipe [전체]
              Equipment Group [축 선택 ▾] [조건 ▾] [조건 적용] [설비 선택 적용]
              wall-clock · Asia/Seoul
              (전달된 미지원 Context가 있을 때만 별도 미적용 행)

 Page Filter  집계 단위와 지표별 버전(아래)
              지표 버전: 점유 v3 · 체류 v2 · 사이클 v4 · 처리량 v1 [확인]

 Summary      물리 점유율      비Process 체류      사이클타임          Job 처리량
              68.4 %          18.6 분 / Job      P50 42.8 분         1,248 Job
              [progress]      예시: Job당 평균   P95 71.2 분         기간 내 완료 수
              114.912/168 h   체류 v2            사이클 v4           처리량 v1
              점유 v3

 Main Trend   Job 처리량 추세                집계 단위 [시간][일][주] [데이터 표 보기]
              완료 Job 수 · 처리량 v1 · 일별 / 합계 1,248 Job
              0에서 시작하는 막대 차트: 09/17 160, 18 182, 19 175,
              20 198, 21 169, 22 190, 23 174 (각 bar 위 값, y축 Job)
              Source: 처리량 mart(예시) · Updated 09.24 00:10 KST · Coverage 97.5%

 Attention    확인할 항목
              [미확인] 신뢰 상태 근거 없음 · 지표값과 별개로 상태 판정 불가 [근거 보기]
              [분석 진입] 사이클타임 P50 42.8 / P95 71.2 분             [상세 보기 →]

 Data Trust   Updated 09.24 00:10 KST · Data through 09.24 00:00 wall-clock (배타)
              Coverage 처리량 97.5% · 나머지 Unknown · Metric version 점유 v3 / 체류 v2 / 사이클 v4 / 처리량 v1
              Status Unknown · 계산 기준시각 09.24 00:08 KST [신뢰 근거 보기]
```

차트의 일별 합은 KPI 1,248과 일치한다. 기간은 사용자가 이미 고른 7일의 절대 경계이며 첫 진입 기본값을 확정하지 않는다. 단일 설비 예시라 timeDomain assertion 부재를 다중 설비 병합 허가로 오해하지 않는다.

물리 점유율은 stat-card + 6px progress-track으로 표시한다. 막대는 합성 분자/분모 114.912h/168h를 갖는 비율 예시이며 실 계산에서 중복 interval/기간 clipping/관측 가능 시간 정의는 §6의 Open이다. 채움은 chart-blue(상태 성공색 아님). 별도 donut/gauge는 같은 비율의 중복 표현이라 쓰지 않는다. 비Process 체류 평균·완료 기준 처리량은 시각화를 위한 Candidate 정의다. 실제 정의 확정 전 운영 수치를 표시할 수 없다.

카드 4개는 `stat-card`의 padding 16/radius 8, 40px `icon-chip`, 32px 주 숫자/22px 보조 숫자를 사용한다. 처리량은 `bar-chart`의 보라색 series/14px bar/0축/11px label/grid 토큰을 쓰되 레퍼런스의 `unit: defects`는 도메인 의미이므로 **Job**으로 바인딩한다. 의미 없는 지표·비교 증감·목표치·장식 donut는 없다.

표 보기와 신뢰 근거는 추가 artboard 없이 같은 영역에서 펼치는 Candidate다. 정적 mockup은 접힌 상태와 버튼만 그린다. 표는 위 7개 bucket/값/결측 상태 및 같은 버전·세대를 제공한다. 신뢰 근거는 지표별 Coverage 분자/분모·정의·source/lineage·계산 세대·assessment 이유를 제공해야 한다. 아래 상세 분석은 구현하지 않는다.

## 5. CONCEPTUAL COMPONENT MAP

| 영역 | 계층 / 책임 |
| --- | --- |
| PageHeader / GlobalContextBar / Context Link | Kernel 선언·슬롯 소비. Scope/URL/권한/전달 정책은 [06](06_platform_ui_contract.md) §4–8/§17/§22 |
| room_name / Equipment Group / PPID·Recipe | Kernel Global Context 소비. 조건 매칭·지표별 Recipe 조인 범위는 Domain/서버 |
| KPI 카드 / 처리량 series | Domain composition. stat-card/icon-chip/progress-track/bar-chart 토큰 재사용; 자유 위젯 엔진 없음 |
| AnalysisChartFrame / 대체 표 | Platform의 제목·단위·상태·접근성. bucket 의미와 단위는 Domain ([06](06_platform_ui_contract.md) §13–16/§26) |
| Attention List | Domain의 신뢰 확인/상세 진입. 임계값 알림 엔진이 아님 |
| DataTrustIndicator / Error Boundary | Platform 표준 표현, 상태 판정과 계산 근거는 Backend/Data layer (§18–19) |

## 6. DATA REQUIREMENTS

- **허용 지표/정의(Open)**: 지표별 ID·grain·단위·분자/분모·기간 경계·null 의미·버전·coverage 정의가 필요하다. 점유 interval의 중복 제거/기간 clipping과 유효 관측시간 분모, 비Process 분류/체류 집계 통계, Job 사이클타임 시작·끝/미완료 제외, Job 처리량의 시작 또는 완료 귀속·중복 집계 방지는 원문에 없다. §4의 숫자는 합성 예시이고 이 세부 정의는 승인되지 않았다. 근거: [02](02_domain_menus.md) 생산성 분석/지표관리, [01](01_architecture_and_data_contract.md) 「대응」「집계 가능성 계약」, [CONTEXT](../CONTEXT.md) Lot/Job/Recipe.
- **소비 경계(Decided)**: API는 호환 view/mart를 소비하며 파서 원본 직접 조회를 하지 않는다. 조인/원천 정밀도·분류·품질은 서버가 소유한다. 여러 설비/날짜의 P95를 평균하지 않으며 비율은 분자·분모 각각 합산한다. 표시용 downsampling을 지표 계산으로 사용하지 않는다. 근거: [01](01_architecture_and_data_contract.md) 「전체 아키텍처」「집계 가능성 계약」.
- **Scope/Equipment(Decided)**: 단일 scopeId 필수, Site·room_name 기준으로 서버가 조회/옵션/링크마다 권한을 재검증한다. Site→room_name→StGroup→Equipment 관계와 독립 Line 축을 따르며 권한 상속 세부는 Open이다. 고정 Selection은 조용히 제거/대체하지 않는다. 명시적 공집합은 유효한 나머지 요청에 대해 empty이며 무제약과 다르다. 근거: [06](06_platform_ui_contract.md) §6.1–6.2/§17, [ADR-0005](adr/0005-scope-room-name-line-independent.md).
- **페이지 조회 계약(Candidate)**: page-owned 키는 granularity/네 버전 키이며 Kernel에 등록한다. roomNames/ppid/recipeIds 및 Equipment Group Condition/Selection은 전역 계약을 소비한다. 그룹 현재 결과와 평가 기준시각이 필요하다. 현재 조건의 결과 0건은 live Condition을 유지한 empty이며 고정 공집합으로 자동 바꾸지 않는다. 사용자가 명시한 선택 0건만 Selection 공집합 표식으로 표현한다. 근거: [06](06_platform_ui_contract.md) §6.1/§6.4, [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md).
- **시간(Decided)**: naive 초 정렬 `[from,to)`와 wall-clock을 소비하고 UTC 변환하지 않는다. 프리셋 1일/7일은 서버 defaultRangeTo에서 Δ24h/168h로 물질화하며 R이 있을 때 defaultRangeTo≤R 조건을 확인한다. 둘 다 없는 기간은 기본 Δ가 미정이면 선택 상태, 한쪽만 있으면 오류. 첫 기본 Δ는 Open; defaultRangeTo=Data through=now로 추정하지 않는다. 근거: [06](06_platform_ui_contract.md#ctx-time) §6.3/§6.4.
- **다중 설비 시간축(Decided/Open)**: 모든 설비의 요청 전체 기간을 동일 timeDomainId assertion이 덮어야 병합 가능. 공급자는 Open. 부재/불일치는 time_domain_unverified/time_domain_mismatch 오류 + Correlation ID이며 경고 후 합산하지 않는다. 단일 설비 또는 분리 조회 경로를 안내한다. 근거: [06](06_platform_ui_contract.md#ctx-time).
- **계산 세대(Decided)**: 카드·차트·대체 표가 같은 완료 세대/계산 기준시각을 사용해야 한다. Updated(결과 갱신), Data through(원천 데이터 진행 범위), calculation basis time(계산 기준)을 분리하고 각각 시간역·경계 의미를 제공한다. 다른 세대가 섞이면 새 조합을 완료 결과처럼 노출하지 않는다. 세대 ID/원자 교체 방식은 Candidate 구현 계약. 근거: [01](01_architecture_and_data_contract.md) 「mart 재계산 트리거」, [06](06_platform_ui_contract.md) §6.1/§18.
- **재계산/갱신(Decided/Open)**: 지연 완료, 마스터 소급 정정, module_class_map 재분류, 지표 정의 변경이 트리거다. H=1시간, 자동 창 `[R-H,R)` 밖은 식별 가능한 정정/backfill 후보로 보존하며 이 화면에 실행 UI는 만들지 않는다. R 부재는 자동 재집계 보류이고 autoRefreshClosed는 완전성 보장이 아니다. 300s 폴링은 완료된 계산 세대 정보로 캐시 재검증, watermark 이동만으로 결과를 완료 처리하지 않는다. 폴링 중단/워커 주기는 Open. 근거: [01](01_architecture_and_data_contract.md#late-arrival-policy), [01 갱신 정책](01_architecture_and_data_contract.md#refresh-policy).
- **Data Trust(Decided/Candidate)**: 지표별 Updated/Data through/Coverage/Metric version/Status·source/lineage·계산 기준시각이 필요하다. Coverage는 지표별 분자·분모·대상 모집단이 있어야 하며 한 지표 97.5%를 전체 건강도로 확대하지 않는다. 예시는 처리량 coverage=1,248/1,280(반올림 97.5%)라는 합성 품질 평가값; 나머지는 Unknown이며 이 분모의 실제 검증 원천은 Open. 근거: [06](06_platform_ui_contract.md) §18–19, [02](02_domain_menus.md) 지표 정의 관리.
- **응답/Attention(Candidate 적용안)**: 위젯별 outcome과 적용 assessments 목록을 선언한다. 미수집/지연/coverage 부족/미확정의 적용 여부와 statusSource는 구현 전 확정 필요. 적용 kind의 근거가 없으면 unknown+이유를 반환하며 누락을 clear로 만들지 않는다. 예시는 source_unavailable로 상태 평가 불가인 Attention 한 건, 임계값 경보는 없다. confirmed/clear는 statusSource·observedAt 필수이고 빈 결과 원인은 explainsEmpty 규칙으로만 설명한다. 근거: [06](06_platform_ui_contract.md) §18–19.
- **조회량(Decided/Open)**: 서버 집계·반환량 제한·timeout/취소를 지원하고 원본 로그 전체를 내려보내지 않는다. 실제 상한·bucket 제한·주별 정렬 정의는 Open이다. 근거: [06](06_platform_ui_contract.md) §27, [01](01_architecture_and_data_contract.md) 「확장성」, [PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) Open Questions 4.

## 7. INTERACTION RULES

| 규칙 | 상태 / 근거 |
| --- | --- |
| 기간/Equipment 변경 시 URL 갱신 후 새 조회; 이전 결과 숨김, 늦은 이전 응답 폐기. 동일 조건 새로고침만 기존 결과+Refreshing | Decided — [06](06_platform_ui_contract.md) §11/§19 |
| Scope/권한 변경은 결과 숨김 후 재검증. 무단 ID를 제거해 남은 설비만 자동 조회하지 않음 | Decided — [06](06_platform_ui_contract.md) §6.2/§17 |
| room_name·그룹 Condition·Selection·PPID/Recipe 변경은 명시 적용 시 전역 Context 변경. 조건 결과와 고정 선택을 구분 표시 | Decided 계약 / Candidate UI — [06](06_platform_ui_contract.md) §6/§11, [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md) |
| 집계 단위 변경은 page-owned URL과 차트 조회를 변경. 기간이나 원 지표 정의는 변경하지 않으며 세대 정합성 유지 | Candidate — [06](06_platform_ui_contract.md) §6.1/§16, [01](01_architecture_and_data_contract.md) 집계 가능성 |
| 버전 확인은 지표별 버전 목록·정의를 표시. 변경을 채택할 경우 해당 키를 명시적으로 바꾸고 재조회; 전역 동일 metric 쌍과 충돌하면 오류 | Candidate UI / Decided 검증 — [06](06_platform_ui_contract.md) §6.1 |
| 사이클타임 상세는 Context Link helper로 이동. Scope/Time/Equipment 및 미적용 전역 Context 보존. cycleTimeVersion을 동일 metricId/version 쌍으로 전달하려면 명시적 목적지 계약 필요; 기존 다른 전역 쌍을 덮어쓰지 않음 | Decided 경계 / Candidate 목적지 매핑 — [06](06_platform_ui_contract.md) §6.1/§6.4/§22 |
| room_name·PPID·Recipe·Equipment Group 두 층은 목적지 지원 여부와 무관하게 보존하고 지원하는 값만 적용. granularity/다른 지표 버전은 자동 복사하지 않음. 분석 복귀 시 진입 전 Context를 그대로 복원 | Decided — [06](06_platform_ui_contract.md) §6.4/§22 |
| Lot/다른 지표 쌍과 지표별 미지원 PPID/Recipe는 URL 보존+미적용 표시; 임의 제거 없음. back/forward는 등록된 URL 상태 재검증 후 복원 | Decided — [06](06_platform_ui_contract.md) §6.1/§6.4 |
| 표 보기/신뢰 근거 보기는 현재 영역을 펼치는 로컬 상태. 숫자 클릭/hover는 전역 필터 변경 없음; 상세 진입 링크만 이동 | Candidate — [06](06_platform_ui_contract.md) §12.1/§16/§18/§24/§26 |
| 오류 영역 재시도+Correlation ID. too_large/timeout은 취소·기간 축소·집계 단위 변경 경로. 0값/결측/권한 없음은 별도 표현 | Decided — [06](06_platform_ui_contract.md) §17/§19/§27 |
| 상태/차트는 텍스트 병행, 버튼 키보드 포커스, 차트 제목·단위·합계와 동일 데이터 표 제공. 1024–1439는 sidebar collapse/카드 2열 후보; 작은 화면에서는 조회 중심 | Baseline / responsive Candidate — [06](06_platform_ui_contract.md) §25–26, [DESIGN](../DESIGN.md) interaction |

## 8. DESIGN DECISIONS / OPEN QUESTIONS

| 상태 | 결정 / 질문 |
| --- | --- |
| Decided 소비 | Scope/시간/URL/상태 근거/재집계 정책은 원본 [06](06_platform_ui_contract.md)/[01](01_architecture_and_data_contract.md) 유지 |
| 지시된 화면 범위 | Overview, 네 지표만, 다음 Analysis Workspace 제외 |
| Candidate | 4카드 + 처리량 막대 + Attention 2행 + Data Trust. donut 없이 점유율 progress 사용 |
| Candidate | Time O / Equipment O / room_name O / Lot △ / Metric Version O(해당 지표만); PPID·Recipe는 지표별 적용 범위 명시 |
| Candidate | Global room_name·배타적 Group Condition/고정 Selection; page-owned granularity와 지표별 버전 키 |
| Open | 네 지표 계산식/지표별 grain(시간 기반 실행 분석은 Job)/coverage 분모/지표 ID 및 정의 버전. 실제 mart/품질 원천·lineage 서비스 |
| Open | room_name 공개 값 매핑, PPID/Recipe의 지표별 조인 범위, bucket 정렬/부분 bucket/주 시작일, 사이클 버전 전달 등록 계약 |
| Open 유지 | Scope 상속, 최초 기본 Δ, timeDomain assertion 공급, 다중 Site 날짜·교대일 의미, 조회 상한/timeout/폴링 중단 |

## 9. UX REVIEW (문서 단계)

2026-09-24 인터뷰 반영 검수는 이 Markdown의 계약·용어·왕복 규칙을 대상으로 했다. 아래의 기존 HTML/Step 2 검증 기록은 수정 전 산출물의 이력이며, 이번 작업에서 HTML을 갱신하거나 다시 검증한 결과가 아니다.

검수 완료 — HTML 작성 전 이 초안을 [06](06_platform_ui_contract.md)/[01](01_architecture_and_data_contract.md)/[02](02_domain_menus.md)/[CONTEXT](../CONTEXT.md)와 대조했다.

- Decided 충돌 점검: 그룹 Condition/고정 Selection 분리와 Global room_name, naive 기간, 단일 Scope, 다중 시간축 가드, 단일 전역 지표 쌍, page-owned 전달 경계를 유지했다.
- Open 은폐 점검: 평균 체류/완료 처리량/점유 분모는 Candidate 예시로만 표시. 기본 Δ·상속·상태 원천·지표 공식은 확정하지 않았다.
- 출처 점검: §6의 모든 데이터 요구와 §7의 모든 동작에 원본 근거를 붙였다. Candidate는 원문 요구 그 자체로 표시하지 않았다.
- 화면 점검: Overview 6영역, 추가 KPI 없음. Attention은 임계값 이상 판정 없이 신뢰 확인과 다음 행동을 연결한다.
- 데이터 점검: 일별 합 1,248; 점유 114.912/168=68.4%; 처리량 coverage 1,248/1,280=97.5%. coverage를 점유율이나 전체 상태로 혼동하지 않는다.
- HTML은 §4 한 상태만 표현하는 정적 mockup. 버튼/링크 동작·API·권한·성능의 구현 검증은 수행하지 않는다. 최종 compliance 승인 대상이다.
- Step 2 정적 검사: HTML 태그 균형, x-dc/preview 1440×900, 지정 script 2개, 이벤트 핸들러 없음, 7개 본문 묶음(Overview 6영역 + 페이지 조건), 로컬 문서 링크와 숫자 일치를 확인했다. 브라우저 렌더링 검수는 sandbox의 ego_cli bootstrap 연결 실패로 미실행. `support.js`는 Artifact 런타임이 공급하는 파일이라 이 저장소에는 없으며, 필수 참조는 그대로 유지하고 새 런타임 파일을 만들지 않았다.

## OPEN QUESTIONS / RISKS

- **비교 모집단(Open — 이 화면 분석 로직 담당)**: 사이클타임 P95 및 느린 실행 비교에서 Recipe/PPID가 다른 Job을 어떤 기준으로 비교할지 명시해야 한다. 비교 가능성·분리/포함 기준은 메뉴 분석 로직의 정확성 문제이며 플랫폼/Kernel 통계 규칙으로 확정하지 않는다.

- 지표 정의와 실제 분모가 정해지기 전 합성 예시를 운영값으로 사용할 수 없다. 점유율은 허용된 물리 점유율이며 제외된 지표의 대체 명칭이 아니다.
- 다중 설비 시간역 증명과 계산 세대 정합성 없이는 집계 요약의 신뢰가 무너진다. 예시 한 대를 다중 설비 구현 근거로 쓰지 않는다.
- source가 없는 상태를 Healthy나 Provisional로 추정하지 않는다. 예시 Status는 Unknown이다.
- 버전 page-owned 키와 목적지 매핑은 등록 전 계약 후보다. 상충한 전역 metric 쌍을 조용히 교체할 수 없다.
- 선택형 외부 CLI 자문은 사용하지 않았다. 제공된 원문 간 대조로 판단 가능한 범위였으며 외부 전송 없이 자체 검수했다.
