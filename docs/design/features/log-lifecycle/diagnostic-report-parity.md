# 검증 진단 리포트 보존 설계 (#1815)

**Decided 구조 · 대부분 미구현.** 공개 코드의 정적 대조와 구현 분할을 담는다. 사내 Validator의 실제 출력은 확인하지 않았고, 소유자 결정에 따라 플랫폼이 진단 구조를 정의하며 사내가 그 구조에 맞춘다(R1·R2, [ADR-0159](../../../adr/0159-attempt-diagnostic-separate-worker-write-and-source-acl-read.md)). 기존 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)·[ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md)는 Decided로 유지한다. API 규칙은 [log-lifecycle API](../../../architecture/platform-api/api/log-lifecycle.md#진단-읽기-투영-1815), 공통 근거 위치는 [기존 설계 §3](README.md#rule_result)가 소유한다.

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

- `AttemptOut`의 기존 필드 목록과 추가 `workerSummaryProjection`, `workerSummaryState`, `workerSummary` 및 정확한 허용 키/타입(버전 1: `fixture`, `mode`, `durationMs`, `producer`, `producerVersion`)은 [API의 읽기 투영](../../../architecture/platform-api/api/log-lifecycle.md#attemptout과-summary-허용-목록)에 한 번만 정의한다(R1 Decided). 제목·설명은 summary에 두지 않고 Slice B의 ACL 읽기로 낸다.
- 규칙 상세는 저장된 기대/관측을 잘림 없는 텍스트로, 근거는 모든 행을 표로 제공한다. 이는 로컬 원문이나 제거된 개행의 복원을 뜻하지 않는다. 읽기 필드·상한·행 identity·중복 위치와 발췌 index 연결은 [API의 근거 행 계약](../../../architecture/platform-api/api/log-lifecycle.md#근거-행의-두-상태-축)을 따른다.
- 발췌/원본 상태·삭제 provenance·재인증·감사·숨겨진 대상 처리는 같은 API 계약이 소유한다. 화면은 그 상태를 구분해 표시하며, 원본 링크의 파일 순서·줄 이동은 기존 Source 통합을 사용한다. 보관된 발췌와 원본은 수명이 다르므로 하나의 상태로 합치지 않는 이유도 API를 따른다.
- `PlatformDataTable`·`DetailDrawer`·`@ap/ui`를 재사용한다. [#1809 수정 A](README.md#121-결과-중심-round-workbench-1809)가 결과 우선 탐색과 공용 우측 Drawer 구조를 확정했다. 이 문서는 진단 출력의 픽셀·문구·추가 URL 키를 정하지 않는다. UI 구현은 같은 실제 앱 variant와 소유자 Artifact 승인 뒤 진행한다.

Slice A는 풍부한 로컬 보고서 전체 parity를 약속하지 않는다. 기존 계약으로 보존할 수 없는 설명·진단표는 인벤토리에 손실과 이유를 남기고 Slice B 판단으로 보낸다.

## 3. Slice B — 버전 있는 진단과 선택 첨부

**Decided · 미구현 (R2, [ADR-0159](../../../adr/0159-attempt-diagnostic-separate-worker-write-and-source-acl-read.md)).** `AttemptDiagnostic`(시도 × 생산자당 문서 하나)과 `DiagnosticItem`을 도입한다. 규칙 결과와 1:1을 강제하지 않으며 규칙 결과·의견·사람 등록 항목과 다른 출처다. wire shape·상한·읽기·감사·수명은 [API §시도 진단](../../../architecture/platform-api/api/log-lifecycle.md#시도-진단-attemptdiagnostic-b0b1)이 한 번만 정의한다. 이 절은 설계 이유만 둔다.

- **쓰기를 결과 본문과 떼는 이유.** 별도 worker 경로라서 verdict·`result_digest`·결과 422 범위가 진단 상한에 묶이지 않는다. 의견 경로와 같은 «성공한 시도 뒤 추가 쓰기» 틀이다.
- **상한.** items 500, 표 4/항목, 열 16, 행 200, 셀 500자, 설명 4,000자, 시도 합계 512 KiB, 읽기 쪽 크기 100. 모두 유한하고 초과는 422, 조용한 절단은 없다. 수량을 곱한 값보다 합계 bytes가 실제 상한이며 발췌 256 KiB와 summary 4,096 bytes와 비교한 이유는 API가 가진다.
- **R5 적용.** 제목·설명·표 텍스트는 Source 유래로 보고 원본 소유자 `lifecycle.excerpt.read`를 매 호출 판정·감사한다. 권리 없는 사람에게는 형태 메타데이터만 간다. HTML·Markdown·수식·URL은 해석하지 않고 텍스트로만 렌더한다.
- **수명.** 본문은 발췌와 같은 보관 일수 뒤 지우고, 새 표라서 삭제 원인(`retention`·`admin`)을 권위 있게 기록한다.

**첨부 (R4 Decided, schemaVersion 1 제외).** 방향은 Source 소유 참조다. 형식은 인라인 표로 담지 못하는 경우의 최소 셋인 CSV(큰 표)·PDF(사람용 리포트)·PNG(차트 그림)이고, JSON은 구조 데이터가 인라인 표로 가므로 제외한다. 플랫폼은 내용 해시·크기·형식 참조만 두고 열기는 Source 계약의 새 ACL 판정을 거친다. 보관은 Source 수명이며 발췌 90일과 따로 간다(발췌가 지워져도 참조는 남고, Source가 지운 파일은 열 때 부재로 드러난다). 플랫폼 저장 첨부·세션 전용 `uploadFile`의 worker 전용·원본 자동 복제는 하지 않는다. Source 산출물 읽기 포트가 없어 버전 2 필드로 미루며 다시 여는 조건은 backlog가 가진다.

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
| P0 출력 인벤토리/Golden 매핑 | 사내가 플랫폼 구조에 맞춘 뒤의 적합성 기록 | 문서/fixture. A1·B1의 게이트가 아님. #1809와 독립 |
| A1 summary 안전 투영 | 이 설계 merge (R1 Decided) | **구현 가능 backend 노드.** 새 `domain/worker-summary-projection.ts`(허용 목록 버전 1 판정, 순수 함수), `repositories/queue-read.ts`의 `AttemptOut`·시도 select에 `worker_summary` 추가, 시험 `__tests__/worker-summary-projection.test.ts`(단위)·`request-queue.integration.test.ts` 확장. DDL·쓰기 변경 없음. RoundScreen 미접촉 |
| A2 **As-built** #1840 발췌/원본 상태 읽기 | 이 설계 merge + R3 삭제 provenance 결정 | backend excerpt/Source 읽기·ACL/상태 테스트. RoundScreen 미접촉, 먼저 가능. 기존 상태만으로 만료를 추정하는 구현 금지 |
| A3 상세/근거표 | A1/A2 + **#1809 merge** + 실제 앱 variant 승인 | `RoundScreen.tsx`, 화면 contracts·상세 Drawer. #1809 뒤 stack |
| A4 parity 회귀 | P0 + A1/A2/A3 | 합성 DB/read/UI 검증. UI 사양은 A3 의존 |
| B0 진단 계약 | **Decided** ([ADR-0159](../../../adr/0159-attempt-diagnostic-separate-worker-write-and-source-acl-read.md), API §시도 진단) | 문서만. #1807 공급자 선택과 동일시하지 않음 |
| B1 버전 진단 쓰기/읽기 | B0 | **구현 가능 backend 노드.** 마이그레이션(`attempt_diagnostic`·`attempt_diagnostic_item`, guard·삭제 함수 확장, `db:generate` 스냅샷), `domain/diagnostic-payload.ts`(파싱·상한·비밀 검사), `diagnostic-service.ts`, `repositories/diagnostic-write.ts`·`diagnostic-read.ts`, `worker-routes.ts`의 진단 경로, `request-endpoints.ts`의 `logLifecycle.diagnostics`·`diagnosticItem`, `excerpt-purge-job.ts`·`excerptDelete` 경로 확장, `@ap/contract-schemas` `validationDiagnostic*` 스키마, 메뉴 `log-validation-requests` 읽기 미러. RoundScreen 미접촉 |
| B2 진단 표 상세 | B1 + A3 + `?variant=` 실제 앱 시안 + 소유자 질문 답 | 화면 노드. `RoundScreen.tsx`·상세 Drawer, #1809 뒤 stack |
| B3 첨부 참조 | Source 산출물 읽기 포트 + schemaVersion 2 | Deferred(backlog #1815 행) |

**A3 상태 · 부분 구현(A2 부분만).** 규칙 상세 Drawer의 «근거·원본 라인»이 `logLifecycle.evidenceStates`를 열 때마다 읽어 근거 행마다 발췌 축(`not_submitted`·`not_loaded`·`no_permission`·`unknown`)과 원본 축(`no_permission`·`hash_mismatch`·`not_checked`)을 따로 보인다. 발췌 보기는 `not_loaded`일 때만, 원본에서 보기는 `not_checked`일 때만 열린다. 근거 상태와 발췌 본문은 Drawer 인스턴스마다 따로 읽어, 다시 열면 이전 결과 없이 새로 읽는다(오프라인으로 다시 열어도 캐시된 본문·상태를 보이지 않고 연결 뒤 새 요청만 보인다). 상태 조회 뒤 삭제된 발췌도 원인을 단정하지 않고 «발췌 상태 알 수 없음»으로 보인다(R3). A1(summary 투영)과 B1(진단 쓰기·읽기)은 계약이 Decided라 화면 없이 구현할 수 있다. A3의 summary 표시와 B2(진단 표 상세)는 화면 노드라 `?variant=` 실제 앱 시안과 소유자 승인 뒤에 만든다(루트 AGENTS §UI 시험 A: 새 상세 영역).

#1808은 [사람 등록/토론 설계](validation-issues-discussion.md)의 N1/N2 backend를 먼저 준비할 수 있지만 진단 연결 UI는 A3의 안정 참조를 따른다.

## 6. Open decisions (통합)

| ID / 상태 | 선택지·실사 질문 | 추천과 이유 |
| --- | --- | --- |
| R1 Decided (소유자 2026-11-13, 플랫폼 정의; 미구현) | Slice A 허용 키를 enum만 둘까, 검증된 자유 설명까지 열까? | 허용 목록 버전 1: `fixture`·`mode`·`durationMs`·`producer`·`producerVersion`(enum·정수·좁은 문자 집합). 자유 제목·설명은 summary에 두지 않음: `platform:view` 목록 읽기라 R5 ACL이 없고, 비밀 패턴·길이 제한으로 원본 비포함을 증명할 수 없음. 제목·설명은 R2의 ACL 읽기로 |
| R2 Decided (소유자 2026-11-13, 플랫폼 정의; [ADR-0159](../../../adr/0159-attempt-diagnostic-separate-worker-write-and-source-acl-read.md), 미구현) | 기존 기대/관측·근거로 충분한가, AttemptDiagnostic이 필요한가? 표의 열/행/셀·총량·페이지 상한은? | 도입. 별도 worker 경로, items 500·표 4·열 16·행 200·셀 500자·설명 4,000자·시도 합계 512 KiB·페이지 100. 한 줄 500자 기대/관측으로는 설명·표가 사라짐 |
| R3 Decided (소유자 2026-11-12, 추천안; 과거 삭제 provenance는 unknown) | 관리자 삭제와 retention의 과거 provenance를 어떻게 구별할까? unknown 유지, 제한된 안전 사유 읽기, 후속 provenance 보강 중 선택 | 권위가 없는 과거 행은 unknown. 만료를 추정하면 거짓 상태가 됨. 보강에 DDL이 필요하면 별도 승인 PR |
| R4 Decided (소유자 2026-11-12, 추천안; 미구현) | 첨부 불필요, Source 소유 참조, 플랫폼 attempt/issue 첨부 중 어느 범위·형식·보관 기간인가? | Source 참조 우선, 형식 CSV·PDF·PNG, 보관은 Source 수명(발췌 90일과 별도). schemaVersion 1에서 제외하고 Source 산출물 읽기 포트가 생기면 버전 2로(§3) |
| R5 Decided (소유자 2026-11-12, 추천안) | 진단 상세/첨부를 누가 읽고 생산자는 누구인가? Source 유래 표·설명을 통째로 보호할까, 검증된 메타데이터만 분리할까? | Source 유래 내용은 매 접근 ACL. 독립 metadata만 명시적으로 투영해 목록 누출 방지 |

R1–R5는 모두 Decided다. 화면 노드(A3 summary 표시, B2)는 `?variant=` 시안과 소유자 질문 답 뒤에만 구현한다.
