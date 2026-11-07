# Log Rules — 검증 규칙 조회·연결 설계 (v0.31.0, Candidate, 구현 전)

> **Status: Candidate.** 설계만 있고 구현·DB·API·화면은 없다. 근거는 [#1486](https://github.com/hjung3113/analytics-platform/issues/1486)이고, [#1346](https://github.com/hjung3113/analytics-platform/issues/1346) §1·§3 P1-3, [#1330](https://github.com/hjung3113/analytics-platform/issues/1330) Epic, v0.30.0 [`log-lifecycle`](../log-lifecycle/README.md), 모델 명세 [ADR-0111](../../../adr/0111-log-knowledge-model-spec-is-the-source.md)을 **재사용**한다(중복 설계 금지). 릴리스는 v0.31.0(소유자 2026-11-08 «추천대로»). [ADR-0122](../../../adr/0122-rule-catalog-is-a-token-submitted-read-only-snapshot.md)는 Proposed이고, 실제 코드와 Decided ADR이 이 문서보다 우선한다.
>
> 사내 Validator의 인터페이스·출력·권한은 실사 전이다. 이 설계는 **받는 쪽(플랫폼) 계약과 합성 보고자까지만** 정하고 «연동 완료»를 쓰지 않는다([#1330](https://github.com/hjung3113/analytics-platform/issues/1330)).

## 1. 이 설계가 하는 것

기존 `logRules`(라벨 «기준»)를 **조회·연결 전용**으로 실구현하기 위한 계약이다.

1. **조회**: Validator가 실제로 지원한다고 보고한 Rule·RuleSet·Revision 목록과 **지원 범위**를 본다.
2. **연결**: 모델 명세의 **명세 요구사항**(모듈·이벤트 키)과 Rule을 잇고, 요구사항별 **명세 커버리지**를 계산해 보인다. 연결 없는 요구사항은 성공처럼 보이지 않고 «규칙 없음»으로 보인다.
3. **읽기 포트**: 나중에 Gate의 필수 Rule 커버리지 계산([log-lifecycle §9](../log-lifecycle/README.md#9-미구현-목록-다시-여는-조건))이 이 연결을 읽는 포트를 정해 둔다. 계산 자체는 하지 않는다.

하지 않는 것(§9에 다시 여는 조건): Rule 편집기·실행·규칙 엔진 이관(P2 — Validator가 안전한 편집 API를 내놓고 권위 일치가 확인될 때), Rule 정의 본문·파라미터·판정 로직의 저장, 플랫폼에서 Validator로 나가는 호출, LLM이 제안한 연결, Gate 필수 Rule 정책 계산, 실행 결과(`rule_result`)의 재판정.

## 2. 책임 경계와 용어

| 무엇 | 소유 | 플랫폼이 가지는 것 |
| --- | --- | --- |
| Rule·RuleSet 정의, 판정 로직, 편집 | 외부 Validator | **없음**(본문·파라미터·스크립트 저장 금지) |
| 지원하는 Rule/RuleSet/Revision/지원 범위의 목록 | Validator가 보고 | 보고를 **읽기 전용 스냅샷**으로 받은 투영(§3) |
| 모델 명세(모듈·이벤트), 실효 명세 | `log-knowledge` | 읽기 포트로 요구사항 키만 읽음 |
| Rule ↔ 명세 요구사항 연결 | Validator 선언 + 사람의 수동 연결 | 연결 행과 사람 결정 이력 |
| 규칙 결과(`rule_result`), 시도, Gate | `log-lifecycle` | **읽기만** — 재판정·복사 없음 |

- **카탈로그는 Validator의 보고를 받은 투영이다.** Rule 정의를 독립으로 복제하지 않는다. 저장하는 표시 필드는 닫힌 목록이다(§3.2) — 식별자·짧은 이름·짧은 요약·지원 범위·상태·digest뿐.
- **판정 축 분리.** 이 문서의 연결·커버리지는 «이 요구사항을 검사하는 규칙이 있다»는 **구성 정보**이고 검증 결과가 아니다. 커버리지 100%는 통과를 뜻하지 않는다. 규칙 결과, 사람 Gate 결정과 서로 덮지 않는다.
- **명세 커버리지 ≠ 실행 커버리지.** 명세 커버리지는 *명세 요구사항 ↔ Rule 연결*이고(이 문서), 실행 커버리지는 *한 회귀 실행/시도에서 기대한 Rule 중 실제로 돈 것*이다([log-test-datasets](../log-test-datasets/README.md)). 두 문서는 각각 이 이름만 쓴다.
- **«규칙 없음» ≠ «미검증».** 요구사항에 연결된 Rule이 없을 때 이 설계의 표시는 «규칙 없음»이다. «미검증»은 지식 Item의 기술 검증 상태 이름과 겹치고 `NOT_CHECKED` 규칙 결과와도 다르므로 쓰지 않는다(이슈 본문의 «미검증 표시» = 이 표시, 질문 4).
- **ID 보존.** `rule_key`·`rule_set_key`는 Validator가 정한 불투명 식별자이고 플랫폼은 이름을 해석하지 않는다. 같은 `rule_key`가 Revision마다 같은 의도를 가진다는 가정은 Validator가 보고한 `supersedes` 관계가 있을 때만 쓴다.
- **용어.** `RuleSet`·`Rule`은 Validator 쪽 용어 그대로. `규칙 결과`·`실행 프로파일`·`근거 위치`는 GLOSSARY. 새 용어 `규칙 카탈로그`, `명세 요구사항`, `명세 커버리지`, `실행 커버리지`는 구현 노드 0에서 GLOSSARY에 등재한다.

## 3. 데이터 모델 (확정 DDL 아님)

스키마 후보 `log_rules`. 모든 테이블은 `workspace_id`를 가지며 타 Workspace 접근은 서버가 거절한다.

### 3.1 catalog_report (추가 전용)

`id`, `workspace_id`, `source_system`(Validator 식별 문자열, 닫힌 길이), `reported_by_actor_id`(서비스 토큰의 system Actor), `validator_version`, `report_digest`(정규 직렬화 SHA-256), `reported_at`, `outcome`(`accepted`·`rejected`), `reject_reason?`.

- 같은 `report_digest` 재전송은 새 행을 만들지 않고 같은 응답을 준다(멱등, [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 결정 5와 같은 방식). 거절 사유(`unknown_field`·`too_large`·`duplicate_key`·`secret_pattern`)는 기록한다.
- 보고는 **전체 스냅샷**이다(증분 아님). 새 보고가 `accepted`되면 이전 보고는 `superseded`로 표시될 뿐 지워지지 않는다. Round의 `rule_set_revision`이 옛 보고를 가리킬 수 있기 때문이다.

### 3.2 rule_set_revision · rule (보고의 정규화 행, 불변)

`rule_set_revision`: `id`, `report_id`, `rule_set_key`, `revision`(Validator의 버전 문자열), `revision_digest`, `released_at?`, `status`(`active`·`retired`: 보고가 알려 준 값), `supersedes?`.

`rule`: `id`, `rule_set_revision_id`, `rule_key`, `title`(≤120자), `summary`(≤300자, 정의 본문 아님), `support`(`supported`·`partial`·`unsupported`·`unknown`), `scope`(jsonb 후보, 닫힌 키: `logTypes[]`·`processes[]`·`modelIds[]`·`softwareRange?`·`inputFormats[]` — 실제 키는 Validator 실사 뒤 확정, D2), `required_default`(bool?: Validator가 «기본 필수»로 표시한 경우), `covers`(§3.3의 선언 연결 입력), `rule_digest`.

- **저장 금지:** 규칙 본문, 조건식, 임계값, 파라미터, 스크립트, 예시 로그. 서버가 허용 키 밖의 필드를 `unknown_field`로 거절한다.
- `support=unknown`은 «Validator가 알려 주지 않음»이고 `unsupported`로 단정하지 않는다.
- 행은 불변이다(DB 트리거로 UPDATE·DELETE 차단). 상태 변화는 새 보고의 새 행이다.

### 3.3 requirement_link (연결)

`id`, `workspace_id`, `model_id`, `requirement_key`, `rule_set_key`, `rule_key`, `source`(`validator_declared`·`manual`), `state`(`proposed`·`confirmed`·`retired`), `requirement_digest`(연결 시점 요구사항 정의의 digest), `linked_rule_revision`(연결 시점에 본 Revision), `reason?`(수동일 때 필수), `created_by_actor_id`, `created_at`, `row_version`.

- `requirement_key`는 **명세 요구사항 키**다: `moduleKey` 또는 `moduleKey/eventKey`(기본, 질문 3). `log-knowledge`의 `spec_module`·`spec_event` 키를 그대로 쓰고 새 식별자를 만들지 않는다. 명세 Revision이 바뀌어도 키가 유지되는 한 연결이 이어진다([GLOSSARY 안정 키](../../../../GLOSSARY.md)).
- `validator_declared`: 보고의 `covers`에서 서버가 만든다. Validator 선언이므로 `confirmed`로 시작하되 표시는 «Validator 선언»이다. 보고에서 사라지면 `retired`가 된다(삭제 없음).
- `manual`: 사람이 만든다. `proposed`로 시작해 사람이 `confirmed`해야 커버리지에 센다. 표시는 «수동 연결(Validator 미확인)»으로 선언 연결과 구분한다. 자기 확인은 막지 않고 이력에 표시한다([log-lifecycle D3](../log-lifecycle/README.md#10-open-decisions-이-문서)와 같은 원칙).
- 모든 상태 변경은 추가 전용 `requirement_link_event`(`before`·`after`·`reason`·`actor`·`at`)와 Core 감사에 같은 트랜잭션으로 쓴다.
- 대상 `model_id`·`requirement_key`는 쓰기 때 `log-knowledge` 읽기 포트로 존재를 확인하고, 없으면 `unresolved`로 저장하지 않고 거절한다(선언 연결은 `unresolved`로 보존하되 커버리지에 세지 않음).

### 3.4 커버리지는 저장하지 않고 읽을 때 계산한다

입력: `(model_id, software_id?)`의 **실효 명세**(`log-knowledge`가 주는 요구사항 키 목록과 `spec_pin`), 현재 `active` RuleSet Revision들의 `rule`, `confirmed` 연결. 요구사항마다 상태:

| 상태 | 조건 |
| --- | --- |
| `covered` | 확인된 연결이 있고 그 Rule이 현재 `active` Revision에서 `supported`(또는 `partial`이면 `partial`) |
| `partial` | 연결된 Rule이 모두 `partial`이거나 `scope`가 이 모델·SW를 일부만 덮음 |
| `no_rule` | 확인된 연결이 없음 → 표시 «규칙 없음» |
| `unsupported` | 연결은 있으나 Rule이 `unsupported` |
| `unknown` | 연결은 있으나 Rule의 `support`가 `unknown`, 또는 카탈로그를 아직 받지 못함 |
| `stale` | 연결 시점의 `requirement_digest`가 현재와 다르거나 Rule이 새 Revision에서 사라짐/`supersedes` 없이 바뀜 → 재확인 필요 |

- 명세가 없는 모델(발행된 모델 명세 Revision 없음)은 «명세 없음»이고 0%로 계산하지 않는다. 카탈로그를 받은 적 없으면 «카탈로그 미수신»이다.
- 응답에는 `coverageDigest`(요구사항 키·상태·연결 ID·`spec_pin`·RuleSet Revision digest의 정규 직렬화 SHA-256)를 둔다. Gate가 나중에 이 digest를 `basis`에 고정하면 과거 행을 고치지 않고 낡음을 비교할 수 있다.

## 4. 서버 모듈 경계

`apps/platform-api/src/modules/log-rules/` — 새 인증·권한 서비스를 만들지 않고 기존 Fastify 진입점·Menu Dispatch·Core 감사·[ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md) 토큰을 쓴다.

```text
log-rules/
  deps.ts                 # db, clock, specRead(log-knowledge 읽기 포트), audit
  domain/                 # 보고 검증·정규화·digest, 커버리지 계산 (순수 함수)
  repositories/           # catalog_report, rule_set_revision, rule, requirement_link(+event)
  report-route.ts         # 토큰 호출 전용 REST: 카탈로그 보고
  catalog-endpoints.ts    # 읽기(menu-query)
  link-endpoints.ts / link-actions.ts
  coverage-port.ts        # Gate·Round·Dataset이 읽는 포트(§5.3)
  index.ts
```

- **플랫폼 → Validator 호출은 없다.** Validator(또는 그 보고자)가 토큰으로 보고를 올린다([log-lifecycle §4](../log-lifecycle/README.md#4-서버-모듈-경계)의 «Validator로 나가는 호출은 없다»와 같은 원칙, ADR-0122).
- **교차 모듈.** `log-knowledge`(실효 명세 요구사항 읽기 — 새 읽기 포트가 필요하다, 노드 c), `log-lifecycle`(Round의 `rule_set_revision` 해석은 이 모듈의 읽기). 다른 모듈 DB에 쓰지 않는다.
- **합성 보고자.** 통합 테스트와 dev 시드를 위한 참조 보고 스크립트를 `tooling` 아래에 둔다(참조 작업자와 같은 규칙: 문서·PR에 «합성 fixture», 운영 연동 증거 아님).
- **계약 산출물.** 보고 스키마는 `@ap/contract-schemas`에 `v0`(잠정)로 낸다.

### 권한 (capability, 이름 후보)

| capability | 무엇 | 부여 |
| --- | --- | --- |
| `platform:view` | 카탈로그·연결·커버리지 읽기 | 로그인 사용자 전체(민감 모델은 `log-knowledge` ACL을 읽기 포트가 따름) |
| `rules.link.manage` | 수동 연결 만들기·확인·폐기 | Workspace 범위 |
| `validation.catalog.report` | 카탈로그 보고 | **토큰 범위로만**(서비스 토큰, 관리자 발급). 사람 세션에는 부여하지 않음. 읽기·연결 capability와 별개 |

## 5. API 목록 (v0.31.0)

### 5.1 보고 — 토큰 호출 REST (`v0`)

```text
POST /api/v1/validation-catalog/report   { sourceSystem, validatorVersion, ruleSets:[{ ruleSetKey, revision, status, supersedes?, rules:[{ ruleKey, title, summary, support, scope?, requiredDefault?, covers?:[requirementKey] }] }] }
  → 200 { reportId, outcome:"accepted" }  | 200 (같은 digest 재전송)  | 4xx 사유 코드(unknown_field·too_large·duplicate_key·secret_pattern·forbidden)
```

한 보고의 상한(시작값, 측정 후 조정): RuleSet 50, Rule 5,000, 본문 2MB. 제어 문자를 제거하고 토큰 형식·흔한 비밀 패턴이 보이면 거절한다([ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 결정 7의 입력 검사와 같음).

### 5.2 읽기 — `POST /api/v1/menu-query`

| Endpoint id | 용도 | 비고 |
| --- | --- | --- |
| `logRules.ruleSets` | RuleSet 목록(현재 active Revision, 지원 요약, 최근 보고 시각) | 표 필터 모델([ADR-0105](../../../adr/0105-one-table-filter-model.md)) |
| `logRules.ruleSetDetail` | 한 RuleSet의 Revision 이력과 Revision 간 추가·제거·`support` 변경 | 안정 ID `ruleSetKey` |
| `logRules.rules` | Rule 서버 페이지(검색, `support`·`scope`·연결 여부 필터) | `PlatformDataTable` |
| `logRules.ruleDetail` | Rule + 연결된 요구사항 + Revision별 `support` | `ruleSetKey`·`ruleKey` |
| `logRules.coverage` | `(modelId, softwareId?)`의 요구사항별 상태·연결·`coverageDigest` | §3.4 |
| `logRules.coverageSummary` | 모델별 상태 개수(모델 목록·모델 명세 화면 배지용) | |
| `logRules.catalogStatus` | 마지막 보고 시각·Validator 버전·`source_system`·«카탈로그 미수신» 여부 | |

### 5.3 읽기 포트 (모듈 간)

`RuleCoveragePort.getCoverage(modelId, softwareId?)` → `{ requirements:[{ key, state }], coverageDigest, specPin, ruleSetRevisions:[…] }` 와 `resolveRuleSetRevision(ruleSetKey, revision)`. 소비자(구현은 각 문서의 몫): Gate의 필수 Rule 커버리지 계산(log-lifecycle §9), Round 화면의 RuleSet 링크, [log-test-datasets](../log-test-datasets/README.md)의 `expected_scope` 규칙 ID 존재 확인, 이후 `logCross`.

### 5.4 쓰기 — `POST /api/v1/menu-action`

| Action | `input` | 동시성 |
| --- | --- | --- |
| `logRules.linkCreate` | `modelId`, `requirementKey`, `ruleSetKey`, `ruleKey`, `reason` | none (idempotencyKey) |
| `logRules.linkConfirm` | `id`, `reason?` | version |
| `logRules.linkRetire` | `id`, `reason` | version |

선언 연결은 보고로만 생기고 이 액션으로 만들거나 고칠 수 없다.

## 6. 화면 IA (analysis-platform-wireframe)

### 6.1 Requirements

- 개발 담당자: 내 모델 명세의 요구사항 중 규칙이 없는 것을 한눈에 보고 어떤 Rule이 있는지 찾는다.
- 검증 담당자: Validator가 지원하는 RuleSet·Rule과 지원 범위, Revision 사이 변화를 본다.
- 검토자: 연결의 출처(Validator 선언/수동)와 낡은 연결을 구분한다.

### 6.2 IA — 메뉴 배치

기존 `logRules` 그룹(«기준»)의 `log-rules`(`/log/rules`, 현재 planned catalog)를 실구현한다. **새 메뉴를 만들지 않는다**(질문 5).

```text
log-dev > 기준 (logRules)
├─ 검증 규칙        log-rules                 /log/rules                     [Catalog] 탭: 규칙 | 명세 커버리지
│                    └─ (navHidden) log-rule  /log/rules/:ruleSetKey/:ruleKey   [Catalog 상세 서랍 우선]
└─ 테스트 데이터셋  log-datasets              (log-test-datasets)
```

새 **화면**은 1개(두 탭)이다. 이번 릴리스 신규 화면은 로그 탐색 1 + 테스트 데이터셋 2 + 이것 1이므로 범위는 소유자 확인이 필요하다(질문 5). 구현 전 `?variant=` 시안을 아티팩트로 컨펌한다(이 PR에는 시안이 없다).

### 6.3 Conceptual Contract

**규칙 탭 (`PlatformDataTable`, 좌 RuleSet 필터 + 본문 표 + 오른쪽 서랍)**
- 열: RuleSet, Rule, 짧은 이름, 지원(`지원`·`일부`·`미지원`·`확인 불가`), 지원 범위 요약, 연결된 요구사항 수, Revision.
- 머리에 `catalogStatus`: «Validator <source> · 마지막 보고 <시각>». 보고가 없으면 표 대신 이유 있는 빈 상태 «카탈로그를 아직 받지 못했습니다».
- Rule 서랍: 요약(정의 본문 아님), 지원 범위, Revision별 지원 변화, 연결된 요구사항 목록(출처 배지), 「요구사항 연결」(권한 있을 때, 수동).
- RuleSet 이력: Revision 사이 추가·제거·지원 변경(읽기).

**명세 커버리지 탭**
- 상단: 모델·SW 선택(안정 ID, `log-knowledge` 딥링크), `spec_pin`, 상태별 개수 띠(`규칙 있음`·`일부`·`규칙 없음`·`미지원`·`확인 불가`·`재확인 필요`).
- 본문: 요구사항 표(모듈/이벤트 키, 상태, 연결된 Rule 수, 출처 배지). **`규칙 없음`을 가장 먼저 보이게 정렬 기본값**으로 하고 색만으로 구분하지 않는다. 100%여도 «통과가 아니라 구성 정보입니다» 문구를 둔다.
- 행 서랍: 연결된 Rule(출처, 확인자, 연결 시점 Revision), 낡음 사유, 「연결 추가/확인/폐기」.
- 명세가 없는 모델은 «발행된 모델 명세가 없습니다»(0%로 보이지 않음).

**연동 표시(다른 화면)**: 모델 명세 화면과 Round 상세에 `coverageSummary` 배지와 이 탭으로의 딥링크를 둔다(각 화면은 해당 노드가 소유).

### 6.4 Wireframe·URL

데스크톱 1440×900과 1280만. 새 컴포넌트를 만들지 않는다(`PlatformDataTable`·`DetailDrawer`·`AuditTimeline`·`DataTrustIndicator`, 탭은 기존 Catalog 패턴). URL은 안정 ID만(`ruleSetKey`·`ruleKey`·`modelId`·`softwareId`)이고 탭·필터는 기존 화면 상태 계약을 따른다.

## 7. 구현 노드 분할 (제안)

티어는 `tier.sh`·PROFILE §Size and path 기준. 선행: v0.30.0 노드 a(토큰), c(스키마), `log-knowledge` 모델 명세·변경점(구현됨).

| 노드 | 내용 | 기대 티어 | 선행 |
| --- | --- | --- | --- |
| 0 | [ADR-0122](../../../adr/0122-rule-catalog-is-a-token-submitted-read-only-snapshot.md) 확정 + GLOSSARY 용어(`규칙 카탈로그`·`명세 요구사항`·`명세 커버리지`·`실행 커버리지`) + log-test-datasets의 «Rule coverage» → «실행 커버리지» 정리 | light | 소유자 답 |
| a | `log_rules` 스키마·마이그레이션, 보고 REST(토큰 scope, 멱등, 상한, 닫힌 필드, 비밀 패턴 거절), 합성 보고자 | full, `impl-complex` (권한·입력 경계) | 0, v0.30.0 a |
| b | 카탈로그 읽기: ruleSets·ruleSetDetail·rules·ruleDetail·catalogStatus | full | a |
| c | `log-knowledge` 실효 명세 요구사항 읽기 포트(모델·SW → 키 목록·`spec_pin`·ACL) | full, `impl-complex` | — (a와 독립) |
| d | 연결: 선언 연결 생성(보고 처리), 수동 연결 액션, 이벤트·감사, 커버리지 계산·`coverageDigest`·`coverage`·`coverageSummary` | full, `impl-complex` | b, c |
| e | 화면: 규칙 탭 + 명세 커버리지 탭 + 시안(`?variant=`) | full, `ux=required`, 시각 부분 `impl-complex-sol` high | b, d, 시안 컨펌 |
| f | 연동: `RuleCoveragePort` 소비(Round RuleSet 링크, Dataset 규칙 ID 확인, 모델 명세 화면 배지) | full | d, v0.30.0 f |
| g | 통합: 계약 E2E(토큰 보고 → 목록 → 선언 연결 → 수동 연결 → 낡음 → 폐기), 문서 소유 갱신, `.planning` 줄 | full | a–f |

병렬: a∥c. 마이그레이션 노드(a)는 전체 백엔드 `test:integration` 규칙을 따른다.

## 8. 반례와 대응

| 위험 | 대응 |
| --- | --- |
| Rule 정의를 플랫폼이 복제해 Validator와 어긋남 | 본문·파라미터 저장 금지, 허용 키 밖 필드 거절, 모든 행에 `source_system`·보고 시각 |
| 연결 없는 요구사항이 «문제 없음»으로 보임 | `규칙 없음`을 기본 정렬 맨 위, 0%·100% 모두 «통과 아님» 문구 |
| 커버리지 100%를 통과로 오인(Gate 소비자) | 응답에 구성 정보임을 표시, Gate는 규칙 결과·verdict로만 판정 |
| 카탈로그를 한 번도 못 받았는데 «0개 Rule» | `catalogStatus`로 «카탈로그 미수신», 빈 표 문구 구분 |
| 새 Revision에서 Rule 이름·의미가 바뀜 | `supersedes` 없으면 연결을 `stale`(재확인 필요)로, 자동 승계 없음 |
| Rule이 사라지거나 `retired` | 연결은 보존하고 `stale`/`unsupported`, 삭제 없음 |
| 명세 요구사항이 새 Revision에서 사라짐/정의 변경 | `requirement_digest` 불일치 → `stale`, 사라진 키는 `orphan` 행으로 목록 끝에 보임 |
| 사람이 수동으로 거짓 커버리지를 만듦 | `proposed`→사람 확인 필요, 출처 배지 «수동(Validator 미확인)», 이력·감사, 선언 연결과 구분해 집계 |
| 보고자가 비밀·개인정보를 요약에 실음 | 길이 상한·비밀 패턴 거절·분리 표시, 요약은 텍스트로만 렌더 |
| 같은 보고 재전송·동시 전송 | `report_digest` 멱등, 다른 digest는 전체 스냅샷 교체(이전은 `superseded`) |
| 지원 범위 모름을 «미지원»으로 단정 | `unknown`을 별도 상태로 보존 |
| 민감 모델의 요구사항 키가 규칙 카탈로그로 새어 나감 | 커버리지는 `log-knowledge` 읽기 포트가 ACL을 판정한 모델만 계산, 카탈로그는 모델 비종속 |
| 합성 보고 성공을 연동 성공으로 오인 | 화면·PR·테스트에 «합성» 표기, 운영 그래프에 합성 보고자 금지 |

## 9. 미구현 목록 (다시 여는 조건)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| Rule 편집기·실행·규칙 엔진 이관 | P2, 권위 원본은 Validator | Validator가 안전한 편집 API를 내놓고 권위 일치가 확인될 때 |
| 플랫폼 → Validator 호출(pull 어댑터) | 인터페이스 실사 전, 호출 금지 원칙 | 실사 완료 + 소유자 결정(ADR-0122 개정) |
| LLM이 제안한 연결 | 사내 모델 능력 측정 전 | 측정 완료 + Draft-only 경로 |
| Gate 필수 Rule 정책·커버리지 기반 승인 계산 | Gate 계산은 별도 | 두 번째 Round 비교 필요 시점(log-lifecycle §9) |
| 필드 단위 요구사항 | 질문 3 | Validator가 필드 단위 선언을 보내고 소유자가 요청할 때 |
| 커버리지 추세·부서/공정별 집계 | `logCross` P2 | logCross 착수 |
| 영향 분석(명세 변경 → Rule → 테스트셋) | P3 | 실제 확인된 edge가 쌓인 뒤 |

## 10. Open Decisions

| ID | 결정 | 추천 | 이유 |
| --- | --- | --- | --- |
| D1 | 카탈로그 수신 방식 | Validator가 서비스 토큰으로 전체 스냅샷을 보고(플랫폼은 나가는 호출 없음), 읽기 전용 투영 | 요청 큐와 같은 방향, 사내 인터페이스 실사 전 안전 |
| D2 | `scope` 키 집합 | 후보 5키로 시작, 실사 뒤 확정 | Validator 실제 지원 차원을 모름 |
| D3 | 요구사항 단위 | 모듈·이벤트(이벤트 기본), 필드는 이후 | 명세 키가 모듈·이벤트까지 안정적 |
| D4 | 연결 작성자 | Validator 선언 + 사람 수동(확인 필요, 출처 구분) | 선언만이면 Validator 쪽 누락을 사람이 메울 수 없음 |
| D5 | 표시 이름 | «규칙 없음»(요구사항), 명세 커버리지/실행 커버리지 구분 | «미검증»은 지식 Item·`NOT_CHECKED`와 충돌 |
| D6 | 화면 범위 | `log-rules` 한 화면 두 탭, 새 메뉴 없음 | 신규 화면 수 최소 |
| D7 | 보고 상한(RuleSet 50·Rule 5,000·2MB, 요약 300자) | 이 값으로 시작 | 측정 전 시작값 |
| D8 | 카탈로그 보존 | 모든 보고 추가 전용 보존 | Round의 `rule_set_revision` 참조 |
