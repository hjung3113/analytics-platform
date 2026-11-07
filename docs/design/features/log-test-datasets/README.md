# Log Test Datasets & Golden Baseline — 검증 테스트 데이터셋·기대 결과 설계 (v0.31.0, 소유자 답 반영, 구현 전)

> **Status: Candidate → 소유자 답 반영(2026-11-07), ADR-0120 Decided.** 설계만 있고 구현·DB·API·화면은 없다. 근거는 [#1345](https://github.com/hjung3113/analytics-platform/issues/1345)이고, [#1330](https://github.com/hjung3113/analytics-platform/issues/1330) Epic과 v0.30.0 [`log-lifecycle`](../log-lifecycle/README.md)(Round·샘플 목록·`rule_result`·검증 요청 큐)을 **재사용**한다(중복 설계 금지). 같은 릴리스의 [`log-explorer`](../log-explorer/README.md)의 `SourceReadPort`를 원본 존재·해시 확인에 쓴다. [ADR-0120](../../../adr/0120-regression-runs-reuse-validation-queue-dataset-identity-separate-from-round.md)은 Decided이고, 실제 코드와 Decided ADR이 이 문서보다 우선한다. 결정마다 «소유자 2026-11-07»로 표시한다.
>
> 검증 스크립트·사내 LLM은 별도 개발 중이고 플랫폼에서 다시 쓰지 않는다. 실제 API가 확정되기 전에는 **합성 Dataset과 어댑터 stub만** 쓰고 운영 연동 완료로 표시하지 않는다.

## 1. 이 설계가 하는 것

Round에 묶이지 않고 여러 모델·Round·Validator 버전에서 되풀이해 쓰는 **테스트 자산과 기대 결과**를 별도 도메인으로 둔다.

1. **Dataset**: 목적·소유·공유 범위·모델 범위·시나리오 태그(정상·예외·경계·회귀·파일 경계·carryover·일부 Rule 미지원)를 가진 이름 붙은 묶음.
2. **DatasetRevision**: 순서 있는 파일 참조·해시·매니페스트 digest를 **불변**으로 고정. 원본은 복제하지 않는다.
3. **ExpectedBaseline**: 한 DatasetRevision에 대해 적용 Spec·RuleSet·Parser 버전·실행 프로파일(`engine_profile_ref`) 버전, 예상 검사 범위, Rule별 기대 결과·예외, 검수자·시각. **실행 결과(`rule_result`)로 자동 덮어쓰지 않는다.**
4. **RegressionSuite**: Dataset 집합 + 고정 실행 프로파일(`engine_profile_ref`). 재실행을 **요청**하고 실행은 외부 작업자(기존 검증 요청 큐)가 한다.
5. **Comparison**: Baseline 대비 새 회귀 실행의 fixed·new·regressed·unchanged와 Rule coverage(실행 vs 미검사), false-positive/negative를 사람이 붙이는 결과 검토 라벨. 공식 확정은 사람.
6. **회귀 자산화**: 새 Defect·Round 근거 위치에서 Dataset **후보(draft)**를 만들고 사람이 검토·승인한다.

식별자·이력은 처음부터 Round와 분리한다(인수 기준 1). 같은 Dataset이 여러 Round에서 쓰여도 각 실행 이력은 따로 남는다.

하지 않는 것(§9에 다시 여는 조건): Raw Log 저장소, Validator·LLM 엔진, 독립 인증·승인, 자동 CI, 대규모 Dataset 관리, 외부 파일 동기화, Parser Golden 비교(Parser 실사 전), Defect 연결.

## 2. 책임 경계와 용어

| 무엇 | 소유 | 플랫폼이 가지는 것 |
| --- | --- | --- |
| 원본 파일 | Source 소유자 | `fileRef`, 순서, `sha256`, 확인된 인코딩/형식 메타데이터 |
| RuleSet·검사 로직·Parser | 외부 Validator/Parser | 버전/실행 프로파일 **참조**(`rule_set_revision`, `parser_version`, `engine_profile_ref`) |
| 기대 결과 | 플랫폼(사람이 작성·승인) | Rule별 기대 결과·예외·검수자 |
| 실제 실행 결과 | `log-lifecycle`(`execution_attempt`·`rule_result`) | **읽기만** — Baseline이 결과를 복사하지 않는다 |
| 기술 사실·지식 근거(Knowledge Evidence Ref) | Knowledge Hub | 이 도메인은 테스트 데이터·기대 결과를 Knowledge에 넣지 않는다 |
| 규칙 정의·커버리지 조회 | `logRules` | Dataset은 Rule을 `rule_id` 참조로만 쓴다 |

- **판정 축 분리.** 스크립트 판정, LLM 가설(이 슬라이스엔 저장 없음), 사람의 결과 검토 라벨, Baseline 승인은 별도 축이다. 어느 쓰기 경로도 실행 결과로 기대 결과를 바꿀 수 없다.
- **재사용.** 샘플 목록(`sample_set`)의 모양은 [log-lifecycle §3 `validation_round.sample_set`](../log-lifecycle/README.md#validation_round) 한 곳이 정의하고 여기서 다시 정의하지 않는다. `sample_manifest_digest` 계산도 그대로 쓴다. 파일 순서는 사용자가 확정하고 시간순 재정렬·합치기를 하지 않는다.
- **용어.** `Dataset`·`Baseline`·`Regression Suite`는 도메인 용어 후보다. `GLOSSARY.md` 등재는 구현 노드 0에서 한다(Dataset ≠ 데이터 수집 Source, Baseline ≠ 지표 Baseline).

## 3. 데이터 모델 (확정 DDL 아님)

스키마 후보 `log_datasets`. 모든 테이블은 `workspace_id`를 가지며 타 Workspace 접근은 서버가 거절한다.

### 3.1 dataset

`id`, `workspace_id`, `name`, `purpose`, `owner_actor_id`, `share_scope`(`private`·`workspace`), `model_ids`(모델 범위, `log-knowledge` 안정 ID 배열; 비어 있으면 모델 무관), `scenario_tags`(닫힌 집합: `normal`·`exception`·`boundary`·`regression`·`file_boundary`·`carryover`·`partial_support`), `status`(`active`·`archived`), `row_version`, 생성·수정 시각.

### 3.2 dataset_revision (불변)

`id`, `dataset_id`, `seq`, `sample_set`(샘플 목록 jsonb, §2의 링크가 가리키는 모양), `sample_manifest_digest`, `input_meta`(jsonb: 확인된 인코딩/형식만, 추정값은 넣지 않음), `note`, 생성자·시각.

- 생성 후 수정·삭제 없음(DB 트리거 + 서비스). 파일을 바꾸려면 새 revision.
- 생성 시 서버가 `SourceReadPort`(log-explorer)로 각 `fileRef`의 존재와 해시를 확인한다. 포트가 지원하지 않거나 원본이 없으면 revision은 **만들어지되** `availability='unverified'`로 시작하고 «확인됨»으로 표시하지 않는다.
- 가용성은 저장값이 아니라 조회 때 계산하는 표시다: `available`·`unavailable`(원본 없음/권한 없음)·`hash_mismatch`·`unverified`.

### 3.3 expected_baseline (revision 단위, 불변 + 상태 이력)

`id`, `dataset_revision_id`, `seq`, `status`(`draft`·`approved`·`superseded`), `profile_pin`(jsonb: `spec_pin?`·`rule_set_revision?`·`parser_version?`·`engine_profile_ref?` — 알려진 것만, 모르면 키 없음), `expected_scope`(jsonb: 검사하기로 한 `rule_id` 목록), `expectations`(jsonb 배열 `{ rule_id, expected, exception?: { reason, scope }, evidence?: [{ fileRef, line }] }`, `expected` ∈ `PASS·FAIL·WARN·NOT_APPLICABLE·EXPECTED_UNSUPPORTED`), `parser_golden_ref?`(외부 소유 Golden의 위치+digest; 내용은 저장하지 않음), `author_actor_id`, `approved_by_actor_id?`, `approved_at?`.

- `EXPECTED_UNSUPPORTED`는 «이 Rule은 현재 엔진이 지원하지 않음을 알고 있다»는 기대다. 실제로 `NOT_CHECKED` 결과가 나와도 `unchanged`로 보이되 PASS와 섞이지 않는다.
- `approved` 후 내용 수정 불가. 바꾸려면 새 `draft` seq를 만들고 승인하면 이전 것은 `superseded`. 모든 상태 변경은 추가 전용 `baseline_event`(`before`·`after`·`reason`·`actor`·`at`)와 감사 로그를 같은 트랜잭션에 쓴다.
- **실행 결과로 자동 변경 없음.** «이 시도를 기준으로 새 Baseline 초안» 동작은 결과를 **복사해 새 draft**를 만들 뿐이고 승인은 사람이 한다.

### 3.4 기준 낡음 (조회 때 계산)

승인된 Baseline은 아래 중 하나가 달라지면 `기준 낡음`(코드 `stale`)으로 표시된다(사유 배지, 값은 비교 대상만 표시):

| 사유 | 비교 |
| --- | --- |
| `file_hash_changed` / `file_unavailable` | revision의 `sha256` ↔ Source 현재 해시/존재 |
| `spec_pin_changed` | `profile_pin.spec_pin` ↔ `log-knowledge` 현재 실효 명세 |
| `rule_set_changed` / `parser_changed` / `engine_profile_changed` | pin ↔ 엔진 capability가 알려 주는 현재 값 |
| `unknown` | 현재 값을 알 수 없음 — 기준 낡음으로 단정하지 않고 «확인 불가» 표시 |

기준 낡음은 판정·승인을 바꾸지 않고, 비교 화면에 경고로만 나타난다. 과거 행은 고치지 않는다.

### 3.5 regression_suite / suite_run

- `regression_suite`: `id`, `workspace_id`, `name`, `items`(jsonb 배열 `{ datasetId, datasetRevisionId?, baselineId? }` — revision 생략 시 실행 시점에 최신 approved를 해석해 **`suite_run`에 고정**), `engine_profile_ref`, `required_pin`(jsonb: 요구 pin), `row_version`.
- `suite_run`: `id`, `suite_id`, `requested_by_actor_id`, `idempotency_key`, `resolved_items`(jsonb: 고정된 revision·baseline ID와 digest), `state`(파생: 하위 요청 상태에서 계산 — 별도 저장 상태 없음), 생성 시각.
- 각 항목은 기존 **검증 요청 큐**의 요청이 된다(§4, [ADR-0120](../../../adr/0120-regression-runs-reuse-validation-queue-dataset-identity-separate-from-round.md)). 실행·`claim`·lease·결과 수신은 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 그대로다.

### 3.6 comparison (조회 때 계산) + 결과 검토 라벨 (추가 전용)

비교는 `expected_baseline`의 `expectations`와 해당 요청의 최신 `succeeded` 시도 `rule_result`로 **읽을 때 계산**한다(결과 복사 없음). 분류(rule 단위):

| 분류 | 기대 → 관측 |
| --- | --- |
| `unchanged` | 기대와 같음(`EXPECTED_UNSUPPORTED`↔`NOT_CHECKED`/`SKIPPED` 포함) |
| `regressed` | 기대 `PASS` → 관측 `FAIL`/`WARN`/`ERROR` |
| `fixed` | 기대 `FAIL`(알려진 결함) → 관측 `PASS` |
| `new` | 기대에 없던 Rule의 관측, 또는 기대 없는 `FAIL` |
| `not_comparable` | 관측 `NOT_CHECKED`/`SKIPPED`/`ERROR`/원본 부재인데 기대가 검사였음 — **PASS로 세지 않음** |
| `missing` | 기대한 `rule_id`가 결과에 없음(미검사) |

- **Rule coverage**: `expected_scope` 대비 실행된 Rule / 미검사 Rule 수와 목록. 필수 Rule 미검사는 비교 요약 맨 위에 보인다.
- `false positive`/`false negative`는 **계산 값이 아니라 사람의 결과 검토 라벨**이다: `suite_review_label`(추가 전용: `suite_run_id`, `rule_id`, `dataset_revision_id`, `label`(`false_positive`·`false_negative`·`accepted_change`·`needs_review`), `reason`, `actor_id`, `at`). triage가 Baseline이나 Rule 결과를 바꾸지 않는다. 기대를 바꾸려면 새 Baseline draft → 승인.
- 스크립트 판정과 LLM 가설은 별도 열이다. 이 슬라이스에는 LLM 열이 없고 자리만 정한다(§9).

### 3.7 dataset_candidate (회귀 자산화, draft)

`id`, `workspace_id`, `origin`(`manual`·`round_evidence`), `source_ref`(Round ID, 근거 위치 `EvidenceRef` 목록), `proposed_by`(사람), `status`(`draft`·`approved`·`rejected`), `reviewer`, `reason`. 승인하면 `dataset` + 첫 revision을 만든다. **LLM이 제안한 후보나 실행 가능한 코드·쉘 필드는 없다**(후보는 데이터 참조뿐). Defect에서의 생성은 §9.

## 4. 검증 요청 큐 재사용 — 핵심 설계 결정

[log-lifecycle](../log-lifecycle/README.md) `execution_request.round_id`는 **필수**이고 Round는 `development_project`에 속한다. 회귀 실행은 개발 건도 Round도 없다. 대안(상세는 ADR-0120):

- **A. 합성 Round**: 데이터셋 실행마다 «회귀» 종류 Round를 만든다 → 개발 건 모델과 어긋나고 Round 목록이 오염된다.
- **B. 요청 주체(subject) 확장 (소유자 2026-11-07 결정)**: `execution_request`에 `round_id` XOR `suite_run_item_id`(CHECK 제약). 작업자 REST는 그대로이고 `claim` 응답이 둘 중 하나의 샘플 목록을 준다. `execution_attempt`·`rule_result`는 변경 없음.
- **C. 별도 큐**: 같은 claim/lease 로직을 둘로 만든다. 중복 구현이라 기각.

B는 v0.30.0에서 구현 중인 스키마(#1444·#1445)를 건드리므로 **ADR-0117 개정이 필요**하다. 구현 순서: v0.30.0 노드 d 병합 → 개정 → 이 노드.

## 5. 서버 모듈과 권한

`apps/platform-api/src/modules/log-datasets/` — 기존 Fastify·Menu Dispatch·Core 감사를 쓴다.

```text
log-datasets/
  deps.ts                  # db, clock, lifecycleQueue(요청 등록·결과 읽기 포트), sourceRead(log-explorer 포트), knowledgeLookup, audit
  domain/                  # 비교 분류, 기준 낡음 계산, digest (순수 함수)
  repositories/            # dataset, revision, baseline(+event), suite, suite_run, review_label, candidate
  dataset-endpoints.ts / dataset-actions.ts
  baseline-actions.ts      # 승인은 별도 capability
  suite-endpoints.ts / suite-actions.ts
  comparison-endpoints.ts  # 읽기 전용 계산
  index.ts
```

- 교차 모듈은 읽기 포트로만 접근한다(`log-lifecycle`의 요청 등록과 결과 읽기는 lifecycle이 내놓는 서비스 인터페이스, 다른 모듈 DB에 직접 쓰지 않음).
- **운영 그래프에 합성 어댑터·stub 금지**(CI 확인), 합성 Dataset은 `synthetic=true` 표시.

| capability (이름 후보) | 무엇 | 부여 |
| --- | --- | --- |
| `platform:view` | 읽기 | 로그인 사용자 전체, `share_scope=private`은 소유자만 |
| `dataset.manage` | Dataset·revision·후보 작성, Suite 편집 | Workspace 범위 |
| `dataset.baseline.approve` | Baseline 승인·superseded | Workspace 범위, **sensitive, 세션 전용**(토큰 불가). 자기 승인은 막지 않고 이력에 표시(log-lifecycle D3와 같음) |
| `dataset.suite.run` | 회귀 실행 요청 | Workspace 범위, 사용자당 동시 실행 상한(시작값 3) |

원본 열람은 Dataset 권한이 아니라 `sourceOwner` 범위 Source ACL을 매 요청 따른다(log-explorer 포트).

## 6. API 목록 (v0.31.0)

### 읽기 — `POST /api/v1/menu-query`

| Endpoint id | 용도 |
| --- | --- |
| `logDataset.datasets` | Dataset 목록(태그·모델·상태·기준 낡음 요약, 표 필터 모델 [ADR-0105](../../../adr/0105-one-table-filter-model.md)) |
| `logDataset.datasetDetail` | 머리 + revision 목록 + 가용성 |
| `logDataset.baselines` | revision의 Baseline 목록·상태·기준 낡음 사유 |
| `logDataset.baselineDetail` | 기대 목록(서버 페이지) + `baseline_event` 이력 |
| `logDataset.suites` / `logDataset.suiteRuns` | Suite·실행 목록(파생 상태) |
| `logDataset.comparison` | `suite_run` × 항목 비교 요약 + rule 분류 목록(서버 페이지·필터) + coverage |
| `logDataset.rerunDiff` | 같은 revision 두 `suite_run`의 결과 diff |

### 쓰기 — `POST /api/v1/menu-action`

| Action | `input` | 동시성 |
| --- | --- | --- |
| `logDataset.datasetCreate` / `datasetUpdate` / `datasetArchive` | 이름·목적·범위·태그 | none / version |
| `logDataset.revisionCreate` | `datasetId`, `sampleSet`, `inputMeta?`, `note?` | none |
| `logDataset.baselineDraftCreate` | `datasetRevisionId`, `fromAttemptId?`(복사 초안) | none |
| `logDataset.baselineUpdateDraft` | `id`, 기대·pin | version |
| `logDataset.baselineApprove` | `id`, `reason` | version |
| `logDataset.suiteCreate` / `suiteUpdate` | `items`, `engineProfileRef` | none / version |
| `logDataset.suiteRun` | `suiteId`, `idempotencyKey` | idempotencyKey |
| `logDataset.reviewLabelAdd` | `suiteRunId`, `ruleId`, `datasetRevisionId`, `label`, `reason` | none |
| `logDataset.candidateCreate` / `candidateDecide` | 출처·사유 / 승인·거절 | none / version |

작업자 REST는 새로 만들지 않는다(ADR-0117 4개 그대로).

## 7. 화면 IA (analysis-platform-wireframe)

### 7.1 Requirements

- 검증 개발자: 같은 시나리오 묶음을 새 Validator 버전으로 다시 돌려 무엇이 바뀌었는지 본다.
- 검토자: Baseline이 낡았는지(기준 낡음), 어떤 Rule이 미검사인지 한눈에 본다. 결과 검토 라벨을 남긴다.
- 운영자: 실행 요청의 대기·실패·원본 부재를 본다.

### 7.2 IA — 메뉴 배치

기존 `logRules` 그룹(라벨 «기준»)에 둔다.

```text
log-dev > 기준 (logRules)
├─ 검증 규칙        log-rules                 /log/rules                          [Catalog, 기존]
└─ 테스트 데이터셋  log-datasets              /log/datasets                       [Management, 신규]
   └─ (navHidden)   log-dataset               /log/datasets/:datasetId[/regression-runs/:suiteRunId]   [Management 상세]
```

- 새 화면은 **2개**(목록, 상세[탭: 개요·Revision·Baseline·실행·비교]). log-explorer(1개)와 합쳐 이번 릴리스 신규 3화면이고 **소유자가 범위를 승인했다**(2026-11-07, 독립 메뉴 진행).
- 소규모 MVP로 #1330 Round 화면 안의 «데이터셋» 진입으로 시작하는 안이 있으나, **식별자와 데이터 모델은 처음부터 분리**하므로 화면 배치는 나중에 옮길 수 있다. 소유자가 독립 메뉴를 골랐다(2026-11-07).
- 시각이 바뀌므로 구현 전 `?variant=` 시안을 아티팩트로 컨펌한다. 이 PR에는 시안이 없다.

### 7.3 Conceptual Contract

**목록 (`PlatformDataTable`)**: 열 = 이름, 태그, 모델 범위, 최신 revision, Baseline 상태(`승인`·`초안 없음`·`기준 낡음 사유`), 최근 실행 요약, 소유자, 갱신. 빈 상태는 이유를 말한다.

**상세**
- 개요: 목적·소유·공유 범위·태그, 가용성 배지(`available`·`unavailable`·`hash_mismatch`·`unverified`), 파일 목록(순서·해시·«탐색에서 열기» 링크 = log-explorer 딥링크).
- Baseline: 기대 표(Rule, 기대, 예외, 근거 위치), 상태 이력(`AuditTimeline`), 기준 낡음 사유 배지, 승인 패널(세션 전용; 승인 불가 이유를 `DataTrustIndicator` 문구로).
- 실행: Suite 실행 요청 서랍(고정될 revision·baseline 요약 표시, 동시 실행 한도 안내), 요청 상태.
- 비교: 상단 coverage 띠(실행 / 미검사 / 필수 미검사 강조), 분류 필터(`regressed`·`new`·`fixed`·`not_comparable`·`missing`·`unchanged`), 행 서랍에서 결과 검토 라벨. **스크립트 판정 열과 LLM 열을 분리**(LLM 열은 이 슬라이스에서 «없음» 대신 숨김; 자리만 계약에 정의).
- 모든 `not_comparable`/`unavailable`은 PASS 색을 쓰지 않는다.

### 7.4 Wireframe·URL

데스크톱 1440×900과 1280만. 새 컴포넌트를 만들지 않는다(`PlatformDataTable`·`DetailDrawer`·`AuditTimeline`·`DataTrustIndicator`). URL은 안정 ID만(`/log/datasets/:datasetId/regression-runs/:suiteRunId`); 파일 경로·해시·필터 값을 주소에 직렬화하지 않는다.

## 8. 반례와 대응

| 위험 | 대응 |
| --- | --- |
| 새 결과가 나쁘다고 Baseline이 자동 수정됨 | Baseline은 사람이 승인한 새 revision으로만 변경; 실행 결과 → draft 복사만 허용 |
| 미지원·원본 부재·실행 오류가 PASS | 분류 `not_comparable`, coverage 미검사에 집계; 서버 verdict 규칙(ADR-0117)과 같음 |
| 파일 순서가 바뀌었는데 같은 Dataset으로 간주 | 순서 포함 `sample_manifest_digest`; 순서/해시 변경은 새 revision, 옛 Baseline은 `file_hash_changed`로 기준 낡음 |
| 원본 삭제·권한 없음 | `unavailable` 표시, 실행은 요청 단계에서 거절(요청 안 만듦) 또는 `failed` + 이유 |
| 타 Workspace Dataset 접근 | 서버가 `workspace_id`로 거절(404 취급), 테스트 필수 |
| 같은 Suite 이중 실행(더블 클릭·재시도) | `idempotencyKey`; 같은 키는 같은 `suite_run` |
| 결과 수신 replay·늦은 결과 | ADR-0117 `result_digest` 멱등·`lease_lost` 그대로 |
| Rule이 일부만 지원되는 엔진 | `EXPECTED_UNSUPPORTED` 기대와 `partial_support` 태그; 커버리지 숫자에 반영 |
| carryover·파일 경계 시나리오 | `carryover`·`file_boundary` 태그와 기대에 `incomplete` 근거 위치를 명시; 판정은 엔진 몫 |
| LLM 제안 테스트가 코드 실행 | 후보는 데이터 참조만, 코드·쉘 필드 없음, 실행은 승인된 실행 프로파일 |
| 스크립트·LLM 이견을 한쪽이 덮음 | 별도 열, 결과 검토 라벨은 사람 |
| 합성 Dataset 성공을 운영 연동으로 오인 | `synthetic=true` 배지, 운영 그래프에 stub 금지, 화면·PR 문구에 «합성» |
| 같은 digest의 두 revision 중복 | 같은 Dataset 안에서는 거절(같은 내용), 다른 Dataset은 허용 |

## 9. 미구현 목록 (다시 여는 조건)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| 자동 CI·스케줄 회귀 | P1 범위 밖, 비용 | 수동 실행이 반복적으로 쓰인 뒤 별도 이슈 |
| 대규모 Dataset 관리·외부 파일 동기화 | 비범위 | Dataset 수가 표 한계를 넘는다는 측정 |
| Parser Golden 비교 | Parser capability 실사 전 | 엔진이 Parser 출력/버전을 돌려줄 때(`parser_golden_ref`는 자리만) |
| Defect에서 Dataset 후보 생성 | Defect는 lifecycle P3 | 결함 연결의 실제 소비자 |
| LLM 열·LLM 제안 후보 | 사내 모델 능력 측정 전 | 측정 완료 + Draft-only 경로(#1198 정책) |
| 타 Workspace 공유 | 격리 정책 미정 | 소유자 요청 + 격리 설계 |
| 실제 엔진 capability로 기준 낡음 계산 | 엔진 인터페이스 실사 전 | 현재 `rule_set`/parser 값을 읽는 포트 확정(그때까지 `unknown`) |
| 토큰 호출 | 필요 소비자 없음 | 외부 도구가 Dataset을 조회해야 할 때 |

## 10. 구현 노드 분할 (제안)

티어는 `tier.sh`·PROFILE §Size and path 기준. 선행: v0.30.0 노드 c·d(스키마·요청 큐), log-explorer 노드 a(`SourceReadPort`).

| 노드 | 내용 | 기대 티어 | 선행 |
| --- | --- | --- | --- |
| 0 | [ADR-0120](../../../adr/0120-regression-runs-reuse-validation-queue-dataset-identity-separate-from-round.md) 확정 + ADR-0117 개정(요청 subject 확장) + GLOSSARY 용어 | light | 소유자 답, v0.30.0 d |
| a | `log_datasets` 스키마·dataset/revision/candidate 쓰기·읽기, 가용성 확인 | full, `impl-complex` | 0, log-explorer a |
| b | Baseline draft/approve/superseded + 이벤트 + 기준 낡음 계산 | full, `impl-complex`(승인 경계) | a |
| c | 요청 subject 확장(lifecycle 스키마·claim 응답) + Suite·suite_run | full, `impl-complex` | 0, b |
| d | 비교·coverage·결과 검토 라벨 읽기·쓰기, 재실행 diff | full | c |
| e | 화면 목록·상세·비교 + 시안(`?variant=`) | full, `ux=required`, 시각 `impl-complex-sol` high | a, d, 시안 컨펌 |
| f | 통합: 계약 E2E(합성 Dataset → 요청 → 참조 작업자 → 비교), 권한·replay·삭제·타 Workspace 시험, 문서 소유 갱신, `.planning` 줄 | full | a–e |

병렬: a와 시안 준비는 독립. 노드 c는 lifecycle 스키마를 바꾸므로 마이그레이션 규칙(전체 백엔드 `test:integration`)을 따른다.

## 11. Open Decisions

| ID | 결정 | 상태 |
| --- | --- | --- |
| D1 | 회귀 실행이 큐를 쓰는 방식 | **결정됨**: 요청 주체를 Round 또는 suite 실행 항목으로 확장, ADR-0117 개정은 v0.30.0 큐 병합 뒤(소유자 2026-11-07) |
| D2 | 독립 메뉴 vs #1330 안 진입 | **결정됨**: 독립 메뉴 `log-datasets`(`logRules` «기준» 그룹), 신규 3화면 승인(소유자 2026-11-07) |
| D3 | Baseline 승인 권한 | **결정됨**: 별도 capability, 세션 전용, 사람 자기 승인 허용 + 표시, AI·토큰 불가, 자동 갱신 없음(소유자 2026-11-07) |
| D4 | `EXPECTED_UNSUPPORTED` 도입 | **결정됨**: 도입(소유자 2026-11-07) |
| D5 | 기준 낡음 판정 시 현재 엔진 값을 모를 때 | **결정됨**: 「확인 불가」 표시, 기준 낡음으로 단정하지 않음(소유자 2026-11-07) |
| D6 | Suite 항목 revision 고정 시점 | 추천: 실행 시점에 `suite_run`에 고정(비교의 재현성). 비소유자 결정 |
| D7 | 사용자당 동시 Suite 실행 | 시작값 3, 측정 후 조정 |
| D8 | 결과 검토 라벨 집합 | 시작값 `false_positive`·`false_negative`·`accepted_change`·`needs_review` |
