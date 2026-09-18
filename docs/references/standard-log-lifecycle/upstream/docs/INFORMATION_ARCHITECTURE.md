# Information Architecture

## 1. Navigation

초기 Navigation은 5개로 제한한다.

```text
Models
Validate
Defects
Specs
Reports
```

### Models

설비 모델 중심의 Lifecycle 관리.

- Model List
- Model Detail
- Development Stage
- Alpha / Beta Round History
- Gate Status
- Model Documents

### Validate

실제 Sample 기반 검증 작업.

- Sample selection
- Validation Run
- Rule Result
- Raw Event exploration
- Parser result
- Data validation
- Comparison

### Defects

모델과 Round를 가로질러 결함을 관리.

- Open defects
- Severity
- Linked Rule
- Affected Models
- Fix status
- Re-test status

### Specs

표준 로그 스펙과 Validation Rule 관리.

- Spec version
- Rule set
- Rule metadata
- Effective date
- Mandatory / Optional
- Rule change history

### Reports

관리/완료 판정을 위한 조회.

- Model readiness
- Alpha/Beta status
- Defect trend
- Pass trend
- Round count
- Completion evidence

---

## 2. Page Tree

```text
Models
├─ Model List
└─ Model Detail
   ├─ Overview
   ├─ Alpha
   │  ├─ Round #1
   │  ├─ Round #2
   │  └─ ...
   ├─ Beta
   │  ├─ Round #1
   │  └─ ...
   ├─ Defects
   ├─ Documents
   └─ Activity

Validate
├─ New Validation
├─ Validation Run
│  ├─ Summary
│  ├─ Rules
│  ├─ Raw Log
│  ├─ Parser
│  ├─ Data
│  └─ Compare
└─ Validation History

Defects
├─ Defect List
└─ Defect Detail
   ├─ Evidence
   ├─ Occurrences
   ├─ Fix History
   └─ Re-test History

Specs
├─ Spec Versions
├─ Rule Sets
└─ Rule Detail

Reports
├─ Lifecycle Overview
├─ Gate Readiness
└─ Quality Trends
```

---

## 3. Core Screens

초기 UX 설계의 핵심 화면은 다섯 개다.

1. Model List
2. Model Detail
3. Validation Workbench
4. Validation Result / Rule Detail
5. Defect Detail

---

## 4. Model List

목표:

> 어떤 모델이 어느 단계에 있고 무엇 때문에 막혀 있는지 빠르게 찾는다.

필수 컬럼:

```text
Model
Vendor
Equipment Type
Current Stage
Current Round
Pass Rate
Open Critical
Open Total
Last Validation
Owner
```

필터:

```text
Stage
Vendor
Equipment Type
Owner
Gate Status
Has Critical Defect
```

상태 표현:

```text
Kickoff
Alpha
Beta
Complete
Blocked
```

---

## 5. Model Detail

상단에는 현재 상태와 Lifecycle을 먼저 보여준다.

```text
Model X100
TEL · Etch · Owner: Kim

Kickoff ✓ ── Alpha ✓ ── Beta ● ── Complete ○
```

그 아래 우선순위:

1. Gate blocker
2. Current Round
3. Validation quality summary
4. Open defects
5. Round history
6. Documents / metadata

### Gate Blocker panel

```text
Beta Gate

[PASS] Mandatory Rules
[FAIL] Critical Defects: 2 open
[PASS] Parser
[WARN] Data Coverage: 98.2% / target 99%

2 blockers
```

---

## 6. Validation Workbench

이 화면은 가장 중요한 작업 화면이다.

### Views of a Validation Run

Workbench는 한 레이아웃이 아니라 Run의 여러 뷰다.

1. **New Validation / Sample ingest**
   파일 추가(txt·zip), 처리 순서, 제외, 업로드/처리/제외 건수.
   Equipment identity는 Model에서 오고 로그에서 읽지 않는다.
   선택 파일은 모두 그 Model의 로그여야 한다는 안내가 파일 선택 시점에 있다.
2. **Summary** — 판정 문장 먼저 (형식 / 파서 / 품질 / 미검증). 차트는 보조.
3. **Rules** — Rule PASS/FAIL, Expected vs Observed.
4. **Findings / Raw Log** — 엑셀식 결함 그리드 + 선택 행 Evidence.
   3-pane explorer(필터 | 이벤트 | 상세)는 이 뷰의 조사 모드다.
5. **Parser** — ParsedRecord, 실제 탄 라우팅 경로, 원본 줄 링크.
6. **Data** — 추출 테이블 품질. 웨이퍼 간트·시간대 히트맵은 여기 또는 Summary 하단.

### Findings view constraints

- 기본 필터: Error + Warning. Info는 선택. NotChecked는 심각도가 아니라 검사 상태.
- 규칙별 묶기 후 대표 행. 상세: 원본 줄, 기대 vs 관측, 추출 필드, 규칙 설명.
- 사람 검토(미검토/확인중/조치완료)는 Rule Result와 독립. 검토 완료 ≠ 검증 통과.
- 중복 키 Failure는 dictionary 변환 전 두 위치를 모두 보여 준다.

