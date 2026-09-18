# Standard Log Lifecycle

> 신규 설비 모델의 **표준 로그 개발 Lifecycle**을 관리하고, Alpha/Beta 단계의 로그·Parser·추출 데이터 검증을 반복 가능하고 추적 가능한 프로세스로 만드는 시스템.

## Why

신규 설비 도입 시 설비사가 표준 로그 스펙에 맞는 Event Log를 생성하는지 검증해야 한다. 실제 업무는 한 번의 검사로 끝나지 않는다.

```text
Development Kickoff
        ↓
Alpha Development
  Sample Log → Validation → Defect → Fix → Re-validation
        ↓
Beta Development
  FAB Lot → Validation → Defect → Fix → Re-validation
        ↓
Development Complete
```

현재 반복 업무에서 발생하는 핵심 문제는 다음과 같다.

- 모델별 개발 진행 상태와 검증 이력이 흩어진다.
- Sample Log를 받을 때마다 동일한 정적/포맷 검사를 반복한다.
- 표준 로그 스펙 위반 근거를 사람이 다시 찾아야 한다.
- Parser 가공 이후 추출 데이터 품질 검증이 별도 작업으로 분리된다.
- 같은 결함의 수정/재검증 이력이 연결되지 않는다.
- Alpha/Beta 완료 판정의 근거가 표준화되어 있지 않다.

## Product Scope

Standard Log Lifecycle은 크게 두 영역으로 나눈다.

### 1. Lifecycle Management

- Equipment Model 관리
- Development Kickoff / Alpha / Beta / Complete 단계 관리
- Validation Round 관리
- Sample 및 검증 이력 추적
- Defect / Fix / Re-test 이력 관리
- 단계별 Gate 및 완료 판정

### 2. Validation Workbench

- Sample Event Log 입력
- 표준 로그 스펙 기반 정적 검사
- Format / Required Field / Value / Ordering / Pairing 검사
- Parser 실행 결과 확인
- Parser 가공 후 추출 데이터 검증
- 실패 Event와 원본 로그 Evidence 연결
- 이전 Round와 결과 비교

## Core Domain Model

```text
Equipment Model
    │
    ├── Development Kickoff
    │
    ├── Alpha
    │    ├── Validation Round #1
    │    ├── Validation Round #2
    │    └── ...
    │
    ├── Beta
    │    ├── Validation Round #1
    │    └── ...
    │
    └── Complete

Validation Round
    ├── Samples
    ├── Validation Runs
    ├── Rule Results
    ├── Parser Results
    ├── Data Validation Results
    └── Defects
```

## UX Direction

한 SaaS를 복제하지 않고 역할별로 좋은 패턴을 조합한다.

| 영역 | 참고 UI |
|---|---|
| Lifecycle / Validation Round | Qase, TestRail |
| Model List / Metadata | Linear |
| Validation Rule Result | Great Expectations |
| Raw Event Log Explorer | Elastic Discover |
| Defect Evidence / History | Sentry |

핵심 Navigation 초안:

```text
Models
Validate
Defects
Specs
Reports
```

## Documents

- [Project Overview](docs/PROJECT_OVERVIEW.md)
- [UI / SaaS Research](docs/UI_RESEARCH.md)
- [Information Architecture](docs/INFORMATION_ARCHITECTURE.md)
- [Wireframes](docs/UI_WIREFRAMES.md)
- [Domain Facts](docs/DOMAIN_FACTS.md)

## Related

Validation Run의 로그 형태·파서 오진 규칙·조사 UX 스파이크는
`log-contract-lens`에 있다. 이 제품의 범위는 그 스파이크가 아니라
Equipment Model Lifecycle + Round/Defect 추적이다.
흡수된 사실은 [Domain Facts](docs/DOMAIN_FACTS.md).

## Current Status

`Concept / UX design`

아직 구현 기술이나 데이터베이스 구조를 확정하지 않는다. 현재 단계의 목적은 **업무 Lifecycle, 핵심 Domain, UX 흐름, 검증 단위를 먼저 고정하는 것**이다.
