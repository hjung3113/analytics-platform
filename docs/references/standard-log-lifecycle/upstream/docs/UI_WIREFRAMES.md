# UI Wireframes

> Low-fidelity wireframes for the initial Standard Log Lifecycle product concept.

These wireframes focus on **information hierarchy and workflow**, not visual styling.

---

# 1. Model List

Goal:

> 전체 설비 모델의 현재 개발 단계와 Blocker를 빠르게 확인한다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Standard Log Lifecycle                                                     [Search...]        │
├───────────────┬──────────────────────────────────────────────────────────────────────────────┤
│               │ Models                                                   [+ New Model]      │
│  Models       │                                                              │              │
│  Validate     │ [Stage ▼] [Vendor ▼] [Equipment Type ▼] [Owner ▼] [More ▼] │              │
│  Defects      │                                                              │              │
│  Specs        │ ───────────────────────────────────────────────────────────────┤              │
│  Reports      │ MODEL       VENDOR     STAGE    ROUND   PASS    CRIT  OPEN   LAST RUN         │
│               │ ───────────────────────────────────────────────────────────────┤              │
│               │ X100        TEL        Beta     #2      98.4%    1     2     Sep 12           │
│               │ X200        TEL        Alpha    #4      91.2%    3     8     Sep 11           │
│               │ NX-01       Vendor A   Alpha    #3      84.3%    7    17     Sep 10           │
│               │ ABC-300     Vendor B   Complete -      100%      0     0     Aug 30           │
│               │                                                               │              │
│               │ Legend:  Blocked / In Progress / Complete                    │              │
└───────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

### Interaction

- Row click → Model Detail
- `CRIT > 0` → blocker 강조
- Stage / Vendor / Owner filtering
- default sort: blocker severity → latest activity

---

# 2. Model Detail

Goal:

> 현재 모델이 어디까지 왔고, 다음 단계로 못 넘어가는 이유가 무엇인지 보여준다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ X100                                                                                         │
│ TEL · Etch · Owner: Kim                                           [Edit] [Start Validation] │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│ Development Lifecycle                                                                        │
│                                                                                              │
│   Kickoff ✓ ───────── Alpha ✓ ───────── Beta ● ───────── Complete ○                          │
│                                      Current                                                 │
│                                                                                              │
├──────────────────────────────┬───────────────────────────────────────────────────────────────┤
│ Beta Gate                    │ Current Round                                                 │
│                              │                                                               │
│ ✓ Mandatory Rules           │ Beta Round #2                                                 │
│ ✕ Critical Defects     1    │ Sample: fab-lot-20260912-01                                  │
│ ✓ Parser                     │ Last Run: Sep 12 10:43                                        │
│ ! Data Coverage      98.2%   │                                                               │
│ ✓ Alpha Gate                 │ PASS       187                                                 │
│                              │ FAIL         4                                                 │
│ BLOCKED                      │ WARNING      2                                                 │
│ 1 blocker                    │                                                               │
├──────────────────────────────┴───────────────────────────────────────────────────────────────┤
│ Open Defects                                                                                │
│                                                                                              │
│ [Critical] DEF-183  PROCESS_END missing                  Vendor Fixing                       │
│ [Major]    DEF-177  Slot context mismatch                Ready for Retest                    │
│                                                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Validation History                                                                          │
│                                                                                              │
│ STAGE   ROUND   DATE       PASS      FAIL RULES   OPEN DEFECT   RESULT                         │
│ Beta    #2      Sep 12     98.4%          4            2        Blocked                       │
│ Beta    #1      Sep 05     95.7%          9            5        Failed                        │
│ Alpha   #4      Aug 27     99.2%          2            0        Passed                        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Principle

Dashboard cards are secondary. The primary visual is:

```text
Lifecycle → Gate blocker → Current round → Defects → History
```

---

# 2.5 New Validation / Sample ingest

Goal:

> 이 Run이 어떤 파일 집합을, 어떤 Model identity와 프로필로 검증하는지 확정한다.

