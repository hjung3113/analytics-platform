# 검증 진단 리포트 보존 설계 (#1815)

**Candidate · 미구현.** 공개 코드의 정적 대조와 구현 분할을 담는다. 사내 Validator의 실제 출력·변환기는 확인하지 않았으며 필드·첨부·새 스키마를 승인하지 않는다. 기존 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)·[ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md)는 Decided로 유지한다. API 규칙은 [log-lifecycle API](../../../architecture/platform-api/api/log-lifecycle.md#진단-읽기-투영-1815), 공통 근거 위치는 [기존 설계 §3](README.md#rule_result)가 소유한다.

## 1. Worker → 저장 → 읽기 → 화면 손실 매트릭스

아래 경로는 저장소 루트 기준이다. 확인은 코드 읽기이며 실행·사내 연동 검증이 아니다.

| 단계 / 코드 | 확인한 동작 | 보존·손실과 한계 |
| --- | --- | --- |
| Worker 스키마 `packages/sdk/contract-schemas/src/validation-queue.ts` | result/규칙/evidence는 strict shape. expected·observed 각 500, evidence 20/규칙·excerpt 2,000, results 2,000. summary는 임의 JSON 객체 | 새 최상위·규칙·evidence 필드는 거절하지만 **summary 내부의 표 구조 키 자체를 strict로 거절하지는 않음**. summary를 리포트 저장 우회로로 쓰면 안 됨 |
| 서버 파싱 `apps/platform-api/src/modules/log-lifecycle/domain/result-payload.ts` | 제어 문자 제거·비밀 패턴 거절, expected/observed 한 줄 정리, summary 직렬화 후 4,096 UTF-8 bytes·깊이 16, 발췌 합계 256 KiB. 초과/미지 필드는 422, 자동 절단 없음 | 원래 개행은 expected/observed에서 제거됨. SDK 문자열 max와 서버 코드포인트 계산은 동일한 측정 방식이 아님. parity는 두 파서를 따로 확인해야 함 |
| 실행/저장 `queue-service.ts` → `repositories/queue-write.ts` (동일 모듈) | summary→workerSummary, 규칙 기대/관측·근거 저장, 발췌는 별도 행. 실패 reason도 `{ reason }`으로 workerSummary에 저장. 같은 정규화 digest 재제출은 재사용 | 저장은 이미 가능. evidence 파일 참조는 sample에 있는지 검사하나 **각 evidence hash를 샘플 hash와 같도록 강제하지 않음**. 화면의 mismatch 검사가 필요 |
| 읽기 `repositories/queue-read.ts` | AttemptOut은 workerSummary를 투영하지 않음. RuleResultOut은 기대/관측·EvidenceRef/hasExcerpt·의견 요약 반환 | DB select로 시도 행을 읽어도 DTO에서 빠짐. 현재 Round 요청 읽기만 대상이며 회귀 항목은 이 경로에서 제외 |
| 발췌 읽기 `request-endpoints.ts` / `readExcerpt` | 사람 세션·객체 가시성·Source별 `lifecycle.excerpt.read` 후 읽기와 감사. `{ deleted, excerpt }` 또는 null, 권한 거절은 forbidden | Source 원본을 fetch하지 않음. deleted는 보관 삭제와 관리자 삭제를 구별하지 못함. 원본 부재·원본 현재 hash도 이 응답으로 알 수 없음 |
| `apps/feature-screens/src/features/log-lifecycle/RoundScreen.tsx` | 규칙 ID·Badge는 비클릭, 기대/관측은 truncate + title. 첫 근거는 행에, 나머지는 근거 drawer에 있음. 발췌는 pre. hash 일치·sourceView 주입 시 `원본에서 보기`로 파일 순서·줄 이동 | **근거 전체 열기와 원본/시퀀스 이동은 이미 존재**. 근거가 아예 없거나 이동 기능 자체가 없다는 주장은 부정확. 진단 상세·표는 없음. deleted를 전부 보관 만료로 표시하는 것은 현재 DTO보다 강한 해석 |
| `RequestsScreen.tsx`의 RequestDrawer | 메타데이터·Gate·ResultSummary·Attempts·Round 이동·취소 | 요약/시도만 있다는 표현은 축약이다. 규칙 진단 상세는 여기에도 없음 |
| [Attachments](../../../architecture/platform-api/api/attachments.md) / [ADR-0140](../../../adr/0140-generic-file-upload-port.md) | 수동 Round 연결과 세션 전용 uploadFile은 존재 | worker 토큰의 attempt/규칙별 리포트 자동 발행·연결 경로는 보장되지 않음 |

`tooling/scripts/validation-worker-mock.mjs`는 메타데이터로 합성 결과를 만든다. summary의 실제 예는 `fixture`, `note`, `mode`이며 사내 보고서 인벤토리가 아니다. 입력 바이트 전달은 [#1807 계약](../../../architecture/platform-api/api/log-lifecycle.md#작업자-입력-전달-1807)의 별도 책임이다.

## 2. Slice A — 기존 저장 계약으로 읽기 손실 복구

**Candidate.** 새 Worker 쓰기 필드·DDL·대용량 저장 없이 진행하는 범위다. 기존 verdict/Gate/회귀 비교·의견을 바꾸지 않는다. 이유: 상세 읽기와 기계 판정을 분리한다.

- `AttemptOut`의 기존 필드 목록과 추가 `workerSummaryState`, `workerSummary` 및 정확한 허용 키/타입은 [API의 읽기 투영](../../../architecture/platform-api/api/log-lifecycle.md#진단-읽기-투영-1815)에 한 번만 정의한다. 추천은 기존 합성 fixture의 enum 메타데이터만이며, 실제 설명 필드는 Open R1 답 후 정한다.
- 규칙 상세는 저장된 기대/관측을 잘림 없는 텍스트로, 근거는 모든 행을 표로 제공한다. 이는 로컬 원문이나 제거된 개행의 복원을 뜻하지 않는다. 읽기 필드·상한·행 identity·중복 위치와 발췌 index 연결은 [API의 근거 행 계약](../../../architecture/platform-api/api/log-lifecycle.md#근거-행의-두-상태-축)을 따른다.
- 발췌/원본 상태·삭제 provenance·재인증·감사·숨겨진 대상 처리는 같은 API 계약이 소유한다. 화면은 그 상태를 구분해 표시하며, 원본 링크의 파일 순서·줄 이동은 기존 Source 통합을 사용한다. 보관된 발췌와 원본은 수명이 다르므로 하나의 상태로 합치지 않는 이유도 API를 따른다.
- `PlatformDataTable`·`DetailDrawer`·`@ap/ui`를 재사용한다. [#1809 수정 A](README.md#121-결과-중심-round-workbench-1809)가 결과 우선 탐색과 공용 우측 Drawer 구조를 확정했다. 이 문서는 진단 출력의 픽셀·문구·추가 URL 키를 정하지 않는다. UI 구현은 같은 실제 앱 variant와 소유자 Artifact 승인 뒤 진행한다.

Slice A는 풍부한 로컬 보고서 전체 parity를 약속하지 않는다. 기존 계약으로 보존할 수 없는 설명·진단표는 인벤토리에 손실과 이유를 남기고 Slice B 판단으로 보낸다.

## 3. Slice B — 버전 있는 진단과 선택 첨부

**Candidate · 미구현, R1/R2/R4/R5 답 이후 재개.** `AttemptDiagnostic`은 규칙 결과와 1:1을 강제하지 않는 시도별 읽기 모델 후보이며 `DiagnosticItem`은 그 안의 항목 후보 명칭이다. 규칙 결과·의견·사람 등록 항목은 서로 다른 출처다. API/저장 스키마 도입은 별도 구현 PR에서 소유 문서를 고치며, 이 문서는 wire schema를 확정하지 않는다.

| 논리 필드 후보 | 제약과 이유 |
| --- | --- |
| `schemaVersion`, `attemptId`, `inputManifestDigest`, `producer`, `producerVersion` | 버전·시도·입력·생산자를 식별. 지원하지 않는 버전은 명시적 미지원 |
| `items[].itemKey`, 선택 `ruleResultId` | 같은 생산자/시도 안에서 안정 키 유지. 배열 순번·제목을 키로 쓰지 않음. 참조는 같은 시도인지 검증 |
| `origin`, `title`, `explanation` | 규칙 진단/별도 분석 출처를 명시. 의견 등급이나 사람 주장을 기계 verdict로 바꾸지 않음 |
| `evidenceRefs[]` | 기존 EvidenceRef 사용. 본문·경로·일시 URL을 identity에 넣지 않음 |
| `tables[].columns`, `rows` | 열은 안정 key·텍스트 label·scalar type 선언. 행은 열 key에 맞는 string/finite number/boolean/null만. 실행 코드·중첩 임의 객체 금지 |
| 선택 `attachmentRefs` | 원본 소유자·내용 해시·보관/접근 상태를 가리키는 안정 참조. 발행/연결 권한은 별도 설계 게이트 |

items 수, 항목별 표 수, 열 수, 행 수, 셀 길이, payload 총 bytes, 페이지 크기를 **각각 유한 상한**으로 둔다. 구체 수치는 R2의 합성 인벤토리와 읽기 예산으로 정하며 무제한·조용한 절단은 금지한다. 큰 표는 안정 순서/페이지·총량·누락 이유를 함께 제공한다. HTML·SQL·Markdown 실행/렌더 명령·수식 실행·임의 URL fetch·원본 경로는 받지 않는다. 텍스트로만 렌더하고 Source 유래 셀/설명은 원본과 같은 ACL·보관 조건을 적용한다.

첨부는 인라인 표·제한된 발췌로 해결되지 않는 경우에만 후보로 연다. PDF/CSV/JSON/이미지 중 필요한 형식·보관 주체를 R4에서 정한다. Source 소유 참조를 우선 추천하며 플랫폼 저장이 필요하면 기존 StorageBackend/Attachments seam의 재사용을 검토한다. 세션 전용 `uploadFile`을 worker 업로드로 전용하지 않는다. worker token 발행/연결, 부모 읽기 판정, 크기/MIME/내용 검사, 다운로드 중계·감사, 멱등 키, 보관/삭제·철회 시험을 설계한 뒤 별도 구현한다. 원본 전체를 자동 복제하지 않는다.

## 4. Golden report parity 확인 계획

1. 사내 출력 항목을 구조만 같은 합성 Golden report로 만든다. 제목·왜 문제인지·기대/관측·표·줄 101–105·파일 참조·생산자 버전의 각 항목을 현지에서 대조한다. 사내 원문·경로는 반입하지 않는다.
2. 필드별 표를 `Golden field → worker adapter payload path → DB field → read DTO path → 상세 표현 → 누락 이유`로 작성한다. 변환 생략/422/읽기 미투영/권한 거절/만료/원본 부재/UI 미표시를 별도로 기록한다. 서버 정규화로 제거한 개행도 손실로 명시한다.
3. Slice A fixture는 허용 summary enum·긴 기대/관측·여러 근거·중복 위치/서로 다른 excerpt index·hash mismatch를 포함한다. fail reason만 있는 시도와 summary 미제출/허용 키 없음도 확인한다. Slice B 표/첨부는 승인 전 현행 지원으로 계산하지 않는다.
4. SDK 스키마와 서버 parser 각각 한도 경계/UTF-8 bytes/코드포인트/초과 필드/secret을 확인한다. 거절이면 DB 무기록을, 성공이면 동일 digest 재제출·변경 충돌·증거 순서·읽기 전체 필드 보존을 확인한다.
5. 읽기/UI에서 미제출·권한 없음·관리 삭제/보관 만료·부재·mismatch·일시 장애를 분리한다. Source ACL 철회 후 열린 Drawer·재조회·탭 전환·목록·첨부·링크에서 본문이 재노출되지 않아야 한다. UI는 첫 상세 열기로 파일·줄·기대/관측 차이를 읽을 수 있어야 한다.
6. verdict/Gate/opinion/회귀 비교가 동일하고 감사/알림에 본문·credential이 없는지 확인한다. 공개 테스트는 합성, 실제 Validator 적합성은 내부 기록으로만 남긴다.

## 5. 구현 노드와 의존성

아래는 후속 구현 그래프이며 이 문서 변경에서 구현하지 않는다. 병렬 가능한 노드라도 배정 범위 밖 착수는 별도 승인 대상이다.

| 노드 | 선행 / 게이트 | 변경 위치와 충돌 |
| --- | --- | --- |
| P0 출력 인벤토리/Golden 매핑 | 사내 합성 등가 구조 확보, R1 | 문서/fixture. #1809와 독립 |
| A1 summary 안전 투영 | 이 설계 merge + R1의 허용 키 승인 | backend `queue-read`/DTO·읽기 권한 테스트. RoundScreen 미접촉, 먼저 가능 |
| A2 발췌/원본 상태 읽기 | 이 설계 merge + R3 삭제 provenance 결정 | backend excerpt/Source 읽기·ACL/상태 테스트. RoundScreen 미접촉, 먼저 가능. 기존 상태만으로 만료를 추정하는 구현 금지 |
| A3 상세/근거표 | A1/A2 + **#1809 merge** + 실제 앱 variant 승인 | `RoundScreen.tsx`, 화면 contracts·상세 Drawer. #1809 뒤 stack |
| A4 parity 회귀 | P0 + A1/A2/A3 | 합성 DB/read/UI 검증. UI 사양은 A3 의존 |
| B0 진단/첨부 계약 | P0 + R2/R4/R5 및 권한·보관 확정 | 별도 API/저장 설계. #1807 공급자 선택과 동일시하지 않음 |
| B1 버전 진단 쓰기/읽기 | B0 승인 | backend·schema·후속 DDL. RoundScreen 미접촉 |
| B2 표/첨부 상세 | B1 + A3 + 실제 앱 variant 승인 | `RoundScreen.tsx` 연결 가능, #1809 뒤 stack |

**A3 상태 · 부분 구현(A2 부분만).** 규칙 상세 Drawer의 «근거·원본 라인»이 `logLifecycle.evidenceStates`를 열 때마다 읽어 근거 행마다 발췌 축(`not_submitted`·`not_loaded`·`no_permission`·`unknown`)과 원본 축(`no_permission`·`hash_mismatch`·`not_checked`)을 따로 보인다. 발췌 보기는 `not_loaded`일 때만, 원본에서 보기는 `not_checked`일 때만 열린다. 근거 상태와 발췌 본문은 Drawer 인스턴스마다 따로 읽어, 다시 열면 이전 결과 없이 새로 읽는다(오프라인으로 다시 열어도 캐시된 본문·상태를 보이지 않고 연결 뒤 새 요청만 보인다). 상태 조회 뒤 삭제된 발췌도 원인을 단정하지 않고 «발췌 상태 알 수 없음»으로 보인다(R3). A1 summary 투영과 Slice B(표·첨부 상세)는 Candidate로 남는다. 다시 여는 조건: R1·R2 범위를 사내 리포트 점검 뒤 소유자가 확정할 때.

#1808은 [사람 등록/토론 설계](validation-issues-discussion.md)의 N1/N2 backend를 먼저 준비할 수 있지만 진단 연결 UI는 A3의 안정 참조를 따른다.

## 6. Open decisions (통합)

| ID / 상태 | 선택지·실사 질문 | 추천과 이유 |
| --- | --- | --- |
| R1 Open | 실제 보고서에 제목/설명/원인/통계/버전 중 무엇이 있으며 어느 것이 필수인가? Slice A 허용 키를 enum만 둘까, 검증된 자유 설명까지 열까? | enum 메타데이터로 시작하고 설명은 구조 실사 후 결정. secret 정규식만으로 원본 유출을 막을 수 없음 |
| R2 Open | 기존 기대/관측·근거로 충분한가, AttemptDiagnostic이 필요한가? 표의 열/행/셀·총량·페이지 상한은? | 실제 Golden에서 사라지는 정보가 입증될 때 B 도입. 수치는 합성 크기와 운영 예산을 함께 측정 |
| R3 Open | 관리자 삭제와 retention의 과거 provenance를 어떻게 구별할까? unknown 유지, 제한된 안전 사유 읽기, 후속 provenance 보강 중 선택 | 권위가 없는 과거 행은 unknown. 만료를 추정하면 거짓 상태가 됨. 보강에 DDL이 필요하면 별도 승인 PR |
| R4 Open | 첨부 불필요, Source 소유 참조, 플랫폼 attempt/issue 첨부 중 어느 범위·형식·보관 기간인가? | Source 참조 우선. 필요한 최소 형식만 선택하고 발췌 90일과 별도 수명 차이를 명시 |
| R5 Open | 진단 상세/첨부를 누가 읽고 생산자는 누구인가? Source 유래 표·설명을 통째로 보호할까, 검증된 메타데이터만 분리할까? | Source 유래 내용은 매 접근 ACL. 독립 metadata만 명시적으로 투영해 목록 누출 방지 |

R1–R5의 미확정 범위는 구현하지 않는다. 같은 ID의 답과 소유자 승인으로 해당 노드만 다시 연다.
