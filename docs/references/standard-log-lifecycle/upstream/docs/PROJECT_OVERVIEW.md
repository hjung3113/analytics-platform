# Project Overview

## 1. Purpose

Standard Log Lifecycle은 신규 설비 모델이 사내 **표준 로그 스펙(Standard Log Specification)** 에 맞는 Event Log를 생성하도록 개발·검증·수정·재검증 과정을 관리하는 시스템이다.

목표는 단순한 로그 검사기가 아니다.

> **설비 모델 단위의 Standard Log Development Lifecycle을 하나의 시스템에서 관리하고, Alpha/Beta 단계 검증을 반복 가능하고 증거 기반으로 수행한다.**

---

## 2. Development Lifecycle

```text
┌──────────────────────┐
│ Development Kickoff  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Alpha Development    │
│ Vendor / Lab         │
└──────────┬───────────┘
           │
           │  Sample Log
           │      ↓
           │  Validate
           │      ↓
           │  Defect
           │      ↓
           │  Vendor Fix
           │      ↓
           └── Re-validation ──┐
                               │
                               └── repeat
           │
           ▼
┌──────────────────────┐
│ Beta Development     │
│ FAB / Real Lot       │
└──────────┬───────────┘
           │
           │  Real Equipment Log
           │      ↓
           │  Validate
           │      ↓
           │  Defect / Fix / Retest
           │
           ▼
┌──────────────────────┐
│ Development Complete │
└──────────────────────┘
```

### 2.1 Development Kickoff

설비 개발 착수 단계.

관리 대상 예시:

- Equipment Vendor
- Equipment Model
- Equipment Type / Process
- 설비 사양서
- 적용 Standard Log Spec Version
- 개발 담당자 / 검증 담당자
- 개발 일정
- Alpha/Beta 예정 일정
- 특이사항 및 범위

이 단계의 목적은 이후 모든 검증 결과가 어떤 모델, 어떤 스펙, 어떤 개발 범위에 대한 것인지 기준선을 만드는 것이다.

### 2.2 Alpha Development

설비가 FAB에 정식 반입되기 전 Vendor 또는 연구소 환경에서 Test Lot을 수행하고 Sample Event Log를 생성하는 단계.

주요 검증:

1. 로그 파일/레코드 형식
2. 필수 Event 존재 여부
3. 필수 Field 존재 여부
4. Value Domain / Data Type
5. Timestamp / Sequence
6. Start-End Pairing
7. Event 간 관계
8. 표준 로그 스펙 준수 여부
9. Parser 처리 가능 여부
10. Parser 이후 추출 데이터 수준 검증

실패 시:

```text
Validation Failure
      ↓
Defect 등록
      ↓
Vendor 수정
      ↓
새 Sample Log 제출
      ↓
새 Validation Round
```

Alpha는 1회성 단계가 아니라 여러 Round가 존재하는 구조로 본다.

### 2.3 Beta Development

설비가 실제 FAB에 반입된 이후 실제 Lot을 이용해 검증하는 단계.

Alpha 검증 항목을 반복하면서 실제 운전 상황에서만 확인 가능한 Context를 추가한다.

예:

- 실제 Lot 흐름
- Wafer / Slot Context
- Robot / Module 이동
- Process Start-End 관계
- 설비 State 변화
- 동시성 및 순서
- 장시간 운전 시 누락
- Parser가 생성하는 Raw Data의 실제 의미 정합성

### 2.4 Development Complete

단순히 마지막 Sample이 PASS했다고 완료시키지 않는다.

완료 Gate는 최소 다음을 근거로 판단한다.

```text
Mandatory Rules       PASS
Critical Defects      0 Open
Parser Processing     PASS
Required Data         PASS
Alpha Gate            PASS
Beta Gate             PASS
Known Exceptions      Approved
```

---

## 3. Core Product Areas

## 3.1 Lifecycle Management

설비 모델의 전체 개발 상태와 검증 이력을 관리한다.

