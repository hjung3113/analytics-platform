# 12. 생산성 분석 — 사이클타임 상세 → 느린 실행 목록 → occurrence 상세

상태: 설계 산출물. `.agents/skills/analysis-platform-wireframe/SKILL.md`의 설계 단계에서 종료한다. 승인·구현·실데이터 검증이 아니다. 전역 결정의 원본은 [06](06_platform_ui_contract.md), 데이터 원본은 [01](01_architecture_and_data_contract.md), 용어는 [CONTEXT](../CONTEXT.md)다. 이 문서의 배치·새 키·경로·예시 데이터는 Candidate다.

## 1. USER TASK

공정/설비 엔지니어가 [생산성 개요](11_productivity_overview_wireframe.md)에서 들어와 사이클타임 P50/P95와 느린 실행을 확인하고, 특정 occurrence의 공정 타임라인·품질 근거를 검토한 뒤 VOC로 전달하고 같은 occurrence로 돌아온다. 식별자·권한·리니지·차트를 함께 검증하는 대표 경로다([PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) §2.1/§3).

이 화면의 KPI는 사이클타임 P50/P95 두 개뿐이다. Overview의 네 지표 가족 안에서 이 지표만 상세화하며 가동률·수율·원인 자동 진단·별도 Wafer Journey 화면은 추가하지 않는다. VOC 편집/등록 화면도 범위 밖이다.

## 2. IA / SCREEN INVENTORY

```text
생산성 분석 / 개요 [11, 기존 화면]
  → 사이클타임 상세 [Full Page · Analysis Workspace]
      KPI → Primary Chart → Selection → 느린 실행 목록 [Breakdown Table 영역]
        → occurrence 상세 [Full Page · 상세 작업]
            식별 정보 → 공정 타임라인 → 품질 표시 → 리니지
              → VOC 생성 진입 [Context Link; 대상 화면은 범위 밖]
              ← VOC의 관련 분석 / 분석으로 돌아가기 링크
        ← 느린 실행 목록으로 복귀 [분석 Context + page-owned 조건 복원]
```

| Surface | 선택 및 §20 근거 |
| --- | --- |
| 사이클타임 상세 | Full Page. 조건 설정·차트·실행 비교의 복잡한 Analysis Workspace([06](06_platform_ui_contract.md) §12.2/§20) |
| 느린 실행 목록 | 같은 페이지의 Breakdown Table. 별도 Management 화면/route를 만들지 않음 |
| occurrence 상세 | **Full Page**. 행에서 출발하지만 긴 anchor, 여러 공정 구간과 정확한 시각 표, 품질 원천, 리니지, VOC 직접 복귀를 함께 검토하는 deep-link 상세 작업. Drawer의 좁은 폭보다 전체 폭과 독립 URL이 적합(§20). 새 archetype을 만들지 않고 Analysis Workspace의 상세 surface로 구성 |
| VOC 생성/복귀 | **Cross-menu Context Link**. 생성 액션은 VOC 메뉴의 생성 진입점으로 이동하며 여기서 폼·Modal·VOC artboard를 만들지 않음. 단일 확인인 소수초 구간 정렬 확인만 공통 Modal 사용 가능(§20/§22) |

## 3. SCREEN SPECIFICATION

| 항목 | 사이클타임 상세 | occurrence 상세 |
| --- | --- | --- |
| Purpose | P95 이상 실행 비교·선택 | 선택 실행의 관측 구간과 품질 근거 확인 |
| Primary action | 선택 구간 분석 / occurrence 열기 | VOC 생성 |
| Input | Global Context + page-owned 조건 | 목적지 occurrence 키 + 출발 분석 Context + 복귀 명세 |
| Output | 동일 계산 세대의 P50/P95·추세·실행 목록 | 단일 occurrence 타임라인·품질 영역·리니지 |
| Secondary actions | 새로고침, 차트 데이터 표, 조건 해제, 목록 CSV, 컬럼 | 느린 실행 목록으로, 타임라인 데이터 표, 신뢰 근거 |
| Route 후보 | `/analytics/cycle-time/detail` | `/analytics/occurrences/{equipmentId}/{entityType}/{anchor}`; 각 경로 segment 무손실 인코딩 |
| Loading / Error | KPI·차트·목록별 상태, Context 변경은 이전 결과 숨김 | 키/권한 검증 후 조회; 타임라인 실패와 품질 미확정 구분 |

