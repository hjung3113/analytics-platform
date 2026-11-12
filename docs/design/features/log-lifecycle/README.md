# Log Lifecycle — v0.30.0 최소 슬라이스 설계 (As-built, 사이드바 계층 g2만 부분)

> **Status: As-built (v0.30.0 슬라이스 노드 a–h), ADR 0116–0118 Decided, 소유자 13개 질문 답 반영.** 구현된 것: API 토큰 a(#1442)·b(#1443), 개발 건·이벤트·Round c(#1444)와 수동 검증 첨부 c2(#1451)·Entity Link c3(#1466), 검증 요청 큐 d(#1445, 참조 작업자는 «합성 fixture»), Gate 결정 e(#1446), 화면 f(#1447, #1809 수정 A), 사이드바 계층 g(#1448 SDK 조각)·g2(#1449), 통합 h(#1450, 토큰 → claim → 결과 → Gate 계약 E2E). **부분 구현은 g2 하나다:** `node` 없는 개발 건·Round 딥링크에서 현재 노드를 찾는 기능은 SDK seam 결정 전 미구현이다(§7, [백로그](../../../../.planning/backlog.md)). 노드 f 화면의 데스크톱 시각 확인은 호스트 몫이다(§12). 이 슬라이스가 만들지 않은 것은 §1 «하지 않는 것»과 §9가 그대로 갖는다. 계약 원본은 [log-lifecycle API](../../../architecture/platform-api/api/log-lifecycle.md). 노드별 표기는 §7을 따른다. 릴리스 묶음(v0.30.0 = #1108 + #1330 P0 + #1419 + #1420, 이후 v0.31.0 = #1198 + #1344)은 소유자 2026-11-07 확정이다. 근거는 [#1330](https://github.com/hjung3113/analytics-platform/issues/1330)(Epic)·[#1346](https://github.com/hjung3113/analytics-platform/issues/1346)(우선순위)·[#1420](https://github.com/hjung3113/analytics-platform/issues/1420)(검증 요청 큐)·[#1419](https://github.com/hjung3113/analytics-platform/issues/1419)(API 토큰)이고, 실제 코드와 Decided ADR이 이 문서보다 우선한다. 결정마다 «소유자 2026-11-07»로 표시한다.
>
> 사내 스크립트 Validator·사내 LLM은 별도 개발 중이다. 인터페이스·출력·권한은 실사 전이므로 **연동 완료로 쓰지 않는다.** 이 슬라이스는 플랫폼 쪽 틀(요청 등록·가져가기·결과 저장·사람 기록)만 만든다.

## 후속 설계와 화면 결정

| 범위 | 소유 문서 | 상태 |
| --- | --- | --- |
| #1809 결과 중심 Round workbench | [화면·URL·Gate 계약](#121-결과-중심-round-workbench-1809) | Decided · 수정 A, 소유자 2026-11-12 |
| #1807 분리 작업자 입력 바이트 전달 | [ADR-0152](../../../adr/0152-worker-input-delivery-source-owner-step.md), [API 상세·Open decisions](../../../architecture/platform-api/api/log-lifecycle.md#작업자-입력-전달-1807) | Candidate · 미구현, 공급자 미선택 |
| #1815 진단 보존·상세·근거표·선택 첨부 | [손실 매트릭스·Slice A/B·노드·Open decisions](diagnostic-report-parity.md), [API 읽기 투영](../../../architecture/platform-api/api/log-lifecycle.md#진단-읽기-투영-1815) | Candidate · 미구현 |
| #1808 사람 등록 항목·Round/항목별 토론 | [논리 모델·권한·노드·Open decisions](validation-issues-discussion.md) | 저장(N1)·API(N2)·Round 화면(N3) 구현. 상태·담당·심각도(H3)와 N4–N6은 미구현 |

아래 v0.30.0의 비범위는 이 후보 설계로 구현 상태가 바뀌지 않는다. #1809의 Round 탐색 구현과 충돌하는 화면 노드는 각 문서의 그래프를 따른다.

## 1. 이 슬라이스가 하는 것

v0.30.0 묶음(소유자 2026-11-07): **#1108**([ADR-0118](../../../adr/0118-dynamic-hierarchy-navigation-sdk-piece.md)) + **#1330 P0 최소** + **#1419 API 토큰**([ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md)) + **#1420 검증 요청 큐**([ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)). 이 문서는 이 중 #1330 P0 + #1420을 담는 `log-lifecycle` 모듈을 정한다.

사용자가 얻는 것:

1. 모델별 개발 단계와 현재 검증 상태를 한 표에서 본다(`logModels`).
2. 개발 건을 만들고 단계를 옮기면 추가 전용 이력이 남는다.
3. 개발 건에 Round를 열고 순서 있는 샘플 목록(위치·해시)을 고정한 뒤 검증 요청을 등록한다.
4. 외부 작업자가 유휴 시간에 요청을 가져가 규칙별 결과를 올리면 Round 화면에서 본다.
5. 사람이 결과를 보고 단계 진입을 승인·거절하거나 예외로 통과시킨다(근거 스냅샷과 함께).

하지 않는 것(이 슬라이스 밖, §9에 다시 여는 조건): Validator·LLM 호출 어댑터와 자동 의견 생성(의견 저장은 [ADR-0117 개정 2](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)), Gate 정책 자동 계산(필수 Rule의 명세 커버리지·stale), 결함(Defect)·재검증 연결, 레거시 이관, 대시보드(`logCross`)·`logRules`·`logMyWork` 확장, 로그 탐색(#1344), 테스트 데이터셋(#1345).

## 2. 책임 경계와 용어

#1330 §2의 권위 표를 그대로 따른다. 여기서 요약하면:

- 플랫폼(`log-lifecycle`)은 **개발 건·이력·Round·요청·결과 참조·사람 결정**을 소유한다. 원본 로그, Validator 실행 로직·규칙 판정 알고리즘, Knowledge 정식 Item은 소유하지 않는다.
- 원본은 **위치(locator)와 해시만** 보관하고, 실패 지점 확인용 **짧은 로그 발췌**는 상한·열람 권한·보관 기한 아래 별도 저장한다(소유자 2026-11-07). 원본 전체 열람은 그쪽 권한을 다시 따른다. 원본이 없으면 `unresolved`로 보이고 가짜 근거로 대체하지 않는다.
- **판정 축 분리.** 스크립트 판정(`rule_result`)·AI 의견·사람 검토·Gate 결정·Knowledge 발행은 서로 다른 상태 축이다. AI 의견은 시도의 항목에 붙는 별도 행(**의견**, [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 개정 2)이고, 어떤 쓰기 경로도 AI 의견으로 스크립트 판정을 바꿀 수 없다는 불변식은 지금 정한다([ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 결정 6).
- **모델 명세 원본(stale 문구 정리, #1346 P0-4).** #1330의 «SW별 독립 Spec 원본» 문구는 폐기된 것으로 본다. 현행 결정은 [GLOSSARY](../../../../GLOSSARY.md)의 **모델 명세 Revision**(원본) + SW별 **변경점**(SW X부터 적용, 변경 없으면 행 없음)이고, 그 결과가 **실효 명세**다. Round는 검증 시점의 실효 명세를 `spec_pin`(모델 명세 Revision ID + 적용된 변경점 집합의 digest)으로 고정해 재현성을 얻는다. `spec_pin`은 #1196 구현이 제공하는 값을 읽어 저장할 뿐 이 모듈이 계산하지 않는다.
- **모델 식별.** `model_id`·`software_id`는 `log-knowledge`의 안정 ID를 쓴다. Log Format 버전은 SW 버전이 아니다(자동 동일시 금지; 레거시 이관 때 명시 매핑). 스키마 사이 FK는 두지 않고(모듈 경계: [02 §](../../../../apps/platform-api/docs/02-domain-module-boundaries.md)) 쓰기 때 `log-knowledge`가 내놓는 읽기 포트로 존재·활성을 확인한다.

## 3. 데이터 모델 (v0.30.0 최소; 실제 컬럼·제약은 마이그레이션과 API 문서가 갖는다)

스키마 `log_lifecycle`. 테이블은 이 슬라이스가 쓰는 것만 둔다. #1330 §3의 아홉 개념과의 대응:

| #1330 개념 | v0.30.0 | 비고 |
| --- | --- | --- |
| DevelopmentProject | `development_project` | |
| DevelopmentEvent | `development_event` | 추가 전용 |
| ValidationRound | `validation_round` | 계획 revision·RuleSet은 보고만 받음 |
| SampleSetRef | `validation_round.sample_set`(jsonb) | 별도 테이블 아님. Round를 열 때부터 불변 |
| ExecutionRequest | `execution_request` | #1420의 큐 항목 |
| ValidationRunRef | `execution_attempt` | 시도(attempt)마다 한 행 |
| FindingLink | `rule_result`(근거 위치 포함) | Defect 연결은 **미구현** |
| GateDecision | `gate_decision` | 정책 자동 계산 없음, 사람 결정 기록 |
| LlmSuggestionRef | **없음** | P2, 불변식만 지금 확정 |

### development_project

`id`, `workspace_id`, `model_id`, `software_id?`, `kind`(`new`·`redevelopment`), `stage`, `owner_actor_id`, `target_date?`, `row_version`, 생성·수정 시각.

- `stage` 닫힌 집합 후보: `registered → kickoff → alpha → beta → completed`, 어느 단계에서든 `cancelled`. 되돌림은 `reopen` 한 동작(사유 필수)만, 이력에 남긴다([improvement-items 상태 흐름](../improvement-items.md)과 같은 형태). **레거시 7단계·4진행 상태의 이름과 매핑은 이관 슬라이스 몫이고, 여기서 이름을 정하지 않는다**(Open Decision D1).
- 한 모델에 열린(`completed`·`cancelled` 아닌) 개발 건은 하나만(`unique (workspace_id, model_id) where stage not in (...)`). 재개발은 새 개발 건(`kind='redevelopment'`)다. 레거시 «공정+설비사+모델» 키를 PK로 쓰지 않는다.
- `software_id`는 비어도 등록된다. SW별 Gate 승인(`beta`→`completed`)은 `software_id`가 있어야 한다.

### development_event (추가 전용)

`project_id`, `seq`, `kind`(`created`·`stage_changed`·`owner_changed`·`target_changed`·`cancelled`·`reopened`·`gate_decided`), `before`, `after`(jsonb), `reason`, `actor_id`, `at`. DB 트리거로 UPDATE·DELETE를 막는다(`improvement_item_guard`와 같은 방식). 프로젝트 변경은 같은 트랜잭션에서 이벤트와 감사 로그를 쓴다.

### validation_round

`id`, `project_id`, `seq`(개발 건 안 번호), `stage`(열린 시점 단계), `status`(`open`·`closed`), `sample_set`(jsonb), `sample_manifest_digest`, `spec_pin?`, `note?`, 생성자·시각.

- `sample_set` = `{ files: [{ fileRef, order, sha256 }], sourceOwner }`. `fileRef`는 외부 위치 문자열(불투명 값; 경로 정규화·길이 상한·허용 스킴은 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)). 순서는 사용자가 확정하고 시간순 재정렬이나 합치기를 하지 않는다. `sample_manifest_digest`는 순서·해시를 포함한 정규 직렬화의 SHA-256이다.
- **Round를 연 순간부터 샘플·`spec_pin`은 불변**이다(As-built: 삽입 뒤 불변, 샘플 편집 동작 없음). 바꾸려면 새 Round를 연다(과거 시도는 불변 보존). 이 규칙은 DB 트리거와 서비스가 같이 지킨다.
- 수동 검증 기록(#1330 P0 «수동 검증 첨부»)은 Core 첨부(Attachments)와 등록 entity link로 Round에 붙이고 새 테이블을 두지 않는다. **As-built(#1451 c2)**: 첨부에 부모 종류(`parent_kind`, 닫힌 집합 `voc`·`validation_round`)와 종류별 읽기 판정 seam(`AttachmentParentReader`, 등록 없는 종류는 거부)을 두었다. 쓰기 = `roundEvidenceAttach`(`lifecycle.round.manage`, 열린 Round만), 읽기 = Round와 같은 가시성(`platform:view`, 같은 워크스페이스). 계약: [api/log-lifecycle.md](../../../architecture/platform-api/api/log-lifecycle.md) §Manual validation attachment. **Entity Link As-built(c3 [#1466](https://github.com/hjung3113/analytics-platform/issues/1466), [ADR-0123](../../../adr/0123-entity-links-extend-to-targets-without-managed-system.md))**: 첨부마다 `manual_validation_attachment → validation_round (evidence_of)` 링크 한 건을 `roundEvidenceAttach`와 같은 트랜잭션에 쓴다(링크 쓰기 실패 = 첨부도 롤백). Managed System이 없는 끝이라 `managed_system_id`는 NULL이고, 두 끝의 소유 모듈 읽기 권한(Round = `platform:view` + 같은 워크스페이스, 첨부 = 부모 종류 reader)으로 판단한다. 일반 `POST /entity-links`·목록·인벤토리에는 나오지 않는다(명령 전용). Gate(#1446)는 log-lifecycle 배럴의 `readRoundEvidenceLinks`로 Round와 같은 가시성의 링크를 읽는다. 개발 건 끝(`log_project`)은 같은 규칙이 허용하나 쓰는 쌍이 없어 등록하지 않았다.

### execution_request

`id`, `workspace_id`, `round_id`, `priority`(0–2), `immediate`(bool, 소유자 2026-11-07), `state`, `request_digest`, `engine_profile_ref?`, `requested_by_actor_id`, `idempotency_key`, `attempt_count`, `max_attempts`, `not_before?`, 현재 lease(`claimed_by_actor_id?`, `lease_expires_at?`, `last_heartbeat_at?`), 생성·종료 시각.

- `immediate=true`는 실행 시간대 밖에서도 claim에 내준다([ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 결정 8: 요청자 권한 안에서, 감사, 사용자당 동시 5건).
- `state`: `queued → claimed → succeeded | failed | cancelled`, 그리고 lease 만료·시도 소진 시 `expired`. 상태 전이 표와 lease 규칙은 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)이 소유한다.
- `round_id`는 **필수**다. #1420 본문은 «처음엔 요청·결과만, Round는 #1330 때»라 했지만 둘이 같은 릴리스에 들어가고, 샘플 위치·해시·모델·SW는 이미 Round가 불변으로 들고 있어 요청에 따로 두면 모양이 둘이 된다. 소유자 2026-11-07이 Round 필수를 확정했다.

### execution_attempt

`id`, `request_id`, `attempt_no`, `worker_actor_id`(토큰의 Actor), `started_at`, `ended_at?`, `outcome`(`running`·`succeeded`·`failed`·`lease_expired`), `executor_version?`, `executor_digest?`, `rule_set_revision?`, `input_manifest_digest`, `result_digest?`, `verdict?`.

- `verdict`는 **서버가 `rule_result`에서 계산**한다(`pass`·`fail`·`incomplete`): `FAIL`이 하나라도 있으면 `fail`; `required`인 규칙에 `ERROR`·`NOT_CHECKED`·`SKIPPED`가 있거나 전달 샘플이 요청 매니페스트와 digest가 다르면 `incomplete`; 그 외 `pass`. 작업자가 보낸 요약은 저장하되 판정에 쓰지 않는다. 미지원·미검증이 `pass`에 섞이지 않게 하는 장치다.
- `input_manifest_digest`는 작업자가 실제 쓴 샘플 매니페스트의 digest로, 요청의 `sample_manifest_digest`와 다르면 결과를 받되 `incomplete`로 표시한다.

### rule_result

`attempt_id`, `rule_id`(외부 규칙 식별자), `result`(`PASS`·`FAIL`·`WARN`·`NOT_CHECKED`·`SKIPPED`·`NOT_APPLICABLE`·`ERROR`), `required`, `expected?`, `observed?`(짧은 요약 문자열, 상한 500자), `evidence`(jsonb 배열, 최대 20개; 항목 = 공통 근거 위치 `EvidenceRef`(`fileRef`, `line`, `fileSha256`)에 `hasExcerpt`를 더한 것. `EvidenceRef`는 이 문서의 이 자리가 한 곳에서 정의하고, 로그 탐색 등 다른 설계는 링크한다). 로그 발췌 본문은 별도 테이블 `rule_result_excerpt`(`rule_result_id`, `evidence_index`, `excerpt`, `deleted_at?`)에 둔다.

- **짧은 로그 발췌는 저장을 허용한다**(소유자 2026-11-07; 추천 «위치·해시만»과 다름). 상한·열람(`lifecycle.excerpt.read`, `sourceOwner` 범위 = 원본 Source ACL)·보관(Round 종료 후 90일, 관리자 즉시 삭제)·입력 검사는 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 결정 7이 소유한다. `observed`·`expected` 필드와 감사 로그·알림에는 발췌 본문을 쓰지 않는다.
- `evidence.fileRef`는 해당 Round `sample_set`에 있는 것만 받는다(없으면 `validation.failed`).
- 결함(Defect)·재검증 연결은 만들지 않는다. 같은 `rule_id`·`fileRef`·`line`을 Round 사이에 비교하는 보기는 이 테이블로 나중에 가능하다.

### gate_decision (추가 전용) — **As-built(#1446 e)**

`id`, `round_id`, `target_stage`, `decision`(`approved`·`rejected`·`exception`), `basis`(jsonb: 결정 시점의 `execution_attempt` ID들과 각 `verdict`·`rule_set_revision`·`input_manifest_digest`·`spec_pin`), `reason`, `exception`(`decision='exception'`일 때 `{ riskAcceptedBy, scope, until? }`), `actor_id`, `at`.

- 서버 규칙: `approved`는 가장 최근 `succeeded` 시도의 `verdict='pass'`가 있을 때만; 없으면 `exception`(사유·위험 수용자 필수)으로만 통과한다. `fail`·`incomplete`·시도 없음은 `exception`이 아니면 `approved`가 거절된다. **검증 판정과 업무 승인은 별도 행**이고, 승인이 스크립트 판정을 바꾸지 않는다.
- 승인한 결정은 `development_project.stage`를 같은 트랜잭션에서 옮긴다. 이벤트 `gate_decided`도 같이 쓴다.
- **As-built(#1446 e, 마이그레이션 0113)**: 위 필드에 `from_stage`(결정 때 단계)·`self_approved`(저장; 결정자 = 최근 검증 요청의 요청자, 요청이 없으면 Round를 연 사람)를 더했다. `basis`는 `version`, `attempts[]`(성공한 모든 시도: 시도 ID·`attemptNo`·`verdict`·`rule_set_revision`·`input_manifest_digest`·종료 시각), `decisiveAttemptId`·`decisiveVerdict`(가장 최근 성공 시도), `specPin`, `sampleManifestDigest`, 요청 digest, `evidenceLinks[]`(수동 검증 첨부의 ID와 연결 시각만)이다. 모든 결정이 개발 건 버전을 올리고(동시 결정은 한 건만 이김), `rejected`는 단계를 옮기지 않는다. 예외는 기계 판정이 `pass`가 아닐 때만 쓴다(`pass` 위의 예외는 거절). Gate는 사람 결정이다: 토큰·`system` 행위자는 결정할 수 없다. 사유·예외 범위는 Round를 읽을 수 있는 누구나 본다(감사 로그에는 없다). 계약: [api/log-lifecycle.md §Gate decision](../../../architecture/platform-api/api/log-lifecycle.md#gate-decision-node-e-1446).
- 이 슬라이스는 stale/needs_revalidation을 계산하지 않는다. 대신 비교에 필요한 digest(`spec_pin`, `rule_set_revision`, `input_manifest_digest`)를 `basis`에 고정해 두므로 나중에 계산이 추가되어도 과거 행을 고치지 않는다(§9).

## 4. 서버 모듈 경계

`apps/platform-api/src/modules/log-lifecycle/` — 새 인증·업무 권한 서비스를 만들지 않고 기존 Fastify 진입점·Menu Dispatch 엔진·Core 감사를 쓴다. 구성은 `log-knowledge`를 따른다.

```text
log-lifecycle/
  deps.ts                       # 의존 주입: db, clock, knowledgeLookup(읽기 포트), attachments, entityLinks, audit
  domain/                       # 상태 전이 표, verdict·Gate 규칙, 매니페스트 digest, 실행 시간대 (순수 함수)
  repositories/                 # 개발 건·이벤트·Round, 요청·시도·규칙 결과, gate_decision, 계층 읽기
  lifecycle-endpoints.ts        # 읽기(menu-query): models·projectDetail·rounds·roundDetail …
  project-actions.ts            # 개발 건 쓰기(menu-action)
  round-actions.ts              # Round 열기·닫기·수동 검증 첨부
  request-endpoints.ts / request-actions.ts   # 검증 요청 읽기·등록·취소, 큐 설정, 발췌
  gate-actions.ts / gate-availability.ts      # Gate 결정과 결정 가능 여부 읽기
  queue-service.ts / worker-routes.ts         # 토큰 호출 전용 REST: claim·heartbeat·result·fail (ADR-0117)
  hierarchy-read.ts             # 사이드바 계층 읽기(#1449)
  index.ts                      # 배럴: 다른 모듈이 쓰는 포트
```

- **쓰기·읽기 분리.** 사람의 화면 호출은 기존 방식(`menu-query`·`menu-action`, `idempotencyKey`·`expectedVersion`, 응답 봉투)이다. 작업자 호출은 토큰 인증 REST 4개이고 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)이 계약을 가진다. 둘은 같은 서비스·저장소를 쓰고 인증 진입만 다르다.
- **교차 모듈.** `log-knowledge` 읽기 포트(`getModel`·`getSoftware`·`getEffectiveSpecPin`), `workspace-settings`(실행 시간대), Attachments. 다른 모듈 DB에 쓰지 않는다. Validator·LLM으로 나가는 호출은 **없다**(작업자가 가져간다).
- **감사.** 모든 쓰기는 `core.audit_log`에 쓴다. 토큰 호출의 감사 Actor는 토큰의 Actor(`system` 포함)이고 토큰 ID를 세부에 둔다([ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md)).
- **작업자 모의(mock) 조각.** 통합 테스트와 dev 시드를 위한 참조 작업자(claim → heartbeat → 결과 제출 스크립트)를 `tooling` 아래에 둔다. 실제 사내 Validator 연동 증거로 쓰지 않으며 문서·PR에 «합성 fixture»로 적는다(#1330 §8 마지막 항목).
- **계약 산출물.** 작업자 REST의 요청·응답 스키마는 `@ap/contract-schemas`에 `v0`(잠정)로 낸다. 메뉴 엔드포인트는 기존 `endpoints.json` 규칙을 따른다.

### 권한 (capability)

| capability | 무엇 | 부여 |
| --- | --- | --- |
| `platform:view`(메뉴 권한) | 개발 건·Round·요청·결과 읽기 | 로그인 사용자 전체 |
| `lifecycle.project.manage` | 개발 건 생성·단계 이동·담당 변경·취소·reopen | Workspace 범위 |
| `lifecycle.round.manage` | Round 열기·닫기·샘플 지정·요청 등록·취소 | Workspace 범위 |
| `lifecycle.gate.decide` | Gate 결정(승인·거절·예외) | Workspace 범위, **sensitive, 세션 전용**(토큰 불가) |
| `validation.worker` | claim·heartbeat·결과 제출 | **토큰 범위로만** 존재; 사람 세션에는 부여하지 않음 |
| `lifecycle.excerpt.read` | 로그 발췌 본문 열람 | `sourceOwner` 범위로 부여, 열람마다 감사 |

`log-dev`는 Managed System이 아니므로 `managed_system_id` 없이 Workspace 범위로 부여한다([ADR-0107](../../../adr/0107-log-knowledge-catalog-authority-keys-and-edit-rights.md) 결정 3 보충과 같은 이유). 자기 승인(요청자=결정자)은 막지 않고 이력에 표시한다(소유자 2026-11-07, 질문 9).

## 5. API 목록 (v0.30.0)

구현된 읽기·쓰기의 정확한 목록과 파라미터는 [log-lifecycle API](../../../architecture/platform-api/api/log-lifecycle.md)가 갖는다. 아래 표는 설계 시점의 윤곽이다.

### 읽기 — `POST /api/v1/menu-query`

| Endpoint id | 용도 | 비고 |
| --- | --- | --- |
| `logLifecycle.models` | 모델 목록 + 열린 개발 건의 `stage`·최근 Round 검증 상태·대기 요청 수 | `log-knowledge` 모델을 기준 행으로, 표 필터 모델([ADR-0105](../../../adr/0105-one-table-filter-model.md)): `stage`·`validation`·`processes`·`vendorId`·`active` |
| `logLifecycle.projectDetail` | 개발 건 머리 정보 + 단계 + 열린 Round 요약 | 안정 ID `projectId` |
| `logLifecycle.projectEvents` | 이력(커서 페이지) | `AuditTimeline` 소비 |
| `logLifecycle.rounds` | 개발 건의 Round 목록 | |
| `logLifecycle.roundDetail` | Round + 샘플 목록 + 요청·시도 요약 + Gate 결정 이력 | `roundId` |
| `logLifecycle.roundEvidence` | Round에 붙은 수동 검증 첨부 목록(#1451) | `roundId`, `platform:view` |
| `logLifecycle.ruleResults` | 시도의 규칙 결과(서버 페이지·정렬·필터), 발췌는 `hasExcerpt`만 | `PlatformDataTable` |
| `logLifecycle.excerpt` | 발췌 본문 한 건 | `lifecycle.excerpt.read` 필요, 열람 감사 |
| `logLifecycle.requests` | 검증 요청 목록 | 필터: `state`·`priority`·`modelId`·기간 |

공통 규칙(page·pageSize·sorting·filters·`{ rows, total }`·알 수 없는 파라미터 거절)은 `log-knowledge` 계약과 같다. 소유 메뉴 id는 `log-models`(개발 건·Round)와 `log-validation-requests`(요청 큐). 둘 다 `requiresScope: false`.

### 쓰기 — `POST /api/v1/menu-action`

| Action | `input` | 동시성 |
| --- | --- | --- |
| `logLifecycle.projectCreate` | `modelId`, `softwareId?`, `kind`, `ownerActorId`, `targetDate?` | none |
| `logLifecycle.projectSetStage` | `id`, `toStage`, `reason?` | version |
| `logLifecycle.projectReopen` | `id`, `reason` | version |
| `logLifecycle.projectUpdate` | `id`, `ownerActorId?`, `targetDate?`, `softwareId?` | version |
| `logLifecycle.roundOpen` | `projectId`, `sampleSet`, `note?` (`spec_pin`은 입력이 아니라 서버가 열 때 `log-knowledge` 읽기 포트로 고정, #1444) | none |
| `logLifecycle.roundClose` | `id` | version |
| `logLifecycle.roundEvidenceAttach` | `roundId`, `attachmentIds` (수동 검증 첨부, #1451) | none (idempotencyKey) |
| `logLifecycle.requestCreate` | `roundId`, `priority`, `immediate?`, `engineProfileRef?` | none (idempotencyKey) |
| `logLifecycle.requestCancel` | `id`, `reason` | version |
| `logLifecycle.gateDecide` | `roundId`, `targetStage`, `decision`, `reason`, `exception?` | version(프로젝트) |

### 작업자 — 토큰 호출 REST (`v0`, 계약은 [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md))

```text
POST /api/v1/validation-queue/claim                 → 200 { request, attempt, leaseExpiresAt } | 204
POST /api/v1/validation-queue/requests/:id/heartbeat → 200 { leaseExpiresAt } | 409 lease_lost
POST /api/v1/validation-queue/requests/:id/result    → 200 | 200 (같은 digest 재전송) | 409 conflict
POST /api/v1/validation-queue/requests/:id/fail      → 200
```

## 6. 화면 IA (analysis-platform-wireframe: Requirements → IA → Conceptual Contract → Wireframe → Open Decisions)

### 6.1 Requirements

- 개발 담당자: 내 모델이 어느 단계에서 어떤 검증 상태인지 한눈에, 다음 행동(Round 열기·요청 등록)으로 바로 간다.
- 검토자: Round의 결과를 규칙별로 보고 실패 위치로 가고(파일·줄은 외부 원본 링크 또는 `unresolved`), Gate 결정을 근거와 함께 남긴다.
- 운영자: 요청 큐의 대기·진행·만료를 보고 막힌 요청을 취소하거나 우선순위를 바꾼다.

### 6.2 IA — 메뉴 배치(정적 Registry, 객체는 안정 ID)

```text
log-dev (기존 Space)
└─ logModels (기존 그룹)
   ├─ 모델 목록            log-models              /log/models                         [Management, 기존 planned → 구현]
   ├─ 개발 건 상세·Round 상세  log-model-project       /log/models/:projectId[/rounds/:roundId]   [Management 상세, navHidden, parent=log-models]
   └─ 검증 요청            log-validation-requests /log/validation-requests            [Management, 신규]
```

화면 수: 모델 목록(계층 보기 포함, 기존 planned 메뉴의 첫 실구현) + 개발 건·Round 상세 + 검증 요청(+등록·결과 서랍) = **새 화면 3개**이고 범위는 소유자가 확정했다(2026-11-07). 토큰 관리 화면([ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md))은 내 활동의 개인 토큰(`/tokens`)과 운영 콘솔 권한 그룹의 서비스 토큰(`/operations/service-tokens`) 두 메뉴다(탭 없음, 소유자 2026-11-07). 각 화면은 실제 앱 시안(`?variant=`) 컨펌 뒤 구현한다.

### 6.3 Conceptual Contract (화면별 최소)

**모델 목록 (`PlatformDataTable`, 필터 표)**
- 열: 모델, 설비사, 공정, 개발 단계, 검증 상태(`검증 전`·`요청 대기`·`실행 중`·`통과`·`실패`·`불완전`·`Gate 승인됨`), 대기 요청, 갱신.
- 검증 상태는 **가장 최근 Round의 가장 최근 시도 `verdict`와 요청 `state`에서 파생**한 표시값이고 Gate 승인과 구분해 별도 열(`Gate`)로 둔다. `incomplete`·`미지원`을 `통과`로 보이지 않는다.
- 개발 건이 없는 모델도 행으로 보인다(`개발 건 없음`) — 행 동작: 「개발 건 만들기」(권한 있을 때).
- 필터 표(위 열)와 **사이드바 설비사→공정→모델→SW 계층 탐색**을 함께 쓴다. [ADR-0118](../../../adr/0118-dynamic-hierarchy-navigation-sdk-piece.md)의 메뉴 `navTree` + SDK `HierarchyNav`(모델은 `mode: tree`, 소유자 2026-11-07 컨펌)로 네 단계와 노드 종류·목적지를 선언한다. 모델 노드는 안정 객체 ID로 등록된 메뉴·개발 건 상세를 연다. **As-built(#1449, 부분 구현)**: 노드 조회(`listChildren`·`resolveAncestors`·검색)는 메뉴의 `Source`가 `logLifecycle.hierarchy` 선언 엔드포인트로 조립한다. 설비사·공정과 `vendorId`·`processId`·`modelId` 전체 모델 필터 주소는 조상을 복원한다. 모델·SW의 개발 건 링크는 객체 ID 경로 `node`(`v/<vendor>/p/<process|none>/m/<model>[/s/<sw>]`)를 담고, 프로젝트 내 Round 이동에서도 보존해 현재 노드를 표시한다. `node` 없는 개발 건·Round 딥링크에서 현재 노드를 찾는 기능만 **미구현**이다. 동기 `currentNodeId`가 경로 조회 결과를 받을 SDK seam은 [백로그](../../../../.planning/backlog.md)의 확장 결정 뒤 재개한다. 본문 `HierarchyExplorer`·`HierarchyBreadcrumb`은 보류이며 필터 표와 지식 허브 «모델 탐색» 표는 유지한다.

**개발 건 상세 (Management 상세)**
- 머리: 모델·SW 딥링크(`log-knowledge`), 단계 스테퍼, 담당, 목표일, 현재 Gate 상태. 단계 이동 버튼은 서버가 허용한 다음 단계만 보인다.
- 본문 탭: `Round`(목록 + 「Round 열기」), `이력`(`AuditTimeline`, `development_event`).

**Round 상세**
- 구역: 샘플 목록(순서·파일 참조·해시, 요청 후 읽기 전용), 고정된 명세(`spec_pin`, 없으면 `미고정`), 요청·시도 표(상태·lease 만료 시각·시도 번호), 규칙 결과 표(결과·필수·기대/관측·근거 위치), Gate 결정 이력 + 「Gate 결정」 패널(세션 전용, 서버가 결정 가능 여부와 이유를 `DataTrustIndicator` 문구로 보여줌).
- 로그 발췌: 규칙 결과 행에 발췌 있음 표시만 보이고, 「발췌 보기」를 눌러야 본문이 열린다(권한 없으면 숨김 대신 «권한 없음» 사유 표시, 삭제됐으면 원인을 단정하지 않고 «발췌 상태 알 수 없음», R3).
- 근거 위치 링크: 외부 도구가 있으면 그쪽으로, 없으면 `원본 확인 불가(unresolved)`. 해시 불일치는 경고 배지.
- 모든 빈 상태는 이유를 말한다(`요청 없음`, `작업자가 아직 가져가지 않음(실행 시간대: 평일 22:00–06:00)`).

**검증 요청 목록**
- 열: 요청, 모델·SW, Round, 우선순위·「즉시」 표시, 상태, 대기 시간, 마지막 하트비트, 시도 횟수, 요청자.
- 「요청 등록」 서랍: Round 선택(또는 Round 상세에서 진입 시 고정), 우선순위, 「즉시 실행」 체크(실행 시간대 밖에서도 가져가게 함; 한도 안내 문구와 현재 시간대 표시). 샘플은 Round가 가진 것이라 여기서 다시 입력하지 않는다.
- 행 서랍(`DetailDrawer`): 시도 이력, 결과 요약, 취소.

### 6.4 Wireframe 수준

1440×900과 1280 폭만 다룬다(데스크톱 범위). 전체 높이를 채우는 표 + 오른쪽 서랍 구조이고 새 컴포넌트는 만들지 않는다 — `PlatformDataTable`·`DetailDrawer`·`AuditTimeline`·`DataTrustIndicator`와 기존 단계 스테퍼 후보를 찾는다(없으면 Open Decision D5). **시각이 바뀌는 구현 전에 `?variant=` 시안을 아티팩트로 컨펌**받는다(루트 AGENTS «UI는 프로토타입 컨펌 뒤 구현»). 컨펌된 안은 §12.1의 수정 A다.

### 6.5 URL

`/log/models/:projectId/rounds/:roundId`처럼 **안정 ID만** 주소에 둔다. 표 필터·정렬·열린 서랍은 기존 화면 상태·복원 계약을 따르고, 원본 로그 위치·토큰·샘플 목록을 주소에 직렬화하지 않는다.

## 7. 구현 노드 분할과 상태

티어는 `tier.sh`·PROFILE §Size and path 기준(`apps/platform-api`·`platform-web`·`packages/sdk/*` 비테스트 소스는 full, 문서·메뉴 샘플은 light). 한 노드 = 한 PR 기본.

| 노드 | 내용 | 기대 티어 | 선행 |
| --- | --- | --- | --- |
| 0 | ADR 0116·0117·0118 확정(소유자 답) + 이 문서 Candidate→As-built 전환 계획 | light | 소유자 답 |
| a | **API 토큰 코어**([ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md)): 테이블·발급·폐기·인증 훅·scope ∩ 권한 판정·감사·고위험 거절. **As-built** #1442(PR #1456): `core.api_tokens`(0101), 토큰은 `menu-query`·`menu-action`과 검증 작업자 REST 4개(claim·heartbeat·result·fail, ADR-0117)를 호출할 수 있고 Gate 결정 같은 세션 전용 동작은 거절된다, 계약은 [auth.md](../../../architecture/platform-api/api/auth.md)·[05](../../../architecture/platform-api/05-permission-policy.md) | full, `impl-complex` (권한 경계) | 0 |
| b | **As-built** #1443: 확인된 A안(표 + 발급 서랍), 개인 `/tokens`(내 활동)·`/operations/service-tokens`(운영 콘솔 권한), 복수 권한 묶음·일회 표시·폐기. 화면은 `apps/feature-screens/src/features/api-tokens/`, 묶음은 `packages/feature-shared/src/enums/api-token-bundles.ts`. 서비스 목록은 기본 서비스 토큰만, 「개인 토큰 포함」으로 전체(ADR-0116 3a); review-ux·일관성 점검·impeccable·mock/real E2E 통과. | full, `ux=required` | a |
| c | `log-lifecycle` 스키마·마이그레이션·개발 건·이벤트·Round 쓰기·읽기 — **As-built**(#1444; 수동 검증 첨부는 c2 #1451, 구현됨) | full, `impl-complex`(상태·순서 로직) | 0 (a와 독립) |
| d **As-built** #1445 | 검증 요청 큐([ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md)): `execution_request`·`attempt`·`rule_result`, claim/lease/heartbeat/멱등 결과, 실행 시간대, verdict 계산, 참조 작업자 모의 | full, `impl-complex` | a, c |
| e **As-built** #1446 | Gate 결정 + 근거 스냅샷 + 단계 연동 | full, `impl-complex`(권한·승인 경계) | c, d |
| f **As-built** #1447 | 모델 표·개발 건/Round 상세·검증 요청. #1809 수정 A의 결과 우선 배치와 Gate 상세 슬롯은 §12.1을 따른다. `PlatformDataTable`·`DetailDrawer`·`AuditTimeline`을 재사용한다. 사이드바 계층은 g2 #1449가 연결한다; | full, `ux=required`, 시각 부분은 `impl-complex-sol` high | c(읽기), d·e(쓰기), 시안 컨펌 |
| g | **#1108 SDK 조각**([ADR-0118](../../../adr/0118-dynamic-hierarchy-navigation-sdk-piece.md)): `navTree` + `HierarchyNav`, 합성 source·실제 AppShell 테스트 — **As-built**(#1448, 호스트 검증 대기; 본문 조각 보류) | full, `impl-complex`(공개 API `sdk:api`) | 시안 컨펌(소비자는 확정) |
| g2 **As-built(부분)** #1449 | `log-models` tree 선언·4단계 source·서버/합성 조회·노드 목적지 연결. 계층 링크의 개발 건·Round는 객체 경로 `node`로, 모델 목록은 `vendorId`·`processId`·`modelId`로 현재 노드를 복원한다. `node` 없는 개발 건·Round 딥링크만 SDK seam 결정 전 미구현([백로그](../../../../.planning/backlog.md)) | full, `ux=required` | g, c |
| h **As-built** #1450 | 통합: 계약 E2E 한 건(서비스 토큰 발급 → 등록 → claim·heartbeat·결과 → verdict → Round 읽기 → 세션 Gate → 단계·이벤트·감사), 소유 문서 갱신, `.planning` 줄. 아래 §13 | full | a–f |

병렬: a∥c, g는 독립(파일이 겹치지 않음). 도메인 스키마를 바꾸는 노드(c·d·e)는 마이그레이션 노드의 규칙(전체 백엔드 `test:integration`)을 따른다([traps](../../../../.agents/conductor/addenda/traps.md)).

## 8. 반례와 대응 (v0.30.0 범위만)

| 위험 | 대응 |
| --- | --- |
| 일부 규칙만 실행됐는데 `pass` | `required` 규칙의 `NOT_CHECKED`·`ERROR`·`SKIPPED`는 `incomplete`; 서버 계산 |
| 작업자가 다른 샘플로 실행 | `input_manifest_digest` ≠ 요청 digest이면 `incomplete` + 경고 |
| 같은 결과 재전송·동시 제출 | `result_digest` 멱등: 같은 digest는 같은 응답, 다른 digest는 `409 conflict.stale_write` |
| 작업자 사망·네트워크 단절 | lease 만료 → `queued` 복귀(시도 소진 시 `expired`); 늦게 온 결과는 `lease_lost` |
| 유휴 시간 밖 claim | 서버가 `204`(내줄 요청 없음)로 응답; 우회 불가 |
| 사람이 거짓 통과 | `fail`·`incomplete`·시도 없음의 통과는 `exception`(사유·수용자 필수)으로만, 기록은 일반 승인과 구분 |
| 발췌로 비밀·개인정보 유출 | 상한, 비밀 패턴 거절, 분리 저장·기본 숨김, `sourceOwner` 범위 열람 권한·열람 감사, 90일 삭제, 감사·알림·검색에 본문 금지 |
| 「즉시」 남용으로 낮 시간 부하 | 요청자 권한 안에서만, 사용자당 동시 5건, 감사, 관리자 집계 |
| 토큰으로 Gate 승인 | 고위험 동작은 세션 전용(ADR-0116); 서버 거절 테스트 필수 |
| 샘플 변경 후 이전 PASS 재사용 | Round는 열린 순간부터 샘플 불변; 변경은 새 Round |
| 원본 Validator가 없는데 «연동됨» 표시 | 연동 표시 자체가 없다. 참조 작업자는 «합성 fixture»로만 표기 |

## 9. 미구현 목록 (다시 여는 조건)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| Validator·LLM 호출 어댑터 | 사내 인터페이스 실사 전 | 실제 CLI/API/출력/권한 실사 완료(#1330 §9-1) |
| LLM 자동 의견 생성·초안 연결(`LlmSuggestionRef`; 의견 저장 자체는 ADR-0117 개정 2) | P2, 사내 모델 능력 측정 전 | 측정 완료 + #1198 초안 경로 |
| Gate stale/needs_revalidation(재검증 필요) 계산 | 노드 e는 digest만 `basis`에 고정(구현 안 함) | 두 번째 Round 비교가 필요한 시점 |
| Defect·재검증·Task/VOC 연결 | P3 | FindingLink의 실제 소비자 |
| 레거시 이관(키 매핑·7단계 매핑) | 소유자 결정: 이번 릴리스 제외 가정 | 이관 슬라이스 착수 |
| `logCross`·`logRules`·`logMyWork` 확장 | #1346 P1–P2 | 이 슬라이스 병합 후 |

## 10. Open Decisions (이 문서)

| ID | 결정 | 추천 | 이유 |
| --- | --- | --- | --- |
| D1 | `stage` 닫힌 집합 이름과 레거시 7단계 매핑 시점 | 새 이름 5개 + 취소, 매핑은 이관 슬라이스(레거시 이관 제외: 소유자 2026-11-07) | 레거시 원문을 모르는 채 이름을 정하면 이관 때 어긋남 |
| D2 | Gate 결정이 v0.30.0에 들어가는가 | **결정됨**: 들어간다(소유자 2026-11-07) | |
| D3 | 자기 승인 | **결정됨**: 막지 않고 이력에 표시(소유자 2026-11-07) | |
| D4 | 우선순위 단계 수(비소유자 결정 아님, 시작값) | 3단계(0–2) | #1420 «우선순위» 요구만 충족 |
| D5 | 단계 스테퍼 컴포넌트 | 기존 후보 조사 후 없으면 메뉴 로컬로 시작 | 소비자 2–3곳 확인 전 공통화하지 않음(§24) |
| D6 | 수동 검증 첨부 = 첨부 + entity link | **결정됨**(소유자 2026-11-07); 첨부 부모 종류 등록은 **구현됨**(#1451 c2). 확인 결과: 첨부는 `voc.voc_attachments`(voc_id/comment_id)만 쓰고 권한이 VOC 읽기에 묶여 있어 종류 레지스트리가 없었다 → 종류 열 + 종류별 reader를 추가 | Entity Link 등록은 **구현됨**(c3 #1466, ADR-0123 — 소유자 2026-11-08 option B: 공통 Entity Link를 Managed System 없는 대상까지 넓힘). |
| D7 | `observed` 500자·근거 20개·발췌 2,000자·시도당 256KB·보관 90일·「즉시」 동시 5건 | 이 값으로 시작 | 측정 전 시작값, 실제 Validator 출력 확인 후 조정 |

## 11. 노드 d As-built 메모 (#1445)

- 구현 위치와 계약: [log-lifecycle API §Validation request queue](../../../architecture/platform-api/api/log-lifecycle.md). 설계와 달라진 점: 발췌 열람 권한 `lifecycle.excerpt.read`는 «sourceOwner 범위»를 권한 모듈이 표현하지 못해 `log_lifecycle.excerpt_reader` 표로 둔다(관리자가 부여·철회). `validation.worker`는 capability가 아니라 서비스 토큰 전용 scope(`TOKEN_ONLY_SCOPES`)다. 큐 설정(실행 시간대·lease·«즉시» 한도·발췌 보관일)은 `workspace_settings`가 아니라 `log_lifecycle.queue_settings`에 둔다. 요청 우선순위는 숫자가 클수록 먼저 가져간다. 하트비트는 감사하지 않는다. lease가 끝나 `queued`로 돌아갔지만 아무도 가져가지 않은 시도의 하트비트는 같은 시도에 lease를 되돌려 준다(결정 4). 만료된 lease의 복귀는 claim 호출이 처리한다(주기 작업 없음).
- 발췌 삭제(결정 7)는 구현했다: Round 종료 + `excerptRetentionDays` 뒤 본문을 물리 삭제하는 일일 작업 `lifecycle.excerpt_purge`와 관리자 즉시 삭제 `logLifecycle.excerptDelete`(Round·시도 범위, 사유 필수, 감사에 본문 없음). 아직 없음(다시 여는 조건): `queued` 요청의 우선순위 변경, Round를 닫을 때 대기 요청 자동 취소(지금은 가져가지 않고 사람이 취소).



## 12. 노드 f As-built (#1447, #1809)

- 소유자 2026-11-12 확정 수정 A. 내부 단계 값은 그대로 두고 화면은 등록·착수·알파·베타·완료의 5단계, 취소는 별도 배지로 표시한다. 용어는 «개발 건». Gate는 헤더 상태와 우측 상세 슬롯으로 제공하고 검증 판정과 구분한다.
- 모델 표(`/log/models`), 숨은 개발 건·Round 상세(`/log/models/:projectId[/rounds/:roundId]`), 검증 요청(`/log/validation-requests`). 화면은 `apps/feature-screens/src/features/log-lifecycle/`, 메뉴 조립은 `menus/log-dev/log-models/`. 조회·쓰기는 기존 Kernel menu-query/action 훅을 주입하고, 이동은 feature host seam을 통해 `linkTo`로 연결한다. 모델 표는 `includeClosedProjects: true`로 열린 개발 건을 우선하고 없으면 최근 종료·취소 건을 표시한다(A2). 기존 API의 기본값은 열린 개발 건만으로 유지하며, 종료·취소 행에서도 새 개발 건을 만들 수 있다.
- 모델 검색·단계/검증/설비사/공정/활성 필터·정렬·페이지, 요청 상태/우선순위/모델/기간 필터·선택, 규칙 결과/필수/정렬·선택 시도와 상세 탭을 주소에서 복원한다. 샘플 위치·해시·발췌·사유는 URL에 넣지 않는다.
- Round의 요청 목록은 `requestsPage`, 규칙 결과는 `rulesPage`(각각 1부터 시작, 생략 = 첫 페이지)를 쓴다. 요청 페이지 변경은 요청·시도 선택과 규칙 페이지를, 요청 선택은 시도·규칙 페이지를, 시도 선택과 규칙 필터·정렬 변경은 규칙 페이지를 한 URL 변경에서 초기화한다. 모델·검증 요청 목록과 이력의 기존 `page`는 유지한다.
- 신규 개발 건, 속성 수정, 서버 허용 단계 이동·재개, 샘플 순서 확정 후 Round 열기/종료, 고정 Round 또는 모델→Round 선택 요청 등록, 시도·결과·취소를 제공한다. 발췌는 명시적 클릭 때만 열며 권한 없음·삭제 상태를 구분한다. 주입된 원본 도구와 샘플 해시가 맞는 근거만 원본 탭으로 연결하고, 그렇지 않으면 원본 확인 불가로 표시한다.
- 서버 보강은 모델·Round·요청 표시용 projection, `roundDetail.gateAvailability`, `queueStatus`, 규칙 결과 서버 정렬뿐이다. 마이그레이션·권한·GRANT 변경 없음. 실제 Validator 연동은 여전히 미구현(§9); mock은 합성 fixture다.
- 데스크톱 1440×900/1280 실앱 확인·캡처와 `log-lifecycle screens` E2E는 워커의 브라우저 금지 규칙 때문에 호스트 확인 대기다. 이 표기는 시각 검증 통과를 뜻하지 않는다.

### 12.1. 결과 중심 Round workbench (#1809)

**Decided — 소유자 2026-11-12, 수정 A.** Gate 위치와 저장·링크 상태 변경도 승인한 범위다. 새 SDK API·검증 엔진·결함 저장·토론 저장은 추가하지 않는다.

- Round는 모델·SW/개발 건·Round, 최신 실행 상태, 선택한 완료 시도의 서버 판정을 먼저 보여 준다. 최신 실패·대기와 과거 완료 판정은 별도 축이다. 기본 완료 시도는 서버 Gate 근거의 결정 시도이며, 선택한 시도의 서버 집계로 실패·미검증·전체 규칙 수를 표시한다. 현재 25행 페이지에서 합산하지 않는다. 검증 요청이 없는 Round의 개발 건 요약은 완료 시도·규칙 결과 없음과 서버 결함 집계의 제공 여부를 표시한다.
- 탭은 `결과·결함` / `Round 토론` / `원본` / `설정·이력`이다. 기본은 결과이며 문제 규칙을 우선 표시한다. 샘플 위치·해시·고정 명세·요청·lease·시도 이력과 Round 관리 동작은 설정·이력에 둔다. 개발 건의 속성·단계 스테퍼는 개발 건 화면에만 둔다.
- 규칙 표 다음에 서버 `validationIssues`(이 Round에서 등록했거나 이 Round에 연결된, 읽을 수 있는 항목)의 검증 항목 표를 둔다. 헤더 항목은 키보드와 클릭으로 표 영역에 이동하고 포커스를 준다. 헤더 수는 서버가 주는 ACL 적용 Round 전체 수만 쓴다. N2 API에 그 값이 아직 없으므로 페이지 길이로 수를 만들지 않고 `검증 항목 집계 불가`로 표시하며 0도 만들지 않는다(N2 통합 차단 항목). 표는 cursor 페이지이며, 쓰기 뒤 같은 페이지가 다시 응답하면 새 snapshot이므로 첫 페이지로 돌아간다. 상태 값(H3)이 없으므로 `미해결`이라 부르지 않는다. 항목 상세·토론·등록·연결은 [#1808 N3](validation-issues-discussion.md#6-18151809-경계와-구현-노드)이며 원본 탭이나 규칙 결과를 막지 않는다.
- 모든 규칙 상태는 ID/기대 요약의 상세 열기 버튼을 제공한다. 우측 `DetailDrawer`에 기대·관측 원문, 근거 없음·권한 없음·삭제·오류·조회 중과 의견 없음을 표시한다. 관측 요약에서는 같은 문장 반복을 줄이되 상세 원문은 보존한다. 발췌는 명시적으로 열 때만 읽는다. 진단 리포트·추가 첨부는 #1815의 서버 공급 전까지 만들지 않는다.
- 헤더의 Gate 상태와 `lifecycle:gate-decide` 권한자의 `Gate 결정` 버튼은 같은 우측 슬롯을 쓴다. 처음에는 결정 종류를 고르지 않는다. 결정·사유·예외 입력 초안과 기록 action·결과·동일 요청 재시도는 Round 수명에 속한다. 슬롯 교체·닫기·탭 방문 중에도 진행 중 결과를 받고 재시도가 유지되며 URL에 저장하지 않는다. 기록 동작의 이름은 `Gate 결정 기록`이다. 읽기 전용 서버 근거는 Gate의 결정 시도에 대한 실패 규칙과 미해결 결함 집계를 보여 주며 verdict를 바꾸지 않는다.
- URL의 `rule`은 규칙 결과 UUID, `issue`는 사람 항목 UUID다. 규칙을 열 때 `request`·`attempt`도 같은 변경으로 고정한다. 탭은 `view`(생략 = 결과, `discussion` / `source` / `history`), 결과 범위는 `result`(생략 = 문제만, `all` 또는 결과 값)다. 페이지·필터·정렬을 함께 복원한다. 선택한 규칙 상세는 표 페이지·의견 필터와 독립적으로 UUID를 찾는다. 현재 API에 단건 조회·ID 필터가 없어 선택한 시도의 필터 없는 25행 페이지를 순서대로 읽고, 전체 조회 후에도 없는 UUID만 찾을 수 없다고 표시한다. 요청/시도 전환은 종속 규칙·항목 선택을 초기화한다. 샘플 위치·본문·발췌·사유·서명 URL은 주소에 넣지 않는다. 검증 요청 상세의 결과 열기는 해당 요청과 완료 시도 ID를 전달한다.

## 13. 노드 h As-built (#1450)

- 계약 E2E는 `apps/platform-api/src/modules/log-lifecycle/__tests__/contract-chain.integration.test.ts` 한 건(`-t "contract chain"`)이다. 실제 `buildServer`·인증·토큰·Menu Dispatch와 실제 DB로 노드 a·c·d·e 사이의 이음새만 잇는다: 관리자 세션이 `validation.worker` 서비스 토큰을 발급 → 사람이 Round·샘플·검증 요청 등록(`idempotencyKey`) → 참조 작업자(합성 fixture)가 토큰으로 claim·heartbeat·결과 제출 → 서버가 `verdict` 계산 → Round·요청 읽기에 결과 표시 → `lifecycle.gate.decide`를 가진 세션 사용자가 근거 스냅샷과 함께 Gate 결정 → 단계 이동, 추가 전용 이벤트·감사(작업자 호출의 감사 Actor는 토큰의 Actor, 세부에 토큰 ID).
- 같은 테스트가 경계도 고정한다: 같은 토큰은 Gate를 결정할 수 없고(세션 전용) 사람처럼 읽을 수 없으며, 사람 세션은 claim할 수 없고, 폐기한 토큰은 다음 작업자 호출에서 거절되며, 다른 작업자가 잡은 요청의 결과는 `queue.lease_lost`로 거절되고, 같은 결과의 두 번째 제출은 멱등이다. 노드별 규칙은 d·e 테스트가 갖고 여기서 되풀이하지 않는다.
- 브라우저에서 보이는 반쪽은 mock E2E `log-lifecycle screens`(`apps/platform-e2e/tests/log-lifecycle.spec.ts`)가 갖는다. 실서버 브라우저 단계는 두지 않았다.
- 새 마이그레이션·권한·GRANT·화면은 없다. §1 «하지 않는 것»과 §9는 그대로다: 사내 Validator·LLM 어댑터, Gate 정책 자동 계산, 결함 연결은 미구현이고 참조 작업자는 연동 증거가 아니다.
