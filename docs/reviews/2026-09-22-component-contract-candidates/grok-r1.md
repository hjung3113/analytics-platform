# R1 검토 — 공통 컴포넌트/계약 후보 초안

- 작성: 2026-09-22
- 역할: 초안의 논리적 정확성·완성도 검토. 그럴듯함이나 인기 후보라는 이유로 동의하지 않는다.
- 대상: `docs/integration/component-contract-candidates.md` (Research/Candidate 초안)
- 근거: `docs/integration/repository-ideas.md`, `.agents/reports/repository-integration-candidates-luna.md`, `docs/06_platform_ui_contract.md`, `docs/01_architecture_and_data_contract.md`, `docs/research/platform-build-2026-09-22/SYNTHESIS.md` §5.1
- 보조 대조(읽기만): ProjectGraph `bd3bda9` (`EvidenceEntry`, `ConfidenceLevel`, `ConclusionLevel`, `write_canonical`), FileGateway `30d89a5` (`SiteTime`, `ApiKeyMiddleware`, `AuditMiddleware`, `LogEndpoints`, `ConfigurationEndpoints`), parser `docs/11` §14 · `docs/23` §0. 실행·빌드·실서비스 호출 없음.
- 상태: 검토·권고. 대상 문서와 06/01/03은 수정하지 않았다. 이 파일만 작성했다.
- 표기: **[사실]** 문서·코드에서 확인. **[추론]** 그 사실에서 도출한 설계 판단. **[미검증]** 실행·측정·운영 확인 없음.

---

## 1. 총평

초안은 Luna 보고서의 순위 후보와 제외 이유를 **대체로 충실히 옮긴다.** 후보 1의 `confirmed` 경고, 후보 2의 `X-Api-Key`/Asia/Seoul 불일치, 후보 3의 “흡수하지 않고 소비한다”, 설계-only 저장소의 제외는 Luna 본문과 06 Kernel 경계에 맞다. **[사실]**

반대하는 축은 “요약을 잘했다”가 아니라 **필드 수준 계약 초안으로서의 정확도**다.

1. Luna가 이미 줄인 필드 목록을 한 번 더 줄여, 원본 모델에 있는 식별자·시각·enum을 빠뜨린다.
2. 후보 3은 새 추출이 아니라 01이 이미 소유한 기준선이고, 후보 4는 Luna가 “한정된 reference”로 둔 agent 어휘를 번호 후보로 격상한다.
3. 06이 **Decided**로 막아 둔 시간·인증 충돌을 “맞대조 필요” 수준으로 약화한다.
4. 반영 표가 Data Trust를 §19로 적는다. Data Trust는 §18이고, §19는 `assessments[].state = confirmed | clear | unknown`이다. 초안이 스스로 경고하는 `confirmed` 혼동이 문서 구조에서 재현된다.

이 문서를 06/01에 붙이기 전에 고칠 것은 새 후보를 더 넣는 일이 아니다. **기준선(parser)과 참고 어휘(agent)를 번호 후보에서 내리고, 남은 1·2의 필드를 Luna 인용이 아니라 원본 모델/06 Decided와 맞춰 적는 일**이다. **[추론]**

---

## 2. 관점 1 — 뽑은 필드가 Luna 인용·원본과 일치하는가

판정 기준: Luna가 가리킨 라인과 문자 일치인지, 그리고 그 라인이 가리키는 원본 모델과 일치인지. 후자가 어긋나면 초안이 Luna의 축약을 **계약 필드인 양 재생산**한 것이다.

### 2.1 후보 1 Evidence / Lineage — Luna와는 일치, 원본 모델과는 축약

| 초안 필드 | Luna | 원본 | 판정 |
| --- | --- | --- | --- |
| `EvidenceEntry`: kind, source path, line range, content hash, sample set, analysis context | 보고서 L43, `evidence.py` L7–L30 인용 | `kind`, `source_path`, `line_start`/`line_end`, `content_hash`, `sample_set_id`, `analysis_context_id` 존재 | **Luna와 일치.** 원본에는 추가로 `evidence_id`, `symbol`, `source_excerpt`, `captured_at`(ISO-8601)이 있다. **[사실]** |
| lineage: raw field / output column / transformation chain / confidence / contract version / evidence IDs | 보고서 L43, `lineage.py` L18–L39 | `Level1LineageEntry`와 일치 | **일치.** 다만 `lineage_id`, 문서 수준 `graph_version`, `Level2WarningCandidate`는 초안 표에 없다. Luna L49는 `graph_version`을 참고 가치가 높다고 적어 두었다. **[사실]** |
| `confirmed` / `suspected` / `unresolved` / `conflicted` | 보고서 L49 | `ConfidenceLevel`은 이 넷이 전부가 아니다 | **과장.** 아래 2.1.1. |
| validation 실패 시 lineage/evidence를 쓰지 않고 validation 결과만 | 보고서 L45, `writer.py` L77–L119 | `validation.status == "fail"`이면 `validation-result.json`만 쓰고 return | **일치.** 성공 시 쓰는 `graph-version.json`(`graph_version`, `git_sha`, `input_content_hash`, `computed_at`)은 표에서 빠졌다. **[사실]** |

