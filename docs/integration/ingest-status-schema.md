# 적재 워커 상태 기록 스키마 (초안)

상태: **Candidate(초안) — 파서 담당 합의는 Open.** 테이블·필드·코드 이름과 보존 기간 숫자는 모두 Candidate다. 합의되면 [01 가공 상태 보고](../01_architecture_and_data_contract.md#processing-status-report)의 Open을 닫고 이 문서를 Decided로 올린다. 작업 이슈: #37. 소비 화면: 운영 콘솔 모니터링·트레이스(#51), 분석 공간 가공 상태 조회.

이 문서는 적재 워커 기록의 **모양과, 그것을 06 §19 평가로 줄이는 규칙**만 다룬다. 원천·최소 기록 항목·노출 수준은 [01 가공 상태 보고](../01_architecture_and_data_contract.md#processing-status-report)가, 응답 모양(`outcome`/`assessments[]`, 가짜 `clear` 금지)과 표시 상태는 [06 §19](../06_platform_ui_contract.md#19-loading--empty--error-taxonomy)가 원본이다.

관찰 기준: `context_recognized_parser` `main` `d84fab1`(2026-09-28). 파서 쪽 사실은 그 저장소 `docs/11`·`docs/16`·`docs/22`와 `src/`에서 확인했다.

## 1. 파서가 지금 남기는 것과 빈 곳

| 사실 (파서 `d84fab1`) | 상태 기록에 주는 의미 |
| --- | --- |
| 소스 파일 1개 = 트랜잭션 1개. `source_file`·결과·`data_quality_issue`·`carryover_snapshot`·`processing_segment`를 한 번에 커밋한다(`docs/11` §12). 레코드 0건 파일도 정상 Segment를 만든다(`docs/11` §8). | **파일 커밋 성공은 이미 원자적으로 남는다.** `processing_segment` 행이 그 증거다. 단, 커밋 성공은 수집 완결성이나 데이터 품질의 증거가 아니다. |
| 커밋 전 실패는 파일 트랜잭션 전체를 롤백한다(`docs/11` §12, `docs/16` §5). `processing_run`은 그 전에 따로 커밋될 수 있다(`docs/11` §12). | **파일 단위 실패·결과 기록은 남지 않는다**(Run provenance만 남을 수 있다). 실패 기록은 워커가 트랜잭션 밖에서 따로 써야 한다. |
| 파일 수신·순서·누락 감지·중복 전달 방지는 Scheduler 책임이다(`docs/16` §1). raw 파일 → `ParsedRecord` 변환도 이 저장소 범위 밖이다(`docs/16` §2, `docs/22` §1.1). 저장소에 host 프로젝트가 없다(`docs/17` §6.4). | 수집·변환 단계 상태와 "파일 미수신"은 **파서를 호출하는 쪽(적재 워커)** 만 알 수 있다. |
| 같은 설비의 파일은 순서대로 처리하고, 두 번째 파일부터는 직전 Output Snapshot이 필요하다(`docs/22` §1). | 한 파일이 실패하면 뒤 파일은 **선행 파일 때문에 대기**한다. |
| 실패는 대부분 타입이 있는 예외로 난다: `SnapshotRestoreException`(`Reason`: `SchemaVersionMismatch`·`EquipmentMismatch`·`InvalidState`·`DuplicateActive`), `DuplicateSourceFileException`, `MismatchedEquipmentStreamException`, `PersistenceValidationException`(하위 `UnsupportedCompletedEntityException`). 예외: 요청 envelope 검증(`SegmentPersistenceWriter.ValidateEnvelope`)은 `ArgumentException` 계열을 던지며, 파일 서술 문제(빈 파일명, 음수 크기)와 호출 버그(빈 Run/Segment/Snapshot id)가 섞여 있다. | 원인 분류는 메시지 문자열이 아니라 예외 타입에서 뽑는다(§4). `ArgumentException`은 원천 문제로 분류하지 않는다(§4.2). |
| `data_quality_issue`는 레코드 단위 품질 문제이고 정상 커밋의 일부다(`DataQualityCode` 15종). | 품질 이슈는 가공 실패가 아니다. 원인 분류에 넣지 않는다. |
| 업무 시각은 시간대 없는 설비 wall-clock(`timestamp`), 운영 시각은 `timestamptz`다. PK는 `(equipment_id, date, …)`로 시작하고 global UNIQUE를 요구하지 않는다(`docs/11` §5). `processing_segment.created_at`은 앱이 INSERT 전에 채운다(커밋 시각이 아니다). | 이 스키마도 같은 키 규칙을 따른다. `created_at`은 증거 시각이지 관측 시각이 아니다(§3.3). |

"적재 워커"는 이 문서에서 **Scheduler + raw 변환 + 파서 호출을 묶은 실행 주체**를 뜻한다. 그 코드가 어느 저장소에 있는지는 Open이다(§7 Q1).

## 2. 기록 구조

### 2.1 무엇을 어디에 쓰나

```text
ingest_status.expected_slot  워커(Scheduler)가 쓴다. 받아야 할 파일 구간의 목록 = 수집 커버리지의 원본.
ingest_status.stage_event    워커가 쓴다. 단위·단계별 결과 한 건 = 한 행. append-only.
ingest_status.stage_detail   워커가 쓴다. 원시 오류·로그. 트레이스 전용.
parser.processing_segment    파서가 이미 쓴다. 파일 커밋 성공의 원자적 증거.
```

- **저장 위치:** 파서와 같은 Postgres 인스턴스의 별도 스키마 `ingest_status`. 워커가 쓰고, 플랫폼은 기존 read-only 역할로 읽는다([01 파서 DB 접근 방식](../01_architecture_and_data_contract.md#parser-db-access)과 같은 토폴로지). 플랫폼 메타 DB에 두면 워커에게 플랫폼 DB 쓰기 권한을 줘야 한다.
- **두 종류의 구간을 섞지 않는다.** 슬롯 구간(`slot_start`~`slot_end`)은 "이 구간의 파일이 와야 한다"는 **권위 있는 커버리지**다. 파일 레코드의 최소·최대 시각(`data_first_at`~`data_last_at`)은 **관측된 데이터 범위**일 뿐이며, 파일이 다 왔다는 증거가 아니다. `clear`는 슬롯 목록으로만 판정한다(§3).
- **사용자 조회와 트레이스의 분리:** 원시 오류는 `stage_detail`에만 둔다. 사용자용 소비 뷰는 `stage_detail`을 조인하지 않는다.

### 2.2 `ingest_status.expected_slot`

| 컬럼 | 타입 | 필수 | 의미 |
| --- | --- | --- | --- |
| `equipment_id` | `text` | ✓ | 설비 ID(파서와 같은 값, Ordinal 비교). |
| `date` | `date` | ✓ | 슬롯의 운영 날짜. 파티션 키 호환용. |
| `slot_key` | `text` | ✓ | 설비 안에서 유일한 슬롯 키. 날짜가 바뀌면 반복되는 키라면 날짜를 포함한다. |
| `slot_start` | `timestamp` | ✓ | 슬롯 시작(설비 wall-clock, 포함). |
| `slot_end` | `timestamp` | ✓ | 슬롯 끝(설비 wall-clock, **배타**). |
| `wait_until` | `timestamptz` | ✓ | 이 시각까지 파일이 안 오면 미수신으로 판정한다. |
| `created_at` | `timestamptz` | ✓ | `DEFAULT now()`. |

- 슬롯은 한 번 쓰면 바뀌지 않는다. 일정이 바뀌면 새 슬롯을 쓰고, 옛 슬롯은 `stage_event`로 `cancelled` 처리한다(§2.3 `result`).
- 한 슬롯을 어느 파일이 채우는지는 `stage_event.satisfied_by`로 기록한다(§2.3). 파일 하나가 여러 슬롯을 채울 수 있고, 한 슬롯을 여러 파일이 나눠 채울 수도 있다. 한 슬롯이 여러 파일로 채워지면 그 파일들이 모두 커밋돼야 슬롯이 가공 완료다.

### 2.3 `ingest_status.stage_event`

| 컬럼 | 타입 | 필수 | 의미 |
| --- | --- | --- | --- |
| `equipment_id` | `text` | ✓ | 설비 ID. |
| `date` | `date` | ✓ | 단위의 운영 날짜(파일이면 파서 `source_file.date`와 같은 규칙). |
| `event_id` | `uuid` | ✓ | 행 식별자. |
| `unit_kind` | `text` | ✓ | `slot`(expected_slot 단위) · `source_file`(받은 파일) · `delivery`(전달 시도, 트레이스 전용 §3.1). |
| `unit_key` | `text` | ✓ | `slot`이면 `slot_key`, `source_file`·`delivery`면 `file_name`. `(equipment_id, unit_kind, unit_key)`가 단위 식별자다. |
| `stage` | `text` | ✓ | `collect` · `convert` · `parse` · `load` · `validate`. |
| `result` | `text` | ✓ | `succeeded` · `failed` · `pending` · `cancelled`(슬롯 취소 전용). |
| `cause_code` | `text` | `failed`·`pending`이면 ✓ | §4.2 내부 원인 코드. |
| `satisfied_by` | `text[]` | | `slot`의 `collect` `succeeded`일 때 그 슬롯을 채운 `file_name` 목록. |
| `attempt` | `integer` | ✓ | 단위·단계별 시도 번호(1부터). 워커가 영속적으로 증가시킨다(재시작해도 되돌아가지 않는다). |
| `seq` | `bigint` | ✓ | 단위별 단조 증가 순번. 같은 `attempt` 안의 순서를 정한다. |
| `data_first_at` | `timestamp` | | 파일 레코드 `DateTime` 최소값(설비 wall-clock, 포함). 트레이스·슬롯 매핑용. |
| `data_last_at` | `timestamp` | | 파일 레코드 `DateTime` 최대값(포함). |
| `next_attempt_at` | `timestamptz` | | 워커가 예약한 **다음 재시도 시각**. 해소 예상 시각이 아니다. |
| `estimated_resolution_at` | `timestamptz` | | 워커가 명시적 추정 정책으로 낸 예상 해소 시각. 정책이 없으면 null이고 사용자 화면에 내지 않는다(§7 Q5). |
| `processing_run_id` | `uuid` | | 파서 호출이 있었으면 그 Run. |
| `segment_id` | `uuid` | | 파서 커밋에 성공했으면 그 Segment. |
| `logic_version` | `text` | | 파서 호출이 있었으면 `processing_run.logic_version`. |
| `worker_version` | `text` | ✓ | 워커 빌드 버전. |
| `observed_at` | `timestamptz` | ✓ | 워커가 이 결과를 확인한 시각. 06 §19 `observedAt`의 근거. **순서 판정에는 쓰지 않는다.** |
| `created_at` | `timestamptz` | ✓ | `DEFAULT now()`. |

- 물리 PK 후보: `(equipment_id, date, event_id)`. `(equipment_id, unit_kind, unit_key, stage, attempt, seq)`의 유일성은 파서와 같은 방식으로 **워커 검증 + ID 생성 규칙**으로 지키는 논리 불변식이다(global UNIQUE 추가 안 함).
- 조회 인덱스 후보: `(equipment_id, unit_kind, unit_key, stage, attempt, seq)`.
- append-only. 한 단위·단계의 **현재 상태 = `(attempt, seq)`가 가장 큰 행**이다. 시계가 되돌아가도 순서가 바뀌지 않도록 `observed_at`은 정렬에 쓰지 않는다.
- 워커는 상태가 바뀔 때마다 새 행을 쓴다. 특히:
    - 미수신이던 슬롯에 파일이 오면 그 슬롯에 `collect` `succeeded` + `satisfied_by`를 쓴다. 이 행이 앞의 `file_not_received`를 대체한다.
    - `blocked_by_predecessor`로 대기하던 파일은 선행 파일이 커밋되면 워커가 다시 평가해 새 행(처리 시작 또는 다른 원인)을 쓴다. 선행 파일이 커밋됐다고 뒤 파일이 성공한 것은 아니다. 뒤 파일의 성공은 **자기 `processing_segment`** 로만 증명된다.
    - 파일 커밋에 성공하면 커밋 확인 뒤 `load` `succeeded`를 쓴다(권장). 이 행이 없어도 성공 판정은 `processing_segment`로 한다(§3.3).

### 2.4 `ingest_status.stage_detail`

| 컬럼 | 타입 | 의미 |
| --- | --- | --- |
| `equipment_id`, `date`, `event_id` | | `stage_event`와 1:1(같은 키). |
| `error_type` | `text` | 예외 타입 전체 이름. |
| `error_message` | `text` | 원시 메시지. |
| `error_detail` | `jsonb` | 스택, 예외별 속성(`Reason`, `Stage` 등), 입력 파일 위치 등. |
| `log_excerpt` | `text` | 해당 단계 로그 일부. 원문 로그 전체 drill-through는 [05](../05_roadmap_and_open_questions.md#결정-상태) defer 결정을 따르며 이 계약으로 열리지 않는다. |

## 3. 06 §19 평가로 줄이는 규칙

플랫폼은 원본 테이블을 직접 조회하지 않고 플랫폼 소유 소비 뷰를 둔다([01 전체 아키텍처](../01_architecture_and_data_contract.md#전체-아키텍처)). 아래는 그 뷰가 지켜야 할 의미다. kind 이름("미수집", "가공 지연")은 06 §19 어휘를 설명용으로 쓴 것이다.

### 3.1 가용성 판정에 들어가지 않는 것

- `unit_kind = delivery` 행(예: `duplicate_delivery`)은 **트레이스 전용**이다. 이미 커밋된 파일이 다시 온 것이라 데이터 가용성과 무관하다. 파일의 성공은 전달 시도와 따로 `processing_segment`로 판정한다.
- `cancelled` 슬롯은 커버리지에서 빠진다.
- `data_quality_issue`는 판정에 쓰지 않는다.

### 3.2 설비·기간 `[a, b)` 조회의 평가 (kind마다 위에서부터 첫 규칙 하나만 적용)

**보존 기간**부터 가른다. 소비 뷰는 설비별 `retained_from`(보존 파티션 중 가장 이른 운영 날짜에서 유도한 wall-clock 하한)을 함께 낸다. `[a, b)` 전체가 `retained_from` 이전이면 모든 kind가 `unknown`(`retention_expired`)이다. 일부만 이전이면 보존된 부분만 아래 규칙으로 평가하되, 결과가 `clear`라면 `unknown`(`retention_expired`)으로 낮춘다(보존 밖 구간을 확인할 수 없으므로). `confirmed`는 그대로 둔다.

"미수집":

1. `[a, b)`와 겹치는 슬롯 중 현재 `collect`가 `failed`/`file_not_received`인 것이 있다 → `confirmed`.
2. 슬롯이 `[a, b)`를 빈틈없이 덮고, 모든 슬롯의 현재 `collect`가 `succeeded`다 → `clear`.
3. 그 밖(슬롯 목록이 없거나 틈이 있음, `file_waiting` 포함) → `unknown`(`source_unavailable`).

"가공 지연":

1. `[a, b)`와 겹치는 슬롯 가운데 (a) 현재 `collect`가 `pending`(`file_waiting`)이거나, (b) 그 슬롯을 채운 파일 중 하나라도 현재 어느 단계가 `pending`/`failed`이다 → `confirmed`, 원인은 §4.1 사용자 분류(여러 개면 모두).
2. 다음을 모두 만족한다 → `clear`:
    - 슬롯이 `[a, b)`를 빈틈없이 덮고 모든 슬롯의 `collect`가 `succeeded`다.
    - 각 슬롯의 `satisfied_by` 파일이 모두 `processing_segment`를 가진다(마지막 필수 단계는 `validate`가 켜지기 전까지 `load`다. §4.3).
    - 같은 설비에 **어느 슬롯에도 매핑되지 않은** `pending`/`failed` 파일 단위가 없다(구간을 모르는 실패가 이 조회 구간에 속할 수 있으므로).
3. 그 밖 → `unknown`. 슬롯 목록이 없거나 틈이 있으면 `source_unavailable`, 매핑되지 않은 실패가 있으면 `check_failed`.

- **슬롯 목록이 없으면 `clear`는 나오지 않는다.** 받은 파일의 관측 범위가 조회 구간을 덮어도 `clear`가 아니다. 중간 파일이 빠졌는지 알 수 없다.
- 파일이 성공적으로 커밋됐고 0건이어도 그 자체는 어느 kind의 `confirmed`도 아니다(06 §19 "0건 ≠ 미수집").

### 3.3 `statusSource`·`observedAt`

- `statusSource`는 `ingest-worker`(Candidate).
- 각 증거의 관측 시각: `stage_event.observed_at`. 파일 커밋 성공의 관측 시각은 그 파일의 `load` `succeeded` 행이 있으면 그 `observed_at`, 없으면 `processing_segment.created_at`이다. 후자는 커밋 전에 찍힌 **증거 시각**이라 실제 관측보다 이르다(보수적).
- 평가의 `observedAt` = 그 평가에 쓴 증거 중 **가장 이른** 관측 시각. 가장 오래된 증거가 판정의 신선도를 정한다.

### 3.4 표시 상태

실패는 06 §19에 따라 별도 상태 없이 "가공 지연 + 원인 분류"로 보인다(2026-09-28 결정, 06 §19 가공 상태 원천). 예상 해소 시점은 `estimated_resolution_at`이 있을 때만 보인다. `next_attempt_at`은 트레이스에서 "다음 재시도"로만 보인다.

## 4. 원인 분류

두 층이다. **내부 코드**(`cause_code`)는 워커가 쓰고 트레이스가 보인다. **사용자 분류**는 플랫폼이 내부 코드에서 매핑해 사용자 화면에 보인다. 사용자 분류 어휘는 플랫폼이 소유한다.

### 4.1 사용자 분류 (플랫폼 소유, Candidate)

| 코드 | 화면 문구 후보 | 뜻 |
| --- | --- | --- |
| `not_received` | 파일 미수신 | 와야 할 파일이 대기 시간 안에 오지 않았다. ("미수집" kind) |
| `waiting` | 처리 대기 | 파일을 기다리는 중이거나, 차례가 오지 않았거나, 선행 파일을 기다린다. |
| `retrying` | 처리 지연 | 일시적 오류로 다시 시도하는 중이다. |
| `source_format` | 원천 형식 오류 | 받은 파일 내용이 기대한 형식이 아니다. |
| `processing_error` | 처리 오류 | 워커·파서 내부 오류. 담당자 조치가 필요하다. |

### 4.2 내부 코드 (워커 소유, Candidate)

| 단위·단계 | `cause_code` | 근거 (파서 `d84fab1`) | `result` | 사용자 분류 |
| --- | --- | --- | --- | --- |
| slot · collect | `file_waiting` | Scheduler 대기 정책(`docs/16` §1), `wait_until` 전 | pending | `waiting` |
| slot · collect | `file_not_received` | `wait_until`이 지남(`docs/16` §1) | failed | `not_received` |
| delivery · collect | `duplicate_delivery` | `DuplicateSourceFileException` — 이미 커밋된 파일이 다시 옴 | failed | 트레이스 전용(§3.1) |
| source_file · convert | `raw_format_error` | raw → `ParsedRecord` 변환 실패(파서 범위 밖) | failed | `source_format` |
| source_file · convert | `descriptor_invalid` | **워커가 파서 호출 전에 직접** 검증한 `SourceFileDescriptor` 오류(빈 파일명, 음수 크기 등) | failed | `source_format` |
| source_file · convert | `equipment_stream_mismatch` | `MismatchedEquipmentStreamException` | failed | `source_format` |
| source_file · parse | `blocked_by_predecessor` | 같은 설비의 앞 파일이 아직 커밋되지 않음(`docs/22` §1) | pending | `waiting` |
| source_file · parse | `snapshot_schema_mismatch` | `SnapshotRestoreException.Reason = SchemaVersionMismatch` | failed | `processing_error` |
| source_file · parse | `snapshot_invalid` | `Reason = EquipmentMismatch` · `InvalidState` · `DuplicateActive` | failed | `processing_error` |
| source_file · parse | `chain_invalid` | `PersistenceValidationException`(Segment/Snapshot 체인 위반) | failed | `processing_error` |
| source_file · parse/load | `caller_contract_error` | 파서가 던진 `ArgumentException` 계열(envelope 검증). 파일 문제인지 호출 버그인지 타입으로 가를 수 없으므로 원천 탓으로 돌리지 않는다. | failed | `processing_error` |
| source_file · load | `unsupported_entity` | `UnsupportedCompletedEntityException` | failed | `processing_error` |
| source_file · load | `db_transient` | 연결·타임아웃 등 재시도 가능한 DB 오류 | pending(재시도 예약) / failed(한도 초과) | `retrying` / `processing_error` |
| 공통 | `unclassified` | 위에 없는 예외 | failed | `processing_error` |

- 워커는 **예외 타입(과 `Reason`)으로 분류하고 메시지 문자열을 파싱하지 않는다.**
- 파일 서술 오류를 `source_format`으로 보이려면 워커가 파서 호출 전에 스스로 검증해야 한다(`descriptor_invalid`). 파서의 전용 예외(§6 P2)가 생기면 그쪽으로 옮긴다.

### 4.3 `validate` 단계

무엇을 검사하는지 아직 정해지지 않았다(§7 Q4). 정해지기 전까지 워커는 `validate` 행을 쓰지 않고, 플랫폼은 마지막 필수 단계를 `load`로 본다. `validate`를 켜면 그때부터 마지막 필수 단계가 `validate`가 되며, 이는 이 계약의 버전 변경이다.

## 5. 보존 기간 (Candidate 숫자)

| 대상 | 보존 | 이유 |
| --- | --- | --- |
| `expected_slot`, `stage_event` | 90일 | 파서 Snapshot 예상 보존 약 3개월(`docs/11` §9)과 맞춘다. |
| `stage_detail` | 30일 | 원시 오류·로그는 크고 민감하다. 오래된 실패는 원인 코드만으로 충분하다. |

- 삭제는 운영 날짜 `date` 기준 파티션 단위다. 운영 날짜와 슬롯 구간은 날짜 경계에서 어긋날 수 있으므로(`docs/11` §4), 소비 뷰의 `retained_from`은 **남은 파티션 중 가장 이른 날짜에서 보수적으로 유도**한다(§3.2).

## 6. `context_recognized_parser` 변경 범위 (제안)

필수 변경은 없다. 성공 판정은 기존 `processing_segment`로 하고, 상태 기록은 워커가 쓴다. 아래는 워커 구현을 쉽게 하는 제안이며 우선순위 순이다.

| # | 제안 | 이유 |
| --- | --- | --- |
| P1 | 실패 예외 → `cause_code` 매핑을 파서가 공개 API로 제공(예: `IngestFailureClassifier.Classify(Exception)`) 또는 코드 상수를 공개 | 예외 계층이 바뀌어도 워커의 분류가 조용히 `unclassified`로 떨어지지 않는다. 파서 테스트로 매핑을 고정한다. |
| P2 | `ValidateEnvelope` 실패를 전용 예외(또는 이유 enum)로 구분: 파일 서술 오류 vs 호출 계약 위반 | 지금은 `ArgumentException`·`ArgumentOutOfRangeException` 하나로 섞여 워커가 `caller_contract_error`로만 분류할 수 있다. |
| P3 | `SegmentWriteResult`에 처리 레코드 수와 `data_quality_issue` 건수 추가 | 트레이스에서 파일별 규모·품질 이슈를 추가 조회 없이 보인다. |
| P4 | `docs/16`에 "상태 보고 경계" 절 추가: 파서는 상태 테이블을 쓰지 않고 예외·결과만 돌려준다 | 상태 기록 책임이 파서로 새어 들어가지 않게 경계를 고정한다(`docs/16` §4와 같은 취지). |

- 워커 코드와 `ingest_status` DDL이 파서 저장소에 들어간다면(§7 Q1) 마이그레이션 번호·방식은 파서 `docs/19`를 따른다.
- 일정은 파서 담당이 정한다. 플랫폼 화면(#51)은 합의 전 설계까지만 한다.

## 7. 파서 담당에게 물을 것

| # | 질문 | 이 초안의 가정 |
| --- | --- | --- |
| Q1 | 적재 워커(Scheduler + raw 변환 + 파서 호출) 코드는 어느 저장소에 있나? 누가 운영하나? | 파서 저장소 밖. 상태 테이블은 워커가 소유한다. |
| Q2 | Scheduler가 "받아야 할 파일"의 일정(슬롯)을 아는가? 대기 시간과 누락 판정 규칙은? | 안다고 가정하고 `expected_slot`을 둔다. 모르면 "미수집"과 "가공 지연"의 `clear`는 나올 수 없고, 알려진 실패만 `confirmed`로 보인다. |
| Q3 | 받은 파일을 어느 슬롯에 매핑하나? 파일명 규칙, `file_timestamp`, 변환 후 레코드 시각 중 무엇인가? 변환 전에 실패한 파일도 매핑할 수 있나? | 파일명 규칙으로 변환 전에 매핑할 수 있다고 가정한다. 매핑하지 못한 실패는 그 설비의 `clear`를 막는다(§3.2). |
| Q4 | `validate` 단계는 실제로 무엇을 검사하나? 필요한가? | 정해질 때까지 쓰지 않는다(§4.3). |
| Q5 | 재시도 정책(횟수, 간격)은? 예상 해소 시각을 추정할 근거가 있나? | 재시도는 `next_attempt_at`으로만 기록한다. 추정 정책이 없으면 `estimated_resolution_at`은 null이다. |
| Q6 | 보존 90일/30일이 운영 저장 용량과 맞나? | 표 5의 숫자. |
| Q7 | 재처리(트레이스의 "재처리" 동작)를 무엇이 받나? 파서 재처리는 Post-MVP다(`docs/12`). | 트레이스의 재처리 동작은 워커의 "같은 파일 다시 시도"(`docs/16` §5)만 뜻한다. 범위 재처리는 이 계약 밖이다. |

## 8. 합의 후 할 일

1. 이 문서 상태를 Decided로 올리고 Candidate 이름을 확정한다. [01 가공 상태 보고](../01_architecture_and_data_contract.md#processing-status-report)의 Open 줄과 [05](../05_roadmap_and_open_questions.md) 행을 고친다.
2. #51 모니터링·트레이스 화면 설계를 시작한다.
3. 소비 뷰와 `PlatformAdapter` 포트는 서버 골격 작업에서 만든다. mock 서버에 이 스키마를 흉내 낸 fixture를 넣는 일은 #51 화면이 필요로 할 때 이슈로 올린다.
