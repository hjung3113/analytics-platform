# UI / SaaS Research

## 1. Research Goal

Standard Log Lifecycle은 기존 상용 SaaS와 업무 내용이 동일하지 않다. 따라서 특정 제품을 복제하기보다 **업무 성격별로 검증된 UI 패턴을 조합**한다.

추천 조합:

| Product | 참고 영역 | 적용 대상 |
|---|---|---|
| Qase | Test Run, Result, Defect linkage | Alpha/Beta Validation Round |
| TestRail | Milestone, Progress, Defect summary | Development Stage / Gate |
| Great Expectations | Rule-level PASS/FAIL, observed values, run history | Spec / Data Validation Result |
| Elastic Discover | Log search, field exploration, document detail | Raw Event Log Workbench |
| Sentry | Evidence-centered issue detail | Defect Detail |
| Linear | Dense list, metadata placement, lifecycle status | Equipment Model List / Detail |

---

## 2. Qase

### Why it matters

Qase에서 Test Run은 실제 검증 실행의 중심 단위다. Run Dashboard에서는 상태 분포, completion, 환경/설정, 연결된 Defect를 한 곳에서 본다. Failed result에서 Defect 생성으로 자연스럽게 이어지는 구조가 강점이다.

### UI patterns to adopt

- Run 단위 Dashboard
- PASS / FAIL / BLOCKED 분포
- Completion rate
- Run metadata sidebar
- Failed result → Defect 생성
- Defect ↔ Result ↔ Run traceability
- Re-test를 별도 실행으로 관리

### Mapping

```text
Qase                   Standard Log Lifecycle
---------------------------------------------------
Project                Equipment Model
Test Run               Validation Round / Run
Test Case              Validation Rule
Result                 Rule Result
Defect                 Log Defect
Environment            Alpha / Beta environment
Attachment             Sample / Evidence
```

### Do not copy blindly

- Test Case 중심 IA를 그대로 가져오지 않는다.
- 우리의 상위 개념은 테스트 프로젝트가 아니라 **Equipment Model Lifecycle**이다.
- 하나의 Rule 실패가 수천 Event에 발생할 수 있으므로 Failure Instance 집계가 필요하다.

Source:
- https://docs.qase.io/en/articles/5563702-test-runs
- https://docs.qase.io/en/articles/5563710-defects

---

## 3. TestRail

### Why it matters

TestRail은 Milestone / Test Run / Progress / Defect를 계층적으로 보여주는 방식이 강하다. 특히 테스트 활동을 단계별 milestone로 묶고 progress와 defect를 같이 보는 방식이 신규 설비 개발 단계 관리에 적합하다.

### UI patterns to adopt

- Stage / Milestone progress
- Remaining work
- Defect summary
- Run history
- 전체 진행 상태를 한 눈에 보는 summary chart

### Mapping

```text
TestRail               Standard Log Lifecycle
---------------------------------------------------
Project                Equipment Model
Milestone              Alpha / Beta Stage
Test Run               Validation Round
Progress               Gate readiness
Defect chart           Open/Closed defect status
```

### Recommended adaptation

Stage Progress를 단순 percentage로만 표현하지 않는다.

```text
Alpha Readiness
Mandatory Rules     PASS
Critical Defects    0
Parser              PASS
Data Coverage       98.7%
Open Exception      1 approved
```

즉 진행률과 **Gate 조건**을 같이 보여준다.

Source:
- https://support.testrail.com/hc/en-us/articles/15545364561044-Milestones
- https://support.testrail.com/hc/en-us/articles/7101753582996-Charts-and-dashboards

---

## 4. Great Expectations

### Why it matters

Great Expectations는 개별 Expectation을 실행하고 각 Validation Result에 성공 여부와 관측값을 남기며, 과거 Run History와 실패 결과를 조회할 수 있다.

이 패턴은 표준 로그 스펙의 각 검증 항목을 Rule로 관리하는 화면과 매우 유사하다.

### UI patterns to adopt

- Rule-level PASS / FAIL
- Expected vs Observed
- Failures Only filter
- Run History
- Failure sample / unexpected rows
- Validation summary

### Mapping

```text
Great Expectations      Standard Log Lifecycle
---------------------------------------------------
Expectation              Validation Rule
Expectation Suite        Rule Set / Standard Log Spec
Validation               Validation Run
Validation Result        Rule Result
Unexpected Rows          Failure Instances
Observed Value           Actual / Observed
```

### Recommended result card

```text
[FAIL] EVT-031 Process Start-End Pairing

Expected
PROCESS_START → PROCESS_END

Observed
Matched       1,284
Unmatched         7
Success       99.46%

Failure Samples
#1842  PROCESS_START / missing END
#2231  PROCESS_START / missing END

[View source log] [Create defect]
```

Source:
- https://docs.greatexpectations.io/docs/0.18/cloud/validations/manage_validations/
- https://docs.greatexpectations.io/docs/core/trigger_actions_based_on_results/choose_a_result_format/

