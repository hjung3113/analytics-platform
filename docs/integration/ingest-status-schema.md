# 적재 워커 상태 기록 스키마 (초안)

상태: **Draft — 파서 담당 합의 전.** 이 문서의 테이블·필드·코드 이름과 보존 기간 숫자는 모두 Candidate다. 합의되면 이 문서를 Decided로 올리고 [01 가공 상태 보고](../01_architecture_and_data_contract.md#processing-status-report)의 Open을 닫는다. 작업 이슈: #37. 이 계약을 소비하는 화면: 운영 콘솔 모니터링·트레이스(#51), 분석 공간 가공 상태 조회([06 §19](../06_platform_ui_contract.md#19-loading--empty--error-taxonomy)).

이미 Decided인 것(여기서 다시 정하지 않는다):

- 가공 상태의 원천(`statusSource`)은 적재 워커의 단계별 처리 결과 보고다. 플랫폼은 행 수나 mart 결과로 원인을 추론하지 않는다(01, 06 §19).
- 최소 기록 항목: 설비 ID, 대상 구간, 단계(수집/변환/파싱/적재/검증), 결과(성공/실패/대기), 원인 분류, 관측 시각. 원시 오류·단계 로그는 연결하되 사용자 화면에는 내지 않는다(01).
- 사용자 화면은 단계 상태·원인 분류·예상 해소 시점·VOC 문의까지, 개발자 트레이스는 원시 오류·로그·재처리까지 보인다. 둘은 같은 원천을 쓴다(06 §19).
- 기록이 없는 구간은 `unknown`이지 정상이 아니다(01).

관찰 기준: `context_recognized_parser` `main` `d84fab1`(2026-09-28). 파서 쪽 사실은 그 저장소 `docs/11`·`docs/16`·`docs/22`와 코드에서 확인한 것이다.

## 1. 파서가 지금 남기는 것과 빈 곳

| 사실 (파서 `d84fab1`) | 상태 기록에 주는 의미 |
| --- | --- |
| 소스 파일 1개 = 트랜잭션 1개. `source_file`·결과·`data_quality_issue`·`carryover_snapshot`·`processing_segment`를 한 번에 커밋한다(`docs/11` §12). | **성공은 이미 원자적으로 남는다.** 파일의 파싱·적재 성공은 `processing_segment` 행의 존재로 판정할 수 있다. |
| 커밋 전 실패는 파일 트랜잭션 전체를 롤백한다(`docs/11` §12, `docs/16` §5). | **실패는 아무 흔적도 남지 않는다.** 실패 기록은 파일 트랜잭션 밖에서 따로 써야 한다. |
| 파일 수신·순서·누락 감지·중복 전달 방지는 Scheduler 책임이다(`docs/16` §1). raw 파일 → `ParsedRecord` 변환도 이 저장소 범위 밖이다(`docs/16` §2, `docs/22` §1.1). 저장소에 host 프로젝트가 없다(`docs/17` §6.4). | 수집·변환 단계 상태와 "파일 미수신"은 파서가 아니라 **파서를 호출하는 쪽(적재 워커)** 만 알 수 있다. |
| 같은 설비의 파일은 순서대로 처리하고, 두 번째 파일부터는 직전 Output Snapshot이 필요하다(`docs/22` §1). | 한 파일이 실패하면 그 뒤 파일은 모두 **선행 파일 때문에 대기**한다. 사용자에게는 "처리 대기"로 보여야 한다. |
| 실패는 대부분 타입이 있는 예외로 난다: `SnapshotRestoreException`(`Reason`: `SchemaVersionMismatch`·`EquipmentMismatch`·`InvalidState`·`DuplicateActive`), `DuplicateSourceFileException`, `MismatchedEquipmentStreamException`, `PersistenceValidationException`(하위 `UnsupportedCompletedEntityException`). 예외: 요청 envelope 검증(`SegmentPersistenceWriter.ValidateEnvelope`)은 `ArgumentException` 계열을 던진다. | 원인 분류를 **메시지 문자열이 아니라 예외 타입**에서 뽑을 수 있다(§4). envelope 검증은 타입만으로 가를 수 없다(§6 P2). |
| `data_quality_issue`는 레코드 단위 품질 문제이고 정상 커밋의 일부다(`DataQualityCode` 15종). | 품질 이슈는 **가공 실패가 아니다.** 이 스키마의 원인 분류에 넣지 않는다. 필요하면 트레이스에서 건수만 보인다. |
| 제어 테이블의 업무 시각은 시간대 없는 설비 wall-clock(`timestamp`), 운영 시각은 `timestamptz`다. PK는 `(equipment_id, date, …)`로 시작한다(`docs/11` §5, `0001_control_and_provenance.sql`). | 이 스키마도 같은 규칙을 따른다. |

"적재 워커"는 이 문서에서 **Scheduler + raw 변환 + 파서 호출을 묶은 실행 주체**를 뜻한다. 그 코드가 어느 저장소에 있는지는 Open이다(§7 Q1).

## 2. 기록 구조

### 2.1 두 테이블 + 성공은 파서 테이블에서 읽는다

```text
ingest_status.stage_event    워커가 쓴다. 단계별 결과 한 건 = 한 행. append-only.
ingest_status.stage_detail   워커가 쓴다. 원시 오류·로그. 트레이스 전용.
parser.processing_segment    파서가 이미 쓴다. 파싱·적재 성공의 원자적 증거.
```

- **저장 위치:** 파서와 같은 Postgres 인스턴스의 별도 스키마 `ingest_status`(Candidate). 워커가 쓰고, 플랫폼은 기존 read-only 역할로 읽는다([01 파서 DB 접근 방식](../01_architecture_and_data_contract.md#parser-db-access)과 같은 토폴로지). 플랫폼 메타 DB에 두지 않는 이유: 워커에게 플랫폼 DB 쓰기 권한을 주게 된다.
- **성공을 따로 쓰지 않아도 되는 이유:** 파싱·적재 성공 기록을 파일 트랜잭션 밖에서 쓰면, 커밋은 됐는데 상태 기록만 실패하는 틈이 생긴다. `processing_segment`는 결과와 같은 트랜잭션에 있으므로 그 틈이 없다. 워커는 파싱·적재 성공 행을 **써도 되지만**, 플랫폼 조회는 `processing_segment`를 우선한다(§3).
- **사용자 조회와 트레이스의 분리:** 원시 오류는 `stage_detail`에만 둔다. 사용자용 소비 뷰는 `stage_detail`을 조인하지 않는다. 표시 수준 차이를 뷰 경계로 강제한다.

### 2.2 `ingest_status.stage_event`

| 컬럼 | 타입 | 필수 | 의미 |
| --- | --- | --- | --- |
| `equipment_id` | `text` | ✓ | 설비 ID. 파서 `equipment_id`와 같은 값(Ordinal 비교). |
| `date` | `date` | ✓ | 처리 단위의 운영 날짜. 파서 `source_file.date`와 같은 규칙. 파티션 키 호환용. |
| `event_id` | `uuid` | ✓ | 행 식별자. |
| `unit_kind` | `text` | ✓ | `source_file` 또는 `expected_slot`. 받은 파일이면 `source_file`, 와야 하는데 아직 없는 구간이면 `expected_slot`. |
| `unit_key` | `text` | ✓ | `source_file`이면 `file_name`(파서 `(equipment_id, file_name)`과 조인), `expected_slot`이면 워커가 정한 슬롯 키. |
| `interval_start` | `timestamp` | | 대상 구간 시작(설비 wall-clock, 포함). |
| `interval_end` | `timestamp` | | 대상 구간 끝(설비 wall-clock, 배타). |
| `stage` | `text` | ✓ | `collect` · `convert` · `parse` · `load` · `validate`. |
| `result` | `text` | ✓ | `succeeded` · `failed` · `pending`. |
| `cause_code` | `text` | `failed`·`pending`이면 ✓ | §4 내부 원인 코드. `succeeded`면 null. |
| `attempt` | `integer` | ✓ | 같은 단위·단계의 시도 번호(1부터). |
| `next_attempt_at` | `timestamptz` | | 워커가 다음 시도를 예약했으면 그 시각. 사용자 화면의 "예상 해소 시점" 근거. 없으면 화면에 내지 않는다. |
| `processing_run_id` | `uuid` | | 파서 호출이 있었으면 그 Run. 파서 provenance와 조인. |
| `segment_id` | `uuid` | | 파서 커밋에 성공했으면 그 Segment. |
| `logic_version` | `text` | | 파서 호출이 있었으면 `processing_run.logic_version`. |
| `worker_version` | `text` | ✓ | 워커 빌드 버전. |
| `observed_at` | `timestamptz` | ✓ | 워커가 이 결과를 확인한 시각. 06 §19 `observedAt`의 근거. |
| `created_at` | `timestamptz` | ✓ | `DEFAULT now()`. 트러블슈팅용. 파서 규칙과 같다. |

- PK 후보: `(equipment_id, date, event_id)`. 조회 인덱스 후보: `(equipment_id, interval_start, interval_end)`, `(equipment_id, unit_key, stage, attempt)`.
- append-only. 상태가 바뀌면 행을 고치지 않고 새 행을 쓴다. 한 단위·단계의 현재 상태는 **`attempt`가 가장 큰 행 중 `observed_at`이 가장 늦은 행**이다.
- **대상 구간이 null인 행**은 기간 조회에 매칭되지 않는다(트레이스에는 보임). 파일이면 늦어도 `convert` 성공 시점에는 구간을 채운다. 구간을 어떻게 정할지는 §7 Q3.

### 2.3 `ingest_status.stage_detail`

| 컬럼 | 타입 | 의미 |
| --- | --- | --- |
| `equipment_id`, `date`, `event_id` | | `stage_event`와 1:1(같은 키). |
| `error_type` | `text` | 예외 타입 전체 이름(예: `ContextRecognizedParser.Snapshot.SnapshotRestoreException`). |
| `error_message` | `text` | 원시 메시지. |
| `error_detail` | `jsonb` | 스택, 예외별 속성(`Reason`, `Stage` 등), 입력 파일 위치 등. |
| `log_excerpt` | `text` | 해당 단계 로그 일부. 원문 로그 전체 drill-through는 [05](../05_roadmap_and_open_questions.md#결정-상태) defer 결정을 따르며 이 계약으로 열리지 않는다. |

## 3. 플랫폼이 읽는 방법

플랫폼은 원본 테이블을 직접 조회하지 않고 소비 계층 뷰를 둔다([01 전체 아키텍처](../01_architecture_and_data_contract.md#전체-아키텍처)). 뷰는 플랫폼 소유이며 아래는 의미만 정한다.

- **`v_ingest_unit_stage`(현재 상태):** 단위·단계별 최신 행. 단, `parse`·`load`는 `(equipment_id, file_name)`에 `processing_segment`가 있으면 `succeeded`로 덮는다(`observed_at` = `processing_segment.created_at`, `segment_id` 연결).
- **설비·기간 조회 `[a, b)`:** 구간이 겹치는 단위를 모은다. 06 §19 `assessments[]`에 다음처럼 옮긴다. kind 이름은 06이 소유하며 여기 적은 이름은 설명용이다.

| 조건 | 평가 |
| --- | --- |
| `[a, b)` 안에 `collect` `failed`/`cause=file_not_received`인 `expected_slot`이 하나라도 있음 | "미수집" `confirmed` |
| `[a, b)`를 단위 구간이 빈틈없이 덮고, 모든 단위의 `collect`가 `succeeded` | "미수집" `clear` |
| 어느 단위가 `pending`이거나 `failed`(`file_not_received` 제외) | "가공 지연" `confirmed`, 원인은 §4 사용자 분류 |
| `[a, b)`를 단위 구간이 빈틈없이 덮고 모든 단위의 마지막 단계가 `succeeded` | "가공 지연" `clear` |
| 덮이지 않은 틈이 있음 | `unknown`(`source_unavailable`) |
| 보존 기간 밖 | `unknown`(`retention_expired`, §5) |

- `confirmed`·`clear`의 `statusSource`는 `ingest-worker`(Candidate), `observedAt`은 판정에 쓴 행 중 **가장 이른** `observed_at`이다. 가장 오래된 증거가 판정의 신선도를 정한다.
- **"미수집"은 `expected_slot`이 있어야 주장할 수 있다.** 워커가 받을 파일의 일정을 모르면 "안 왔다"를 확인할 수 없고, 그 구간은 `unknown`이다. 받은 파일이 없다는 사실만으로 `confirmed`를 내지 않는다(06 §19 "0건 ≠ 미수집").
- **실패는 "가공 지연 + 원인 분류"로 옮긴다.** 06 §19에 "가공 실패" 상태를 따로 두지 않기로 했다(2026-09-28, 06 §19 가공 상태 원천).

## 4. 원인 분류

두 층이다. **내부 코드**(`cause_code`)는 워커가 쓰고 트레이스가 보인다. **사용자 분류**는 플랫폼이 내부 코드에서 매핑해 사용자 화면에 보인다. 사용자 분류 어휘는 플랫폼이 소유한다. 내부 코드가 늘어도 사용자 분류는 매핑표만 고친다.

### 4.1 사용자 분류 (플랫폼 소유, Candidate)

| 코드 | 화면 문구 후보 | 뜻 |
| --- | --- | --- |
| `not_received` | 파일 미수신 | 와야 할 파일이 대기 시간 안에 오지 않았다. |
| `waiting` | 처리 대기 | 아직 차례가 오지 않았거나 선행 파일을 기다린다. |
| `retrying` | 처리 지연 | 일시적 오류로 다시 시도하는 중이다. |
| `source_format` | 원천 형식 오류 | 받은 파일 내용이 기대한 형식이 아니다. |
| `processing_error` | 처리 오류 | 워커·파서 내부 오류. 담당자 조치가 필요하다. |

### 4.2 내부 코드 (워커 소유, Candidate)

| 단계 | `cause_code` | 근거 (파서 `d84fab1`) | `result` | 사용자 분류 |
| --- | --- | --- | --- | --- |
| collect | `file_waiting` | Scheduler 대기 정책(`docs/16` §1) | pending | `waiting` |
| collect | `file_not_received` | Scheduler 누락 감지(`docs/16` §1) | failed | `not_received` |
| collect | `duplicate_delivery` | `DuplicateSourceFileException` — 이미 커밋된 파일이 다시 옴 | failed | 사용자 표시 안 함(데이터는 이미 있다) |
| convert | `raw_format_error` | raw → `ParsedRecord` 변환 실패(파서 범위 밖) | failed | `source_format` |
| convert | `envelope_invalid` | `SourceFileDescriptor` 검증 실패(`docs/22` §1 `ValidateEnvelope`) | failed | `source_format` |
| convert | `equipment_stream_mismatch` | `MismatchedEquipmentStreamException` | failed | `source_format` |
| parse | `blocked_by_predecessor` | 같은 설비의 앞 파일이 아직 성공하지 못함(`docs/22` §1) | pending | `waiting` |
| parse | `snapshot_schema_mismatch` | `SnapshotRestoreException.Reason = SchemaVersionMismatch` | failed | `processing_error` |
| parse | `snapshot_invalid` | `Reason = EquipmentMismatch` · `InvalidState` · `DuplicateActive` | failed | `processing_error` |
| parse | `chain_invalid` | `PersistenceValidationException`(Segment/Snapshot 체인 위반) | failed | `processing_error` |
| load | `unsupported_entity` | `UnsupportedCompletedEntityException` | failed | `processing_error` |
| load | `db_transient` | 연결·타임아웃 등 재시도 가능한 DB 오류 | pending(재시도 예약) / failed(한도 초과) | `retrying` / `processing_error` |
| 공통 | `unclassified` | 위에 없는 예외 | failed | `processing_error` |

- 워커는 **예외 타입(과 `Reason`)으로 분류하고 메시지 문자열을 파싱하지 않는다.** 이를 안정적으로 하려면 파서 쪽 도움이 있으면 좋다(§6 P1).
- `data_quality_issue`(`DataQualityCode`)는 원인 분류에 넣지 않는다(§1). 트레이스에서 파일별 건수로만 보인다.
- `validate` 단계에서 무엇을 검사하는지는 아직 정해지지 않았다(§7 Q4). 정해지기 전까지 워커는 `validate` 행을 쓰지 않고, 플랫폼은 "마지막 단계"를 `load`로 본다.

## 5. 보존 기간 (Candidate 숫자)

| 대상 | 보존 | 이유 |
| --- | --- | --- |
| `stage_event` | 90일 | 파서 Snapshot 예상 보존 약 3개월(`docs/11` §9)과 맞춘다. 트레이스가 Segment 체인을 따라갈 수 있는 범위. |
| `stage_detail` | 30일 | 원시 오류·로그는 크고 민감하다. 오래된 실패는 원인 코드만으로 충분하다. |

- 삭제는 `date` 기준 파티션 단위(파서와 같은 키 규칙).
- 보존 기간을 넘은 구간을 조회하면 사용자 조회는 `unknown`이다. 이유는 `retention_expired`다(06 §19, 이름 Candidate).

## 6. `context_recognized_parser` 변경 범위 (제안)

필수 변경은 없다. 성공 판정은 기존 `processing_segment`로 하고, 상태 기록은 워커가 쓴다. 아래는 워커 구현을 쉽게 하는 제안이며 우선순위 순이다.

| # | 제안 | 이유 |
| --- | --- | --- |
| P1 | 실패 예외 → `cause_code` 매핑을 파서가 공개 API로 제공(예: `IngestFailureClassifier.Classify(Exception)`) 또는 코드 상수를 공개 | 예외 계층이 바뀌어도 워커의 분류가 조용히 `unclassified`로 떨어지지 않는다. 파서 테스트로 매핑을 고정한다. |
| P2 | `ValidateEnvelope` 실패를 전용 예외 타입으로 구분 | 지금은 `ArgumentException`·`ArgumentOutOfRangeException`이라, 파일 쪽 문제(빈 파일명, 음수 크기)와 워커 호출 버그(빈 Run/Segment id)가 같은 타입으로 섞인다. 앞은 `source_format`, 뒤는 `processing_error`여야 한다. |
| P3 | `SegmentWriteResult`에 처리 레코드 수와 `data_quality_issue` 건수 추가 | 트레이스에서 파일별 규모·품질 이슈를 추가 조회 없이 보인다. |
| P4 | `docs/16`에 "상태 보고 경계" 절 추가: 파서는 상태 테이블을 쓰지 않고 예외·결과만 돌려준다 | 상태 기록 책임이 파서로 새어 들어가지 않게 경계를 문서로 고정한다(`docs/16` §4 책임 혼합 금지와 같은 취지). |

- 워커 코드와 `ingest_status` DDL이 파서 저장소에 들어간다면(§7 Q1) 마이그레이션 번호·방식은 파서 `docs/19`를 따른다.
- 일정은 파서 담당이 정한다. 플랫폼 화면(#51)은 합의 전 설계까지만 한다.

## 7. 파서 담당에게 물을 것

| # | 질문 | 이 초안의 가정 |
| --- | --- | --- |
| Q1 | 적재 워커(Scheduler + raw 변환 + 파서 호출) 코드는 어느 저장소에 있나? 누가 운영하나? | 파서 저장소 밖. 상태 테이블은 워커가 소유한다. |
| Q2 | Scheduler가 "받아야 할 파일"의 일정을 아는가? 대기 시간과 누락 판정 규칙은? | 안다고 가정하고 `expected_slot`을 둔다. 모르면 "미수집"은 항상 `unknown`이다. |
| Q3 | 파일의 대상 구간을 어떻게 정하나? 파일명 규칙, `file_timestamp`, 변환 후 레코드 `DateTime` 최소·최대 중 무엇인가? | 변환 후 레코드 `DateTime` 최소·최대. 빈 파일은 파일명 규칙이나 `file_timestamp`로 정한다. |
| Q4 | `validate` 단계는 실제로 무엇을 검사하나? 필요한가? | 정해질 때까지 쓰지 않는다. |
| Q5 | 재시도 정책(횟수, 간격)과 `next_attempt_at`을 워커가 알 수 있나? | 예약 재시도가 있으면 쓴다. 없으면 null이고 화면에 예상 해소 시점을 내지 않는다. |
| Q6 | 보존 90일/30일이 운영 저장 용량과 맞나? | 표 5의 숫자. |
| Q7 | 재처리(트레이스의 "재처리" 동작)를 무엇이 받나? 파서 재처리는 Post-MVP다(`docs/12`). | 트레이스의 재처리 동작은 워커의 "같은 파일 다시 시도"(`docs/16` §5)만 뜻한다. 범위 재처리는 이 계약 밖이다. |

## 8. 합의 후 할 일

1. 이 문서 상태를 Decided로 올리고 Candidate 이름을 확정한다. [01 가공 상태 보고](../01_architecture_and_data_contract.md#processing-status-report)의 Open 줄과 [05](../05_roadmap_and_open_questions.md) 행을 고친다.
2. #51 모니터링·트레이스 화면 설계를 시작한다.
3. 소비 뷰와 `PlatformAdapter` 포트는 서버 골격 작업에서 만든다. mock 서버에 이 스키마를 흉내 낸 fixture를 넣는 일은 #51 화면이 필요로 할 때 이슈로 올린다.