### 3.1 Context Capability와 상태 계층

화면 선언 Candidate. [06](06_platform_ui_contract.md) §6/§6.1/§6.4를 소비한다.

| Surface | Time | Equipment | Lot | Metric Version |
| --- | --- | --- | --- | --- |
| 사이클타임 상세 | O | O | △ 검색 보조; 전역 Lot은 미적용 | O 동일 cycle-time 지표 쌍만 적용 |
| occurrence 상세 | △ 출발 분석 참조, 객체 구간을 자르지 않음 | △ 동일 EquipmentID 개념의 출발 집합 참조 | △ 참조/검색 보조 | △ 출발 지표 버전 참조 |
| VOC 진입 | △ | △ | △ | △ — [06] 예시; 실제 VOC 조회 적용은 대상 선언에 따름 |

Scope는 항상 단일 요청·권한 검증 대상이며 헤더에만 선택기가 있다. Site→room_name→StGroup→Equipment 관계, 실무 room_name 권한 기준, 독립 Line 축을 따른다. 상속 세부는 Open이며 Maker→Model→ChamberType→EquipmentID 분류와는 구별한다([ADR-0005](adr/0005-scope-room-name-line-independent.md)).

- **Global**: Scope, Time, roomNames, Equipment Group Condition/고정 Selection, Lot/PPID/Recipe/metric 쌍을 보존한다. 사이클타임 조회는 room_name·Equipment Group을 적용하며 PPID/Recipe도 필터 축으로 받는다. Recipe의 Job 전체/매칭 PRC 구간 조인 범위는 메뉴 정의 Candidate다. occurrence 상세에서는 이 값들을 출발 분석 참조로 보존하고 객체 구간을 자르지 않는다. 전역 Lot/다른 metric 쌍은 미적용 표시한다. 같은 cycle-time metric 쌍이면 적용; 다른 쌍은 보존하고 page-owned cycleTimeVersion을 사용한다. 동일 지표의 전역/페이지 버전 충돌은 오류다.
- **Page Filter**: `cycleTimeVersion`, `granularity=hour|day|week`, `slowSelection=p95AndAbove`, `lotSearch`, `selectedOccurrence`(세 키를 담는 구조화 조건), `sort`가 등록 대상 후보다. 키 이름/인코딩/API는 확정 전이다. room_name·PPID/Recipe는 해당 메뉴의 정의에 따라 모집단에 적용하고, slowSelection/lotSearch는 목록에 적용하고 KPI P95의 모집단을 재귀적으로 줄이지 않는다. 선택 occurrence chip은 기존 조건에 추가하며 교체/해제는 명시 동작이다.
- **Visualization**: zoom, 시간 brush 초안, hover, series visibility. URL 복원 보장 밖이다. P95 꼬리 선택은 시간 구간이 아니라 목록 predicate이므로 전역 from/to로 변환하지 않는다.
- **Annotation**: Selection 영역만 이 문서에서 사용. 영속 주석 객체/범용 편집기를 이번 화면에 만들지 않는다([06] §14).

Overview의 room_name·PPID·Recipe·Equipment Group 두 층은 Global Context로 보존·검증하며 지원 범위에 따라 적용한다(11 §7). 그룹 축은 StGroup / 분임조 / Maker+Model 중 배타적으로 하나이며 Selection은 어떤 축에서도 고정 EquipmentID 목록이다. Overview의 granularity와 다른 지표 버전은 자동 복사하지 않는다. cycleTimeVersion→전역 metric 쌍 매핑은 기존 쌍이 없거나 동일할 때만 검증 후 수행하는 후보 계약이다. 다른 전역 쌍을 덮어쓰지 않는다. mockup은 명시 선택된 cycle-time v4와 단일 EQ-0231, room_name 전체다. 최초 기본 버전/기간을 확정하지 않는다.

### 3.2 식별자 / 왕복 Link 계약

[06](06_platform_ui_contract.md) §6.1/§17/§22가 원본. 아래 envelope는 **의미 구분을 설명하는 Candidate**, 새 전역 URL 키나 완성 API가 아니다.