---

## 5. Elastic Discover

### Why it matters

Elastic Discover는 대량 로그를 탐색하는 UI에서 검증된 패턴을 제공한다.

주요 특징:

- Search / Query
- Filter
- Field list
- Event table
- Individual document detail
- Field statistics
- Top values / distribution / cardinality

표준 로그 검증에서 가장 시간이 많이 드는 작업 중 하나는 **실패가 난 원본 Event를 다시 찾아보는 것**이다. 따라서 이 UI 패턴을 Workbench의 핵심으로 사용한다.

### UI patterns to adopt

- 좌측 Filter / Field pane
- 중앙 Event list
- 우측 Event detail
- Search bar
- PASS/FAIL 필터
- Rule filter
- line/event 선택 시 detail
- failure line highlighting
- field statistics

### Recommended adaptation

Elastic처럼 범용 검색 언어를 처음부터 만들 필요는 없다.

MVP에서는 다음만 지원해도 충분하다.

```text
Event Type
Module
Lot
Wafer / Slot
Validation Status
Rule
Timestamp range
Free-text contains
```

Source:
- https://www.elastic.co/docs/explore-analyze/discover
- https://www.elastic.co/docs/explore-analyze/discover/show-field-statistics

---

## 6. Sentry

### Why it matters

Sentry의 Issue Detail은 Issue 자체의 설명보다 **실제 발생 Event와 Context**를 중심으로 디버깅하게 만든다.

이 패턴을 Log Defect에 적용하면 Jira 형태의 글 중심 Defect보다 훨씬 빠르게 분석할 수 있다.

### UI patterns to adopt

- Issue title + severity + state
- First seen / Last seen / occurrence count
- Event distribution
- 실제 발생 Event navigation
- Evidence / context
- Activity history
- External issue linkage

### Mapping

```text
Sentry                  Standard Log Lifecycle
---------------------------------------------------
Issue                   Defect
Event                   Failure Instance
Occurrences             Affected Event count
First/Last Seen          First/Latest Validation Round
Tags                    Model / Stage / Rule / Module
Context                  Source log + parsed data
Issue activity           Fix / Re-test history
```

### Critical design principle

Defect 상세 화면의 중심은 Description이 아니라 아래여야 한다.

```text
Expected
vs
Observed
vs
Evidence
```

Source:
- https://docs.sentry.io/product/issues/issue-details/

---

## 7. Linear

### Why it matters

Linear의 장점은 기능보다 정보 밀도와 metadata 배치다. 리스트에서 status와 핵심 속성을 빠르게 훑고, 상세에서는 본문과 metadata를 분리한다.

### UI patterns to adopt

- Dense model list
- 작은 status badge
- filter / search
- 중요 metadata를 sidebar에 배치
- lifecycle status를 색상에 과도하게 의존하지 않음

### Recommended model list

```text
MODEL        VENDOR      STAGE       PASS      OPEN DEFECT
---------------------------------------------------------
X100         TEL         Beta        98.4%          2
X200         TEL         Alpha       91.2%          8
NX-01        Vendor A    Alpha       84.3%         17
ABC-300      Vendor B    Complete   100.0%          0
```

Source:
- https://linear.app/docs/project-status

---

## 8. Combined UX Strategy

최종 UI는 아래 조합으로 가져간다.

```text
Lifecycle / Round       → Qase + TestRail
Equipment Model List    → Linear
Validation Results      → Great Expectations
Raw Log Workbench       → Elastic Discover
Defect Investigation    → Sentry
```

### Why this combination works

우리 업무에는 서로 다른 5개 중심 객체가 존재한다.

```text
Model
Stage / Round
Rule
Raw Event
Defect
```

하나의 SaaS가 이 다섯 개를 모두 잘 다루지는 않는다. 따라서 각 객체에 가장 적합한 UI 패턴을 조합한다.

---

## 9. UX Principles Derived from Research

### 9.1 Failures First

정상 결과보다 실패를 찾고 분석하는 시간이 더 중요하다.

- Failures Only
- Critical First
- Open Defect First
- Regression First

### 9.2 Evidence in One Click

Rule FAIL에서 원본 Event까지 한 번의 interaction으로 내려갈 수 있어야 한다.

### 9.3 Preserve Historical Snapshots

과거 Round의 Result는 현재 Rule/Spec 내용이 바뀌어도 당시 기준으로 유지한다.

### 9.4 Comparison Is Core UX

재검증 과정에서는 현재 결과 자체보다 이전 결과와의 차이가 중요하다.

```text
Round #3 → Round #4

Fixed       12
Regressed    2
New          3
Unchanged    5
```

### 9.5 Avoid Dashboard Overload

첫 화면을 KPI 카드로 채우지 않는다.

목표는 "예쁜 대시보드"가 아니라 **지금 어느 모델이 막혀 있고, 무엇 때문에 다음 단계로 못 가는지 바로 찾는 것**이다.
