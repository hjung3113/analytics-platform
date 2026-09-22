# 공통 컴포넌트/계약 후보 — 저장소 조사 기반 추출

작성일: 2026-09-22. 상태: **Research / Candidate**. 이 문서는 [기존 프로젝트 활용 아이디어 모음](repository-ideas.md)과 그 근거인 [Luna Max 저장소 통합 후보 조사](../../.agents/reports/repository-integration-candidates-luna.md)에서 "플랫폼이 공통 계약으로 가져갈 만한 것"만 뽑아 계약 후보 형태로 재정리한다. 채택 결정, 필드 확정, 구현 착수가 아니다. 전역 계약은 계속 [06 플랫폼 UI 계약](../06_platform_ui_contract.md)이 소유하고, 결정 상태는 [05](../05_roadmap_and_open_questions.md)가 추적한다.

## 왜 이 문서가 필요한가

`repository-ideas.md`는 후보 저장소별로 "참고할 수 있는 내용"을 넓게 모아둔 브레인스토밍이다. 이 문서는 그중 실제로 **필드 수준 계약 형태**로 뽑아낼 수 있는 것만 추려서, 나중에 06/01/03에 반영할 때 바로 비교할 수 있는 단위로 정리한다. 새 계약을 여기서 확정하지 않는다 — 여기 있는 필드 이름과 구조는 설계 착수 시 다시 검증해야 하는 초안이다.

## 추출 기준