```text
C = analysisContext {
  scopeId: site-a,
  from: 2026-09-17T00:00:00, to: 2026-09-24T00:00:00,
  roomNames: absent, ppid: absent, recipeIds: absent,
  equipmentGroup: absent, selectedEquipmentIds: [EQ-0231], metricId: cycle-time, metricVersion: 4
}
P = sourcePageState {
  cycleTimeVersion: 4, granularity: day,
  slowSelection: p95AndAbove, lotSearch: absent, sort: cycleTimeDesc
}
D = destinationOccurrence {
  equipmentId: EQ-0231, entityType: JOB_TYPE,
  anchor: 2026-09-23T08:12:00.123456
}
```

`entityType=JOB_TYPE`과 anchor의 시각형 표현은 합성 예시다. `JOB_TYPE`은 확정되지 않은 원천 Job occurrence enum을 표시하는 설명용 기호이며 실제 전송값이 아니다. 분석 grain은 Job으로 확정됐지만 실제 entityType/원천 매핑은 Open이다. Lot ID로 Job을 대체하지 않는다. anchor는 불투명 키로 **전체 정밀도/문자열을 보존**한다. UI 표시를 줄여도 전송·조인은 원본으로 한다. `lotId=LOT-240923-07`은 표시/검색용이지 D의 일부나 대체 키가 아니다. 동일 Lot 검색 결과가 여러 개면 개별 D를 선택한다. anchor 없는 행은 “식별 정보 부족”과 상세/VOC 진입 불가 이유를 표시하며 Lot으로 조인하지 않는다.

| Hop | 목적지 객체 / 전달·복원 |
| --- | --- |
| Overview → 사이클 상세 | C의 두 층/room_name/PPID/Recipe 보존; 사이클 버전만 명시 매핑. 지표별 적용 범위 표시 |
| 차트 → 느린 실행 | 시간 brush는 local. 명시 적용만 C.Time 변경; P95 선택은 P.slowSelection chip 생성. 목록은 C의 적용 모집단 ∩ 선택 predicate |
| 목록 행 → occurrence | D는 행에서 취득. C의 selectedEquipmentIds를 D.equipmentId로 교체하지 않음. P는 복귀용 sourcePageState로 별도 보존 |
| 개별 chart mark → occurrence | mark가 온전한 D를 가진 경우만 가능. `선택 occurrence: EQ-0231 / JOB_TYPE / …` **Page Filter chip 생성** 후 D로 이동. 기존 P95/room_name/chip 유지. 집계 P95 점에는 D가 없으므로 단일 occurrence를 추정해 열지 않음 |
| occurrence → VOC 생성 | destination은 VOC 생성 진입점(아직 vocId 없음). relatedOccurrence=D, transferableContext=C, returnTarget={occurrence route, D, C, source route/P}. P는 VOC 검색필터나 전역 Context로 승격하지 않음 |
| VOC 저장 후 / 취소 → occurrence | VOC 객체는 **vocId**로 식별. 관련 분석/복귀 링크는 returnTarget의 D/C를 재검증해 복원; vocId로 occurrence를 추론하지 않음. 생성 성공을 분석 화면이 추정하지 않음 |
| occurrence → 느린 실행 / browser back | 진입 직전 등록된 URL 소유 C/P 그대로 재검증·복원. 상세에서 본 객체나 변경한 조건으로 출발 Context를 덮어쓰지 않음. chip, 정렬, 집계 단위 유지; 로컬 줌/brush 복원 약속 없음. 결과 숫자는 재계산으로 달라질 수 있음 |

returnTarget는 Registry 목적지 + 검증된 구조화 상태만 허용하는 후보이며 임의 외부 return URL을 받아 조립하지 않는다. VOC 링크는 helper가 destination/보존 Context/적용 Context/미지원/권한을 나누어 처리한다. 복귀 상태 직렬화·크기 제한은 Open; Deferred savedViewToken을 임시 해결책으로 쓰지 않는다. VOC 권한이 분석 권한을 부여하지 않으며 이동·저장·복귀 시 서버가 각각 검증한다. 대상 등록 전 “VOC 연결 준비 중”, 권한 거부 시 “VOC 생성 권한 없음”으로 구분한다. mockup은 연결/권한 허용을 가정한 진입점 예시일 뿐 실제 VOC를 생성하지 않는다.