#### 2.1.1 `confirmed`는 ProjectGraph 안에서도 하나가 아니다

초안: “이 저장소의 `confirmed`는 ProjectGraph 분석가가 사람이 확인한 결론이지 플랫폼의 권한·Data Trust 판정이 아니다.” Luna L51과 같은 문장이다. 06 §19와 섞지 말라는 결론은 **동의**.

그러나 원본은 `confirmed`를 한 권위로 쓰지 않는다. **[사실]**

- `ConfidenceLevel` enum: `contract_confirmed`, `code_confirmed`, `metadata_confirmed`, `confirmed`, `suspected`, `unresolved`, `sample_observed`, `runtime_observed`, `conflicted`, `deprecated` (`src/projectgraph/models/confidence.py`).
- Level 1 lineage의 `confirmed`는 자동 부여다. “both contract+code → confirmed; one only → suspected; neither → unresolved” (`lineage_builder.py` INV-3).
- 별도 `ConclusionLevel = Confirmed | Partial | Warning Only | Not Answerable` (`bundle.py`). README는 `confidence` / `confirmed` / `conclusion_level` 권위 필드를 사람만 부여한다고 한다.
- reconciliation의 `confirmed`는 “auto는 항상 `suspected`, 사람 override 파일이 있어야 승격”이다.

초안 표의 네 값은 Luna L49의 축약이며, “사람 확인”은 README·bundle 권위에만 해당한다. lineage `confirmed`에 같은 설명을 붙이면 **자동 증거 충분성**과 **사람 승인**이 한 필드명으로 합쳐진다. 06 §19 `confirmed`(statusSource가 해당 kind를 확인, `observedAt` 필수)와 구별하라고 해 놓고, 원본 쪽 구별은 하지 않았다. **[추론]**

**수정 제안:** 표를 `ConfidenceLevel`(자동, 10값)과 `ConclusionLevel`(bundle 결론, 사람 권위)로 분리하고, “사람 확인”은 후자에만 적는다. `evidence_id` / `captured_at` / `graph_version` / `git_sha` / `input_content_hash`는 Luna L49가 이미 고가치로 적은 항목이므로 표에 되돌린다.

#### 2.1.2 “C# 분석기”는 원본과 어긋난다