다음 조건을 만족해야 "계약 후보"로 뽑았다. 아니면 [후보로 뽑지 않은 것](#후보로-뽑지-않은-것--참고만-하고-계약화하지-않음)으로 내렸다.

1. 원본 저장소에 실제 코드·스키마·문서로 구현된 구조가 있어야 한다 (아이디어만 있는 설계 문서는 제외).
2. 플랫폼 Kernel 책임(Shell/Context/Registry/Scope/Data Trust/Audit) 경계 안에 들어오는 것이어야 한다 — 특정 도메인 업무 로직(VOC 상태 전이, 설비 규칙 등)은 제외.
3. 코드를 그대로 복사하는 게 아니라 **계약(필드·경계·불변식)만 추출**할 수 있어야 한다. 구현체(런타임, DB, 프레임워크)는 별도 서비스/adapter로 남긴다.

이 세 기준을 적용해도 이 문서에 나열된 항목이 전부 같은 무게는 아니다. parser 소비는 새로 뽑은 계약이 아니라 [01](../01_architecture_and_data_contract.md)이 이미 소유한 **기준선**이므로 번호 후보에서 뺐다(Grok 4.6 High R1·Astra Medium R1이 합의, [검토 이력](#검토-이력) 참조). 후보 3(Data Trust/Audit 어휘)은 제품 저장소가 아니라 agent 운영 도구에서 가져온 참고 어휘다.

**근거 강도**: 아래 필드는 [Luna Max 조사](../../.agents/reports/repository-integration-candidates-luna.md)의 정적 열람(코드·문서 대조)에 기반하며, 실행·빌드·부하·실서비스 검증이 아니다. 저장소 README의 "테스트 통과"·"MVP 완료" 주장은 확인하지 않은 저장소 자체 주장으로만 취급한다(Luna 보고서 §"검증 한계"). 조사 시점 일부 로컬 worktree는 dirty했다(FileGateway `?? .review/`, standard-log-lifecycle 미추적 파일, ProjectGraph `CLAUDE.md` 변경).

## 후보 1 — Evidence / Lineage Artifact Contract

**출처**: `ProjectGraph` ([근거](../../.agents/reports/repository-integration-candidates-luna.md#L41-L54))

ProjectGraph는 raw field → parser → reference lookup → output column 경로를 `evidence_id`와 lineage로 묶은 정적 분석 산출물을 만든다. 구현은 C#/MSSQL ETL 소스를 분석 **대상**으로 읽는 Python 정적 분석기 + localhost static server다 — "C# 분석기"라고 적으면 작성 언어로 오독된다. 플랫폼이 이 코드를 가져올 이유는 없지만, **원인 추적 결과를 표현하는 필드 형태**는 Data Trust·진단 drawer 설계 시 참고할 가치가 있다.

뽑아낼 수 있는 계약 요소:

| 필드/개념 | ProjectGraph 원형 | 플랫폼에서의 의미(가설) |
| --- | --- | --- |
| `EvidenceEntry` | kind, source path, line range, content hash, sample set, analysis context (원본에는 추가로 `evidence_id`, `symbol`, `source_excerpt`, `captured_at`도 있음) | 근거 하나를 가리키는 최소 단위. 플랫폼에서는 source revision·Scope/ACL·redaction을 추가해야 함 |
| lineage record | raw field/output column/transformation chain/confidence/contract version/evidence IDs | 값 하나가 어떤 변환 경로를 거쳤는지 추적하는 구조 |
| lineage `ConfidenceLevel`(이 경로에서 자동 부여) | `lineage_builder`가 contract+code 증거로 이 경로 한정 자동 부여하는 enum. 값은 `confirmed`/`suspected`/`unresolved`/`conflicted` 외에도 `contract_confirmed`/`code_confirmed`/`sample_observed`/`runtime_observed`/`deprecated` 등이 있다 | 06 §19 `assessments.state`와 동음이지만 **자동 증거 충분성**이다. 그대로 매핑하지 말고 대조만 |
| bundle `ConclusionLevel`(사람 권위 정책) | bundle 결론 `Confirmed`/`Partial`/`Warning Only`/`Not Answerable`. README는 자동 부여 confidence를 사람이 임의 변경하지 못하게 하고 AI agent 단독의 confirmed 승격/conclusion 분류를 금지하는 **권위 정책**을 정의한다 — enum 선언만으로 승인자 신원 검증·승인 기록까지 기술적으로 강제됨을 뜻하지는 않는다 | ProjectGraph 안에서 "사람이 확인한 결론"에 대응하는 건 이쪽이다. lifetimeworkflow의 `baseline.verified`와 유비 가능하나 필드 병합은 금지 |
| reconciliation `confirmed`(별도 human override 경로) | `reconciliation/classifier.py`: 자동 분류 결과는 항상 `suspected`로 제한되고, `confirmed` 승격에는 human override 파일이 필요하다 | 위 두 `confirmed`와 또 다른 세 번째 경로. 세 산출물의 `confirmed`를 하나의 결론으로 합치지 않는다 |
| validation gate | validation 실패 시 lineage/evidence를 쓰지 않고 validation 결과만 씀 | "검증 통과 전엔 결과를 노출하지 않는다"는 원칙만 재사용 |

**채택 전 확인할 것**:
- ProjectGraph 안에서도 `confirmed`는 하나의 권위가 아니다(위 표 `ConfidenceLevel` vs `ConclusionLevel`). 06 §19 assessment `confirmed`까지 더하면 동음이의어가 최소 셋이다. 그대로 이름을 가져오면 의미가 섞인다.
- 이 lineage는 **ETL 코드에 대한 정적 분석 결론**(어떤 raw 필드가 어떤 변환을 거쳐 어떤 컬럼으로 가는지)이다. 플랫폼의 drill-through 요구는 대개 **데이터 값의 계보**(차트 숫자 → occurrence → 원문 로그)다. 어휘(evidence_id, chain, confidence)를 그대로 옮겨도 산출물의 의미는 다르므로, 이 구분 없이 필드를 가져가면 "lineage가 있다"는 말이 두 가지를 가리키게 된다. 값 수준 어휘의 개념적 원형은 [제외한 `log-contract-lens`](#후보로-뽑지-않은-것--참고만-하고-계약화하지-않음)(원본 줄 → 추출 필드 → 진단 근거) 쪽에 가깝다 — 구현이 없어 지금은 제외하지만, 이 게이트가 열리면 상호 대조 대상이다.
- 원본 `EvidenceEntry`에 이미 `analysis_context_id`, `captured_at`이 존재한다. 플랫폼이 같은 이름으로 `analysisContextId`를 새로 정의하면 "같은 이름, 다른 의미" 충돌이 생길 수 있다.
- 필드를 채택하려면 `analysisContextId`, source revision, Scope/ACL, retention/redaction, Data Trust outcome, correlation ID를 플랫폼이 직접 정의해야 한다. 운영 DB 직접 연결 금지, masked raw sample 원칙도 함께 가져온다 — 샘플 원문을 플랫폼 응답에 그대로 넣으면 permission-limited content 원칙과 충돌한다.

**게이트 질문**: 플랫폼에서 field/column 원인 추적과 근거 drill-through를 1급 메뉴/상세 surface로 만들 것인가? 아니면 이 후보 전체를 defer할 것인가?

## 후보 2 — Raw Evidence Drill-through Adapter Contract

**출처**: `FileGateway` ([근거](../../.agents/reports/repository-integration-candidates-luna.md#L55-L65))

FileGateway는 설비 로그/Configuration 파일을 `equipmentId` + 기간으로 읽기 전용 조회·다운로드하는 별도 서비스다. 코드(MSSQL/FTP resolver, .NET/IIS)는 플랫폼에 들어오지 않는다. 재사용 가치는 **adapter 경계 패턴**이다.

뽑아낼 수 있는 계약 요소:

| 개념 | FileGateway 원형 | 플랫폼 adapter가 지켜야 할 것 |
| --- | --- | --- |
| 조회 파라미터 | 로그: `equipmentId`, `logType`, `[from,to)`, pagination cursor, `attr.*`. Configuration은 **다른 축**이다 — current는 `equipmentId + configurationType`으로 기간·cursor 없이 배열을 반환하고, history만 `from`/`to` 필수 + pagination이 있다 | 플랫폼 URL의 `equipmentIds`/`from`/`to`/`scopeId`를 gateway 요청으로 변환하되, 로그의 시간 기반 조회·Configuration history·Configuration current를 구분해서 매핑한다. 셋을 같은 `[from,to)` 축으로 뭉치면 의미가 달라진다. adapter 범위에서 Configuration을 통째로 빼면 원문 조회 범위가 조용히 줄어든다 |
| audit 기록 범위 | caller/equipment/log/config/file metadata/status/error/elapsed는 기록, API key 원문·**token payload**·물리 경로는 기록 안 함(`/health`류는 애초에 감사 대상 아님) | 06에는 아직 이런 요청 감사의 필드 계약이 없다(있는 것은 02의 마스터 변경 감사, who/when/before-after — 다른 Audit이다). "맞는 범위"가 아니라 "신설 필요 여부를 03에서 결정"으로 참고 |
| 읽기 전용 경계 | read-only, opaque cursor, status/error code, health, 물리 경로 비노출, partial FTP failure 차단 | Data Trust outcome으로 변환할 상태값 후보 |
| 인증 불일치 | 현재 `X-Api-Key` middleware(callerId만 `Items`에 보존, 설비 단위 ACL 없음), 플랫폼 OIDC/Scope와 다름 | adapter가 OIDC-to-caller mapping으로 Scope를 **매 요청마다** 재검증해야 함 — 그대로 신뢰 금지. 요청에 포함된 설비 ID를 먼저 검증하고, 권한 없는 ID는 **명시적으로 거부**한 뒤 검증된 조회만 gateway에 전달한다. 무단 ID를 조용히 걸러내고 남은 부분집합 결과를 같은 요청의 "성공"으로 보이게 하면 06 §6.2 위반이다 |
| 시간 모델 | `SiteTime.Parse`: offset 없는 값→고정 `Asia/Seoul`, offset **있는** 값→그 offset 유지, API 경계는 offset 포함 ISO-8601·내부 비교는 UTC instant, 시간 기반 로그 조회에서 `from`/`to` 둘 다 생략하면 gateway 자체 default range, 전 설비 단일 Site TZ | 아래 표. gateway의 시간 표현 자체가 무조건 06 위반은 아니며, **adapter가 특정 방식으로 다룰 때만** 06 §6.3–§6.4 Decided를 위반한다 |

| adapter 행동 | 판정 |
| --- | --- |
| 미확인 플랫폼 naive 값을 그대로 SiteTime에 넘겨 Seoul로 해석시킴 | **위반.** adapter가 offset을 직접 추가하지 않아도 gateway가 추가하므로, 의미 보존 매핑이 입증되지 않으면 이 경로를 호출하지 못하게 해야 함 |
| gateway가 offset 포함 값을 반환하고 내부에서 UTC instant로 비교 | **그 자체는 위반 아님.** 외부 서비스 내부 표현을 플랫폼 URL/원천 의미와 동일시하는 다음 단계가 문제 |
| gateway의 offset 응답을 플랫폼 공개 URL `from`/`to`로 그대로 재사용 | **위반.** offset만 제거해도 의미 보존은 입증되지 않음(§6.3 형식 오류 + 의미 손실) |
| 단일 Site TZ를 복수 설비의 공통 시간역 증명으로 사용 | **위반.** 서버 소유 `timeDomainId` assertion 없이 병합 금지 |
| gateway의 시간 기반 default range를 플랫폼 `defaultRangeTo`로 그대로 위임 | **위반.** §6.4는 한쪽만 있는 입력을 형식 오류로 거부한다 |
| offset 기반 외부 데이터를 설비 단위로 분리 조회만 하는 것 | **06이 일괄 금지하지 않음.** 플랫폼 naive 단일 설비 조회 가능성과 gateway가 이를 안전 지원하는지는 별개 확인 대상 |

이 adapter 행동별 판정은 기존 06 §6.3–§6.4 Decided를 구체화한 것이며, 이를 위해 06 문언을 바꿀 필요는 없다. 기본 TZ fallback 허용, offset URL 허용, assertion 없는 병합 허용처럼 **기존 의미 자체를 바꾸는 변경**이 필요하면 그건 06/03 소유 문서 변경이고 [05](../05_roadmap_and_open_questions.md)에서 결정 상태로 추적한다. 실제 TZ 매핑 값 확정도 05의 기존 Open 항목이며, 이 문서가 그 값을 확정할 권한은 없다.

**게이트 질문**: 원문 로그/설정파일 drill-through가 실제 제품 요구로 확정되는가? 아니면 parser의 view/mart만으로 충분한가?

## 기준선 — Parser Consumption Contract (번호 후보 아님)

**출처**: `context_recognized_parser` ([근거](../../.agents/reports/repository-integration-candidates-luna.md#L29-L37))

parser 소비 경계는 이 문서가 새로 뽑은 후보가 아니라 [01 데이터 계약](../01_architecture_and_data_contract.md)이 이미 소유한 기준선이다. parser는 흡수 대상이 아니라 **독립 upstream + 플랫폼 소유 thin compatibility view/mart**로 소비한다. `(equipment_id, occurrence_anchor)` immutable `RecordSequence` anchor, source file 단위 transaction, insert-only Result, Snapshot/Segment 구조, `equipment_master`/`occurrence_directory`의 소비 계층(플랫폼) 책임은 모두 01이 상세 식별자·다섯 버전 구분(DB 구조·파서 로직·Snapshot 직렬화·플랫폼 분석 계약·지표 정의)·grain·fixture 계약과 함께 소유한다. view는 컬럼 rename만 흡수하고 의미·grain·관계 변경은 흡수하지 못하므로 실제 dump 기반 snapshot contract test가 필요하다는 것도 01의 경고다.

이 문서에 남기는 이유는 다른 후보(특히 Evidence/Lineage, adapter)를 설계할 때 이 기준선과의 정합성을 먼저 확인해야 하기 때문이다. 새 필드를 여기서 다시 정의하지 않는다. "먼저 고정"은 설계 의존성 확인 순서이지 dump 생성·구현 착수 승인이 아니다.

## 후보 3 — Data Trust / Audit Provenance 어휘

**출처**: `feedbackops-workflow`, `general-ai-harness`, `lifetimeworkflow` ([근거](../../.agents/reports/repository-integration-candidates-luna.md#L138-L153)) — 세 저장소 모두 제품 코드가 아니라 agent 운영 도구지만, "결과를 무엇에 결속시켜 신뢰할지"에 대한 어휘는 참고 가치가 있다.

| 저장소 | 원형 개념 | 플랫폼 Data Trust/Audit 필드 후보(가설) |
| --- | --- | --- |
| `feedbackops-workflow` | `head_sha`, `content_sha256`, immutable review snapshot, stale artifact 거부 | `analysisContextId + sourceRevision + evidenceContentHash + verifierIdentity + observedAt` — 이 필드 튜플은 **`feedbackops-workflow` 한 저장소의 패턴**에서만 나왔다. 세 저장소가 공동으로 뒷받침하는 것처럼 읽지 않는다 |
| `general-ai-harness` | RunSpec/AcceptanceContract를 먼저 고정한 뒤 host가 산출물 hash로 판정 | "계약을 먼저 고정하고 결과를 host가 판정"하는 순서만 참고 |
| `lifetimeworkflow` | 기계 제안(`baseline.received`)과 사람 승인(`baseline.verified`)을 분리. 승격에는 `--approve` + **ADR reference** + 인간 confirmation token **세 신호 전부**가 필요(둘만으로는 안 됨) | 자동 계산 결과와 사람 승인 결과를 같은 필드로 섞지 않는다는 원칙. ADR reference는 "승인 사유의 기록"이 설계의 일부라는 뜻 |

이 셋은 **어휘/원칙만** 가져온다. 코드, 스키마, 실행기를 제품에 병합하지 않는다.

[SYNTHESIS §5.1](../research/platform-build-2026-09-22/SYNTHESIS.md)의 `requestEpoch`(브라우저 요청 경쟁) / `resultRevision`(숫자의 계산 기준) / 현재 actor·Scope 판정(접근 가능성) 3분리와 이 후보를 같은 층으로 "겹친다"고 쓰지 않는다. 후보 3의 HEAD 해시·host receipt·`--approve` 토큰은 **산출물 신선도/승인 권위**를 다루는 다른 축이며, 셋 중 `requestEpoch`에 대응하는 항목이 없다. 다만 SYNTHESIS 자체도 이 문서와 같은 Research/Candidate이고 `requestEpoch`/`resultRevision`은 5.1이 예시로 든 이름이지 확정 필드가 아니다. 해시·`observedAt`은 계산 기준/원천 추적과 일부 관련될 수 있으므로 "전혀 겹치지 않는다"보다 **"대응은 별도로 설계하며, 하나의 provenance 값으로 5.1의 세 유효성을 대체하지 않는다"**가 정확하다. 실제 필드를 정할 때는 5.1의 3분리를 지키고, 이 후보는 §18 `source / lineage entry`·§19 `statusSource`/`observedAt`의 **보조 어휘 참고**로만 쓴다.

## 후보로 뽑지 않은 것 — 참고만 하고 계약화하지 않음

| 저장소 | 이유 |
| --- | --- |
| `standard-log-lifecycle`, `log-contract-lens` | 구현이 없는 설계 문서. Validation Round/Defect/Gate 어휘는 검증 메뉴가 실제로 승인될 때 Requirements→IA부터 다시 계약한다. 지금 필드로 확정할 근거가 없음 |
| `vocpage` | FeedbackOps와 VOC/권한/감사 범위가 중복. payload review, 외부 master snapshot, 5분 debounce 알림은 UX 참고일 뿐, 필드를 그대로 채택하면 FeedbackOps와 병렬 상태 머신이 생김. **조건부 재진입**: 공통 알림(수신자·읽음·억제)이 플랫폼 공통 책임으로 확정되면 `(user_id, type, voc_id)` + debounce 구조를 다시 검토 |
| `jira-voc-nexus` | Jira ingress/ACL/write path가 실제로 없는 fixture. `event_id + payload_fingerprint` replay/conflict는 nexus에 실제 구현이 있으나, 실제 외부 connector 요구가 확정되기 전엔 계약화하지 않음. **조건부 재진입**: 외부 VOC/Jira ingress를 실제로 받기로 하면 nexus의 replay/conflict 구현을 참고 어휘로 삼아 `source_event_id`/fingerprint/trusted principal/Scope/ACL을 별도 ingress adapter 계약으로 다시 정한다 — 이 필드들은 Luna가 제안한 **미확정 설계 후보**이며, vocpage에 같은 지문 스키마가 이미 구현돼 있다는 뜻은 아니다(vocpage의 `issue_code` unique/sequence는 식별자 중복 방지일 뿐 inbound event id/hash/idempotency/replay와는 다르다) |
| `system-survey` | intake/attachment/comment UX가 FeedbackOps와 겹침. 별도 계약 추출 불필요 |
| agent 계열 나머지(`Agent-forge`, `agent-platform`, `thin-agent-harness`, `agent-migration-pipeline` 등) | 분석 플랫폼 도메인 구현이 아니라 agent 실행 권한/오케스트레이션. 제품 권한 모델과 agent 실행 권한을 같은 모델로 강제하지 않음 |

## 다음 결정 순서

parser 기준선과 번호 후보 1~2·검증 lifecycle 참고는 우선순위 목록이 아니라 서로 다른 게이트다.

0. **기준선 확인**: parser 소비 계약은 다른 후보의 채택 여부와 무관하게, 01이 이미 진행 중인 의존으로 먼저 고정한다.
1. Evidence drill-through를 1급 제품 요구로 확정할지 결정 → 확정 시 후보 1의 필드부터 플랫폼 소유 계약으로 고정. 단 06 §18 lineage 표시 어휘 자체는 메뉴 승인과 별개로 Kernel 책임이라, "메뉴를 만들 것인가"와 "표시 표준을 §18에 남길 것인가"는 다른 질문이다.
2. 원문 파일 접근(FileGateway) 필요 여부 확정 → 필요 시 후보 2의 adapter 경계, 특히 시간 모델 adapter 행동별 판정을 06 §6.3–§6.4 대조로 검증.
3. 검증 lifecycle 메뉴가 실제로 승인될 때만 `standard-log-lifecycle`/`log-contract-lens` 어휘를 다시 검토.

## 문서 반영 지점

이 문서는 후보를 모아둔 상태이며, 실제 반영은 각 소유 문서에서 별도로 결정한다.

| 항목 | 반영 예상 문서 |
| --- | --- |
| Evidence/Lineage (후보 1) | [01](../01_architecture_and_data_contract.md)이 evidence/lineage artifact 계약의 1차 소유자, [06 플랫폼 UI 계약](../06_platform_ui_contract.md) **§18** Data Trust(`source / lineage entry`)는 표시 표준. 확실성 enum은 §19 `assessments.state`와 대조만 하고 매핑하지 않음 |
| Raw evidence adapter (후보 2) | [06](../06_platform_ui_contract.md) §6.2 Scope·§6.3–§6.4 시간·§17 permission UX·**§19** outcome/assessments 매핑, [03 백엔드](../03_backend_stack.md) — 별도 서비스 통합 시. 요청 감사 **필드** 계약은 06에 아직 없으므로 신설 여부를 03에서 결정하고 02의 변경 감사와 합치지 않음 |
| Parser 소비 계약 (기준선) | [01 아키텍처·데이터 계약](../01_architecture_and_data_contract.md) — 이미 경계 인지됨. 이 문서에서 새로 계약을 만드는 대상이 아니라 01을 교차참조하는 항목 |
| Data Trust/Audit 어휘 (후보 3) | [06](../06_platform_ui_contract.md) §18–§19의 보조 참고, [01](../01_architecture_and_data_contract.md)/[03](../03_backend_stack.md) — audit 원천 필드(`verifierIdentity`, content hash 등)는 API/백엔드 계약 소관, [SYNTHESIS §5.1](../research/platform-build-2026-09-22/SYNTHESIS.md)과는 다른 축이므로 필드 채택은 하지 않음 |

어떤 항목도 이 문서만으로 Decided로 승격되지 않는다. 승격은 각 소유 문서에서 별도 변경으로 기록한다.

## 검토 이력

이 문서는 세 차례 다중 모델 리뷰를 거쳐 보강됐다. R1 보고서는 최종 판정이 아니라 이 문서에 실제 반영된 근거다.

- [Grok 4.6 High R1](../reviews/2026-09-22-component-contract-candidates/grok-r1.md), [GLM 5.3 Max R1](../reviews/2026-09-22-component-contract-candidates/glm-r1.md) — 사실 오류(§ 참조 오류, "C# 분석기" 표현, lifetimeworkflow 3신호 누락, audit token payload 누락)와 보강 항목(정적 코드 계보 vs 데이터 값 계보 구분, `confirmed` 다의성)을 지적, 전부 반영. 두 리뷰어는 parser를 번호 후보로 유지할지에서 입장이 갈렸다.
- [Astra Medium R1](../reviews/2026-09-22-component-contract-candidates/astra-r1.md) — 위 보강판 자체의 추가 오류(vocpage/nexus 지문 동일성 오류, FileGateway Configuration/로그 조회 축 혼동, 남은 § 오번호)를 정정하고, Grok/GLM이 갈린 세 쟁점을 판정했다: parser는 번호 후보에서 빼고 기준선으로 분리(Grok 채택), FileGateway 시간 불일치는 "외부 서비스 전체가 위반"이 아니라 "adapter가 특정 방식으로 다룰 때만 06 §6.3–§6.4 위반"으로 구체화(제3안), nexus/vocpage 보류 필드는 번호 계약으로 승격하지 않고 출처를 밝힌 참고로만 유지(제3안). 이 개정판은 세 판정을 모두 반영했다.