## 4. WIREFRAME (Candidate)

하나의 1440×2440 root에 1440×1200 artboard 두 개를 40px 간격으로 배치한다. 전체 경로와 Data Trust가 같은 board에 충분히 들어가도록 세로 1200px을 사용한다. 각 board는 동일한 [07](07_app_shell_wireframe.md) 셸: 54px 헤더, 270px `#0f1526` sidebar. 08/09/10/11이 이미 확립한 셸 시각 스타일을 그대로 재사용하고 현재 메뉴와 예시 Scope만 반영한다. 본문은 [DESIGN](../DESIGN.md) dashboard 20px padding/16px section gap, 수치는 tabular-nums, 표 행 최소 32px이다.

### A. 사이클타임 상세 — primary artboard

```text
Header        생산성 분석 / 개요 / 사이클타임 상세     [새로고침]
              사이클타임 상세 · 합성 예시 / 정의 Candidate
Global        [1일][7일][사용자 지정] [09.17 00:00 – 09.24 00:00)
              Equipment [EQ-0231] · wall-clock / Asia/Seoul · Metric cycle-time v4
Global        room_name [전체] · PPID [전체] · Recipe [전체] · Group 조건 [없음]
Page Filter   집계 단위 [일] · 사이클 버전 [v4]
KPI Summary   P50 42.8 분        P95 71.2 분       (동일 모집단 / 단순 평균 아님)
Primary Chart 사이클타임 추세 · 일별 P50/P95 [Zoom][Brush][Reset][데이터 표 보기]
              y=분 0..100, x=09/17..09/23, 두 선에 이름/모양 구분
              P50: 40,42,41,43,44,42.8,45 / P95: 66,68,65,70,69,71.2,74
              Source 소비 계층 mart(예시) · Updated 09.24 00:10 KST · Coverage Unknown
Selection     시간 선택(미적용): [09.23 00:00,09.24 00:00) [선택 구간 분석]
              Page Filter [P95 이상 · ≥71.2분 ×] · 시간 brush와 별개인 목록 조건
Breakdown     느린 실행 목록 · 현재 조건 3건(합성 subset) [Lot 검색][검색][컬럼][CSV]
              EquipmentID / entityType / anchor / Lot / Recipe / 사이클타임 / 열기
              EQ-0231 JOB_TYPE 09.23 08:12:00.123456 LOT-240923-07 RCP-A 92.4분 [열기]
              EQ-0231 JOB_TYPE 09.22 11:00:00.654321 LOT-240922-03 RCP-A 84.6분 [열기]
              EQ-0231 JOB_TYPE 09.21 15:10:00.111111 LOT-240921-02 RCP-B 76.8분 [열기]
Data Trust    Status Unknown · Coverage Unknown · Metric v4 [신뢰 근거]
              Updated 09.24 00:10 KST / 계산 기준 00:08 KST / Data through 00:00 wall-clock(배타)
```

KPI는 전체 기간 통계, 일별 값은 각 bucket 통계로 서로 단순 평균하지 않는다. 3행은 전체 모집단이 아닌 tail subset 예시다. P95 71.2는 동일 계산 세대의 C의 적용 모집단 기준, 동률을 포함하는 `≥` 후보다. P95 정의/동률·미완료 정책은 Open이다. 기본 tail 진입은 Overview의 명시 상세 진입 의도에 대한 Candidate다. 빈 tail을 데이터 미수집으로 해석하지 않는다.

### B. occurrence 상세 — second artboard / VOC 복귀 상태도 같은 surface