```text
┌─────────────────────────────────────────────────────────────────┐
│ New Validation · X100 / Beta / Round #2                         │
├─────────────────────────────────────────────────────────────────┤
│ Model        X100 (Equipment identity — 로그에 없음)              │
│ Spec         2026.3          Parser snapshot  [commit/version]  │
│ Profile      routing from Model  · 사용자 수정 N건               │
├──────────────────────────────┬──────────────────────────────────┤
│ Files                        │ Session                          │
│ [drop txt / zip]             │ uploaded 4  process 3  exclude 1 │
│                              │ order: 00 → 01 → 02  (처리 순서)  │
│ eventlog...00.txt.zip   1    │ 파일명 시각 ≠ 레코드 재정렬         │
│ eventlog...01.txt.zip   2    │                                  │
│ eventlog...02.txt.zip   3    │ 선택한 파일은 모두 이 Model        │
│ random_dump.txt       skip   │                                  │
└──────────────────────────────┴──────────────────────────────────┘
│ [Cancel]                                      [Start Validation] │
└─────────────────────────────────────────────────────────────────┘
```

- EquipmentId 입력란을 Sample마다 다시 두지 않는다. Model이 소스다.
- 개발 중 모델은 표시명이 로그에 없어도 된다. 그 사실이 화면에 드러나야 한다.
- 실행 직전 최종 적용 설정(스펙/라우팅/품질 규칙) 요약을 보여 준다.

---

# 3. Validation Workbench

Goal:

> FAIL rule에서 실제 원본 Event와 Parser 결과까지 한 화면에서 조사한다.

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ X100 / Beta / Round #2 / Run #42                              [Compare #1] [Export] [Complete Run]      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Search raw log............................................................] [Time ▼] [Failures only ✓] │
├──────────────────────┬──────────────────────────────────────────────────────┬───────────────────────────┤
│ FILTERS              │ EVENT LOG                                            │ EVENT DETAIL              │
│                      │                                                      │                           │
│ Validation           │ 10:42:01.231 LOT_START                     ✓         │ Timestamp                 │
│ ☑ Fail (11)          │ 10:42:01.447 MODULE_ENTER                  ✓         │ 10:42:04.127              │
│ □ Warning (2)        │ 10:42:02.913 PROCESS_START                 ✓         │                           │
│ □ Pass               │ 10:42:04.127 PROCESS_START                 ✕         │ Event                     │
│                      │ 10:42:05.333 ROBOT_MOVE                    ✓         │ PROCESS_START             │
│ Rule                 │ 10:42:06.027 MODULE_EXIT                   ✓         │                           │
│ ☑ EVT-031            │                                                      │ Fields                    │
│ □ EVT-014            │  ─────────────────────────────────────────────────   │ Module     PM1            │
│                      │  Failure: EVT-031                                    │ Lot        LOT-A31        │
│ Event Type           │  PROCESS_START has no matching PROCESS_END           │ Slot       03             │
│ ☑ PROCESS_START      │                                                      │ Wafer      W03            │
│ □ PROCESS_END        │                                                      │                           │
│                      │                                                      │ VALIDATION                │
│ Module               │                                                      │                           │
│ PM1                  │                                                      │ ✕ EVT-031                │
│                      │                                                      │ Start-End Pairing         │
│ Lot                  │                                                      │                           │
│ LOT-A31              │                                                      │ [View Rule]               │
│                      │                                                      │ [Create Defect]           │
│                      │                                                      │                           │
│                      │                                                      │ PARSED DATA               │
│                      │                                                      │ ProcessStart = 10:42:04   │
│                      │                                                      │ ProcessEnd   = null        │
└──────────────────────┴──────────────────────────────────────────────────────┴───────────────────────────┘
```

### Key interactions

1. Failed Rule 클릭
2. 해당 Failure Event만 자동 필터
3. Event 선택
4. 우측에서 Raw fields + Validation + Parsed Data 동시에 확인
5. `Create Defect`
6. Evidence 자동 첨부

### This layout is the Raw Log / investigation mode

Summary / Parser / Data / Rules는 같은 Run의 다른 뷰다. 3-pane에 다 넣지 않는다.

Parser 뷰에 필요한 것:

- 표와 상세가 같은 라우팅 판정. 예: `EventId 불일치 → Status 일치 → Trigger 평가 안 함`.
- 라우팅 상태와 lifecycle 평가 상태 분리. 파일 경계 NotChecked를 Unrouted와 섞지 않음.
- 원본 파일·줄로 돌아가는 링크. 입력 레코드와 출력 행 1:1 가정 금지.

Summary 뷰에 필요한 것:

```text
판정: 형식 오류 있음 · 파서 실행 가능 · 품질 확인 필요 · 미검증 6건
원인: EVT-031 7 · duplicate key 14
[오류 분석] [미검증 보기]