### Raw Log 뷰 (3-pane explorer, investigation mode)

```text
┌───────────────────────────────────────────────────────────────┐
│ Model / Stage / Round / Sample / Run                         │
├───────────────┬───────────────────────────┬───────────────────┤
│ Filters       │ Event Log                 │ Event Detail      │
│               │                           │                   │
│ Validation    │ line / time / event       │ Fields            │
│ Rule          │ status marker             │ Rule failures     │
│ Event Type    │                           │ Parsed output     │
│ Module        │                           │                   │
│ Lot / Slot    │                           │                   │
└───────────────┴───────────────────────────┴───────────────────┘
```

### Required interactions

- FAIL rule 선택 → 해당 Event만 필터
- Event 클릭 → 원본 필드 / parsed result / failure 표시
- Rule 클릭 → Expected / Observed 표시
- Failure → Defect 생성
- Defect 생성 시 Evidence 자동 포함
- Previous Round와 비교

---

## 7. Validation Result

Summary와 Rule list를 분리한다.

### Summary

```text
Validation Run #42

PASS       187
FAIL         6
WARNING      3
SKIPPED      1

Overall 96.4%
```

### Rule table

```text
STATUS  RULE       CATEGORY     RESULT       FAILURES
----------------------------------------------------
PASS    EVT-001    Format       100%              0
FAIL    EVT-031    Pairing       99.4%             7
WARN    DAT-014    Coverage      98.2%           123
```

### Rule Detail

```text
EVT-031 Process Start-End Pairing

Expected
PROCESS_START → PROCESS_END

Observed
Matched     1,284
Unmatched       7

Failures
#1842
#2231
#8122
...
```

---

## 8. Defect Detail

Defect는 글쓰기 화면이 아니라 Investigation 화면으로 설계한다.

우선순위:

1. Title / Severity / Status
2. Expected vs Observed
3. Evidence
4. Occurrences
5. Fix information
6. Re-test history
7. Activity

```text
DEF-183
PROCESS_END missing
Major · Vendor Fixing

Expected
PROCESS_START → PROCESS_END

Observed
7 unmatched PROCESS_START events

Evidence
alpha_04_01.log : line 4312
alpha_04_03.log : line 812
alpha_04_03.log : line 1332

History
Detected → Sent to Vendor → Fixed → Retest Failed
```

---

## 9. Comparison UX

반복 개발 구조에서는 비교가 핵심이다.

### Round comparison

```text
Alpha Round #3            Alpha Round #4
------------------------------------------------
Pass 92.1%                Pass 97.8%
Fail 14 rules             Fail 5 rules
Open Defects 11           Open Defects 4

Fixed       8
Regressed   2
New         1
Unchanged   3
```

### Rule comparison

```text
EVT-031

Round #3    FAIL  41 occurrences
Round #4    FAIL   7 occurrences

Improved -82.9%
```

---

## 10. Object Relationships

```text
EquipmentModel
  ├─ uses → SpecVersion
  ├─ has → DevelopmentStage
  ├─ has → ValidationRound
  └─ has → Defect

ValidationRound
  ├─ belongs to → Stage
  ├─ has → Sample
  ├─ has → ValidationRun
  └─ produces → GateEvidence

Sample
  ├─ belongs to → EquipmentModel     (Equipment identity의 유일한 소스)
  ├─ has → Files[]                   (hourly txt 또는 zip, 사용자 확인 순서)
  └─ does not contain EquipmentId

ValidationRun
  ├─ uses → RuleSetVersion
  ├─ uses → ParserVersion
  ├─ uses → files[] as an ordered session
  ├─ file boundary is not a lifecycle end
  ├─ snapshots SpecVersion, RuleSetVersion, ParserVersion, RoutingProfile
  ├─ produces → RuleResult
  └─ produces → ParsedData

RuleResult
  └─ has → FailureInstance

FailureInstance
  ├─ references → SourceEvent
  └─ linked to → Defect

Defect
  ├─ has many → FailureInstance
  ├─ has → Fix
  └─ has → Retest
```

---

## 11. Status Model

### Development Stage

```text
Kickoff
Alpha
Beta
Complete
```

### Gate State

```text
Not Ready
Ready for Review
Passed
Passed with Exception
Blocked
```

### Defect State

```text
Open
Vendor Fixing
Ready for Retest
Retest Failed
Verified
Closed
Accepted Exception
```

### Validation Result State

```text
Pass
Fail
Warning
Skipped
Not Applicable
```

검사 상태(Pass/Fail/Warning/Skipped/NotApplicable/NotChecked)와
사람 검토 상태(Unreviewed / In Review / Acknowledged)와
Defect 상태는 서로 대체하지 않는다.

---

## 12. Design Principle

IA는 다음 질문에 가장 빨리 답하도록 설계한다.

```text
이 모델은 지금 어느 단계인가?
왜 다음 단계로 못 넘어가고 있는가?
최근 검증에서 무엇이 실패했는가?
실패 근거는 정확히 어디인가?
이 결함은 이전에도 있었는가?
Vendor 수정 이후 실제로 개선됐는가?
Alpha/Beta 완료 판정 근거는 무엇인가?
```
