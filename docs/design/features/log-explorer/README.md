# Log Explorer — 범용 로그 탐색 워크벤치 설계 (v0.31.0, Candidate, 구현 전)

> **Status: Candidate.** 설계만 있고 구현·DB·API·화면은 없다. 근거는 [#1344](https://github.com/hjung3113/analytics-platform/issues/1344)이고, [#1330](https://github.com/hjung3113/analytics-platform/issues/1330) Epic과 v0.30.0 설계 [`log-lifecycle`](../log-lifecycle/README.md)을 **재사용**한다(중복 설계 금지). 릴리스는 v0.31.0(= #1198 + #1344, 소유자 2026-11-07). [ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md)는 Proposed이고, 실제 코드와 Decided ADR이 이 문서보다 우선한다.
>
> 원본 로그의 소유자(Source API)·Parser·Top View(#1200)는 사내 쪽에서 개발 중이거나 실사 전이다. 이 슬라이스는 **읽기 포트와 합성 어댑터까지만** 만들고 «연동됨» 표시를 두지 않는다.

## 1. 이 설계가 하는 것

검증 Round가 없어도 쓰는 **로그 조사 진입점** 하나를 정한다. 한 화면에서 아래를 한다.

1. 권한 있는 Sample(순서 있는 파일 목록)을 골라 원본 레코드를 서버 페이지로 탐색한다.
2. 로그 타입·시간·Module·Event·Job/Wafer/Robot/Process Context로 거르고, 선택한 레코드의 **연관 이벤트**를 본다.
3. **원본 줄 → 추출 필드 → Parser 입력/출력 → 검증 Finding**을 양방향으로 따라간다(1:1을 가정하지 않는다).
4. 같은 레코드를 **원본 보기**와 **시퀀스 보기**(시작/끝 쌍·상태 전이)로 전환해 본다. 메뉴는 하나다.
5. 고른 증거를 새·기존 Round, 결함, 지식 초안에 **참조**로 넘긴다. 넘기는 것이 공식 FAIL이나 기술 지식 확정이 되지 않는다.

같은 `LogInvestigationView`를 **독립 메뉴**와 **#1330 Round 상세의 «원본/시퀀스» 탭**이 쓴다. 두 곳은 같은 Source 계약과 같은 컴포넌트를 쓰고 데이터 경로를 따로 만들지 않는다.

하지 않는 것(§9에 다시 여는 조건): Parser·Validator·LLM 로직의 프런트 구현, 원본 로그의 플랫폼 DB 복제, 실시간 수집, Top View 자체, LLM 해석 저장, 내보내기, 결함·지식 초안 전달의 실제 연결.

## 2. 책임 경계와 용어

#1344 §데이터/소유 경계와 [log-lifecycle §2](../log-lifecycle/README.md#2-책임-경계와-용어)를 따른다. 요약:

| 무엇 | 소유 | 플랫폼이 가지는 것 |
| --- | --- | --- |
| 원본 로그·Parser Raw·기간 행·실행 결과 | 각 Source/Parser/Validator | **없음**(요청 중 전달만, 저장 없음) |
| 원본 위치 | Source 소유자 | 안정 Source ID, `fileRef`+`line`, `fileSha256`, 파일 순서 |
| 조사 상태 | 플랫폼 | 조사 세트·필터·증거 바구니(참조만) — §3 |
| 검증 판정·Finding | Validator → `log-lifecycle` | 이미 있는 `rule_result.evidence`를 **읽어** 역조회 |

- **판정 축 분리.** 탐색은 읽기다. 조사 중 행위(북마크, 증거 담기, 필터)는 어떤 판정·Gate·지식 상태도 바꾸지 않는다. 스크립트 판정·LLM 가설·사람 검토는 서로 다른 열로 표시하고 서로 덮지 않는다.
- **순서 보존.** 순서는 사용자가 확정한 **파일 순서 → 줄 번호**다. timestamp로 재정렬하지 않는다. 시간 역전은 재정렬하지 않고 «시간 역전» 표시만 붙인다.
- **Carryover.** 파일 경계에서 열린 시작 이벤트는 오류로 확정하지 않고 `incomplete`(불완전/미검증)로 보인다.
- **EquipmentId 추정.** 입력에 없을 수 있다. Model/Source 메타데이터에서 얻은 값은 `confirmed`, 추정한 값은 `inferred`로 구분해 보인다.
- **용어.** `Round`·`SampleSet`·`fileRef`·`spec_pin`은 log-lifecycle 용어 그대로. «로그 분석기»·«시퀀스 분석기»라는 별도 메뉴 이름을 만들지 않는다.

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
- 상한(시작값, 측정 후 조정): 한 응답 행 200, 행당 본문 8,000자(넘으면 `truncated=true`로 표시하고 자르지 않은 척하지 않음), 창 `before/after` 각 100, 요청 시간 예산 10초. 브라우저에 전체 파일을 내려 한 번에 파싱하지 않는다.
- `unsupported`는 오류가 아니라 **명시된 상태**다(«Parser 추적 미연결», «기간 행 미지원», «Top View 미연결»). 가짜 trace·가짜 Top View·가짜 판정을 만들지 않는다.
- 사내 Source API가 확정되기 전에는 **합성 어댑터**(synthetic fixture)만 있고 화면·PR에 «합성»을 표시한다. 운영 연동 완료로 쓰지 않는다.

### 3.2 `investigation` (조사 상태, 최소)

주소에 샘플 목록·필터를 직렬화할 수 없으므로([log-lifecycle §6.5](../log-lifecycle/README.md#65-url)) 공유 가능한 조사 상태만 저장한다. 스키마 후보 `log_explorer`.

`id`, `workspace_id`, `title`, `owner_actor_id`, `origin`(`standalone`·`round`), `round_id?`, `sample_set`(jsonb, `{ files:[{fileRef, order, sha256}], sourceOwner }` — Round의 것과 **같은 모양**), `filters`(jsonb), `evidence`(jsonb 배열 `EvidenceRef`, 최대 100), `status`(`open`·`archived`), `row_version`, 생성·수정 시각.

- `EvidenceRef` = `{ fileRef, line, fileSha256, note? }`. **본문·발췌를 담지 않는다.** 담긴 증거를 다시 열면 Source에서 그 순간 권한으로 다시 읽는다.
- `origin='round'`는 Round의 `sample_set`을 복사하지 않고 `round_id`로 참조한다(Round가 요청을 가진 뒤에는 불변이므로 안전). 독립 조사는 사용자가 지정한 순서 있는 파일 목록이다.
- 권한이 철회되면 저장된 `EvidenceRef`는 남지만 열 때 `권한 없음`으로 보인다(삭제하지 않음).
- 필터 값은 감사·사용 이벤트에 **키만** 남기고 값은 넣지 않는다([ADR-0020](../../../adr/0020-usage-events-identity-fields-only.md) 정신).

### 3.3 증거 역조회 — Finding 쪽

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
| `platform:view` | 메뉴 진입, 내 조사 목록 | 모든 워크스페이스 사용자 |
| `explorer.investigate` | 조사 만들기·편집·증거 담기 | 워크스페이스 범위 |
| `explorer.source.read` | 원본 레코드·창·Parser 추적 열람 | **`sourceOwner` 범위**(원본 Source ACL을 따름), 열람은 요청 단위로 서버가 판정 |

토큰(ADR-0116)으로의 호출은 이 슬라이스에서 허용하지 않는다(탐색은 사람 세션 전용; 이유: 원본 본문이 나가는 경로를 하나로 둔다). 확장은 §9.

## 5. API 목록 (v0.31.0)

### 읽기 — `POST /api/v1/menu-query`

| Endpoint id | 용도 | 비고 |
| --- | --- | --- |
| `logExplorer.investigations` | 내 조사 목록 | |
| `logExplorer.investigationDetail` | 조사 머리 + 세트 + 필터 + 증거 | `investigationId` |
| `logExplorer.records` | 원본 레코드 서버 페이지(커서) | 상한 §3.1; 권한 철회·원본 부재는 행이 아니라 상태로 응답 |
| `logExplorer.window` | 한 줄 주변 창 | |
| `logExplorer.parsed` | 줄의 추출 필드·Parser 입·출력 | `unsupported` 가능 |
| `logExplorer.periods` | 기간 행(시작/끝 쌍, `incomplete` 포함) | `unsupported` 가능 |
| `logExplorer.evidenceLinks` | 한 줄을 가리키는 Finding·Round 역조회 | lifecycle 읽기 포트 |

### 쓰기 — `POST /api/v1/menu-action`

| Action | `input` | 동시성 |
| --- | --- | --- |
| `logExplorer.investigationCreate` | `title`, `origin`, `sampleSet?`/`roundId?` | none |
| `logExplorer.investigationUpdate` | `id`, `filters?`, `title?` | version |
| `logExplorer.evidenceAdd` / `evidenceRemove` | `id`, `ref` | version |
| `logExplorer.investigationArchive` | `id` | version |

증거를 Round·결함·지식 초안에 **전달하는 쓰기**는 이 목록에 없다(§9: 받는 쪽 계약이 생기면 그쪽 액션이 `EvidenceRef`를 받는다).

## 6. 화면 IA (analysis-platform-wireframe)

### 6.1 Requirements

- 개발 담당자: Round 전에도 샘플을 열어 «이 줄이 어디서 왔고 무엇과 연결되는지» 확인한다.
- 검토자: Finding의 근거 줄에서 출발해 앞뒤 맥락과 시퀀스를 본다.
- 운영자: 대용량 샘플에서도 화면이 멎지 않고, 권한 철회·원본 부재가 이유와 함께 보인다.

### 6.2 IA — 메뉴 배치

`log-dev`에 «로그 분석» 그룹은 없다(기존 그룹: `logMyWork`·`logModels`·`logKnowledge`·`logCross`·`logRules`). 그룹 신설은 메뉴 밀도 근거가 없어 추천하지 않는다(D1).

```text
log-dev
└─ logModels (기존 그룹)
   ├─ 모델 목록        log-models
   ├─ 검증 요청        log-validation-requests          (v0.30.0)
   └─ 로그 탐색        log-explorer       /log/explorer            [Analysis Workspace, 신규]
      └─ (navHidden)   log-explorer-view  /log/explorer/:investigationId
```

- 새 화면은 **1개**(목록은 진입 서랍/선택기로 흡수; 별도 목록 화면 없음)라 «3개 이상 연속 신규» 확인 규칙에 걸리지 않는다. 시각이 바뀌므로 구현 전 `?variant=` 2–3안을 아티팩트로 컨펌받는다.
- Round 상세의 «원본/시퀀스» 탭은 `log-lifecycle` 화면(노드 f)의 탭 슬롯에 `LogInvestigationView`를 꽂는다. Sequence를 별도 메뉴로 분리하는 재검토 조건은 §9.

### 6.3 Conceptual Contract

**조사 화면 (Analysis Workspace)**
- 상단: 조사 세트 선택기(순서 있는 파일 목록, 순서 변경 가능·시간순 자동 정렬 없음), 조건 바(로그 타입·기간·Module·Event·Context 키).
- 본문 좌: 가상화된 **원본 이벤트 목록**(서버 커서 페이지, 원본 순서). 열: 순번, 파일, 줄, 시간, 타입, 요약. 시간 역전·Carryover·`inferred` 표식.
- 본문 우: 선택 레코드 **상세/Evidence 서랍**(`DetailDrawer`): 원문 줄(텍스트로만 렌더, HTML 해석 금지), 추출 필드, Parser 입·출력, 연결된 Finding·Round(링크), `fileSha256`·`fileRef:line`.
- 보기 전환: `원본` ↔ `시퀀스`(같은 조건·같은 선택 유지). 시퀀스는 Source가 돌려준 **기간 행**(시작/끝 쌍, 상태 전이)을 로그 순서로 그린다. 짝 맞추기·전이 판정은 프런트가 하지 않는다. 미지원이면 «기간 행 미지원» 안내.
- Top View: 확인된 연결(#1200)이 있을 때만 링크, 아니면 «미연결» 표시.
- 증거 바구니: 서랍/패널에서 줄을 담고 빼며, 담긴 참조는 조사 상태로 저장된다. 「Round에 추가」는 받는 쪽 계약이 생기기 전까지 비활성 + 이유 표시.
- 상태: 로딩·취소, 대용량 부분 결과(`partial`), 원본 부재, 권한 철회(«권한 없음» 사유), 상한 초과(`truncated`), 합성 데이터 배지. 모든 빈 상태는 이유를 말한다.

**표시 규칙(반례 방지)**
- 한 줄이 0개·여러 개의 ParsedRecord·기간 행·Finding과 연결될 수 있다. 연결은 목록으로 보이고 «관련 없음»도 정상 상태다.
- 스크립트 판정과 LLM 가설은 별도 열·별도 배지. 이 슬라이스에는 LLM 가설 저장이 없다.

### 6.4 Wireframe 수준

1440×900과 1280 폭만 다룬다(데스크톱 범위). 새 컴포넌트를 먼저 만들지 않는다: `PlatformDataTable`(서버 페이지·가상화)·`DetailDrawer`·`DataTrustIndicator`·기존 차트 프레임을 찾는다. 시퀀스 보기가 기존 차트 계약(chart.md §16)으로 그려지는지, 새 범용 조각이 필요한지는 D3. 이 설계 PR에는 시안이 없다.

### 6.5 URL

`/log/explorer/:investigationId`. 조사 ID만 주소에 둔다. 원본 위치·샘플 목록·필터 값·본문을 직렬화하지 않는다. 선택한 줄은 화면 상태(복원 계약)로만 둔다.

## 7. 구현 노드 분할 (제안)

티어는 `tier.sh`·PROFILE §Size and path 기준. 한 노드 = 한 PR 기본. 선행은 v0.30.0 노드 c(스키마)·d(요청 큐 `rule_result`)·f(Round 화면).

| 노드 | 내용 | 기대 티어 | 선행 |
| --- | --- | --- | --- |
| 0 | [ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md) 확정(소유자 답) | light | 소유자 답 |
| a | `SourceReadPort` 계약·`@ap/contract-schemas v0`·계약 테스트 하니스·합성 어댑터·모듈 골격 | full, `impl-complex`(데이터 유출 경계) | 0 |
| b | `investigation` 스키마·액션·읽기, 권한 철회·낙관적 동시성 | full | 0, v0.30.0 c |
| c | 읽기 엔드포인트: records·window·parsed·periods (상한·취소·부분 결과) | full, `impl-complex` | a |
| d | `rule_result_evidence` 사이드 테이블 + `evidenceLinks` (D4 결정에 따름) | full | v0.30.0 d |
| e | 시퀀스 보기 조각 (D3 결정에 따라 SDK 범용 조각 또는 메뉴 로컬) | full, `impl-complex`(공개 API 시) | 시안 컨펌 |
| f | 조사 화면 + `LogInvestigationView` + 시안(`?variant=`) | full, `ux=required`, 시각 부분 `impl-complex-sol` high | b, c, 시안 컨펌 |
| g | Round 상세 «원본/시퀀스» 탭 연결 | full, `ux=required` | f, v0.30.0 f |
| h | 통합: 계약 E2E(합성 Source → 탐색 → 증거 담기 → 권한 철회), 문서 소유 갱신, `.planning` 줄 | full | a–g |

병렬: a∥b, d는 독립. 도메인 스키마를 바꾸는 노드(b·d)는 마이그레이션 노드 규칙(전체 백엔드 `test:integration`)을 따른다.

## 8. 반례와 대응

| 위험 | 대응 |
| --- | --- |
| 수백만 줄 샘플을 브라우저가 통째로 파싱 | 서버 커서 페이지·상한·취소만 허용, 전체 다운로드 경로 없음 |
| timestamp 정렬로 로그 순서가 뒤집힘 | 정렬은 파일 순서→줄 번호 고정, 역전은 표식만 |
| 파일 경계에서 열린 시작을 오류로 확정 | `incomplete` 표시, 판정에 쓰지 않음 |
| 원본이 없는데 trace·Top View를 그림 | `unsupported`/`unresolved` 상태만, 합성 어댑터는 합성 배지 |
| 권한 철회 뒤에도 저장된 증거·URL·검색 결과로 본문 노출 | 저장은 참조만, 열 때마다 서버가 ACL 재판정 |
| 본문이 감사·알림·사용 이벤트·URL·내보내기로 새 | 본문 금지, 필터 키만 기록, 내보내기 없음(§9) |
| 원본 줄의 HTML·스크립트 | 텍스트로만 렌더, 신뢰하지 않는 입력 |
| 한 줄에 Finding이 여럿이거나 없음을 1:1로 오해 | 연결은 목록, «관련 없음» 정상 상태 |
| 조사 중 담기를 공식 FAIL로 오해 | 증거 담기는 판정·Gate를 바꾸지 않음, 문구로 명시 |
| 스크립트·LLM 이견을 한쪽이 덮음 | 별도 열, 자동 덮어쓰기 없음 |
| EquipmentId 추정을 확정처럼 표시 | `confirmed`/`inferred` 구분 |
| 합성 fixture 성공을 연동 성공으로 오인 | 화면·PR·테스트 이름에 «합성» 표기, 운영 그래프에 합성 금지 |

## 9. 미구현 목록 (다시 여는 조건)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| 실제 Source/Parser 어댑터 | 사내 API 실사 전 | Source API·인증·ACL·상한 실사 완료(#1330 §9-1) |
| Top View 링크 | #1200 구현·권한 확인 전 | `getTopViewLink` 지원 + 권한 확인 |
| 증거 → Round 전달 | 받는 쪽 액션 없음 | log-lifecycle에 증거 첨부 계약(D6)이 생길 때 |
| 증거 → 결함 전달 | 결함 연결은 lifecycle P3 | FindingLink의 실제 소비자 |
| 증거 → 지식 초안 | #1198 초안 경로가 같은 릴리스 | #1198 병합 후 초안 생성 입력으로 `EvidenceRef` 수용 |
| LLM 해석·가설 표시 | 사내 모델 능력 측정 전 | 측정 완료 + 별도 상태 축 |
| 토큰(자동화) 호출 | 본문 유출 경로를 하나로 | 소비자와 감사·상한 정책이 정해질 때 |
| 내보내기·검색 snippet 외부 전달 | 본문이 ACL 밖으로 나감 | 같은 ACL·감사·상한이 내보내기 경로에 적용되는 설계 |
| Sequence 별도 메뉴 | 독립 권한·업무 근거 없음 | 충분한 사용 사례 + 독립 권한 확인 |

## 10. Open Decisions

| ID | 결정 | 추천 | 이유 |
| --- | --- | --- | --- |
| D1 | 메뉴 위치 | 기존 `logModels` 그룹, 그룹 신설 없음 | «로그 분석» 그룹이 없고 조사는 모델·Round 맥락 |
| D2 | 조사 상태 저장 | 저장(`investigation`) | 주소에 샘플 목록을 못 담아 공유가 불가능해짐 |
| D3 | 시퀀스 보기 조각 | 도메인을 모르는 «순서 있는 구간 행 + 상태 전이» 조각이 필요하면 SDK 범용 조각, 먼저 기존 차트 계약으로 가능한지 확인 | 루트 AGENTS 승격 기준(도메인 무지 범용 조각은 SDK) |
| D4 | Finding 역조회 색인 | `rule_result_evidence` 사이드 테이블(lifecycle 소유) | jsonb 배열은 줄 단위 역조회가 비쌈 |
| D5 | 독립 조사의 Sample 출처 | 사용자가 Source 소유자 목록에서 고른 순서 있는 파일, 카탈로그 없음 | Source 목록 API는 실사 전; 포트에 `describe`만 둠 |
| D6 | 증거 첨부 형식 | log-lifecycle D6(Core 첨부 + entity link)과 같은 방식으로 `EvidenceRef`를 링크 | 새 테이블 없이 재사용 |
| D7 | 상한 값(200행·8,000자·창 100·10초·증거 100) | 이 값으로 시작 | 측정 전 시작값 |
| D8 | 토큰 호출 허용 | 이 슬라이스는 불허 | 본문 유출 경로 단일화 |