핵심 기능:

- Model Registry
- Stage Tracking
- Alpha/Beta Round History
- Validation Result History
- Defect Tracking
- Fix / Re-test Traceability
- Gate Decision
- Completion Evidence

## 3.2 Validation Workbench

실제 Sample Log를 검사하는 작업 공간이다.

```text
Sample
   ↓
Static Validation
   ↓
Spec Validation
   ↓
Parser
   ↓
Parsed / Raw Data Validation
   ↓
Evidence
   ↓
Defect
```

검증자는 한 화면에서 다음 흐름을 끝낼 수 있어야 한다.

```text
FAIL Rule 선택
   ↓
원본 Log 위치 확인
   ↓
Expected vs Observed 확인
   ↓
관련 Parsed Data 확인
   ↓
Defect 생성
```

검증 Run 하나는 Discover 스타일 탐색만으로 끝나지 않는다. 최소 단계:

```text
Sample ingest (txt / hourly zip, 수동 선택, 처리 순서 확인)
   ↓
Baseline (Model → Equipment identity, Spec version, routing profile)
   ↓
Layer A/B 형식·스펙   — 기존 Python 툴과 중복 가능, Evidence는 여기 소유
   ↓
Parser (Layer D)
   ↓
Extracted data quality (Layer E)
   ↓
Evidence → Defect
```

EquipmentId는 로그에서 읽지 않고 Model이 부여한다.
파일 경계에서 lifecycle을 종료하지 않는다.

---

## 4. Validation Layers

검증을 하나의 PASS/FAIL로 뭉치지 않는다.

### Layer A — File / Format

- File naming
- Encoding
- Record delimiter
- Timestamp format
- Column/Token structure
- Basic syntax

#### Layer A — 실무 제약

- 입력: `.txt`와 `eventlogYYYYMMDDHH.txt.zip` 모두.
- 파일명 규칙에 EquipmentId를 요구하지 않는다. 파일명은 시간 버킷만 가진다.
- 레코드는 한 줄, 위치 기반 컬럼. name-based JSON/CSV를 전제하지 않는다.
- 고정 컬럼 뒤 2단위(legacy) / 3단위(신규) 반복 블록.
- 사내 Python 형식검증이 이미 있다. A의 가치는 독자 엔진보다
  원본 위치 Evidence와 파서 ingest와의 연결이다.

### Layer B — Static Spec Conformance

- Required events
- Required fields
- Data type
- Allowed values
- Mandatory attributes
- Spec version conformance

#### Layer B — 실무 제약

- 전 필드를 일괄 Mandatory로 올리지 않는다. JobId 누락은 허용될 수 있다.
- PortId는 deprecated. ModuleIsPort 계열만 본다.
- LEH 등 LogType 상수는 설비 routing에 묶고 전역 규칙으로 고정하지 않는다.

### Layer C — Logical / Sequence Validation

- Start-End pairing
- Ordering
- State transition
- Duplicate / Missing events
- Event correlation
- Context consistency

#### Layer C — 실무 제약

- 파일 끝의 열린 Start/End를 FAIL로 단정하지 않는다 (NotChecked / 다음 파일 대기).
- 레코드 순서는 입력 순서. Timestamp 재정렬로 pairing하지 않는다.

### Layer D — Parser Processing

- Parse success/failure
- Unparsed event
- Field extraction
- Mapping
- Conversion
- Parser-generated defect

#### Layer D — 실무 제약

- 입력 계약: EquipmentId(Model), LogType, Fields. 중복 키는 파서 생성 전 검출.
- 매핑: DateTime→Timestamp, MaterialId→WaferId+MaterialId, FlowId→PPID.
  옛 키를 자동 추가하지 않는다.
- 라우팅: EventIdRoutes → StatusRoutes → TriggerRoutes.
  EventId는 대소문자 구분, LogType/Status는 무시.
- IncomingWafer EventKind null은 정상.
- 상세는 `docs/DOMAIN_FACTS.md`. 권위 문서는 파서 저장소.

