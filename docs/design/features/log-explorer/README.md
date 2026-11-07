# Log Explorer — 범용 로그 탐색 워크벤치 설계 (v0.31.0, 소유자 답 반영, 노드 a·c 구현됨)

> **Status: Candidate → 소유자 답 7개 반영(2026-11-07), ADR 0119·0121 Decided.** 노드 a(읽기 포트·`@ap/contract-schemas v0`·계약 테스트 하니스·합성 어댑터·모듈 골격)는 구현됐고(#1467), 읽기 엔드포인트 네 개(노드 c, #1469: records·window·parsed·periods)도 구현됐다. 조사 상태 DB·화면·실제 Source 연동은 아직 구현되지 않았고, 운영 조립에는 Source 어댑터가 없어 읽기는 «미연결» 상태로 답한다. 근거는 [#1344](https://github.com/hjung3113/analytics-platform/issues/1344)이고, [#1330](https://github.com/hjung3113/analytics-platform/issues/1330) Epic과 v0.30.0 설계 [`log-lifecycle`](../log-lifecycle/README.md)을 **재사용**한다(중복 설계 금지). 릴리스는 v0.31.0(= #1198 + #1344, 소유자 2026-11-07). 결정은 [ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md)(읽기 포트·토큰·내보내기)와 [ADR-0121](../../../adr/0121-ordered-interval-track-sdk-piece.md)(시퀀스 SDK 조각)이 소유하고, 실제 코드와 Decided ADR이 이 문서보다 우선한다. 결정마다 «소유자 2026-11-07»로 표시한다.
>
> **구현 상태.** 노드 b(조사 스키마·액션·읽기, [#1468](https://github.com/hjung3113/analytics-platform/issues/1468))는 구현됨: 모듈 [`log-explorer`](../../../../apps/platform-api/src/modules/log-explorer/AGENTS.md), 계약 [api/log-explorer.md](../../../architecture/platform-api/api/log-explorer.md). 그 밖의 노드는 구현 전이다. 구현이 이 문서의 §3.2와 다른 곳: 근거 위치의 권한 철회 상태는 읽는 사람 기준 두 가지 사유(`capability_lost`, `round_not_visible`)이고 Source ACL 판정은 노드 c의 이음새로 남는다.
>
> 원본 로그의 소유자(Source API)·Parser·Top View(#1200)는 사내 쪽에서 개발 중이거나 실사 전이다. 이 슬라이스는 **읽기 포트와 합성 어댑터까지만** 만들고 «연동됨» 표시를 두지 않는다.

## 1. 이 설계가 하는 것

검증 Round가 없어도 쓰는 **로그 조사 진입점** 하나를 정한다. 한 화면에서 아래를 한다.

1. 권한 있는 Sample(순서 있는 파일 목록)을 골라 원본 레코드를 서버 페이지로 탐색한다.
2. 로그 타입·시간·Module·Event·Job/Wafer/Robot/Process Context로 거르고, 선택한 레코드의 **연관 이벤트**를 본다.
3. **원본 줄 → 추출 필드 → Parser 입력/출력 → 규칙 결과(`rule_result`)**을 양방향으로 따라간다(1:1을 가정하지 않는다).
4. 같은 레코드를 **원본 보기**와 **시퀀스 보기**(시작/끝 쌍·상태 전이)로 전환해 본다. 메뉴는 하나다.
5. 고른 근거 위치를 새·기존 Round, 결함, 지식 초안에 **참조**로 넘긴다(소유자 2026-11-07: 이번 릴리스에 포함, §5.2). 넘기는 것이 공식 FAIL이나 기술 지식 확정이 되지 않는다.
6. 토큰(자동화)으로도 같은 읽기를 하고, 범위를 좁힌 **내보내기**를 한다(소유자 2026-11-07, §4.1).

같은 `LogInvestigationView`를 **독립 메뉴**와 **#1330 Round 상세의 «원본/시퀀스» 탭**이 쓴다. 두 곳은 같은 Source 계약과 같은 컴포넌트를 쓰고 데이터 경로를 따로 만들지 않는다.

하지 않는 것(§9에 다시 여는 조건): Parser·Validator·LLM 로직의 프런트 구현, 원본 로그의 플랫폼 DB 복제, 실시간 수집, Top View 자체, LLM 해석 저장, 결함 수신 쪽 구현(수신 객체가 아직 없음, §5.2).

## 2. 책임 경계와 용어

#1344 §데이터/소유 경계와 [log-lifecycle §2](../log-lifecycle/README.md#2-책임-경계와-용어)를 따른다. 요약:

| 무엇 | 소유 | 플랫폼이 가지는 것 |
| --- | --- | --- |
| 원본 로그·Parser Raw·기간 행·실행 결과 | 각 Source/Parser/Validator | **없음**(요청 중 전달만, 저장 없음) |
| 원본 위치 | Source 소유자 | 안정 Source ID, `fileRef`+`line`, `fileSha256`, 파일 순서 |
| 조사 상태 | 플랫폼 | 샘플 목록·필터·근거 위치 바구니(참조만) — §3 |
| 규칙 결과(`rule_result`) | Validator → `log-lifecycle` | 이미 있는 `rule_result.evidence`를 **읽어** 역조회 |

- **판정 축 분리.** 탐색은 읽기다. 조사 중 행위(북마크, 근거 위치 담기, 필터)는 어떤 판정·Gate·지식 상태도 바꾸지 않는다. 스크립트 판정·LLM 가설·사람 검토는 서로 다른 열로 표시하고 서로 덮지 않는다.
- **순서 보존.** 순서는 사용자가 확정한 **파일 순서 → 줄 번호**다. timestamp로 재정렬하지 않는다. 시간 역전은 재정렬하지 않고 «시간 역전» 표시만 붙인다.
- **Carryover.** 파일 경계에서 열린 시작 이벤트는 오류로 확정하지 않고 `incomplete`(불완전/미검증)로 보인다.
- **EquipmentId 추정.** 입력에 없을 수 있다. Model/Source 메타데이터에서 얻은 값은 `confirmed`, 추정한 값은 `inferred`로 구분해 보인다.
- **용어.** `Round`·`sample_set`(샘플 목록)·`fileRef`·`spec_pin`은 log-lifecycle 용어 그대로. 규칙 결과(`rule_result`)는 «규칙 결과»로 쓰고 «검증 Finding»은 쓰지 않는다(소유자 2026-11-07, #1463). «로그 분석기»·«시퀀스 분석기»라는 별도 메뉴 이름을 만들지 않는다.

## 3. 데이터 모델 (확정 DDL 아님)

### 3.1 원본은 저장하지 않는다 — Source 읽기 포트

플랫폼 서버가 Source 소유자 어댑터를 부르는 **읽기 포트**를 정한다(결정은 [ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md)). 브라우저가 Source를 직접 부르지 않는다. 이유는 매 요청 ACL 판정, 상한 강제, 감사를 서버 한 곳에서 하기 위해서다.

```text
SourceReadPort (capability discovery 후 지원하는 것만 노출)
  describe(sourceOwner)                              → { capabilities, limits, available }
  searchRecords(sampleSet, query, cursor, limit)     → { rows, nextCursor, partial }
  getWindow(fileRef, line, before, after)           → { rows, truncated }
  getParsed(fileRef, line)                           → { extractedFields, parserIn, parserOut } | unsupported
  getPeriods(sampleSet, query, cursor, limit)        → { rows(start,end,state,incomplete), nextCursor } | unsupported
  getTopViewLink(fileRef, line)                      → { url } | unsupported
```

- 모든 호출은 서버가 `sourceOwner` 범위 ACL을 **그 요청에서** 판정하고, 요청 취소(`AbortSignal`)와 시간 예산을 강제한다.
- 상한(시작값, 측정 후 조정): 한 응답 행 200, 행당 본문 8,000자(넘으면 `truncated=true`로 표시하고 자르지 않은 척하지 않음), 창 `before/after` 각 100(대상 줄 포함 한 응답 200행 상한이 우선하므로 `before + after + 1 > 200` 요청은 `invalid_request`로 거부하고 조용히 자르지 않음), 요청 시간 예산 10초. 브라우저에 전체 파일을 내려 한 번에 파싱하지 않는다.
- `unsupported`는 오류가 아니라 **명시된 상태**다(«Parser 추적 미연결», «기간 행 미지원», «Top View 미연결»). 가짜 trace·가짜 Top View·가짜 판정을 만들지 않는다.
- 사내 Source API가 확정되기 전에는 **합성 어댑터**(synthetic fixture)만 있고 화면·PR에 «합성»을 표시한다. 운영 연동 완료로 쓰지 않는다.

### 3.2 `investigation` (조사 상태, 최소)

주소에 샘플 목록·필터를 직렬화할 수 없으므로([log-lifecycle §6.5](../log-lifecycle/README.md#65-url)) 공유 가능한 조사 상태만 저장한다. 스키마 후보 `log_explorer`.

`id`, `workspace_id`, `title`, `owner_actor_id`, `origin`(`standalone`·`round`), `round_id?`, `sample_set`(샘플 목록 jsonb — 모양은 [log-lifecycle §3 `validation_round.sample_set`](../log-lifecycle/README.md#validation_round) 한 곳이 정의하고 여기서 다시 정의하지 않는다), `filters`(jsonb), `evidence`(jsonb 배열 `EvidenceRef`, 최대 100), `status`(`open`·`archived`), `row_version`, 생성·수정 시각.

- `EvidenceRef`는 [log-lifecycle §3 `rule_result.evidence`](../log-lifecycle/README.md#rule_result)가 정의한 공통 근거 위치(`fileRef`, `line`, `fileSha256`)이고, 조사 상태에서만 `note?`를 더해 저장한다(규칙 결과 쪽의 `hasExcerpt`는 그 결과 항목의 메타데이터다). **본문·발췌를 담지 않는다.** 담긴 근거 위치를 다시 열면 Source에서 그 순간 권한으로 다시 읽는다.
- `origin='round'`는 Round의 `sample_set`을 복사하지 않고 `round_id`로 참조한다(Round가 요청을 가진 뒤에는 불변이므로 안전). 독립 조사는 사용자가 지정한 순서 있는 파일 목록이다.
- 권한이 철회되면 저장된 `EvidenceRef`는 남지만 열 때 `권한 없음`으로 보인다(삭제하지 않음).
- 필터 값은 감사·사용 이벤트에 **키만** 남기고 값은 넣지 않는다([ADR-0020](../../../adr/0020-usage-events-identity-fields-only.md) 정신).

### 3.3 근거 위치 역조회 — 규칙 결과 쪽

`log-lifecycle.rule_result.evidence`는 jsonb 배열이라 `(fileRef, line, fileSha256)`로 역조회하려면 정규화 색인이 필요하다. 후보: `rule_result_evidence(rule_result_id, file_ref, line, file_sha256)` 사이드 테이블을 `log-lifecycle`에 추가(소유는 lifecycle, 탐색 모듈은 읽기 포트로만 조회). 결정은 D4.

## 4. 서버 모듈 경계

`apps/platform-api/src/modules/log-explorer/` — 새 인증·권한 서비스를 만들지 않고 기존 Fastify 진입점·Menu Dispatch·Core 감사를 쓴다.

```text
log-explorer/
  deps.ts                 # db, clock, sourceReadPort(어댑터 주입), lifecycleRead(읽기 포트), audit
  domain/                 # EvidenceRef 정규화, 상한 계산, 시간 역전 표식 (순수 함수)
  ports/source-read.ts    # §3.1 계약(타입 + 계약 테스트 하니스)
  adapters/synthetic/     # 합성 fixture 어댑터 (dev·테스트 전용, 운영 그래프 금지)
  repositories/           # investigation
  investigation-endpoints.ts / investigation-actions.ts
  record-endpoints.ts     # search·window·parsed·periods·evidence 역조회 (menu-query)
  index.ts
```

- **운영 그래프에 합성 어댑터 금지.** 운영 조립이 실제 어댑터를 주입하고, CI가 운영 그래프에 합성이 없음을 확인한다([ADR-0009](../../../adr/0009-production-assembly-injection.md)와 같은 방식).
- **교차 모듈.** `log-lifecycle` 읽기 포트(Round `sample_set`, `rule_result` 역조회), `log-knowledge` 읽기 포트(모델·SW 확인). 다른 모듈 DB에 쓰지 않는다.
- **계약 산출물.** `SourceReadPort` 요청·응답 스키마는 `@ap/contract-schemas`에 `v0`(잠정)로 낸다. 메뉴 엔드포인트는 기존 `endpoints.json` 규칙을 따른다.

### 권한 (capability, 이름 후보)

| capability | 무엇 | 부여 |
| --- | --- | --- |
| `platform:view` | 메뉴 진입, 내 조사 목록 | 로그인 사용자 전체 |
| `explorer.investigate` | 조사 만들기·편집·근거 위치 담기 | Workspace 범위 |
| `explorer.source.read` | 원본 레코드·창·Parser 추적 열람 | **`sourceOwner` 범위**(원본 Source ACL을 따름), 요청 단위로 서버가 판정. 토큰 scope에 넣을 수 있음 |
| `explorer.export` | 내보내기 | `sourceOwner` 범위, `explorer.source.read`와 **별개**(읽기만 가진 토큰은 내보낼 수 없음). 토큰 scope에 넣을 수 있음 |
| `explorer.handoff` | 근거 위치를 Round·결함·지식 초안으로 넘기기 | Workspace 범위. 받는 쪽 capability도 따로 필요(§5.2) |

### 4.1 토큰 호출과 내보내기 (소유자 2026-11-07: 허용, 범위·감사·상한을 설계에 포함)

[ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md)을 그대로 쓴다: 유효 권한 = 발급자의 현재 권한 ∩ 토큰 scope, 고위험 동작(발행·승인·Gate·권한 부여·토큰 발급)은 세션 전용이다. 원본 읽기·내보내기·근거 위치 넘기기는 고위험 목록에 없으므로 토큰으로 가능하지만 본문이 플랫폼 밖으로 나가므로 아래를 **추가로** 둔다.

| 항목 | 규칙(시작값, 측정 후 조정) |
| --- | --- |
| scope | 토큰은 `explorer.source.read`·`explorer.export`·`explorer.investigate`를 각각 고른다. 묶음 별칭 «로그 탐색(조회)» = `source.read`만. 내보내기는 별칭에 넣지 않는다 |
| 서비스 토큰 | `sourceOwner` 범위 grant를 서비스 Actor에 **명시적으로** 줘야 한다. 발급 주체는 관리자만(ADR-0116) |
| 읽기 상한 | 세션과 같다: 응답 행 200(창은 대상 줄 포함), 행당 본문 8,000자, 창 한쪽 100, 시간 10초 |
| 토큰별 일일 본문 예산 | 응답 본문 합계 50MB/일(토큰·Actor 각각). 넘으면 `explorer.budget_exceeded`로 거절하고 잘라 주지 않는다 |
| 내보내기 범위 | 샘플 목록 + 조건 + 줄 범위를 **명시한 요청 하나**가 한 번의 내보내기. 최대 10,000행·5MB, 텍스트 형식 두 가지(CSV, JSONL). 넘으면 거절(자르지 않음) |
| 내보내기 생성 | 요청 때 서버가 Source에서 읽어 스트리밍으로 내려 준다. 파일을 플랫폼에 저장·캐시하지 않는다. 매 요청 ACL 재판정, 취소 가능 |
| CSV 안전 | 셀이 `= + - @` 등으로 시작하면 접두를 붙여 수식으로 해석되지 않게 한다 |
| 동시성 | 토큰·Actor당 동시 내보내기 1건, 일일 내보내기 횟수 상한(20) |
| 감사 | 읽기·내보내기·넘기기마다 `core.audit_log`: 누가(Actor, 토큰 ID·`via_token`), 무엇을(`sourceOwner`, 조사/샘플 목록 digest, 파일 ID 수, 필터 **키**), 얼마나(행 수·바이트), 결과(성공·거절 사유). **본문과 필터 값은 쓰지 않는다** |
| 관리자 집계 | 토큰·Actor별 읽기/내보내기 바이트·건수 집계 조회(관리자). 이상 징후 기준은 구현 때 측정 |
| 철회 | 토큰 폐기·발급자 권한 감소·`sourceOwner` grant 철회는 다음 호출부터 반영. 진행 중 스트림은 다음 청크 경계에서 중단 |
| LLM·검색 색인 | 이번 슬라이스에서 원본 본문을 LLM 입력·검색 색인·알림으로 보내지 않는다(같은 ACL·상한이 적용되는 경로가 설계되면 §9에서 연다) |

## 5. API 목록 (v0.31.0)

### 읽기 — `POST /api/v1/menu-query`

| Endpoint id | 용도 | 비고 |
| --- | --- | --- |
| `logExplorer.investigations` | 내 조사 목록 | |
| `logExplorer.investigationDetail` | 조사 머리 + 세트 + 필터 + 근거 위치 | `investigationId` |
| `logExplorer.records` | 원본 레코드 서버 페이지(커서) | 상한 §3.1; 권한 철회·원본 부재는 행이 아니라 상태로 응답 |
| `logExplorer.window` | 한 줄 주변 창 | |
| `logExplorer.parsed` | 줄의 추출 필드·Parser 입·출력 | `unsupported` 가능 |
| `logExplorer.periods` | 기간 행(시작/끝 쌍, `incomplete` 포함) | `unsupported` 가능 |
| `logExplorer.evidenceLinks` | 한 줄을 가리키는 규칙 결과·Round 역조회 | lifecycle 읽기 포트 |

### 쓰기 — `POST /api/v1/menu-action`

| Action | `input` | 동시성 |
| --- | --- | --- |
| `logExplorer.investigationCreate` | `title`, `origin`, `sampleSet?`/`roundId?` | none |
| `logExplorer.investigationUpdate` | `id`, `filters?`, `title?` | version |
| `logExplorer.evidenceAdd` / `evidenceRemove` | `id`, `ref` | version |
| `logExplorer.investigationArchive` | `id` | version |

| `logExplorer.evidenceHandoff` | `id`, `refs[]`, `target`(`round`·`defect`·`knowledgeDraft`, 기존 ID 또는 새로 만들기), `note?` | version(조사), 받는 쪽 동시성은 받는 쪽 계약 |

### 내보내기 — 토큰·세션 공용 REST (`v0`)

```text
POST /api/v1/log-explorer/export   { investigationId | sampleSet, query, range, format: csv|jsonl }
  → 200 text/csv | application/x-ndjson (스트리밍, 저장 없음) | 4xx 사유 코드(budget_exceeded·range_too_large·forbidden·source_unavailable)
```

`menu-query` 봉투는 JSON 응답용이라 스트리밍 다운로드는 별도 REST로 둔다. 인증은 세션 또는 토큰이고 §4.1 규칙을 따른다. 요청·응답 스키마는 `@ap/contract-schemas`에 `v0`로 낸다.

### 5.2 근거 위치 넘기기 계약

탐색은 `EvidenceRef[]`(본문 없음)를 **받는 쪽이 소유한 서비스 인터페이스**에 넘긴다. 탐색 모듈이 받는 쪽 DB에 쓰지 않는다. 넘기는 동작은 «참조 전달»이고 공식 FAIL·결함 확정·기술 지식 확정이 아니다(확인 문구를 화면에 둔다).

| 대상 | 받는 쪽 | 매핑 | 선행 |
| --- | --- | --- | --- |
| Round | `log-lifecycle` — 수동 검증 첨부 = Core 첨부 + entity link([log-lifecycle D6](../log-lifecycle/README.md#10-open-decisions-이-문서)) | `EvidenceRef` → Round의 등록 entity link(`fileRef`, `line`, `fileSha256`; 이 참조는 `sample_set`에 있는 `fileRef`만 허용) | v0.30.0 노드 c(첨부 type 등록 확인) |
| 지식 초안 | `log-knowledge` 초안 제출([#1198](https://github.com/hjung3113/analytics-platform/issues/1198)) | `EvidenceRef` → 초안의 `source_asset_ref` + `locator_snapshot`(`fileRef`·`line`·`fileSha256`), `excerpt_digest`는 비움. 초안 본문은 사람이 #1198 화면에서 쓴다 | **#1198 초안 제출 서비스가 먼저**(같은 릴리스, 노드 순서 §7) |
| 결함 | 결함 객체의 수신 서비스 | `EvidenceRef` → 결함 근거 참조 | **수신 객체가 아직 없음**(lifecycle 결함·재검증은 P3). 수신 인터페이스만 정하고 연결은 객체가 생길 때(질문 상태: 팀장에게 올림) |

- 받는 쪽은 `EvidenceRef`의 `fileSha256`이 Source 현재 값과 다르면 `hash_mismatch` 경고를 붙여 저장하고, 원본이 없으면 `unresolved`로 둔다. 가짜 근거로 대체하지 않는다.
- 같은 요청 재전송은 `idempotencyKey`로 한 번만 반영한다. 받는 쪽 거절(권한·동시성)은 조사 상태를 바꾸지 않는다.
- 토큰 호출도 가능하지만 받는 쪽 capability(예: 지식 초안 제출)가 토큰에 있어야 하고, 지식 발행·승인 등 고위험 동작은 이 경로에 없다([#1198](https://github.com/hjung3113/analytics-platform/issues/1198): AI/Validator는 Draft 제출 전용).

## 6. 화면 IA (analysis-platform-wireframe)

### 6.1 Requirements

- 개발 담당자: Round 전에도 샘플을 열어 «이 줄이 어디서 왔고 무엇과 연결되는지» 확인한다.
- 검토자: 규칙 결과의 근거 줄에서 출발해 앞뒤 맥락과 시퀀스를 본다.
- 운영자: 대용량 샘플에서도 화면이 멎지 않고, 권한 철회·원본 부재가 이유와 함께 보인다.

### 6.2 IA — 메뉴 배치

소유자 2026-11-07: 「로그 분석」 그룹을 **신설**한다(추천 «기존 `logModels` 그룹»과 다름). 그룹 정의는 `apps/platform-web/src/menus.ts`의 `GROUPS`(조립 지점)에 둔다. 후보 id `logAnalysis`, 라벨 `로그 분석`/`Log analysis`, 공간 `log-dev`. 이 그룹은 Round가 없는 조사 진입점을 모으는 곳이고, 이후 «사용자 지정 순서 파일 조사» 같은 메뉴가 늘면 여기에 둔다.

```text
log-dev
├─ logModels (기존)       모델 목록 · 검증 요청
└─ logAnalysis (신설)     「로그 분석」
   ├─ 로그 탐색           log-explorer       /log/explorer                     [Analysis Workspace, 신규]
   └─ (navHidden)         log-explorer-view  /log/explorer/:investigationId
```

- 새 **화면**은 1개이고(목록은 진입 서랍/선택기로 흡수) 새 **그룹**은 1개다. 메뉴 패키지는 `menus/log-dev/log-analysis`(`@ap/menu-log-analysis`)로 `pnpm gen:menu`를 쓴다. 그룹 순서는 `logModels` 뒤.
- 소유자가 신규 3화면(탐색 1 + 데이터셋 2, [log-test-datasets](https://github.com/hjung3113/analytics-platform/pull/1458))을 승인했다(2026-11-07).
- 시각이 바뀌므로 구현 전 `?variant=` 2–3안을 아티팩트로 컨펌받는다(시퀀스 SDK 조각 시안은 §6.6).
- Round 상세의 «원본/시퀀스» 탭은 `log-lifecycle` 화면(노드 f)의 탭 슬롯에 `LogInvestigationView`를 꽂는다. Sequence를 별도 메뉴로 분리하는 재검토 조건은 §9.

### 6.3 Conceptual Contract

**조사 화면 (Analysis Workspace)**
- 상단: 샘플 목록 선택기(순서 있는 파일 목록, 순서 변경 가능·시간순 자동 정렬 없음), 조건 바(로그 타입·기간·Module·Event·Context 키).
- 본문 좌: 가상화된 **원본 이벤트 목록**(서버 커서 페이지, 원본 순서). 열: 순번, 파일, 줄, 시간, 타입, 요약. 시간 역전·Carryover·`inferred` 표식.
- 본문 우: 선택 레코드 **상세/근거 위치 서랍**(`DetailDrawer`): 원문 줄(텍스트로만 렌더, HTML 해석 금지), 추출 필드, Parser 입·출력, 연결된 규칙 결과·Round(링크), `fileSha256`·`fileRef:line`.
- 보기 전환: `원본` ↔ `시퀀스`(같은 조건·같은 선택 유지). 시퀀스는 SDK 범용 조각(§6.6)에 Source가 돌려준 **기간 행**(시작/끝 쌍, 상태 전이)을 넘겨 로그 순서로 그린다. 짝 맞추기·전이 판정은 프런트가 하지 않는다. 미지원이면 «기간 행 미지원» 안내.
- Top View: 확인된 연결(#1200)이 있을 때만 링크, 아니면 «미연결» 표시.
- 근거 위치 바구니: 서랍/패널에서 줄을 담고 빼며, 담긴 참조는 조사 상태로 저장된다. 「넘기기」 메뉴는 Round·지식 초안·결함 대상을 보이고, 받는 쪽이 아직 없거나 권한이 없으면 비활성 + 이유를 보인다(§5.2). 확인 문구: «참조만 전달됩니다. 공식 FAIL·기술 지식 확정이 아닙니다».
- 내보내기: 현재 조건·줄 범위를 보여 주고 한도(행·바이트·일일 예산 잔량)를 안내한 뒤 내려받는다. 권한이 없으면 숨기지 않고 이유를 보인다.
- 상태: 로딩·취소, 대용량 부분 결과(`partial`), 원본 부재, 권한 철회(«권한 없음» 사유), 상한 초과(`truncated`), 합성 데이터 배지. 모든 빈 상태는 이유를 말한다.

**표시 규칙(반례 방지)**
- 한 줄이 0개·여러 개의 ParsedRecord·기간 행·규칙 결과와 연결될 수 있다. 연결은 목록으로 보이고 «관련 없음»도 정상 상태다.
- 스크립트 판정과 LLM 가설은 별도 열·별도 배지. 이 슬라이스에는 LLM 가설 저장이 없다.

### 6.4 Wireframe 수준

1440×900과 1280 폭만 다룬다(데스크톱 범위). 새 컴포넌트를 먼저 만들지 않는다: `PlatformDataTable`(서버 페이지·가상화)·`DetailDrawer`·`DataTrustIndicator`·기존 차트 프레임을 찾는다. 시퀀스 보기는 처음부터 SDK 범용 조각이다(소유자 2026-11-07, §6.6). 이 설계 PR에는 시안이 없다.

### 6.5 URL

`/log/explorer/:investigationId`. 조사 ID만 주소에 둔다. 원본 위치·샘플 목록·필터 값·본문을 직렬화하지 않는다. 선택한 줄은 화면 상태(복원 계약)로만 둔다.

### 6.6 시퀀스 SDK 조각 (`OrderedIntervalTrack`, 이름 후보)

소유자 2026-11-07: 시퀀스 보기를 메뉴 로컬이 아니라 **처음부터 `@ap/components` 범용 조각**으로 만든다([ADR-0121](../../../adr/0121-ordered-interval-track-sdk-piece.md), [ADR-0052](../../../adr/0052-rich-content-stays-in-the-sdk.md)·[ADR-0118](../../../adr/0118-dynamic-hierarchy-navigation-sdk-piece.md)과 같은 원칙). 도메인(Job/Wafer/로그)을 모르는 조각이라 소비자 수와 무관하게 SDK에 둔다. 계약 원본은 `docs/contract/components.md`(§13)와 `chart.md`(§16)가 소유하고 구현 노드에서 갱신한다.

- **입력.** 줄(lane) 선언(`laneKey`, 라벨)과 항목: 구간(`{ id, laneKey, orderStart, orderEnd?, state, label }`)과 점 이벤트. `orderEnd` 없음 = 열린 구간(`open`)이고 끝이 있는 구간과 다르게 그린다(불완전을 확정 오류로 보이지 않음). 상태(`state`)는 메뉴가 선언한 이름·색 토큰 매핑이고 조각은 의미를 모른다.
- **축.** 기본은 **순서 축**(`orderStart/End` = 소비자가 준 서수, 예: 파일 순서→줄). 시간 라벨은 선택 표시로만 붙이며 조각이 시간으로 재정렬하지 않는다(순서 보존은 보안·정합성 이유로 계약에 둔다). `axis: 'time'`은 소비자가 시간 축을 명시했을 때만.
- **대용량.** 가시 구간 창만 그리고(가상화), 창이 바뀌면 `onRangeRequest(orderFrom, orderTo, signal)`로 소비자에게 지연 로딩·취소를 맡긴다. 한 번에 받는 항목 수 상한은 성능 이유로 계약에 둔다.
- **상호작용.** 선택·hover·키보드 이동(줄/항목), `Zoom/Brush`는 chart.md §16 공통 Interaction을 따른다. 선택 변경은 `onSelect(item)`로 소비자에게 알리고 원본 목록 선택과 동기화는 메뉴가 한다.
- **상태.** 로딩·빈(이유)·오류·부분 결과(`partial`)·권한 없음·기간 행 미지원은 소비자가 문구를 넘기고 조각이 프레임을 그린다.
- **접근성.** 항목 목록을 텍스트 대안으로 제공하고 색만으로 상태를 구분하지 않는다.
- **기본 동작 불변.** 선택 조각이라 쓰지 않는 메뉴에 영향 없음. 시각이 바뀌는 새 부품이라 구현 전 `?variant=` 2–3안(줄 막대·상태 띠·스윔레인)을 아티팩트로 컨펌한다. 검증용 합성 소비자(수천 항목 fixture)를 SDK 견본에 둔다.

## 7. 구현 노드 분할 (제안)

티어는 `tier.sh`·PROFILE §Size and path 기준. 한 노드 = 한 PR 기본. 선행은 v0.30.0 노드 c(스키마)·d(요청 큐 `rule_result`)·f(Round 화면)와 같은 릴리스의 #1198 초안 제출 서비스.

| 노드 | 내용 | 기대 티어 | 선행 |
| --- | --- | --- | --- |
| 0 | ADR 0119·0121 Decided 반영 + GLOSSARY 용어 확인 | light | 소유자 답(완료) |
| a | `SourceReadPort` 계약·`@ap/contract-schemas v0`·계약 테스트 하니스·합성 어댑터·모듈 골격 (**구현됨, #1467**: 엔드포인트·테이블·마이그레이션 없음) | full, `impl-complex`(데이터 유출 경계) | 0 |
| b | `investigation` 스키마·액션·읽기, 권한 철회·낙관적 동시성 | full | 0, v0.30.0 c |
| c | 읽기 엔드포인트: records·window·parsed·periods (상한·취소·부분 결과) (**구현됨, #1469**: [`api/log-explorer.md`](../../../architecture/platform-api/api/log-explorer.md); 마이그레이션 없음) | full, `impl-complex` | a |
| d | `rule_result_evidence` 사이드 테이블 + `evidenceLinks` | full | v0.30.0 d |
| e | **시퀀스 SDK 조각** `OrderedIntervalTrack` + 합성 소비자 + 시안(`?variant=`) + `sdk:api` | full, `impl-complex`(공개 API), `ux=required` | 시안 컨펌 |
| f | 토큰 scope 등록·읽기 예산·내보내기 REST·감사·집계 (**구현됨, #1472**: [`api/log-explorer.md`](../../../architecture/platform-api/api/log-explorer.md) 「Tokens…」·「Export REST」; 마이그레이션 없음 — 카운터는 기존 `core.rate_limits`) | full, `impl-complex`(권한·유출 경계), `flags.permission` | a, c, [ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md) 노드 a(v0.30.0) |
| g | 「로그 분석」 그룹·`menus/log-dev/log-analysis` + 조사 화면 + `LogInvestigationView` + 시안 | full, `ux=required`, 시각 부분 `impl-complex-sol` high | b, c, e, 시안 컨펌 |
| h | 근거 위치 넘기기: 수신 인터페이스(Round·지식 초안), 확인 문구, 감사 | full, `impl-complex`(교차 모듈 쓰기) | b, **#1198 초안 제출 서비스**, v0.30.0 c |
| i | Round 상세 «원본/시퀀스» 탭 연결 | full, `ux=required` | g, v0.30.0 f |
| j | 결함 수신 연결 | full | **결함 수신 객체가 생긴 뒤**(§9) |
| k | 통합: 계약 E2E(합성 Source → 탐색 → 근거 위치 담기 → 넘기기 → 권한 철회, 토큰 읽기·내보내기 한도), 문서 소유 갱신, `.planning` 줄 | full | a–i |

병렬: a∥b, d·e는 독립. **순서 의존(레인):** 노드 h는 #1198 초안 제출 서비스 노드가 먼저 병합되어야 하고, #1198이 v0.31.0 안에 없으면 h의 지식 초안 대상만 비활성으로 두고 나머지를 진행한다. 도메인 스키마를 바꾸는 노드(b·d)는 마이그레이션 노드 규칙(전체 백엔드 `test:integration`)을 따른다.

## 8. 반례와 대응

| 위험 | 대응 |
| --- | --- |
| 수백만 줄 샘플을 브라우저가 통째로 파싱 | 서버 커서 페이지·상한·취소만 허용, 전체 다운로드 경로 없음(내보내기도 범위·행·바이트 상한) |
| timestamp 정렬로 로그 순서가 뒤집힘 | 정렬은 파일 순서→줄 번호 고정, 역전은 표식만. SDK 조각도 서수 축 기본 |
| 파일 경계에서 열린 시작을 오류로 확정 | `open`/`incomplete` 표시, 판정에 쓰지 않음 |
| 원본이 없는데 trace·Top View를 그림 | `unsupported`/`unresolved` 상태만, 합성 어댑터는 합성 배지 |
| 권한 철회 뒤에도 저장된 근거 위치·URL·검색 결과로 본문 노출 | 저장은 참조만, 열 때마다 서버가 ACL 재판정 |
| 본문이 감사·알림·사용 이벤트·URL로 새어 나감 | 본문 금지, 필터 키만 기록 |
| 토큰 유출로 대량 본문 반출 | 토큰별 일일 본문 예산·내보내기 횟수·동시 1건, 서비스 토큰은 `sourceOwner` grant 명시, 폐기 즉시 반영, 관리자 집계 |
| 읽기만 허용한 토큰이 내보내기 | `explorer.export`가 별도 scope, 서버가 거절(`forbidden`) |
| 내보낸 CSV의 수식 실행 | 접두 이스케이프 |
| 내보내기 요청이 범위를 부풀림 | 요청마다 범위 명시, 한도 초과는 거절(자르지 않음) |
| 원본 줄의 HTML·스크립트 | 텍스트로만 렌더, 신뢰하지 않는 입력 |
| 한 줄에 규칙 결과가 여럿이거나 없음을 1:1로 오해 | 연결은 목록, «관련 없음» 정상 상태 |
| 근거 위치 넘기기를 공식 FAIL·지식 확정으로 오해 | 참조 전달 확인 문구, 받는 쪽은 초안·첨부 상태만 만듦, 승인·발행은 사람 세션 |
| 넘긴 뒤 원본 해시가 바뀜 | 받는 쪽이 `hash_mismatch` 경고 저장, 원본 없음은 `unresolved` |
| 같은 넘기기 재전송 | `idempotencyKey`로 한 번 반영 |
| 스크립트·LLM 이견을 한쪽이 덮음 | 별도 열, 자동 덮어쓰기 없음 |
| EquipmentId 추정을 확정처럼 표시 | `confirmed`/`inferred` 구분 |
| 합성 fixture 성공을 연동 성공으로 오인 | 화면·PR·테스트 이름에 «합성» 표기, 운영 그래프에 합성 금지 |

## 9. 미구현 목록 (다시 여는 조건)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| 실제 Source/Parser 어댑터 | 사내 API 실사 전 | Source API·인증·ACL·상한 실사 완료(#1330 §9-1) |
| Top View 링크 | #1200 구현·권한 확인 전 | `getTopViewLink` 지원 + 권한 확인 |
| 근거 위치 → 결함 전달(수신 쪽) | 결함 객체가 없음(lifecycle 결함·재검증은 P3). 전달 계약(§5.2)은 이번에 정함 | 결함 수신 서비스가 생길 때 노드 j |
| LLM 해석·가설 표시, 본문의 LLM 입력 | 사내 모델 능력 측정 전, 본문 반출 경로 | 측정 완료 + 같은 ACL·상한·감사를 쓰는 입력 경로 설계 |
| 원본 본문 검색 색인·알림 본문 | 본문이 ACL 밖으로 나감 | 같은 ACL·감사·상한이 적용되는 설계 |
| 내보내기 형식 확장(xlsx 등) | 필요 입증 전 | 소비자 요청 |
| Sequence 별도 메뉴 | 독립 권한·업무 근거 없음 | 충분한 사용 사례 + 독립 권한 확인 |

## 10. Open Decisions

| ID | 결정 | 상태 |
| --- | --- | --- |
| D1 | 메뉴 위치 | **결정됨**: 「로그 분석」 그룹 신설(소유자 2026-11-07; 추천 «기존 그룹»과 다름) |
| D2 | 조사 상태 저장 | **결정됨**: 저장, 참조만(소유자 2026-11-07) |
| D3 | 시퀀스 보기 조각 | **결정됨**: 처음부터 SDK 범용 조각(소유자 2026-11-07; 추천 «차트 계약 확인 후»와 다름), ADR-0121 |
| D4 | 규칙 결과 역조회 색인 | **결정됨**: `rule_result_evidence` 사이드 테이블(소유자 2026-11-07) |
| D5 | 독립 조사의 Sample 출처 | 추천: 사용자가 Source 소유자 목록에서 고른 순서 있는 파일, 카탈로그 없음(포트 `describe`만). 비소유자 결정 |
| D6 | 근거 위치 전달 형식 | Round: log-lifecycle D6(Core 첨부 + entity link) 방식, 지식 초안: #1198의 `source_asset_ref`+`locator_snapshot`. 구현 노드 첫 확인 |
| D7 | 상한 값(읽기 200행·8,000자·창 100·10초, 근거 위치 100, 일일 본문 50MB, 내보내기 10,000행·5MB·20회/일) | 이 값으로 시작, 측정 후 조정 |
| D8 | 토큰 호출·내보내기 | **결정됨**: 허용, 범위·감사·상한을 설계에 포함(§4.1, 소유자 2026-11-07; 추천 «불허»와 다름), ADR-0119 개정 |
| D9 | 근거 위치 넘기기 | **결정됨**: 이번 릴리스에 포함, #1198 계약에 맞춤·레인 순서 의존 명시(§5.2·§7, 소유자 2026-11-07; 추천 «보류»와 다름) |
| D10 | 결함 수신 쪽 | 수신 객체가 없어 전달 계약만 이번에 정하고 연결은 객체 생성 시(팀장에게 확인 요청) |