(보조) 시간대 결함 건수/비율 히트맵 → Findings 필터로 연결
(상세) 웨이퍼 간트, 필드 충족률 — 첫 화면을 차지하지 않음
```

- 정상 비율 막대가 FAIL을 가리지 않게 한다.
- 히트맵 셀은 건수와 분모를 구분. 0 / 미검증 / 로그 없음을 같은 빈 칸으로 그리지 않는다.
- 같은 Run의 표·상세·요약 숫자가 모순되면 와이어프레임 결함이다.

---

# 4. Validation Result / Rule Detail

Goal:

> 어떤 규칙이 왜 실패했는지 Expected / Observed / Evidence 구조로 보여준다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Validation Run #42                                                                           │
│ X100 · Beta Round #2 · fab-lot-20260912-01                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ PASS 187          FAIL 6          WARNING 3          SKIPPED 1             Overall 96.4%     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ [All 197] [Failed 6] [Warnings 3]                     [Category ▼] [Search Rule...]          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ STATUS  RULE       CATEGORY       RESULT         FAILURES                                     │
│ ✓       EVT-001    Format         100%                 0                                      │
│ ✕       EVT-031    Pairing         99.46%              7        ← selected                    │
│ !       DAT-014    Coverage        98.20%            123                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ EVT-031 · Process Start-End Pairing                                      [Create Defect]     │
│                                                                                              │
│ Expected                                                                                     │
│                                                                                              │
│     PROCESS_START ───────────────────────→ PROCESS_END                                       │
│                                                                                              │
│ Observed                                                                                     │
│                                                                                              │
│     Matched        1,284                                                                    │
│     Unmatched          7                                                                    │
│     Success         99.46%                                                                  │
│                                                                                              │
│ Failure Instances                                                                            │
│                                                                                              │
│ #1842   10:42:04  PM1  LOT-A31  Slot 03        [Open in Workbench]                          │
│ #2231   10:47:18  PM2  LOT-A31  Slot 07        [Open in Workbench]                          │
│ #8122   11:21:44  PM1  LOT-A32  Slot 01        [Open in Workbench]                          │
│ ...                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 5. Defect Detail

Goal:

> 결함의 설명보다 실제 Evidence와 재검증 이력을 중심으로 보여준다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ DEF-183 · PROCESS_END missing                                                                │
│ [Critical] [Vendor Fixing]                                X100 · Beta · EVT-031             │
│                                                                                 [Edit]       │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Expected                                      │ Observed                                      │
│                                               │                                               │
│ PROCESS_START → PROCESS_END                   │ PROCESS_START                                 │
│                                               │    ↓                                          │
│                                               │ ROBOT_MOVE                                    │
│                                               │    ↓                                          │
│                                               │ MODULE_EXIT                                   │
│                                               │                                               │
│                                               │ PROCESS_END missing                           │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Occurrences                                                                                  │
│                                                                                              │
│ 7 occurrences · 3 sample files · First seen Alpha #4 · Last seen Beta #2                    │
│                                                                                              │
│ SAMPLE                    LINE      MODULE   LOT       SLOT     RUN                            │
│ fab-lot-20260912-01       4312      PM1      LOT-A31   03       #42       [Open Evidence]    │
│ fab-lot-20260912-01       8122      PM1      LOT-A32   01       #42       [Open Evidence]    │
│ alpha-04-03.log            812      PM2      TEST-07   04       #31       [Open Evidence]    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Fix / Retest                                                                                 │
│                                                                                              │
│ Sep 03   Detected                        Validator A                                          │
│ Sep 04   Sent to vendor                  Owner B                                              │
│ Sep 08   Vendor fix received             FW 1.2.14                                           │
│ Sep 11   Retest                          FAIL · 2 occurrences                                 │
│ Sep 12   Additional fix requested                                                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Defect creation modal

Defect를 새로 만들 때 사용자가 원본 근거를 다시 입력하지 않게 한다.

```text
Create Defect