초안: “이 코드(C# 분석기, static server)”. Luna L51: “C# + MSSQL 소스와 metadata snapshot을 **읽는** 정적 분석기”. README 1행: C# + MSSQL ETL/Parser를 **입력**으로 받아 canonical ETL graph JSON을 만든다. 모델 파일은 Python이다. **[사실]**

“C# 분석기”는 작성 언어로 읽히므로 부정확하다. “C#/MSSQL 입력을 읽는 Python 정적 분석기 + localhost static server”가 Luna와 원본에 맞다.

### 2.2 후보 2 FileGateway — 로그 조회 축은 일치, Configuration·시간 모델은 축소

| 초안 | Luna L55–L65 | 원본 `30d89a5` | 판정 |
| --- | --- | --- | --- |
| `equipmentId`, `logType`, `[from,to)`, pagination cursor, `attr.*` | L59 `LogEndpoints.cs` L12–L66 | 동일. 추가로 `subtype`, `limit`. cursor 실명은 `continuationToken` | **대체로 일치.** subtype/limit 누락은 경미. **[사실]** |
| audit: caller/equipment/log/config/file metadata/status/error/elapsed 기록, API key 원문·물리 경로 미기록 | L59 | 미기록 목록에 **token payload**가 있다 (`AuditMiddleware.cs` 파일 주석). `/health/*`는 미기록 | **token payload 누락.** Luna 인용문에도 있다. **[사실]** |
| read-only, opaque cursor, partial FTP failure 차단 | L61 | Luna가 같은 문장에 status/error code, health, 물리 경로 비노출을 나란히 적음 | **축소.** 상태 코드를 Data Trust outcome으로 바꾼다는 게이트는 L65에 있는데, 표의 “읽기 전용 경계” 행은 그 절반만 옮겼다. **[사실]** |
| `X-Api-Key` middleware vs 플랫폼 OIDC/Scope | L63, `ApiKeyMiddleware.cs` L1–L42 | `/api`에 header 단독, query string 미사용, 불일치 401 | **일치.** **[사실]** |
| offset 없는 값을 `Asia/Seoul`로 해석 | L63, `SiteTime.cs` L5–L32 | 맞음. **추가로** offset **있는** 값은 그 offset을 그대로 유지한다 | **Luna 축약을 재생산.** 아래 5.1. **[사실]** |
| URL `equipmentIds`/`from`/`to`/`scopeId` → gateway 요청 | L65 | 로그 API는 단수 `equipmentId` | **일치하는 가설.** 집합→단수 변환은 06 §6.1 집합 키 계약과 충돌 지점이다. **[추론]** |

Luna L59는 Configuration current/history 엔드포인트(`ConfigurationEndpoints.cs` L12–L75)를 로그와 나란히 적는다. 초안 표는 로그 파라미터만 계약 요소로 뽑았다. 원문 drill-through가 로그만이 아니라 설정 파일도 대상이라고 Luna L11·L57이 명시하므로, adapter 후보에서 Configuration을 빼면 범위가 조용히 줄어든다. **[사실]**

과장된 신규 필드는 보이지 않는다. 문제는 없는 내용을 넣은 것이 아니라 **있는 불일치를 약하게 적은 것**이다.

### 2.3 후보 3 Parser Consumption — Luna L29–L37과 일치, 01보다 얇다

초안의 `(equipment_id, occurrence_anchor)`, insert-only Result, source file 단위 transaction, Snapshot/Segment, `equipment_master`/`occurrence_directory` 소비 계층 책임은 Luna L33과 문자 수준으로 같다. parser `docs/11` §14도 `(equipment_id, occurrence_anchor)`를 immutable `RecordSequence` 기준으로 둔다. **[사실]**

빠진 것은 Luna가 같은 단락에서 이은 항목이다.

- “source commit/schema/contract version을 포함한 fixture 계약” (Luna L35).
- 01이 이미 구분해 둔 다섯 버전: DB 구조·마이그레이션, 파서 로직 버전과 생성 시점, Snapshot 직렬화 버전, 플랫폼 분석 계약 버전, 지표 정의 버전 (`docs/01` “파서-플랫폼 데이터 계약 리스크”).
- 01의 grain/단위/시각 의미/null 의미/품질 필드.
- `docs/23`은 parser 자신이 “구현 계약이 아니다”고 선언한다 (`docs/23` §0). 01 L37은 `docs/23` §2.5가 stale할 수 있다고 경고한다. 초안이 이 경계를 01 인용 없이 `docs/23` 계열 문장만 옮기면, 01이 이미 닫은 함정에 다시 빠진다.

**판정:** Luna 인용 범위 안에서는 일치. “필드 수준 계약 후보”로는 01 재진술이며 새 필드가 아니다. 번호 후보로 올리는 것은 과한 격상이다. **[추론]**

### 2.4 후보 4 Data Trust/Audit 어휘 — Luna L138–L153 복사이나 SYNTHESIS 5.1 겹침은 범주 오류

세 저장소의 원형 개념과 가설 필드(`analysisContextId + sourceRevision + evidenceContentHash + verifierIdentity + observedAt`)는 Luna L144를 그대로 옮겼다. “어휘/원칙만, 코드 병합 금지”도 Luna와 같다. **[사실]**

초안: “SYNTHESIS §5.1이 다루는 `requestEpoch`/`resultRevision`/actor 판정 3분리와 겹치는 부분이 있으므로, 실제 필드를 정할 때는 SYNTHESIS 5.1을 우선 참조”.

SYNTHESIS §5.1의 3분리는 다음이다. **[사실]**

- `requestEpoch`: 브라우저 요청 경쟁
- `resultRevision`: 숫자의 계산 기준
- 현재 actor/Scope 판정: 접근 가능성

후보 4의 해시·HEAD 결속·host receipt·`--approve` 토큰은 **산출물 신선도/승인 권위**이지 요청 경쟁이 아니다. `requestEpoch`에 대응하는 항목이 후보 4에 없다. “겹친다”고 쓰면 5.1이 금지한 일 — 하나의 provenance 값으로 세 유효성을 대체하는 일 — 을 초안이 먼저 한다. **[추론]**

**수정 제안:** “5.1과 겹친다”를 삭제한다. 후보 4는 06 §18 `source / lineage entry`·§19 `statusSource`/`observedAt`의 **어휘 참고**로 내리고, 필드 후보는 5.1 3분리와 직교한다고 명시한다.

---

## 3. 관점 2 — “후보로 뽑지 않은 것”이 타당한가

### 3.1 동의하는 제외

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `standard-log-lifecycle`, `log-contract-lens` | **동의** | Luna L67–L75: 구현 없음, Concept/UX. 추출 기준 1 위반. Menu Registry 입력은 메뉴 승인 후로 미루는 결정 순서 4와 맞다. **[사실]** |
| `vocpage` 전체 병합 | **동의** | Luna L132: 붙이면 VOC 상태·권한·history와 알림 규칙이 병렬이 된다. 추출 기준 2(VOC 상태 전이는 Kernel 밖, 06 §4). `repository-ideas.md`도 5분 debounce를 플랫폼 기본값으로 채택하지 말라고 한다. **[사실]** |
| `jira-voc-nexus` 제품 승격 | **동의** | Luna L77–L83: Jira ingress/ACL/write 없음, AllowAllAcl fixture. **[사실]** |
| `system-survey` | **동의** | Luna L123: FeedbackOps intake와 겹침. **[사실]** |
| agent 계열 나머지 | **동의** | Luna L138–L161. 제품 권한 ≠ agent 실행 권한. **[사실]** |

### 3.2 제외 표에 없어서 독자가 놓치는 것

초안의 제외 표는 Luna “순위 후보” 하단과 agent 3개를 주로 담는다. Luna가 본문에 판정만 하고 초안이 침묵한 항목:

- **FeedbackOps.** Luna L85–L87: 새 후보가 아니라 현재 VOC/auth/scope/audit **baseline**. 초안은 추출 대상에도 제외 표에도 없다. Kernel Audit/Scope의 실제 구현 원천을 건너뛴 채 agent 어휘만 후보 4로 올리면, “필드 수준 추출”의 증거가 제품이 아니라 운영 도구 쪽으로 기운다. **[추론]** 제외 표에 “baseline이라 이 문서의 신규 추출 대상이 아님. Audit/권한 필드는 03 리서치가 담당”을 한 줄로 적어야 한다.
- **`NewParser`.** Luna 제외 표: `context_recognized_parser`와 경쟁하는 설계, 구현 진입 전. 초안 제외 표에 없음. parser 소비 계약을 후보 3으로 두는 문서라면 경쟁 parser를 명시적으로 제외해야 한다. **[사실]**
- **`ai_reporter`.** Luna L111의 “실제 seam을 좁게 읽은 19개”에 들어 있으나 본문 판정이 없다. 초안도 침묵. **[미검증]** — 이 검토도 해당 저장소를 열지 않았다.

### 3.3 제외는 맞지만, 필드가 통째로 사라지면 안 되는 것

Luna L134는 vocpage를 병합하지 말라고 한 **다음**, 외부 VOC/Jira를 받을 **경우에만** 플랫폼 소유로 다시 정할 필드를 적는다: `source_event_id`, payload fingerprint, trusted principal, Scope/ACL, replay/conflict. 같은 지문은 Luna L123의 `jira-voc-nexus` `event_id + payload_fingerprint`에 이미 코드로 있다.

초안 제외 이유는 “실제 외부 connector 요구가 확정되기 전”. 추출 기준 1(구현 존재)은 nexus 쪽이 충족하고, 기준 2(Kernel vs VOC 도메인)로 빼는 편이 더 정확하다. 요구 미확정은 **게이트**이지 필드 소멸이 아니다.

**수정 제안:** 제외 표에 “보류 필드 (수요 게이트 후 재검토)” 열을 둔다. nexus/vocpage 행에 `source_event_id`/`event_id` + `payload_fingerprint` + trusted principal을 남긴다. 지금 06에 올리지 않는다는 판정은 유지한다.

`jira-voc-nexus`의 “근거 없으면 provider를 시작하지 않음”(Luna L81, L123)은 06 §19 “원인을 주장하는 상태는 status source가 확인한 경우에만”과 같은 종류의 Data Trust 원칙이다. 초안은 이 원칙을 제외 표에 묻고, 같은 성격의 “계약을 먼저 고정하고 host가 판정”(후보 4, harness)은 번호 후보로 올렸다. **일관되지 않다.** **[추론]** 둘 다 참고 원칙이거나, 둘 다 §19 보조 참고로 같은 단에 둔다.

### 3.4 번호 후보 중 참고 전용으로 내릴 것

| 후보 | 판정 | 이유 |
| --- | --- | --- |
| 1 Evidence/Lineage | **유지, 필드 보강** | Luna 순위 1. 06 §18이 이미 `source / lineage entry`를 Kernel 어휘로 예약. 구현 복사 금지는 초안이 이미 말한다. Premature Platformization(06 §24) 때문에 **메뉴/프레임워크**는 게이트 질문 유지. **[추론]** |
| 2 Raw evidence adapter | **유지, 불일치 강화** | Luna 순위 2. Kernel이 파일 접근을 소유하지 않고 adapter 경계를 소유하는 구분은 06 §4·§22와 맞다. **[추론]** |
| 3 Parser 소비 | **번호 후보에서 기준선으로 이동** | Luna L29 제목 자체가 “기준선: 흡수하지 않고 계약으로 소비”. 01이 이미 소유. 초안도 “여기서는 요약만”. 새 후보처럼 1·2와 나란히 두면 parser 고정이 아직 없는 일처럼 읽힌다. **[사실]** |
| 4 agent 어휘 | **참고 전용으로 강등** | Luna L138: “제품 코드 통합 후보로 올릴 것은 없다”, “한정된 reference”. 추출 기준 2의 Data Trust는 Kernel이지만, 원천은 agent 실행 도구다. 06 §18–§19와 SYNTHESIS 5.1이 이미 freshness/basis/statusSource/observedAt/3분리를 갖고 있다. 새 필드 후보가 아니라 중복 어휘다. `repository-ideas.md` “이 원칙 때문에 새 승인 엔진·증거 프레임워크를 미리 만들지는 않는다”와도 맞다. **[추론]** |

---

## 4. 관점 3 — 06 Platform Kernel 경계와 분류가 정합적인가

06 §3–§4 Kernel 소유: Shell, Menu Registry, Route/URL, Global Context, Permission/Scope, Data Trust 표시, Audit-aware UX, correlation ID. Kernel이 소유하지 않는 것: 설비 업무 로직, 특정 지표 계산, 특정 차트 configuration, **VOC 상태 전이**, 개별 메뉴 Form. **[사실]**

06 §18 Data Trust 최소 의미: freshness, calculation basis time, coverage, completeness/provisional, metric version, **source / lineage entry**. **[사실]**

06 §19는 Data Trust가 아니라 Loading/Empty/Error taxonomy와 `outcome` + `assessments[]`다. `assessments[].state = confirmed | clear | unknown`. `confirmed`/`clear`는 `statusSource`와 `observedAt` 필수. **[사실]**

### 4.1 맞는 분류

- 후보 1을 Data Trust/진단 drawer 참고로 두고 C#/Python 분석기를 Kernel에 넣지 않는 것 → 06 §4, §24. **동의**
- 후보 2를 별도 서비스 adapter로 두고 MSSQL/FTP/.NET을 Kernel/DB에 복사하지 않는 것 → 06 §4, Luna L65. **동의**
- VOC 상태 머신·payload review·알림 debounce를 계약화하지 않는 것 → 06 §4 “VOC 상태 전이”. **동의**
- agent 실행 권한을 제품 권한과 같은 모델로 강제하지 않는 것 → 06 §4, Luna L159. **동의**

### 4.2 어긋나는 지점

**§18 vs §19 번호.** 초안 후보 1 본문은 “06 §19의 assessment kind”라고 해 assessment를 올바르게 가리킨다. 맨 아래 반영 표는 “06 §19 Data Trust”로 적는다. Data Trust는 §18이다. 후보 4 반영도 “06 §19”. **[사실]**

이 오번호는 단순 오타가 아니다. 초안이 막으려는 `confirmed` 혼동의 입구다. 후보 1의 lineage 확실성, §19 assessment `confirmed`, ProjectGraph `ConclusionLevel.Confirmed`를 같은 “§19 Data Trust”로 모으면 독자가 한 enum으로 읽는다. **[추론]**

**수정 제안:** 후보 1 반영 = 06 **§18** `source / lineage entry` + 01. 후보 1의 확실성 단계는 §19 `assessments.state`와 **대조만** 하고 매핑하지 않는다(본문 경고 유지). 후보 2 반영 = 06 §6.2–§6.3·§17·§18 + 03 (Audit **필드** 계약은 06에 아직 없다). 후보 4는 06 반영 행에서 빼거나 “§18–§19 어휘 참고, 필드 비채택”으로 낮춘다.

**“플랫폼 Audit 계약에 맞는” (후보 2).** 06은 Audit-aware UX와 `AuditTimeline` 컴포넌트를 말할 뿐, FileGateway식 요청 감사(caller/equipment/status/elapsed)의 필드 계약을 갖고 있지 않다. 02의 Audit Trail은 마스터 변경 who/when/before-after다 (`docs/02_domain_menus.md`). 두 Audit은 다르다. “맞는 최소 기록 범위”는 존재하지 않는 계약을 전제한다. **[사실]** → “06에 아직 없는 요청 감사 필드의 참고 범위. 02 변경 감사와 합치지 말 것.”

**후보 1 게이트 질문 vs §24.** “field/column 원인 추적을 1급 메뉴로 만들 것인가”는 도메인 메뉴 수요 질문이다. 06 §18 lineage entry는 메뉴 승인 여부와 별개로 Kernel이 표시 표준을 소유한다(§14 “플랫폼이 소유하는 책임 — 구현 시점과 별개”). 초안 결정 순서 1은 메뉴 승인과 계약 고정을 한 줄에 묶는다. **[추론]** 나눌 것: (a) §18 lineage 표시 어휘는 Kernel 책임으로 남긴다. (b) ProjectGraph shape를 public contract로 복사하거나 진단 메뉴를 만드는 일은 수요 게이트 뒤에 둔다.

**후보 3의 Kernel 위치.** parser 소비는 06이 아니라 01/03 소유다. 초안 반영 표는 01이라고 올바르게 적으면서도 본문 추출 기준 2(“Kernel 경계 안”)로 후보를 걸러 뽑았다고 한다. parser grain/version은 Kernel UI 책임이 아니다. 기준 2를 엄격히 적용하면 후보 3은 이 문서의 “계약 후보”가 아니라 01 재확인이다. 이 점이 강등 권고와 같다. **[추론]**

---

## 5. 관점 4 — Luna에는 있으나 초안에 약하거나 없는 위험

### 5.1 시간: Asia/Seoul은 “맞대조”가 아니라 06 §6.3 Decided 충돌

Luna L63: FileGateway 시각 파서는 offset 없는 값을 고정 `Asia/Seoul`로 해석하며, 플랫폼의 naive `[from,to)` **및 source time-domain assertion**과 맞춰야 한다.

초안 후보 2: “플랫폼 naive wall-clock `[from,to)` 계약과 맞대조 필요. 그대로 가져오면 시간대 가정이 암묵적으로 복사됨.”

06 §6.3 Decided: 기간은 시간대 없는 설비 wall-clock, 임의 UTC 변환 금지, **임의의 기본 TZ를 가정하지 않음**, TZ 미확인은 Data Trust 표시. 복수 설비 병합은 서버 소유 assertion `(equipmentId, timeDomainId, validFrom, validTo)`가 있을 때만. URL `from`/`to`는 naive `YYYY-MM-DDTHH:mm:ss`, **`Z`/offset은 형식 오류**. 03도 “소비 계층이 이를 UTC로 임의 변환하면 조회 구간과 마스터 귀속이 틀어진다.” **[사실]**

원본 `SiteTime.Parse`는 더 넓다. **[사실]**

1. offset 없음 → `Asia/Seoul` (Luna·초안이 말한 부분).
2. offset 있음 → 그 offset을 유지 (초안 없음). 06은 이런 입력을 URL에서 거절한다.
3. FileGateway 문서(`docs/04a-log-provider.md`): API 경계는 offset 포함 ISO-8601, 내부 비교는 UTC instant.
4. 로그 쿼리: `from`/`to`를 **둘 다 생략하면 default range** (`LogEndpoints.cs` 파라미터 설명). 06 §6.4는 기본 구간을 `defaultRangeTo`로 물질화하고, 한쪽만 있으면 형식 오류다. 기본 시계가 다르다.
5. FileGateway는 전 설비에 단일 `SiteTime.Local = Asia/Seoul`. 06의 per-equipment `timeDomainId` assertion과 정면 충돌. Luna가 적은 “source time-domain assertion”이 바로 이 축이다. **초안이 이 구절을 빠뜨렸다.**

**수정 제안:** 후보 2 시간 행을 “맞대조”가 아니라 다음 불변식으로 고친다.

- adapter는 플랫폼 URL의 naive `[from,to)`를 gateway로 넘길 때 **기본 TZ를 채워 넣지 않는다.** SiteTime `Asia/Seoul` 폴백을 플랫폼 조회 경로에 쓰지 않는다.
- gateway가 offset 포함 값을 돌려주면 플랫폼 공개 URL/Context에 다시 넣지 않는다(§6.3 형식 오류).
- 복수 설비 원문 조회는 §6.3 assertion 없이 한 시간축으로 병합하지 않는다.
- gateway default range와 플랫폼 `defaultRangeTo`를 같은 시계로 취급하지 않는다.

### 5.2 인증: OIDC-to-caller mapping만으로는 Scope 재검증이 닫히지 않는다

Luna L63·L65: 현재 `X-Api-Key`, adapter가 OIDC-to-caller mapping으로 Scope를 **재검증**해야 하며 그대로 신뢰 금지. 초안은 이 문장을 유지한다. **동의.**

06 §6.2: `scopeId`는 권한 증명이 아니고 서버가 **매 요청마다** 재검증한다. FileGateway API key는 callerId만 `Items`에 남긴다 (`ApiKeyMiddleware.cs`). 설비 ACL·Scope 계층이 없다. **[사실]**

초안이 빠뜨린 실패 조건: mapping 표가 있어도 gateway가 설비 단위 거절을 하지 않으면, 플랫폼이 허용한 `equipmentIds` 부분집합만 요청하도록 adapter가 **강제**해야 한다. 그렇지 않으면 key 하나가 Scope를 우회한다. `repository-ideas.md` “숫자에서 원문 근거로 이동”도 “링크가 존재한다는 이유만으로 원문 열람 권한을 주지 않는다”고 적는다. **[추론]**

### 5.3 `confirmed` 의미 차이 — 초안이 06만 경고하고 원본 내부 분열을 못 봄

관점 1에서 인용. Luna L51의 “사람 확인”은 README 권위 필드에는 맞고, lineage INV-3 자동 `confirmed`에는 맞지 않는다. 초안은 전자만 옮겼다. 06 §19 `confirmed`까지 더하면 동음이의어가 최소 셋이다. **[사실]**

### 5.4 parser 다섯 버전과 `docs/23` stale 경고

Luna L35·01 L25–L41. 초안 후보 3은 occurrence 키와 소유권만 남겼다. 01이 “같은 API 필드명을 유지한 채 의미만 달라지는 경우가 더 위험”이라고 한 부분이 필드 후보에서 사라졌다. **[사실]**

### 5.5 결정 순서의 내부 모순

초안: “Luna 보고서 권고 그대로 유지” 후 1 Evidence → 2 FileGateway → 3 parser(다른 후보보다 우선) → 4 검증 메뉴. Luna L164–L169도 같은 번호와 같은 긴장(“3. parser를 **먼저** 고정”)을 가진다. **[사실]**

번호 3이 “먼저”이면 목록이 우선순위가 아니다. 초안이 Luna를 그대로 복사하면서 후보 번호(1·2·3·4)와 결정 순서 번호를 같게 매겨 긴장이 커졌다.

**수정 제안:** 순서를 책임 순으로 다시 쓴다. (0) parser 소비 계약은 01이 이미 연 기준선 — 다른 후보보다 먼저 고정. (1) Evidence **표시 어휘**는 §18 자리만 확인하고 ProjectGraph shape 복사는 게이트. (2) FileGateway는 원문 수요가 확정될 때만 adapter 불변식 검증. (3) 검증 lifecycle 메뉴는 승인 전 비계약.

### 5.6 그 밖에 Luna에 있고 초안에 약한 항목

- 운영 DB 직접 연결 금지, masked raw sample (Luna L45·L51). 초안은 redaction을 “채택 전 확인할 것”에만 넣었다. 샘플 내용을 플랫폼 응답에 넣는 순간 §17 permission-limited content와 충돌한다. **[추론]**
- ProjectGraph `serve`는 localhost read-only이며 `scopeId`/OIDC/Context를 제공하지 않는다 (Luna L51). 필드 추출만 하면 당장 치명적이진 않으나, “진단 drawer 참고”가 UI를 가져오는 일로 읽히지 않게 한 줄 남길 것.
- README 테스트 초록 수치를 검증으로 쓰지 말 것 (Luna L47·L63·검증 한계). 초안은 수치를 복사하지 않아 **이 점은 잘했다.** **동의**

---

## 6. 관점 5 — 문안 제안

대상 문서는 이 검토가 수정하지 않는다. 반영 시 초안 저자에게 넘길 문장만 적는다.

### 6.1 추출 기준 다음에 상태 층을 명시

지금 기준 3개만으로는 후보 3·4가 1·2와 같은 층이 된다. 예:

```text
이 문서의 항목은 세 층이다.
- 기준선: 01이 이미 소유한 parser 소비 계약. 새 후보가 아니다.
- 계약 후보: 원본에 구현이 있고 Kernel 경계의 필드·불변식으로 대조할 수 있는 것 (현재 Evidence artifact, FileGateway adapter).
- 참고 전용: 구현이 없거나 agent/도메인 도구인 것. 필드명을 06/01에 올리지 않는다.
```

### 6.2 후보 1 표 — `confirmed` 행 교체 예

```text
| `ConfidenceLevel` | lineage_builder INV-3가 contract+code 증거로 자동 부여. enum은 confirmed 외 contract_confirmed/code_confirmed/…/deprecated | 06 §19 `assessments.state`와 동음. 자동 증거 충분성이며 사람 승인·Data Trust outcome이 아님 |
| `ConclusionLevel` | bundle `Confirmed\|Partial\|Warning Only\|Not Answerable`. README상 사람만 부여 | 사람 결론. lifetimeworkflow `baseline.verified`와 유비 가능하나 필드 병합 금지 |
```

### 6.3 후보 2 시간 행 교체 예

```text
| 시간 모델 | offset 없음→Asia/Seoul, offset 있음→유지, API는 offset ISO-8601, 내부 비교는 UTC instant, 생략 시 default range, 전 설비 단일 Site TZ | 06 §6.3 Decided(naive wall-clock, 기본 TZ 가정 금지, Z/offset 형식 오류, timeDomain assertion)와 충돌. adapter가 폴백 TZ를 채우거나 gateway default range를 `defaultRangeTo`로 쓰면 계약 위반 |
```

### 6.4 반영 표 번호

| 후보 | 반영 예상 |
| --- | --- |
| Evidence/Lineage (1) | 06 **§18** Data Trust의 `source / lineage entry`. 확실성 enum은 §19와 대조만 |
| Raw evidence adapter (2) | 06 §6.2 Scope, §6.3 시간, §17 permission UX, §18 outcome 매핑, 03 서비스 통합. Audit **필드**는 06에 없으므로 02 변경 감사와 분리해 신설 여부를 03에서 결정 |
| Parser 소비 (기준선) | 01 — 이미 소유. 이 문서에서 재후보화하지 않음 |
| agent 어휘 (참고) | 06 §18–§19·SYNTHESIS §5.1의 **보조 참고**. 필드 비채택 |

### 6.5 결정 순서 첫 줄

“Evidence drill-through를 1급 메뉴로 확정하면 후보 1 필드를 고정”을 쪼갠다: Kernel은 §18 lineage **표시**만 소유한다. ProjectGraph JSON을 public contract로 복사하는 일은 메뉴 수요와 별개 게이트다.

---

## 7. 동의 / 반대 / 수정 표

| ID | 초안 주장 | 판정 | 근거 |
| --- | --- | --- | --- |
| T0 | Research/Candidate, 06/05가 권위, 여기서 Decided 승격 없음 | **동의** | 초안 L1–L7, 06 문서 소유권 |
| T1 | 추출 기준 3개 (구현 존재 / Kernel 경계 / 계약만) | **부분수용** | 기준은 맞다. 적용이 후보 3·4에서 느슨하고, 층을 나누지 않음 |
| C1 | ProjectGraph 필드 추출, 코드 비흡수 | **부분수용** | 방향 동의. 표가 Luna 축약을 재생산. `confirmed` 단의화는 반대 |
| C1c | `confirmed` = 사람 확인, 06 assessment와 매핑 금지 | **부분수용** | 매핑 금지는 동의. “사람 확인”은 ConclusionLevel에만 해당. lineage는 자동 |
| C2 | FileGateway는 adapter 경계만 | **동의** | Luna L65, 06 §4 |
| C2t | 시간은 naive 계약과 맞대조 | **반대(약화)** | 06 §6.3 Decided 충돌. Luna L63 time-domain assertion 누락 |
| C2a | OIDC-to-caller mapping으로 Scope 재검증, 그대로 신뢰 금지 | **동의, 보강** | 설비 부분집합 강제 실패 조건을 행으로 추가 |
| C3 | parser는 독립 upstream + thin view/mart | **동의, 강등** | 내용 동의. 번호 후보가 아니라 01 기준선 |
| C4 | agent 3개 어휘를 Data Trust 필드 후보로 | **반대(격상)** | Luna L138 한정 reference. SYNTHESIS 5.1 겹침 주장은 범주 오류 |
| X1 | standard-log-lifecycle 등 설계 문서 제외 | **동의** | 기준 1 |
| X2 | vocpage/nexus/survey 제외 | **부분수용** | 병합 제외 동의. nexus 지문 필드는 보류 열에 잔류 |
| X3 | 나머지 agent 제외 | **동의** | |
| D1 | 결정 순서 = Luna 그대로 | **반대(형식)** | 번호와 “parser 먼저”가 모순. 층을 나누면 해소 |
| M1 | 반영 표 06 §19 Data Trust | **반대** | Data Trust = §18. §19 = assessments |

---

## 8. 핵심 권고 (5)

1. **후보를 세 층으로 다시 쌓는다.** 기준선 = parser 소비(01). 계약 후보 = Evidence artifact, FileGateway adapter. 참고 = agent 어휘, lifecycle UX, nexus 지문.
2. **후보 1 표를 원본 모델에 맞춘다.** `evidence_id`/`captured_at`/`graph_version`/`git_sha`/`input_content_hash`를 되돌리고, `ConfidenceLevel`과 `ConclusionLevel`을 분리한다. “C# 분석기” 표현을 고친다.
3. **후보 2 시간을 Decided 충돌로 승격한다.** 기본 TZ 폴백, offset 보존, UTC 내부 비교, 단일 Site TZ, gateway default range를 각각 06 §6.3–§6.4 위반 조건으로 적는다. Configuration 엔드포인트를 로그와 같은 adapter 범위에 넣는다.
4. **후보 4와 SYNTHESIS 5.1을 붙이지 않는다.** 5.1은 요청 경쟁/계산 세대/actor 접근이다. HEAD 해시·host receipt·approve 토큰은 다른 축이다. 붙이면 5.1이 막은 단일 generation 함정이다.
5. **반영 표의 §19 Data Trust를 §18로 고친다.** Audit은 06 필드 계약이 없음을 명시하고, 요청 감사(FileGateway)와 변경 감사(02)를 한 “Audit 계약”으로 부르지 않는다.

---

## 9. 다른 리뷰어에게 묻는 질문

1. parser 소비를 이 문서의 번호 후보로 남기는 편이, 01을 권위로 두고 여기선 한 줄 교차참조만 하는 편보다 나은가? 남는 이유가 “Luna 조사 범위를 한 장에 모은다”뿐이면 기준선 섹션으로 충분하다.
2. 외부 ingress 지문(`event_id` + `payload_fingerprint`)을 지금 보류 필드로 남길 것인가, 06 Kernel 밖(VOC 도메인/03)이라 이 문서에서 지울 것인가? 지울 경우 Luna L134의 세 결정 항목을 어느 문서가 추적하나?
3. FileGateway 시간 충돌을 adapter 불변식(이 문서)으로 닫을 것인가, 06 §6.3에 “외부 서비스가 기본 TZ를 갖는 경우 거부”를 한 줄 보강할 것인가? 후자는 전역 계약 변경이므로 05 추적 대상이다.

---

## 10. 검증 한계

- 대상 초안, Luna 보고서, 06, 01, SYNTHESIS §5.1, repository-ideas, INDEX는 전부 읽었다. 06의 Shell/테이블/토큰 절과 05 전체는 이번 쟁점에 필요 없어 펼치지 않았다.
- ProjectGraph·FileGateway·parser 문서는 Luna가 인용한 경로를 로컬에서 열어 필드를 대조했다. HEAD는 조사 당시와 같다(ProjectGraph `bd3bda9`, FileGateway `30d89a5`). **테스트·빌드·FTP/MSSQL/Jira/OIDC 호출은 하지 않았다.** README의 테스트 초록·MVP 완료는 저장소 주장으로만 취급한다. **[미검증]**
- FeedbackOps 서브모듈의 audit 스키마, vocpage 알림 트랜잭션, nexus SQLite replay, lifetimeworkflow `approve.py`는 Luna 인용과 보고서 본문으로만 판단했고 이번 세션에서 해당 파일을 다시 열지 않았다. 후보 4 강등은 Luna 문장과 06/SYNTHESIS 대조에 의존한다. **[미검증]** (코드 재확인 없음)
- `ai_reporter` 등 Luna가 이름만 올린 저장소는 열지 않았다.
- 웹 검색 없음. 외부 OSS 사실 확인이 이 검토의 쟁점이 아니다.
- 이 파일 외에 문서를 수정하지 않았다.
