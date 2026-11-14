# ADR-0159 — 시도별 진단(`AttemptDiagnostic`)은 별도 worker 쓰기와 Source ACL 읽기로 둔다

- 상태: Decided (2026-11-13, 플랫폼 정의 구조, B1 As-built #2196, 되돌릴 수 있음). 이슈 [#1815](https://github.com/hjung3113/analytics-platform/issues/1815).
- 결정자: 소유자 — 사내 리포트 실사(R1)를 기다리지 않고 플랫폼이 최선이라 판단한 구조를 정하고 사내가 맞춘다(2026-11-13). 구조와 수치는 플랫폼(에이전트)이 정했다.
- 계약 원천: [log-lifecycle API §시도 진단](../architecture/platform-api/api/log-lifecycle.md#시도-진단-attemptdiagnostic-b0b1), 설계 [진단 리포트 보존 §3](../design/features/log-lifecycle/diagnostic-report-parity.md#3-slice-b--버전-있는-진단과-선택-첨부). 관련: [ADR-0117](0117-validation-request-queue-claim-lease-heartbeat.md)(큐·결과 쓰기·발췌 삭제), [ADR-0119](0119-log-explorer-source-read-port-and-evidence-refs.md)(Source 읽기·근거 위치), [ADR-0140](0140-generic-file-upload-port.md)(범용 업로드).

## 맥락

- 결과 본문의 규칙 행은 `expected`·`observed` 한 줄 500자와 근거 위치 20개뿐이다. 로컬 진단 리포트의 제목·설명·표는 담을 곳이 없다.
- `summary`는 임의 JSON이지만 4,096 bytes이고, 시도 목록에서 `platform:view`만으로 읽히는 자리다. Source에서 온 본문을 여기에 두면 Source ACL(R5) 없이 노출된다.
- 발췌는 Source 유래 본문의 선례다: 시도당 256 KiB, 원본 소유자별 `lifecycle.excerpt.read`, 읽을 때마다 감사, Round 종료 + 보관 일수 뒤 본문 삭제.

## 결정

1. **도입한다.** `AttemptDiagnostic`(시도 × 생산자당 문서 하나)과 그 안의 `DiagnosticItem`을 둔다. 규칙 결과와 1:1을 강제하지 않는다(`origin: rule | analysis`).
2. **쓰기는 별도 worker 경로.** `POST /api/v1/validation-queue/requests/:id/attempts/:attemptNo/diagnostics`(토큰 전용, `validation.worker`). 성공한 시도에만 쓰고, 결과 본문·`result_digest`·verdict 계산은 바꾸지 않는다. 같은 `(시도, producer)`에 같은 정규화 digest는 `duplicate`, 다른 내용은 `409 conflict.stale_write`. 고침은 새 시도다.
3. **유한 상한, 자동 절단 없음.** 문서 items 500, 항목당 표 4, 열 16, 행 200, 셀 500자, 제목 200자, 설명 4,000자, 시도당 정규화 UTF-8 합계 512 KiB, 생산자 4. 넘으면 422이고 아무것도 쓰지 않는다. 수치와 이유는 API 계약이 소유한다.
4. **읽기는 Source ACL.** 제목·설명·표 제목·열 라벨·셀은 Source 유래로 보고 Round 원본 소유자의 `lifecycle.excerpt.read`를 매 호출 트랜잭션에서 다시 판정하고 감사한다. 권한 없는 사람에게는 형태 메타데이터(항목 키, 출처, 규칙 연결, 표·근거 수)만 투영한다. 시도 목록의 `summary` 투영(A1)은 같은 이유로 자유 텍스트 없이 좁은 키 다섯 개만 낸다.
5. **수명은 발췌와 같다.** 본문은 발췌와 같은 보관 일수 뒤 지운다. 새 표라서 삭제 원인(`retention` | `admin`)을 열거형으로 저장하고 읽기에 내보낸다(과거 발췌 행의 R3 `unknown`과 달리 권위 있는 원인이 있다).
6. **첨부(R4)는 schemaVersion 1에 넣지 않는다.** 방향은 Source 소유 참조(CSV·PDF·PNG, 보관은 Source 수명)이며 플랫폼 저장 첨부·세션 `uploadFile` 전용은 쓰지 않는다. Source 산출물 읽기 포트가 생길 때 버전 2 필드로 연다.

## Considered Options

| 안 | 결과 |
| --- | --- |
| 별도 진단 경로 + Source ACL 읽기 (채택) | verdict·결과 멱등·발췌 상한이 그대로다. 의견 경로(ADR-0117 개정 2)와 같은 «시도 뒤 추가 쓰기» 틀이라 worker가 결과를 먼저 내고 진단을 나중에 낼 수 있다 |
| 결과 본문에 `diagnostics` 필드 추가 | 한 번에 쓰지만 `result_digest`·재제출 규칙·결과 422 범위가 진단까지 묶인다. 진단 상한 초과가 verdict 저장까지 막는다 |
| `summary` 키 확장 | 새 경로가 없지만 4,096 bytes로 표 하나도 못 담고, `platform:view` 목록 읽기라 R5를 어긴다 |
| 첨부 파일(PDF 등)만 | 구조 없이 원본 리포트를 그대로 옮기지만 화면에서 항목·규칙·근거를 잇지 못하고 worker 업로드 권한·보관 설계가 먼저 필요하다 |
| 도입 안 함(기대/관측만) | 가장 작지만 설명·표가 계속 사라진다. 소유자가 실사 대기를 거두었으므로 손실을 남길 이유가 없다 |

## 결과

- 사내 worker는 결과를 낸 뒤 진단 경로로 schemaVersion 1 문서를 보낸다. 상한을 넘는 리포트는 worker가 나눠 보내지 못하고(생산자당 문서 하나) 요약해야 한다. 상한이 실제 리포트에 좁다고 드러나면 수치를 올리는 개정으로 다룬다.
- 화면(B2)은 별도 `?variant=` 시안과 소유자 승인 뒤에 만든다. 미룬 것은 [backlog](../../.planning/backlog.md) #1815 행에 있다.