Title        [PROCESS_END missing________________]
Severity     [Critical ▼]
Rule         EVT-031
Model        X100
Stage        Beta
Round        #2

Evidence     7 selected failure instances
              ✓ #1842
              ✓ #2231
              ✓ #8122

Expected     PROCESS_START → PROCESS_END
Observed     7 unmatched PROCESS_START

[Cancel]                              [Create Defect]
```

---

# 6. Round Comparison

Goal:

> Vendor 수정 이후 실제로 무엇이 개선되고 무엇이 회귀했는지 본다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Compare Validation Rounds                                                                    │
│                                                                                              │
│ Alpha #3                                           Alpha #4                                  │
│ Aug 19                                             Aug 27                                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Pass Rate             92.1%                      → 99.2%                                     │
│ Failed Rules              14                      → 2                                         │
│ Open Defects              11                      → 0                                         │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Changes                                                                                      │
│                                                                                              │
│ ✓ Fixed          12                                                                          │
│ ✕ Regressed       1                                                                          │
│ + New             1                                                                          │
│ = Unchanged       1                                                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE       BEFORE                     AFTER                  CHANGE                           │
│ EVT-031    FAIL · 41 occurrences      FAIL · 7 occurrences   Improved 82.9%                  │
│ EVT-041    FAIL · 3                   PASS                   Fixed                            │
│ DAT-014    PASS                       FAIL · 12              Regression                       │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 7. Specs / Rule Set

Goal:

> 현재 모델이 어떤 표준 로그 스펙/Rule version으로 검증됐는지 명확히 한다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Standard Log Spec                                                                            │
│                                                                                              │
│ Version [2026.3 ▼]       Effective 2026-08-01       Status: Active                          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY        RULES     MANDATORY     FAILING MODELS                                       │
│ Format             31          31              2                                              │
│ Event              74          61              5                                              │
│ Sequence           22          19              3                                              │
│ Context            41          28              8                                              │
│ Data               29          18              4                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE       NAME                           LEVEL       STATUS                                  │
│ EVT-031    Process Start-End Pairing      Mandatory   Active                                  │
│ EVT-032    Module transition order        Mandatory   Active                                  │
│ DAT-014    Required context coverage      Mandatory   Active                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 8. Report / Lifecycle Overview

Goal:

> 관리자는 모든 모델의 개발 상태와 Blocker만 빠르게 본다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Lifecycle Overview                                                       [Period ▼]          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│ Active Models  23          Alpha  9          Beta  11          Blocked  5                   │
│                                                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Models requiring attention                                                                  │
│                                                                                              │
│ X200      Alpha #4    Critical defects 3     14 days in Alpha                              │
│ NX-01     Alpha #3    Pass 84.3%             Gate blocked                                   │
│ X100      Beta #2     Critical defects 1     Retest pending                                 │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Development Pipeline                                                                         │
│                                                                                              │
│ Kickoff        Alpha                 Beta                  Complete                           │
│  3              9                     11                     42                                │
│                 │                     │                                                        │
│                 └── blocked 3         └── blocked 2                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 9. Suggested Desktop Layout Tokens

Not final visual design. Initial layout constraints only.

```text
App sidebar            220-240px
Workbench filter pane  220-260px
Workbench detail pane  320-400px
Main content           flexible
Max reading width      1200-1440px where appropriate
Table row height       compact, ~36-40px
```

Use dense enterprise UI rather than oversized consumer-SaaS cards.

---

# 10. Primary End-to-End Flow

```text
Models
  ↓
Model Detail
  ↓
Start / Open Validation Round
  ↓
Validation Summary
  ↓
Failed Rule
  ↓
Validation Workbench
  ↓
Failure Instance
  ↓
Create / Link Defect
  ↓
Vendor Fix
  ↓
New Sample
  ↓
Re-validation
  ↓
Round Comparison
  ↓
Gate Review
  ↓
Alpha / Beta Complete
```

This flow should remain possible without requiring users to manually reconstruct context between pages.