### Layer E — Extracted Data Quality

- 표준 로그 스펙 항목이 Raw Data에서 실제 확인 가능한지
- Context relationship
- Required data coverage
- Logical consistency
- Original Event ↔ Parsed Data traceability

#### Layer E — 실무 제약

- 파서가 만든 행의 활용 가능 여부. 사용자 최소 필수값은 계약과 별도 축.
- 원본 1줄 : ParsedRecord : 출력 행을 1:1로 가정하지 않는다. 단계별 집계 단위를 명시한다.
- 심각도와 NotChecked와 사람 검토 상태를 한 컬럼에 섞지 않는다.

---

## 5. Traceability Model

가장 중요한 설계 원칙 중 하나다.

모든 결함은 최종적으로 실제 Evidence까지 내려갈 수 있어야 한다.

```text
Equipment Model
  ↓
Stage
  ↓
Validation Round
  ↓
Sample
  ↓
Validation Run
  ↓
Rule Result
  ↓
Failure Instance
  ↓
Source Log Line / Event
  ↓
Parsed Result
  ↓
Defect
  ↓
Fix
  ↓
Re-test Result
```

따라서 "이 결함은 해결되었다"는 상태만 저장하는 것이 아니라 **어떤 로그에서 발견되었고, 어느 수정본에서 어떤 검증 결과로 닫혔는지** 추적할 수 있어야 한다.

---

## 6. Primary Users

### Validator

- Sample 입력
- Validation 실행
- Failure 분석
- Defect 등록
- Re-test

### Development Owner

- 모델 개발 상태 확인
- Alpha/Beta Gate 확인
- Vendor 수정 진행 확인
- 완료 판단

### Vendor / External Developer

향후 필요 시 제한된 형태로 다음 정보를 전달할 수 있다.

- Defect list
- Expected / Observed
- Evidence
- Re-test status

### Manager / Stakeholder

- 모델별 현재 Stage
- 일정
- Open Critical Defect
- Pass rate
- 반복 Round 수
- 완료 전망

---

## 7. Product Principles

### Evidence First

모든 FAIL은 원본 근거를 바로 보여준다.

### Lifecycle First

개별 Validation보다 Equipment Model의 개발 Lifecycle이 상위 개념이다.

### Re-test Is a First-class Concept

수정 후 재검증을 별도 임시 작업으로 보지 않고 제품의 기본 흐름으로 둔다.

### Snapshot Results

과거 Validation 결과는 당시 사용한 Sample, Spec Version, Rule Version, Parser Version과 함께 보존한다.

### Failures Are Groupable

같은 Root Cause가 여러 Event / Sample에서 반복되면 하나의 Defect에 여러 Failure Instance를 연결할 수 있어야 한다.

### Gate Is Evidence-based

Alpha/Beta 완료는 사람의 감각이 아니라 Rule Result, Defect, 승인된 Exception을 근거로 결정한다.

---

## 8. Initial Non-goals

초기 MVP에서는 다음을 우선하지 않는다.

- 실시간 설비 로그 Streaming
- 범용 Observability 플랫폼
- 설비 제어
- 자동 Vendor 배포
- 완전 자동 Root Cause Analysis
- 대규모 AI 기능

핵심은 먼저 **개발 Lifecycle + 반복 검증 + Evidence + Defect Traceability**를 안정적으로 만드는 것이다.

---

## 9. Related spike: Log Contract Lens

`log-contract-lens`는 이 제품의 Lifecycle Management를 대체하지 않는다.
한 Validation Run을 파일 투입부터 파서 품질·Evidence GUI까지 좁게 파 본 스파이크다.

- 흡수할 것: Sample 형태, 파서 오진 금지 규칙, Workbench 뷰 분해, 판정 UX.
- 흡수하지 말 것: 구현 스택, 배포 방식, "판정 로직 비소유".
- 사실 목록: `docs/DOMAIN_FACTS.md`.