```text
Header        생산성 분석 / 사이클타임 상세 / occurrence 상세
              occurrence 상세            [느린 실행 목록으로] [VOC 생성 →]
Global        출발 분석 Context: 09.17–09.24 / EQ-0231 / cycle-time v4
              Time·Equipment·Metric은 참조 보존; 객체 구간을 자르지 않음
Page Filter   복귀할 목록 조건: 일별 · P95 이상 ≥71.2분
Object        EquipmentID EQ-0231 / entityType JOB_TYPE / anchor 2026-09-23T08:12:00.123456
              Lot LOT-240923-07 (검색 보조) · Recipe RCP-A · 사이클타임 92.4분
Timeline      공정 타임라인 [데이터 표 보기] — 관측 구간 예시 / wall-clock
              x=08:12..09:44:24.123456; PRC 01 08:18–08:44, PRC 02 08:50–09:38
              두 개의 관측 구간 bar / 나머지 공백은 분류 미확정(대기/비Process 추정 안 함)
Quality       품질 표시 · Unknown / 정확한 품질 데이터 원천 Open
              품질 필드·판정 기준·null 의미 확정 전. 정상/불량·수율로 해석하지 않음
Lineage       occurrence_directory → 소비 계층 view/mart → 이 상세 (논리 경로 예시)
              anchor 무손실 보존 · 원천 계약/계산 세대 상세 [신뢰 근거]
VOC linkage   [VOC 생성 →]는 헤더 액션 한 곳. 이 실행과 분석 조건 함께 전달
              VOC에서 돌아오면 이 occurrence와 출발 분석 조건 복원 (복귀 경로 안내)
Data Trust    Updated 09.24 00:10 KST / 계산 기준 00:08 KST / Metric v4(참조)
              Coverage Unknown · Status Unknown · Data through 00:00 wall-clock(배타)
```

품질 표시와 Data Trust는 역할이 다르다. 전자는 occurrence에 대한 품질 근거 자리이며 후자는 조회 결과의 신뢰 정보다. `01`은 품질 필드 계약 필요성만 명시하고 `02`에는 특정 품질 필드·타임라인 상세 정의가 없다. 타임라인+품질이라는 화면 범위는 REQUIREMENTS §2.1/§3에서 확인된다. 따라서 원문에 없는 불량률/결함수/품질점수는 만들지 않는다.

차트 데이터 표는 동일 영역에 펼치는 로컬 대체 표현(목업은 접힘)이며 A는 위 7개 bucket/P50/P95/결측 여부, B는 2개 구간/시작/끝/관측 상태의 정확한 값이다. Breakdown Table과 다른 접근성 표다. 신뢰 근거는 source·lineage·원천 계약 버전·계산 세대·coverage 분모/분자·assessment 이유를 펼친다. 목업은 버튼만 제공한다. Scope/키/권한 오류나 미지원 Context는 해당 조건일 때만 추가하는 상태이며 기본 board에 상태 갤러리를 넣지 않는다.

## 5. CONCEPTUAL COMPONENT MAP

| 영역 | Layer / 책임 |
| --- | --- |
| PageHeader / GlobalContextBar / PermissionGuard / Context Link | Platform/Kernel. Registry·Context·권한·내비게이션 ([06] §4–8/§17/§22) |
| AnalysisChartFrame / PlatformDataTable / DataTrustIndicator / StateFeedback | Platform. 상호작용·프레임·상태·접근성 ([06] §13/§15–19) |
| CycleTimeSummary / CycleTimeTrend / SlowExecutionColumns | Domain. 분위수·모집단·열 의미·row action |
| **OccurrenceProcessTimeline** | **Domain**. 해당 occurrence의 공정 관측 구간과 원천 관계. 설비 속성 유효기간을 그리는 `EquipmentValidityTimeline`과 다른 책임이며 재사용하지 않음. `06` §13/§22는 `WaferJourneyTimeline`도 별도 Domain Component로 이미 나열한다 — 그 컴포넌트는 Wafer의 이송 경로/체류를 그리는 것으로 추정되며, 이 컴포넌트는 한 occurrence의 공정 관측 구간만 그린다. 둘이 같은 데이터를 다른 그레인으로 보여주는 관계인지, 완전히 분리된 관계인지는 원문에 명시가 없어 **Open**이다 — 대체·부분집합 관계를 이 문서가 임의로 가정하지 않는다 ([06] §13–14) |
| OccurrenceQualityRegion / OccurrenceIdentity / VOC 관련 실행 바인딩 | Domain. 품질 의미·키 표시·관련 객체 의미. Context 운반 자체는 helper 소유 |

이름은 개념적 Candidate이며 실제 React/API 선언이 아니다. 기존 공통 컴포넌트의 책임을 소비하되 이 한 화면의 타임라인을 Platform으로 승격하지 않는다.

## 6. DATA REQUIREMENTS

