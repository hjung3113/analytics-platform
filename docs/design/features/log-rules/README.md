# Log Rules — 검증 규칙 조회·연결 설계 (v0.31.0, 소유자 답 반영, 구현 전)

> **Status: Candidate → 소유자 답 반영 완료(2026-11-08), ADR-0122 Decided.** R-a~R-d의 보고·저장·읽기와 R-e의 조회 화면이 구현되었다. R-f 연동과 R-g 계약 E2E는 미구현이다. 근거는 [#1486](https://github.com/hjung3113/analytics-platform/issues/1486)이고, [#1346](https://github.com/hjung3113/analytics-platform/issues/1346) §1·§3 P1-3, [#1330](https://github.com/hjung3113/analytics-platform/issues/1330) Epic, v0.30.0 [`log-lifecycle`](../log-lifecycle/README.md), 모델 명세 [ADR-0111](../../../adr/0111-log-knowledge-model-spec-is-the-source.md)을 **재사용**한다(중복 설계 금지). 릴리스는 v0.31.0. [ADR-0122](../../../adr/0122-rule-catalog-is-a-token-submitted-read-only-snapshot.md)는 Decided이고, 실제 코드와 Decided ADR이 이 문서보다 우선한다. 결정마다 «소유자 2026-11-08»로 표시한다.
>
> 사내 Validator의 인터페이스·출력·권한은 실사 전이다. 이 설계는 **받는 쪽(플랫폼) 계약과 합성 보고자까지만** 정하고 «연동 완료»를 쓰지 않는다([#1330](https://github.com/hjung3113/analytics-platform/issues/1330)).

## 1. 이 설계가 하는 것

기존 `logRules`(라벨 «기준»)를 **조회 전용**으로 실구현하기 위한 계약이다.

1. **조회**: Validator가 실제로 지원한다고 보고한 Rule·RuleSet·Revision 목록과 **지원 범위**를 본다.
2. **선언 기록·표시**: Rule마다 Validator가 선언한 **대상 범위**를 그 형식 그대로 저장·표시한다(소유자 2026-11-08: «정적 검사가 담당하고 범위가 이벤트·컬럼보다 다양해 플랫폼이 단위를 정하기 어렵다»). 플랫폼은 대상 범위를 해석하거나 이벤트·필드 단위로 바꾸지 않는다.
3. **명세 커버리지**: Validator가 **명세 요구사항 ID**를 함께 줄 때만, 모델 명세의 요구사항과 대조해 요구사항마다 «규칙 있음/규칙 없음»을 계산한다. ID를 주지 않으면 «규칙 없음»을 계산하지 않고 «계산할 수 없음»이라 표시한다.
4. **읽기 포트**: 나중에 Gate의 필수 Rule의 명세 커버리지 계산([log-lifecycle §9](../log-lifecycle/README.md#9-미구현-목록-다시-여는-조건))이 이 선언을 읽는 포트를 정해 둔다. 계산 자체는 하지 않는다.

하지 않는 것(§9에 다시 여는 조건): **사람이 만드는 연결**(수동 연결·확인·폐기 — 소유자 결정), Rule 편집기·실행·규칙 엔진 이관(P2, Validator가 안전한 편집 API를 내놓고 권위 일치가 확인될 때), Rule 정의 본문·파라미터·판정 로직의 저장, 플랫폼에서 Validator로 나가는 호출, LLM이 제안한 연결, Gate 필수 Rule 정책 계산, 실행 결과(`rule_result`)의 재판정.

## 2. 책임 경계와 용어

| 무엇 | 소유 | 플랫폼이 가지는 것 |
| --- | --- | --- |
| Rule·RuleSet 정의, 판정 로직, 편집 | 외부 Validator | **없음**(본문·파라미터·스크립트 저장 금지) |
| 지원하는 Rule/RuleSet/Revision/지원 범위의 목록 | Validator가 보고 | 보고를 **읽기 전용 스냅샷**으로 받은 투영(§3) |
| Rule의 대상 범위, 명세 요구사항 ID | Validator가 선언 | 선언을 형식 그대로 기록·표시, 요구사항 ID는 대조에만 사용 |
| 모델 명세(모듈·이벤트), 실효 명세 | `log-knowledge` | 읽기 포트로 요구사항 키 목록만 읽음 |
| 규칙 결과(`rule_result`), 시도, Gate | `log-lifecycle` | **읽기만** — 재판정·복사 없음 |

- **카탈로그는 Validator의 보고를 받은 투영이다.** Rule 정의를 독립으로 복제하지 않는다. 저장하는 표시 필드는 닫힌 목록이다(§3.2) — 식별자·짧은 이름·짧은 요약·지원 범위·대상 범위 선언·상태·digest뿐.
- **사람이 연결을 만들지 않는다**(소유자 2026-11-08, 앞서 «선언 + 수동» 답을 바꿈). 플랫폼에 연결 작성·확인·폐기 동작과 그 capability가 없다. 연결의 유일한 출처는 Validator 보고다.
- **판정 축 분리.** 이 문서의 선언·커버리지는 «이 요구사항을 검사하는 규칙이 있다고 Validator가 말한다»는 **구성 정보**이고 검증 결과가 아니다. 커버리지 100%는 통과를 뜻하지 않는다. 규칙 결과, 사람 Gate 결정과 서로 덮지 않는다.
- **명세 커버리지 ≠ 실행 커버리지**(소유자 2026-11-08). 명세 커버리지는 *명세 요구사항 ↔ Rule 선언*이고(이 문서), 실행 커버리지는 *한 회귀 실행/시도에서 기대한 Rule 중 실제로 돈 것*이다([log-test-datasets](../log-test-datasets/README.md)). 두 문서는 각각 이 이름만 쓴다.
- **«규칙 없음»**(소유자 2026-11-08): Validator가 요구사항 ID를 선언했는데 어떤 활성 Rule도 그 요구사항을 선언하지 않았다는 표시다. Validator가 ID를 주지 않으면 **쓰지 않는다**(«계산할 수 없음»). 지식 Item의 기술 검증 상태(`not_checked`, 현재 표시 «미확인»)·규칙 결과 `NOT_CHECKED`와 다른 축이고, 이 표시로 그 상태들을 바꾸지 않는다. 이슈 본문의 «미검증 표시»는 이 표시를 뜻한다.
- **식별 계약**(노드 0 확인 결과). 기존 규칙 결과의 `rule_id`(`rule_result.rule_id`)와 Dataset `expected_scope`의 `rule_id`, 시도의 `execution_attempt.rule_set_revision`은 모두 **Validator가 정한 불투명 `text`**다([log-lifecycle §3](../log-lifecycle/README.md#rule_result); 구현 중인 검증 요청 큐 노드가 `text`로 둔다). 카탈로그의 `rule.id`·`rule_set_revision.id`는 보고별 **투영 행 ID**이며 외부 식별자를 대신하지 않는다. 규칙: ① `rule_key`·`rule_set_key`·`revision`·`resultRef`는 1–200자, 앞뒤 공백·제어 문자 없음(위반은 `unknown_field`가 아닌 `invalid_identifier`로 거절), 비교는 **대소문자·정규화 변환 없는 정확한 문자열 일치**; ② `rule_result.rule_id` ↔ 카탈로그는 **`(RuleSet, rule_key)`로** 짝짓고, RuleSet은 시도의 `rule_set_revision` 문자열을 카탈로그의 `result_ref`(§3.2)와 정확히 비교해 찾는다; ③ 한 문자열이 둘 이상의 RuleSet Revision에 걸리면 **짝짓지 않고** `ambiguous`로 표시한다(추정 금지); ④ 실사 전에는 `rule_id = rule_key`라고 단정하지 않고, 합성 보고자는 같은 철자를 쓰는 **합성 fixture**일 뿐 연동 증거가 아니다. Revision 사이 동일성은 Validator가 보고한 `supersedes` 관계가 있을 때만 쓴다.
- **용어.** 화면은 기존 `검증 규칙`·`규칙`, 외부 객체·코드 설명은 `Rule`·`RuleSet`(같은 개념, 노드 0에서 GLOSSARY에 한 항목으로 등재). `규칙 결과`·`실행 프로파일`·`근거 위치`는 GLOSSARY. 새 용어 `규칙 카탈로그`, `명세 요구사항`, `대상 범위`(Rule), `명세 커버리지`, `실행 커버리지`도 노드 0에서 등재한다.

## 3. 데이터 모델 (확정 DDL 아님)

스키마 후보 `log_rules`. 모든 테이블은 `workspace_id`를 가지며 타 Workspace 접근은 서버가 거절한다.

### 3.1 catalog_report (추가 전용)

`id`, `workspace_id`, `source_system`(Validator 식별 문자열, 닫힌 길이), `reported_by_actor_id`(서비스 토큰의 system Actor), `validator_version`, `report_digest`(정규 직렬화 SHA-256), `reported_at`, `outcome`(`accepted`·`rejected`), `reject_reason?`.

- 같은 `report_digest` 재전송은 새 행을 만들지 않고 같은 응답을 준다(멱등, [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 결정 5와 같은 방식). 거절 사유(`unknown_field`·`too_large`·`duplicate_key`·`secret_pattern`)는 기록한다.
- 보고는 **전체 스냅샷**이다(증분 아님). 새 보고가 `accepted`되면 이전 보고는 `superseded`로 표시될 뿐 지워지지 않는다. Round에 속한 시도의 `execution_attempt.rule_set_revision`이 옛 RuleSet Revision을 참조할 수 있기 때문이다.

### 3.2 rule_set_revision · rule · rule_target (보고의 정규화 행, 불변)

`rule_set_revision`: `id`, `report_id`, `rule_set_key`, `revision`(Validator의 버전 문자열), `result_ref`(Validator가 결과 제출의 `rule_set_revision`에 쓰는 문자열, 선택; 없으면 `revision`), `revision_digest`, `released_at?`, `status`(`active`·`retired`: 보고가 알려 준 값), `supersedes?`.

`rule`: `id`, `rule_set_revision_id`, `rule_key`, `title`(≤120자), `summary`(≤300자, 정의 본문 아님), `support`(`supported`·`partial`·`unsupported`·`unknown`), `scope`(지원 범위, jsonb 후보 — 닫힌 키: `logTypes[]`·`processes[]`·`modelIds[]`·`softwareRange?`·`inputFormats[]`; 실제 키는 Validator 실사 뒤 확정, D2), `required_default`(bool?: Validator가 «기본 필수»로 표시한 경우), `rule_digest`.

`rule_target`(Rule이 **선언한 대상 범위**, Rule마다 0..n): `id`, `rule_id`, `format`(Validator가 붙인 형식 이름, ≤40자), `target`(선언을 **그대로** 담은 텍스트, ≤500자), `requirement_ids`(Validator가 준 명세 요구사항 ID 배열, 선택, 최대 50).

- **플랫폼은 `target`을 해석하지 않는다.** 이벤트·필드·컬럼·정적 검사 범위 등 무엇이든 Validator의 형식 그대로 표시하고 검색(부분 문자열)할 뿐이다. 단위를 정하거나 정규화하지 않는다(소유자 2026-11-08).
- `requirement_ids`가 비어 있으면 그 Rule은 명세 커버리지 계산에 쓰이지 않고 목록·상세에만 보인다.
- **저장 금지:** 규칙 본문, 조건식, 임계값, 파라미터, 스크립트, 예시 로그. 서버가 허용 키 밖의 필드를 `unknown_field`로 거절한다.
- `support=unknown`은 «Validator가 알려 주지 않음»이고 `unsupported`로 단정하지 않는다.
- 행은 불변이다(DB 트리거로 UPDATE·DELETE 차단). 상태 변화는 새 보고의 새 행이다. **연결 상태 기계는 없다** — 선언은 보고 행이고 새 보고가 곧 최신 선언이다.

### 3.3 명세 커버리지는 저장하지 않고 읽을 때 계산한다

입력: `(model_id, software_id?)`의 **실효 명세**(`log-knowledge`가 주는 요구사항 키 목록과 `spec_pin`), 현재 `active` RuleSet Revision들의 `rule`·`rule_target.requirement_ids`.

- **매칭 규칙**(소유자 2026-11-08): Validator가 준 요구사항 ID가 실효 명세의 요구사항 키와 **문자열이 정확히 같을 때만** 짝지어진다. 키 형식은 `log-knowledge`의 `moduleKey` 또는 `moduleKey/eventKey`이고 보고 계약에 공개한다. 짝이 없는 ID는 Rule 상세에 «명세에 없는 요구사항 ID»로 보이고 커버리지에 세지 않는다. 다른 ID 체계와의 매핑은 만들지 않는다(§9).
- **계산 가능 조건:** 현재 활성 카탈로그에 요구사항 ID를 선언한 Rule이 하나라도 있어야 한다. 없으면 모델 전체가 «계산할 수 없음 — Validator가 요구사항 ID를 주지 않았습니다»이고 요구사항별 상태를 만들지 않는다.

요구사항마다 상태(계산 가능할 때):

| 상태 | 조건 |
| --- | --- |
| `covered` | 활성 Revision의 `supported` Rule이 그 요구사항을 선언함 |
| `partial` | 선언한 Rule이 모두 `partial`이거나 `scope`가 이 모델·SW를 일부만 덮음 |
| `unsupported` | 선언한 Rule이 모두 `unsupported` |
| `unknown` | 선언한 Rule의 `support`가 모두 `unknown` |
| `no_rule` | 선언한 활성 Rule이 없음 → 표시 «규칙 없음» |

- 명세가 없는 모델(발행된 모델 명세 Revision 없음)은 «명세 없음»이고 0%로 계산하지 않는다. 카탈로그를 받은 적 없으면 «카탈로그 미수신»이다.
- 응답에는 `coverageDigest`(요구사항 키·상태·선언 Rule ID·`spec_pin`·RuleSet Revision digest의 정규 직렬화 SHA-256)를 둔다. Gate가 나중에 이 digest를 `basis`에 고정하면 과거 행을 고치지 않고 비교할 수 있다.
- 낡음 처리를 따로 두지 않는다: 새 보고나 새 명세 Revision이 오면 같은 입력으로 다시 계산한 결과가 곧 현재 상태이고, 사람이 다시 확인할 연결이 없다.

## 4. 서버 모듈 경계

`apps/platform-api/src/modules/log-rules/` — 새 인증·권한 서비스를 만들지 않고 기존 Fastify 진입점·Menu Dispatch·Core 감사·[ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md) 토큰을 쓴다.

```text
log-rules/
  deps.ts                 # db, clock, specRead(log-knowledge 읽기 포트), audit
  domain/                 # 보고 검증·정규화·digest, 커버리지 계산 (순수 함수)
  repositories/           # catalog_report, rule_set_revision, rule, rule_target
  report-route.ts         # 토큰 호출 전용 REST: 카탈로그 보고
  catalog-endpoints.ts    # 읽기(menu-query)
  coverage-port.ts        # Gate·Round·Dataset이 읽는 포트(§5.3)
  index.ts
```

- **플랫폼 → Validator 호출은 없다.** Validator(또는 그 보고자)가 토큰으로 보고를 올린다([log-lifecycle §4](../log-lifecycle/README.md#4-서버-모듈-경계)의 «Validator로 나가는 호출은 없다»와 같은 원칙, ADR-0122).
- **쓰기는 보고 하나뿐이다.** 메뉴 쓰기 액션이 없다(수동 연결 없음).
- **교차 모듈.** `log-knowledge`(실효 명세 요구사항 키 읽기 — 새 읽기 포트가 필요하다, 노드 c), `log-lifecycle`(시도의 `execution_attempt.rule_set_revision` 해석은 이 모듈의 읽기이며 Round 화면은 시도를 통해 조회). 다른 모듈 DB에 쓰지 않는다.
- **합성 보고자.** 통합 테스트와 dev 시드를 위한 참조 보고 스크립트를 `tooling` 아래에 둔다(참조 작업자와 같은 규칙: 문서·PR에 «합성 fixture», 운영 연동 증거 아님).
- **계약 산출물.** 보고 스키마는 `@ap/contract-schemas`에 `v0`(잠정)로 낸다.

### 권한 (capability, 이름 후보)

| capability | 무엇 | 부여 |
| --- | --- | --- |
| `platform:view` | 카탈로그·선언·커버리지 읽기 | 로그인 사용자 전체(민감 모델은 `log-knowledge` ACL을 읽기 포트가 따름) |
| `validation.catalog.report` | 카탈로그 보고 | **토큰 범위로만**(서비스 토큰, 관리자 발급). 사람 세션에는 부여하지 않음 |

## 5. API 목록 (v0.31.0)

### 5.1 보고 — 토큰 호출 REST (`v0`)

```text
POST /api/v1/validation-catalog/report   { sourceSystem, validatorVersion, ruleSets:[{ ruleSetKey, revision, resultRef?, status, supersedes?, rules:[{ ruleKey, title, summary, support, scope?, requiredDefault?, targets?:[{ format, target, requirementIds?:[string] }] }] }] }
  → 200 { reportId, outcome:"accepted" }  | 200 (같은 digest 재전송)  | 4xx 사유 코드(unknown_field·too_large·duplicate_key·secret_pattern·forbidden)
```

한 보고의 상한(시작값, 측정 후 조정): RuleSet 50, Rule 5,000, Rule당 `targets` 20, `requirementIds` 50, 본문 2MB. 제어 문자를 제거하고 토큰 형식·흔한 비밀 패턴이 보이면 거절한다([ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) 결정 7의 입력 검사와 같음).

### 5.2 읽기 — `POST /api/v1/menu-query`

| Endpoint id | 용도 | 비고 |
| --- | --- | --- |
| `logRules.ruleSets` | RuleSet 목록(현재 active Revision, 지원 요약, 최근 보고 시각) | 표 필터 모델([ADR-0105](../../../adr/0105-one-table-filter-model.md)) |
| `logRules.ruleSetDetail` | 한 RuleSet의 Revision 이력과 Revision 간 추가·제거·`support` 변경 | 안정 ID `ruleSetKey` |
| `logRules.rules` | Rule 서버 페이지(검색, `support`·`scope`·«요구사항 ID 선언 여부» 필터, 대상 범위 부분 문자열 검색) | `PlatformDataTable` |
| `logRules.ruleDetail` | Rule + 선언한 대상 범위(형식 그대로) + 요구사항 ID(명세와 짝 여부) + Revision별 `support` | `ruleSetKey`·`ruleKey` |
| `logRules.coverage` | `(modelId, softwareId?)`의 요구사항별 상태·선언 Rule·`coverageDigest`, 또는 «계산할 수 없음» | §3.3 |
| `logRules.coverageSummary` | 모델별 상태 개수(모델 목록·모델 명세 화면 배지용) | |
| `logRules.catalogStatus` | 마지막 보고 시각·Validator 버전·`source_system`·«카탈로그 미수신»·«요구사항 ID 미선언» 여부 | |

### 5.3 읽기 포트 (모듈 간)

`RuleCoveragePort.getCoverage(modelId, softwareId?)` → `{ computable, requirements:[{ key, state }], coverageDigest, specPin, ruleSetRevisions:[…] }` 와 `resolveRuleSetRevision(ruleSetKey, revision)`. 소비자(구현은 각 문서의 몫): Gate의 필수 Rule의 명세 커버리지 계산(log-lifecycle §9), Round 화면의 RuleSet 링크, [log-test-datasets](../log-test-datasets/README.md)의 `expected_scope` 규칙 ID 존재 확인(노드 0의 식별 계약 확인 뒤), 이후 `logCross`.

쓰기 액션은 없다.

## 6. 화면 IA (analysis-platform-wireframe)

### 6.1 Requirements

- 개발 담당자: 내 모델 명세의 요구사항 중 규칙이 없는 것을 한눈에 보고 어떤 Rule이 있는지 찾는다. Validator가 요구사항 ID를 주지 않으면 그 사실을 안다.
- 검증 담당자: Validator가 지원하는 RuleSet·Rule과 지원 범위, 각 Rule이 선언한 대상 범위, Revision 사이 변화를 본다.

### 6.2 IA — 메뉴 배치

기존 `logRules` 그룹(«기준»)의 `log-rules`(`/log/rules`, 현재 planned catalog)를 실구현한다. **새 메뉴를 만들지 않는다**(소유자 2026-11-08).

```text
log-dev > 기준 (logRules)
├─ 검증 규칙        log-rules                 /log/rules                     [Catalog] 탭: 규칙 | 명세 커버리지
│                    └─ (navHidden) log-rule  /log/rules/:ruleSetKey/:ruleKey   [Catalog 상세 서랍 우선]
└─ 테스트 데이터셋  log-datasets              (log-test-datasets)
```

새 **화면**은 1개(두 탭)이고 소유자가 이 범위를 확정했다(2026-11-08). 확정 시안 A(탭 + 표 + 서랍)를 따른다(#1495).

### 6.3 Conceptual Contract

**규칙 탭 (`PlatformDataTable`, RuleSet 필터 칩 + 본문 표 + 오른쪽 서랍)**
- 열: RuleSet, Rule, 짧은 이름, 지원(`지원`·`일부`·`미지원`·`확인 불가`), 지원 범위 요약, 선언한 대상 범위(첫 항목 + 개수, 형식 그대로), 요구사항 ID 수, Revision.
- 머리에 `catalogStatus`: «Validator <source> · 마지막 보고 <시각>». 보고가 없으면 표 대신 이유 있는 빈 상태 «카탈로그를 아직 받지 못했습니다».
- Rule 서랍: 요약(정의 본문 아님), 지원 범위, 선언한 대상 범위 목록(형식 이름 + 텍스트, 해석하지 않음), 요구사항 ID 목록(명세와 짝이면 링크, 아니면 «명세에 없는 요구사항 ID»), Revision별 지원 변화. 편집·연결 버튼은 없다.
- RuleSet 이력: Revision 사이 추가·제거·지원 변경(읽기).

**명세 커버리지 탭**
- 상단: 모델·SW 선택(안정 ID, `log-knowledge` 딥링크), `spec_pin`, 상태별 개수 띠(`규칙 있음`·`일부`·`규칙 없음`·`미지원`·`확인 불가`).
- 계산할 수 없을 때(Validator가 요구사항 ID를 주지 않음 / 카탈로그 미수신 / 명세 없음): 표 대신 이유를 말하는 상태 하나를 보인다. 0%·«규칙 없음 전부»로 보이지 않는다.
- 본문: 요구사항 표(모듈/이벤트 키, 상태, 선언한 Rule 수). **«규칙 없음»을 먼저 보이게 정렬 기본값**으로 하고 색만으로 구분하지 않는다. 100%여도 «통과가 아니라 구성 정보입니다» 문구를 둔다.
- 행 서랍: 선언한 Rule(RuleSet·Revision·지원), 대상 범위 선언. 연결 동작 버튼은 없다.

**연동 표시(다른 화면)**: 모델 명세 화면과 Round 상세에 `coverageSummary` 배지와 이 탭으로의 딥링크를 둔다(각 화면은 해당 노드가 소유). 계산할 수 없는 모델은 배지 대신 «계산 불가».

### 6.4 Wireframe·URL

데스크톱 1440×900과 1280만. 새 컴포넌트를 만들지 않는다(`PlatformDataTable`·`DetailDrawer`·`AuditTimeline`·`DataTrustIndicator`, 탭은 기존 Catalog 패턴). URL은 안정 ID만(`ruleSetKey`·`ruleKey`·`modelId`·`softwareId`)이고 탭·필터는 기존 화면 상태 계약을 따른다.

**구현(#1495, 시안 A):** 기존 `log-rules`를 lazy 화면으로 바꾸고 `log-rule` 상세 별칭(`/log/rules/:ruleSetKey/:ruleKey`) 하나만 navHidden으로 둔다. Registry의 정규 경로는 각각 `/log-dev/log-rules`, `/log-dev/log-rule/:ruleSetKey/:ruleKey`이며 기존 경로는 별칭으로 유지된다. `tab=rules|coverage`, `q`·`targetQ`·`sort`·`page`와 숨은 반복 `filter`는 공용 표 URL 계약이다. `ruleSetKey`만 있으면 RuleSet 이력, `ruleKey`가 함께 있으면 규칙 서랍, 커버리지의 `focus=<요구사항 키>`는 현재 표 페이지의 요구사항 서랍이다.

모델 목록을 타 메뉴에서 중복 선언할 수 없어 모델·SW 선택은 딥링크의 안정 UUID 입력으로 제공한다. `coverageSummary`는 선택한 모델의 모델 기준 요약을 조회하며 목록을 발견하는 API로 사용하지 않는다. 모델 명세 링크는 `log-knowledge-spec`의 기존 ID·module/event 계약을 따른다. 규칙 서랍은 선택한 모델의 커버리지 전체 페이지에서 정확한 키 집합을 읽고, 모든 페이지의 digest가 같을 때만 «명세에 없는 요구사항 ID»를 표시한다. 모델 미선택·읽기 실패·계산 불가는 미확인 안내로 남긴다.

표는 SDK 기본 크기를 사용하며 내부 높이를 덮어쓰지 않는다. #1473의 선택 `fill`이 병합되면 `menus/log-dev/log-rules/src/pages/SnapshotTable.tsx`에서 한 prop으로 적용한다.

## 7. 구현 노드 분할 (제안)

티어는 `tier.sh`·PROFILE §Size and path 기준. 선행: v0.30.0 노드 a(토큰), c(스키마), `log-knowledge` 모델 명세·변경점(구현됨).

| 노드 | 내용 | 기대 티어 | 선행 |
| --- | --- | --- | --- |
| 0 | **완료(#1490)**: 외부 `rule_id` ↔ `rule_key`·`rule_set_key`·Revision 식별 계약 확인(§2) + [ADR-0122](../../../adr/0122-rule-catalog-is-a-token-submitted-read-only-snapshot.md) 확정 + GLOSSARY 용어(`규칙 카탈로그`·`명세 요구사항`·`대상 범위`·`명세 커버리지`·`실행 커버리지`, Rule↔규칙 한 항목) + log-test-datasets의 «Rule coverage» → «실행 커버리지» 정리 | light | 소유자 답(완료), Validator 실사 |
| a | `log_rules` 스키마·마이그레이션, 보고 REST(토큰 scope, 멱등, 상한, 닫힌 필드, 비밀 패턴 거절), 합성 보고자 | full, `impl-complex` (권한·입력 경계) | 0, v0.30.0 a |
| b | 카탈로그 읽기: ruleSets·ruleSetDetail·rules·ruleDetail·catalogStatus | full | a |
| c | `log-knowledge` 실효 명세 요구사항 키 읽기 포트(모델·SW → 키 목록·`spec_pin`·ACL) | full, `impl-complex` | — (a와 독립) |
| d | 커버리지 계산(문자열 일치, 계산 가능 조건)·`coverageDigest`·`coverage`·`coverageSummary`·`RuleCoveragePort` | full, `impl-complex` | b, c |
| e | 화면: 규칙 탭 + 명세 커버리지 탭 + 시안(`?variant=`) | full, `ux=required`, 시각 부분 `impl-complex-sol` high | b, d, 시안 컨펌 |
| f | 연동: `RuleCoveragePort` 소비(Round RuleSet 링크, Dataset 규칙 ID 확인, 모델 명세 화면 배지) | full | d, v0.30.0 f |
| g | 통합: 계약 E2E(토큰 보고 → 목록 → 대상 범위 표시 → 커버리지 → 요구사항 ID 없음 → 새 보고로 갱신), 문서 소유 갱신, `.planning` 줄 | full | a–f |

병렬: a∥c. 마이그레이션 노드(a)는 전체 백엔드 `test:integration` 규칙을 따른다.

## 8. 반례와 대응

| 위험 | 대응 |
| --- | --- |
| Rule 정의를 플랫폼이 복제해 Validator와 어긋남 | 본문·파라미터 저장 금지, 허용 키 밖 필드 거절, 모든 행에 `source_system`·보고 시각 |
| 플랫폼이 대상 범위를 이벤트·필드로 해석해 틀린 단위를 강요 | `target`은 해석·정규화하지 않고 형식 그대로 표시 |
| Validator가 요구사항 ID를 안 주는데 «규칙 없음»이 전부 표시됨 | 계산 가능 조건 불충족이면 요구사항별 상태를 만들지 않고 «계산할 수 없음» |
| 연결 없는 요구사항이 «문제 없음»으로 보임 | «규칙 없음»을 기본 정렬 맨 위, 0%·100% 모두 «통과 아님» 문구 |
| 커버리지 100%를 통과로 오인(Gate 소비자) | 응답에 구성 정보임을 표시, Gate는 규칙 결과·verdict로만 판정 |
| 카탈로그를 한 번도 못 받았는데 «0개 Rule» | `catalogStatus`로 «카탈로그 미수신», 빈 표 문구 구분 |
| 요구사항 ID가 명세 키와 철자가 달라 짝이 안 됨 | «명세에 없는 요구사항 ID»로 Rule 상세에 보이고 커버리지에 세지 않음, 별도 매핑을 만들지 않음 |
| 새 Revision에서 Rule이 사라지거나 `retired` | 활성 Revision 기준으로 다시 계산(옛 Revision은 이력에 남음), 연결 삭제·승계 없음 |
| 명세 요구사항이 새 Revision에서 사라짐 | 그 키는 요구사항 표에서 빠지고 Rule 상세의 해당 ID가 «명세에 없는 요구사항 ID»로 바뀜 |
| 보고자가 비밀·개인정보를 요약·대상 범위에 실음 | 길이 상한·비밀 패턴 거절, 텍스트로만 렌더 |
| 같은 보고 재전송·동시 전송 | `report_digest` 멱등, 다른 digest는 전체 스냅샷 교체(이전은 `superseded`) |
| 지원 범위 모름을 «미지원»으로 단정 | `unknown`을 별도 상태로 보존 |
| 민감 모델의 요구사항 키가 규칙 카탈로그로 새어 나감 | 커버리지는 `log-knowledge` 읽기 포트가 ACL을 판정한 모델만 계산, 카탈로그는 모델 비종속 |
| 사람이 거짓 커버리지를 만듦 | 사람이 연결을 만드는 경로가 없음(출처는 Validator 보고뿐) |
| 합성 보고 성공을 연동 성공으로 오인 | 화면·PR·테스트에 «합성» 표기, 운영 그래프에 합성 보고자 금지 |

## 9. 미구현 목록 (다시 여는 조건)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| 모델·SW 이름 목록 선택(미구현, #1495) | 타 메뉴 endpoint 중복 선언 금지, 공용 모델 목록 조회 표면 없음 | 레인에서 승인된 목록 조회 계약을 제공할 때 |
| 표 높이 채우기(미구현, #1473) | SDK `fill` 병합 대기, 내부 높이 덮어쓰기 금지 | #1473 SDK 선택 prop 사용 가능 시 |
| R-f 소비자 연동·R-g 계약 E2E(미구현) | 이번 R-e는 조회 화면 범위 | 해당 노드 착수 시 |
| 사람이 만드는 연결(수동 연결·확인·폐기) | 소유자 결정(2026-11-08): 플랫폼은 단위를 정하지 않고 Validator 선언만 기록 | 소유자가 사람 연결을 요청하고 연결 단위를 정할 때 |
| 대상 범위의 해석·정규화(이벤트·필드·컬럼 단위로 변환) | 범위가 이벤트·컬럼보다 다양해 정의하기 어렵다(소유자) | Validator가 안정적인 공통 단위를 내놓고 소유자가 요청할 때 |
| Validator 요구사항 ID ↔ 명세 키 매핑 | 문자열 일치 외 매핑 규칙을 모름 | Validator 실사에서 ID 체계가 확인되고 소유자가 매핑을 요청할 때 |
| Rule 편집기·실행·규칙 엔진 이관 | P2, 권위 원본은 Validator | Validator가 안전한 편집 API를 내놓고 권위 일치가 확인될 때 |
| 플랫폼 → Validator 호출(pull 어댑터) | 인터페이스 실사 전, 호출 금지 원칙 | 실사 완료 + 소유자 결정(ADR-0122 개정) |
| LLM이 제안한 연결 | 사내 모델 능력 측정 전 | 측정 완료 + Draft-only 경로 |
| Gate 필수 Rule 정책·커버리지 기반 승인 계산 | Gate 계산은 별도 | 두 번째 Round 비교 필요 시점(log-lifecycle §9) |
| 커버리지 추세·부서/공정별 집계 | `logCross` P2 | logCross 착수 |
| 영향 분석(명세 변경 → Rule → 테스트셋) | P3 | 실제 확인된 edge가 쌓인 뒤 |

## 10. Open Decisions

| ID | 결정 | 상태 |
| --- | --- | --- |
| D1 | 카탈로그 수신 방식 | **결정됨**: Validator가 서비스 토큰으로 스냅샷을 올림, 플랫폼은 나가는 호출 없음(소유자 2026-11-08) |
| D2 | Rule 저장 범위, `scope` 키 | **결정됨**(저장 범위): 식별 정보만(식별자·짧은 이름·요약·지원 상태·범위·digest), 본문·파라미터·스크립트 거절(소유자 2026-11-08). `scope` 키 집합은 후보 5키로 시작, Validator 실사 뒤 확정 |
| D3 | 요구사항↔Rule 연결 단위 | **결정됨**: 플랫폼은 단위를 정하지 않고 Validator가 선언한 대상 범위를 형식 그대로 저장·표시, 요구사항 ID를 함께 줄 때만 «규칙 없음» 계산(소유자 2026-11-08). ID는 실효 명세 키와 정확히 같은 문자열일 때만 짝지음(§3.3, 소유자 2026-11-08) |
| D4 | 연결 작성자 | **결정됨**: Validator 선언만, 사람 수동 연결 없음(소유자 2026-11-08, 앞의 «선언+수동» 답을 바꿈) |
| D5 | 표시 이름 | **결정됨**: «규칙 없음», 명세 커버리지/실행 커버리지 구분(소유자 2026-11-08) |
| D6 | 화면 범위 | **결정됨**: 기존 «검증 규칙» 한 화면에 탭 2개, 신규 화면 1개(소유자 2026-11-08) |
| D7 | 보고 상한(RuleSet 50·Rule 5,000·Rule당 targets 20·요구사항 ID 50·2MB, 요약 300자, `target` 500자) | 이 값으로 시작, 측정 후 조정 |
| D8 | 카탈로그 보존 | 모든 보고 추가 전용 보존(시도의 `rule_set_revision` 참조) |
| D9 | Rule/규칙 이름 | 화면은 `검증 규칙`·`규칙`, 외부 객체·코드는 `Rule`·`RuleSet`을 같은 개념으로 용어집에 한 항목 등재(용어 정리, 비소유자 결정) |
| D10 | 외부 `rule_id` ↔ `rule_key` 대응 | 불투명 text·정확한 문자열 일치·`result_ref`로 RuleSet을 찾고 모호하면 `ambiguous`(§2 식별 계약, 노드 0). 실제 Validator 값과의 일치는 실사 때 확인 |