- **조회 계약**: API는 소비 계층 view/mart·occurrence_directory 조인 결과를 읽는다. 원천 DB 직접 조회 금지. D의 entityType별 조인과 관계 키를 서버가 검증하고 lotId fallback을 허용하지 않는다. 기간 밖 공정 구간을 단순 global clip으로 잃지 않는 occurrence 조회가 필요하다. 근거: [01](01_architecture_and_data_contract.md) 전체 아키텍처/대응, [06](06_platform_ui_contract.md) §6.1; 전체 상세 구간 표현은 이 문서 Candidate.
- **지표 정의 Open**: cycle-time metricId, Job grain의 시작/끝 이벤트, 기간 귀속(시작/완료), 미완료 제외, 분위수 알고리즘·동률, 단위·null·coverage 분모, bucket 경계가 확정돼야 한다. v4/분/완료 interval은 예시다. 설비별/일별 P95를 평균하지 않으며 downsampling과 지표 계산을 분리한다. 근거: [01](01_architecture_and_data_contract.md) 집계 가능성/대응, [02](02_domain_menus.md) 생산성 분석/지표관리.
- **Context/URL**: C와 P의 등록된 공개 스키마, 무손실 D, Return 계약이 필요하다. 반복 집합 정규화·공집합 표식, 단일값 중복 오류, 미등록 키 비적용, v 디코더, 지표 쌍 원자성은 전역 계약 그대로다. URL 없는 값을 세션으로 보충하지 않는다. Equipment Group Condition은 사용한 축 그대로 보존하며 현재 결과를 재평가할 수 있고, Selection은 명시 ID 목록을 그대로 유지한다. 근거: [06](06_platform_ui_contract.md) §6.1/§6.4, [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md), [11](11_productivity_overview_wireframe.md) §3.1/§7.
- **시간**: naive 초 정렬 `[from,to)`와 원천 anchor 전체 정밀도를 분리한다. Z/offset/한쪽 경계 누락은 오류. 기본 기간 공급과 defaultRangeTo/R 조건은 [06 CTX-TIME](06_platform_ui_contract.md#ctx-time)을 소비하며 최초 Δ는 Open이다. 다중 설비 같은 축 집계는 요청 전체를 덮는 서버 timeDomain assertion 필요; 미확인/불일치면 error로 차단하고 단일 설비/분리 조회 안내. assertion 공급자는 Open이다.
- **타임라인/품질 Open**: 소비 계약의 공정 구간 이름·시작/끝·부모 occurrence 관계·겹침/null 의미·품질 필드와 statusSource가 필요하다. 빈 간격으로 대기나 불량을 추정하지 않는다. `01`/`02`만으로 구체 품질 스키마는 확정할 수 없다. 근거: [01](01_architecture_and_data_contract.md) 대응, [02](02_domain_menus.md) 허용 지표 경계, [PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) §2.1/§3.
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
| Candidate | occurrence Full Page, 두 artboard, P50/P95 일별 추세(분포 대신 선택), 3행 tail 예시, 품질 자리, 복귀 조건 strip |
| Candidate | P95 ≥ predicate, 메뉴별 Recipe 조인 범위, 선택 chip·정렬·returnTarget의 page-owned 계약. Kernel 등록/검증 필요 |
| Open — Domain/Data | Job 지표 세부/분위수·기간 귀속·버전 ID·timeline 관계·품질 원천/필드·coverage/assessment 공급자 |
| Open — Domain/Data | `OccurrenceProcessTimeline`과 `06` §13/§22가 이미 나열한 `WaferJourneyTimeline`의 관계(같은 데이터의 다른 그레인 vs 완전 분리) |
| Open — Platform | 복귀 envelope 직렬화/크기 제한, Registry route/권한명, timeDomain assertion 공급, Scope 상속, 첫 Δ, 실제 조회량 |
| Deferred | VOC 화면, 영속 주석 편집, 저장된 뷰, 자유 위젯 엔진 |

## 9. UX REVIEW (문서 단계)

2026-09-24 인터뷰 반영 검수는 이 Markdown의 계약·용어·왕복 규칙을 대상으로 했다. 아래의 기존 HTML/Step 2 검증 기록은 수정 전 산출물의 이력이며, 이번 작업에서 HTML을 갱신하거나 다시 검증한 결과가 아니다.

Step 1 자체 검수 완료 후 Step 2 작성: [06](06_platform_ui_contract.md)/[01](01_architecture_and_data_contract.md)/[02](02_domain_menus.md)/[CONTEXT](../CONTEXT.md)를 다시 대조했다. §6 각 항목·§7 각 규칙에 근거를 붙였고 새 키/수치/배치는 Candidate, 데이터 필드 미정은 Open으로 남겼다.

- P95 → 표 → occurrence → 공정 타임라인 → VOC → 동일 occurrence → 목록까지 D/C/P 소유권이 이어진다. 상세를 위해 selectedEquipmentIds를 단일 D로 덮어쓰지 않는다.
- Global 영역은 control strip, Page Filter는 라벨과 사각 chip, object identity는 별도 패널로 구분한다. occurrence 상세에서는 Time/Equipment가 참조 상태임을 명시한다.
- 표 3건을 모집단 전체로 오해하지 않도록 subset 표시. 공정 실행 구간(PRC)은 설비의 room_name 분류와 구분한다. 품질 미확정을 정상 판정으로 채우지 않는다.
- Full Page 선택은 내용 무게/독립 복귀 대상이라는 근거가 있으며, 느린 실행은 별도 archetype으로 분리하지 않았다.
- 이것은 문서 검수다. 실제 서버 조인·권한·URL 왕복·계산 세대 통합 검증과 최종 compliance 승인을 대체하지 않는다.

Step 2 정적 검사: HTML 태그 균형, 필수 script 2개, 이벤트 핸들러 없음, root/preview 1440×2440 일치, 1440×1200 board 2개, 54px/270px 셸, flex/grid gap, inline SVG 차트 2개, anchor 전체 문자열, 문서 9개 필수 절을 확인했다. `support.js`는 Artifact 런타임이 공급하는 파일이라 이 저장소에는 없으며, 그 실제 동작은 검증하지 않았다. 브라우저 렌더 검수는 ego_cli bootstrap sandbox 연결 실패와 대체 Playwright 도구의 승인 제한(approval policy never)으로 미실행이다. 정적 검사를 시각/실행 검증으로 간주하지 않는다.

## OPEN QUESTIONS / RISKS

- **비교 모집단(Open — 이 화면 분석 로직 담당)**: “P95 이상 느린 실행”이 Recipe/PPID가 다른 Job을 어떤 비교 기준으로 묶는지 명시해야 한다. 위 혼합 Recipe 합성 행은 통계적 비교 가능성의 승인 근거가 아니다. 모집단 구성·분리/포함 기준은 이 메뉴가 정하며 Kernel 규칙으로 올리지 않는다.
- **Module/Slot 타임라인(Open — 이 화면 데이터/표현 계약)**: XFR/FNC/PRC 로그의 grain은 EquipmentID 하위 Module/Slot으로 확정됐다([CONTEXT](../CONTEXT.md)). 상세 구간과 데이터 표에 Module/Slot 참조 및 부모 Job occurrence 관계를 어떻게 표시·연결할지 정해야 한다. 현재 PRC 2개 구간 예시는 이 세부 단위를 표현하지 못하므로 완성된 타임라인 계약으로 보지 않는다. 화면 전체 재설계는 이번 범위에 포함하지 않는다.
- CFG는 설비 단위 기록이며 Module 대상 정보는 개별 값의 속성이다. 분석 설정은 Job 시작 시점 값으로 충분하다. CFG cross-menu 이동은 Deferred이며 이 화면에 신규 이동을 추가하지 않는다(`06` §22).

- 이 문서는 09의 stacked two-board 구조와 08/09/10/11이 확립한 셸 스타일을 따른다.
- `02`에 구체 품질/타임라인 schema가 없으므로 REQUIREMENTS §2.1/§3을 화면 범위 근거로 쓰고 Data 계약을 꾸며내지 않았다.
- link helper/Registry/Return 계약이 구현되지 않은 상태다. 정적 목업의 앵커 이동은 제품 왕복 검증이 아니다. `support.js`는 Artifact 런타임이 공급하는 파일이라 이 저장소에는 없다.
- 선택형 grok/omp 자문은 사용하지 않았다. 원문 대조로 판단 가능한 범위이며 외부 시스템에 문서를 전송하지 않았다.
