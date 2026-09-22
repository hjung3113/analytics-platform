# R1 — GLM 검토보고서: `docs/integration/component-contract-candidates.md`

- 검토일: 2026-09-22 (Asia/Seoul)
- 검토자: OMP `zai/glm-5.3` (GLM 리뷰어)
- 대상: `docs/integration/component-contract-candidates.md` (이하 "후보 문서", 줄 번호는 읽은 시점 기준)
- 근거 문서: `.agents/reports/repository-integration-candidates-luna.md` (이하 "Luna 보고서"), `docs/integration/repository-ideas.md`, `docs/06_platform_ui_contract.md` (이하 06), `docs/01_architecture_and_data_contract.md` (이하 01), `docs/research/platform-build-2026-09-22/SYNTHESIS.md`, `docs/INDEX.md`
- 검증 방법: 후보 문서가 인용한 Luna 보고서 라인 앵커 4개를 전부 대조했고, 로컬에 있는 원본 저장소 5건을 스팟검증했다 — ProjectGraph `models/evidence.py`, `export/writer.py`, `models/confidence.py`·`reconciliation/classifier.py`·`graph/lineage_builder.py`(어휘 grep), FileGateway `Core/Time/SiteTime.cs`, lifetimeworkflow `examples/log-parser/golden_runner/approve.py`(로컬은 `/Users/hyojung/Desktop/2026/lifetimeworkflow`). 설치·빌드·테스트·DB·웹 검색은 하지 않았다. 다른 리뷰어의 R1은 읽지 않았다.
- 소유 산출물: 이 파일 하나만 작성했다. 기존 문서는 수정하지 않았다.
- 표기: **[사실]** = 도구 출력으로 확인, **[추론]** = 근거 기반 해석, **[미검증]** = 이번에 확인하지 못함.

## 0. 요약 결론

1. **후보 1~4의 필드 추출은 근거 문서와 실제로 일치한다.** 인용 앵커(L41-L54, L55-L65, L29-L37, L138-L153)는 모두 정확하고, 표의 필드 나열은 Luna 보고서 해당 라인에서 그대로 왔다. 원본 소스 5건 스팟검증에서 반박 사례는 0건이었다. 과장(원본에 없는 내용 추가)도 발견하지 못했다 **[사실]**.
2. **수정이 필요한 사실 오류·불완전는 4건**이다: ① "06 §19 Data Trust" 참조 오류 2곳(Data Trust는 §18), ② "C# 분석기" 부정확한 표현(ProjectGraph는 Python 코드), ③ lifetimeworkflow 승격 조건 3개 중 ADR reference 누락, ④ FileGateway audit 미기록 목록에서 "token payload" 누락. 전부 국소 수정으로 해결된다.
3. **보강이 필요한 갭은 2건**이다: ① 후보 1에서 "정적 코드 계보 vs 런타임 데이터 계보" 구분이 빠짐(`repository-ideas.md` L29에는 있던 확인 항목), ② Luna 조사의 근거 강도(정적 열람만, README 완료 주장 미검증, 조사 시점 dirty worktree)가 후보 문서에 물려받아지지 않음 — 특히 후보 3을 "가장 먼저 고정"으로 승격하는 문서이므로 필요하다.
4. **제외 분류는 전 항목 타당하다.** 제외된 항목 중 지금 계약화할 가치가 있는 것이 없음을 확인했고, 반대로 후보 1~4 중 근거가 약해서 참고 전용으로 내려야 할 것도 없다(후보 4는 이미 스스로 "어휘/보조"로 한정 중이다).

## 1. 근거 일치성 검증 (관점 1)

### 1.1 검증표

| # | 후보 문서 주장 (위치) | 대조 근거 | 판정 |
|---|---|---|---|
| V1 | 출처 앵커 4개: ProjectGraph→L41-L54, FileGateway→L55-L65, parser→L29-L37, agent 3종→L138-L53 (L19, L38, L56, L68) | Luna 보고서 해당 라인이 정확히 그 섹션들이다 (`### 1. ProjectGraph` L41, `### 2. FileGateway` L55, `## 기준선: context_recognized_parser` L29, `## agent 저장소…(3개만)` L138) | **사실 일치** |
| V2 | `EvidenceEntry` = kind, source path, line range, content hash, sample set, analysis context (L27) | Luna L43과 문자 일치. 원본 `ProjectGraph/src/projectgraph/models/evidence.py` L12-23: `evidence_id, kind(Literal code\|metadata\|contract\|sample), source_path, line_start/line_end, symbol, source_excerpt, captured_at, content_hash("sha256:…"), sample_set_id, analysis_context_id` | **사실 일치** — 원본에는 `captured_at`(ISO-8601), `symbol`, `source_excerpt`가 더 있다(§5 R4 참조) |
| V3 | validation gate: "validation 실패 시 lineage/evidence를 쓰지 않고 validation 결과만 씄" (L30) | 원본 `export/writer.py` L89-91: `if validation.status == "fail": validation-result.json만 write하고 return` — objects/relationships/evidence-index/confirmed-subgraph/lineage 전부 미작성 | **사실 일치** |
| V4 | `confirmed/suspected/unresolved/conflicted` 구분 (L29), "`confirmed`는 사람이 확인한 결론" (L32) | 원본 `models/confidence.py` L5-7 `CONFIDENCE_LEVELS`에 4값 존재, `graph/lineage_builder.py` L120 `"conflicted"` 할당, `reconciliation/classifier.py` L50-55 "Auto-classification ALWAYS returns 'suspected'… 'confirmed' promotion requires human override file" | **사실 일치** — 후보 문서의 핵심 예약(경고)이 소스로 직접 확인됨 |
| V5 | 시간 불일치: "offset 없는 값을 고정 `Asia/Seoul`로 해석 (`SiteTime`)" (L50) | 원본 `FileGateway/src/FileGateway.Core/Time/SiteTime.cs` L17-23: 주석과 코드가 정확히 그 내용 ("확정 결정 9") | **사실 일치** — 단 §5 R3의 offset 비대칭 추가 권고 |
| V6 | FileGateway 조회 파라미터·audit 범위·읽기 전용 경계·인증 (L46-L49) | Luna L59/L61/L63과 일치. 단 미기록 목록에서 Luna의 "token payload"가 빠짐(§5 E4) | **사실, 1건 불완전** |
| V7 | parser: `(equipment_id, occurrence_anchor)`, insert-only Result, `equipment_master`/`occurrence_directory` 소비 계층 책임 (L60-L62) | Luna L33/L35 + 01 L7("플랫폼 소유")·L23·L41 상호 일치 | **사실 일치** |
| V8 | 후보 4 세 행: head_sha/content_sha256/stale 거부, RunSpec/AcceptanceContract 선행, `.received`/`.verified` 분리 (L72-L74) | Luna L144/L148/L152와 일치. 단 lifetimeworkflow는 원본 `approve.py` L4-10이 **세 신호**(① `--approve` ② `--adr` reference ③ 인간 confirmation token)를 요구하는데 후보 문서는 2개만 나열(§5 E3) | **사실, 1건 불완전** |
| V9 | "SYNTHESIS §5.1이 다루는 `requestEpoch`/`resultRevision`/actor 판정 3분리" (L76) | `SYNTHESIS.md` L60-62: "`requestEpoch`는 브라우저 요청 경쟁, `resultRevision`은 숫자의 계산 기준, 현재 actor/Scope 판정은 접근 가능성" | **사실 일치** |
| V10 | 제외 표 각 행의 사실 전제 (L82-L86) | Luna L69/L71(구현 없음), L79(nexus fixture), L125(system-survey), L130-L136(vocpage 병렬 상태 머신 리스크), L159-L162(agent 계열)와 모두 일치 | **사실 일치** |
| V11 | 결정 순서 4단계가 "Luna 보고서 권고 그대로" (L88-L93) | Luna L166-L169와 내용·순서 일치. "parser 먼저 고정" 강조도 Luna L168 "**parser 소비 계약을 먼저 고정한다.**"에 근거 | **사실 일치** |

### 1.2 사실 오류·불완전 상세 (수정 제안 E1-E4)

- **E1 — § 참조 오류 [사실]**: 후보 문서 L101 "06 §19 Data Trust", L104 "[06] §19"는 틀렸다. 현재 06에서 Data Trust Contract는 **§18**(L739-773)이고 §19는 Loading/Empty/Error Taxonomy(L776-821)다. 반면 L29 "06 §19의 assessment kind와 별개 개념"은 옳다 — `assessments[]`의 적용 kind는 §19(L807) 소관이기 때문. 즉 문서가 §18(Data Trust 어휘)과 §19(assessment 상태)를 하나의 "§19"로 뭉뚱그리고 있다. 수정안: L101·L104를 "§18 Data Trust(및 §19 assessments)"로, 또는 재번호화에 강한 "절 이름" 인용으로 바꾼다.
- **E2 — "C# 분석기" [사실]**: L21 "이 코드(C# 분석기, static server)"는 오독을 만든다. ProjectGraph 구현은 Python(pydantic BaseModel)이고, 분석 *대상*이 C# + MSSQL ETL 소스다(evidence.py, Luna L43/L51도 "C# + MSSQL 소스를 읽는 정적 분석기"로 서술). 수정안: "C#·MSSQL ETL 소스를 분석하는 Python 정적 분석기(코드·static server)". 이 구분은 "코드를 가져올 이유는 없다"는 문서 자신의 결론을 강화한다(언어 생태계가 다르다).
- **E3 — lifetimeworkflow 조건 누락 [사실]**: L74는 "`--approve` + confirmation token 없으면 승격 거부"라고 요약했으나 원본은 세 신호 전부를 요구한다(approve.py L4-10; Luna L152도 "세 가지"). ADR reference 누락은 단순 생략이 아니라, "기계 제안과 사람 승인 분리" 원칙에서 *승인 사유의 기록*(감사 가능성)이 설계의 일부라는 점을 흐린다. 수정안: "`--approve` + ADR reference + 인간 confirmation token 없으면 승격 거부".
- **E4 — audit 미기록 목록 불완전 [사실]**: L47은 "API key 원문·물리 경로는 기록 안 함"으로 요약했으나 Luna L59는 "API key 원문·**token payload**·물리 경로"다. 민감값 비기록 경계를 참고하겠다는 행인 만큼 목록을 온전히 옮기는 것이 맞다.

## 2. 제외 분류 타당성 (관점 2)

### 2.1 동의 — 제외는 근거와 정합

- **`standard-log-lifecycle`/`log-contract-lens` [사실]**: Luna L69(상태 "Concept / UX design", 구현 기술·DB 미확정), L71(실행 앱 없음)대로 구현이 없다. 추출 기준 1(L13 "실제 코드·스키마·문서로 구현된 구조")을 적용하면 제외가 맞다. INDEX L50가 이 저장소를 별도 외부 레퍼런스로 고정한 사실과도 충돌하지 않는다.
- **`vocpage` [사실+추론]**: Luna L132 "`vocpage`를 submodule로 붙이거나 화면·DB 모델을 복사하면 두 VOC 상태·권한·history 계약과 병렬 notification 규칙이 생긴다"가 제외 사유의 근거 그 자체다. FeedbackOps가 이미 VOC 기준선(Luna L87)인 이상 타당하다.
- **`jira-voc-nexus` [사실]**: Luna L79 — 실제 Jira ingress/ACL/write path 없는 fixture. replay/conflict(`event_id + payload_fingerprint`, Luna L124)는 ingress adapter가 확정될 때 필요한 어휘이므로 지금 계약화하지 않는 게 맞다. Luna L134도 ingress 결정을 별도 1순위 결정으로 분리했다.
- **`system-survey`, agent 계열 [사실]**: Luna L125, L140("제품 코드 통합 후보로 올릴 것은 없다… 세 저장소만 한정된 reference 가치")와 일치. 후보 4가 그 3개만 취한 것도 Luna 권고 그대로다.

### 2.2 빠진 계약 후보가 있는가 — 없음, 단 조건부 재진입 경로는 명시 가치 [추론]

검토한 후보 밖 소스에서 계약화 가치가 있다고 볼 만한 것은 **공통 알림**뿐이다(`repository-ideas.md` L53-55, L80 질문 7). 그러나 06 §4 Kernel 책임 목록(L109-123)에는 Toast/Confirm/Modal infrastructure만 있고 영구 알림 보관·읽음·억제는 없으며, 06 §1 L34와 §14는 "실제 메뉴 2~3개에서 반복이 확인된 책임만 승격"을 규칙으로 둔다. 따라서 지금 승격하지 않은 것은 문서 체계와 정합이고, 잘못 제외된 것이 아니다. 다만 vocpage 행에 "공통 알림이 플랫폼 책임으로 확정되면 `(user_id, type, voc_id)` + debounce 구조를 재검토한다"는 조건부 재진입 경로를 한 줄 남기면, 나중에 아이디어 문서와 이 문서 사이에서 항목이 소리 소문 없이 사라진 것처럼 보이는 일을 막을 수 있다.

### 2.3 후보 1~4 중 내려야 할 것이 있는가 — 없음 [추론]

- **후보 4**가 유일하게 검토 대상이 되는데, 이미 "어휘/원칙만 가져온다"(L76) + "실제 필드를 정할 때는 SYNTHESIS 5.1을 우선하고 여기 어휘는 보조로만"(L76)으로 스스로를 참고 전용 위치에 두고 있다. 형식상 "후보"로 분류돼 있지만 실질적 위상은 참고 어휘이고, 그것이 정직하다. 추가 제안: L72의 필드 튜플(`analysisContextId + sourceRevision + …`)이 세 저장소 중 **feedbackops-workflow 한 곳의 패턴**(Luna L144)에서 나왔다는 출처 단일성을 명시하라. 세 저장소가 같은 필드 집합을 뒷받침하는 것처럼 읽히면 근거가 과대 표현된다.
- **후보 1·2**는 각자 게이트 질문(L34, L52)으로 미결 보류 중이고, **후보 3**은 01 L25-51이 이미 인지하는 실제 의존이다. 근거가 약해서 내려야 할 사례는 없다.

## 3. 06 Platform Kernel 경계와의 정합성 (관점 3)

- **추출 기준 2(L14)**는 06 §4(L105-133)의 Kernel 책임 목록과 비소유 목록(VOC 상태 전이·설비 로직 제외, L125-133)을 충실히 옮겼다 **[사실]**. vocpage·jira-voc-nexus 제외가 정확히 "VOC 상태 전이 규칙은 Kernel 밖" 경계를 지킨다.
- **후보별 반영 지점 검토**: 후보 1→06+01(표시는 06, 산출물·계약은 01), 후보 2→06+03(인증·시간은 03 소관, INDEX L22), 후보 3→01은 모두 정합이다. **후보 4→"06 §19"만 있는 것(L104)은 불완전하다 [추론]**: `verifierIdentity`·`observedAt`·content hash 같은 audit 원천 필드는 백엔트/API 계약(01·03) 소관이고, 06 §19가 소유하는 것은 응답의 `assessments[]` 표현(statusSource+observedAt 필수, L809)이다. E1 수정과 함께 반영 예상 문서에 01/03을 추가하라.
- **경계 위반 사례는 없다 [사실]**: 후보 1의 게이트 질문(L34)이 field/column 원인 추적의 1급 여부를 물은 것은, 이를 Kernel이 미리 소유하지 않겠다는 06 §1 우선순위와 일치한다.
- 사소한 관찰: L101 후보 1 반영을 "06 §19 → 01" 순으로 나열했는데, evidence/lineage **artifact 계약**의 1차 소유는 01(데이터 계약)이고 06은 표시 표준이다. 순서를 바꾸는 것이 소유권을 오해할 여지를 줄인다.

## 4. 이 문서가 놓친 위험·불일치 (관점 4)

- **R1 — 정적 코드 계보 vs 런타임 데이터 계보 (보강 필요) [사실+추론]**: `repository-ideas.md` L29는 ProjectGraph 행의 "결정 전에 확인할 점"으로 "정적 코드 분석 결과와 실제 실행 데이터의 구분"을 명시했는데, 후보 문서의 후보 1 "채택 전 확인할 것"(L32)에는 이 항목이 없다. ProjectGraph의 lineage는 **ETL 코드에 대한 정적 분석 결론**(어떤 raw 필드가 어떤 변환을 거쳐 어떤 컬럼으로 가는지)이고, 플랫폼의 drill-through 요구는 **데이터 값의 계보**(차트 숫자 → occurrence → 원문 로그)다. 어휘(evidence_id, chain, confidence)는 옮겨져도 산출물 의미는 다르므로, 이 구분 없이 필드를 가져가면 "lineage가 있다"는 말의 의미가 섞인다. 흥미로운 보충: 이 데이터-값 수준 어휘의 개념적 원형은 제외된 `log-contract-lens`(원본 줄 → 추출 필드 → 진단 근거, Luna L71) 쪽에 있다. log-contract-lens의 제외(구현 없음)는 유지하되, 후보 1의 게이트가 열릴 때 "데이터 값 수준 어휘는 log-contract-lens 개념과 상호 대조"한다는 한 줄을 남기면 두 문서의 공백이 서로를 보완한다.
- **R2 — 근거 강도 미표기 (보강 필요) [사실]**: Luna 보고서는 스스로를 정적 열람으로 한정한다(L3 "빌드·테스트·실서비스 호출을 실행했다는 뜻이 아니다", L173). README의 완료 주장·테스트 수치도 미검증이며 수치 자체가 불일치한다(L47: "419 collected" vs "404 tests green"). 조사 시점 worktree가 일부 dirty였다(L174: FileGateway `?? .review/`, standard-log-lifecycle 미추적 파일, ProjectGraph `CLAUDE.md` 변경 — "조사 기준 커밋"과 실제 열람 내용 사이에 미추적 차이 가능성). 후보 문서는 추출 기준 1에서 "실제 구현"을 요구하면서 그 근거가 정적 열람임을 말하지 않는다. 내 5건 스팟검증이 Luna 서술의 충실성을 뒷받침하지만, 문서 스스로 "구현 존재 ≠ 운영 검증" 한계를 물려받아야 한다 — 특히 후보 3을 최우선으로 고정하는 문서라서, dump 기반 snapshot contract test(L64)가 그 완충이라는 점까지 명시하면 완결된다.
- **R3 — offset 수용 비대칭 (구체 케이스 추가 가치) [사실]**: SiteTime은 offset 포함 값도 수용한다(`SiteTime.cs` L24-25, `HasOffset` L29-32 — offset이 있으면 그 offset을 그대로 사용). 반면 플랫폼 v1 URL `from`/`to`는 `Z`/offset이 형식 오류다(06 §6.3 L246). 후보 2의 "시간 불일치" 행(L50)은 naive 해석 충돌만 짚는데, adapter가 플랫폼 naive 값(항상 offset 없음)을 gateway로 보내는 방향은 문제가 없어도, gateway 응답·설정 파일의 offset 포함 시각을 플랫폼 표시로 되돌릴 때 변환 정책이 필요하다. "그대로 가져오면 시간대 가정이 암묵적으로 복사됨" 경고의 구체 실행 케이스로 보강할 만하다.
- **R4 — 同名 필드 충돌 가능성 [사실]**: ProjectGraph `EvidenceEntry`에 이미 `analysis_context_id`(D-49)와 `captured_at`(ISO-8601)가 있다. 후보 문서 L32가 "analysisContextId…를 플랫폼이 직접 정의해야 한다"고 한 것은 옳지만, 원본에 같은 이름의 필드가 이미 존재하므로 "같은 이름, 다른 의미" 충돌이 실재하는 위험이다. `captured_at`은 Data Trust 어휘의 observedAt과 대응되는 원형이기도 하다. 예약 문구에同名 충돌 경고를 더하면 구체적이 된다.
- **R5 — 배포 전제 (참고)**: Luna L63 — FileGateway 배포 전 Windows Server/IIS + 실제 MSSQL/FTP 검증 필요, README "MVP 구현 완료" 주장은 미검증. 후보 2의 게이트 질문(L52)이 "운영 경계 확정"을 이미 전제하므로 치명적 누락은 아니나, 채택 전 확인 목록에 한 줄 값이 있다.

## 5. 문안 제안 요약 (관점 5)

| # | 위치 | 수정안 |
|---|---|---|
| P1 | L101, L104 | "§19 Data Trust" → "§18 Data Trust(표시) · §19 assessments(상태)" — 또는 절 이름 인용으로 재번호화 면역 |
| P2 | L21 | "이 코드(C# 분석기, static server)" → "이 코드(C#·MSSQL ETL 소스를 분석하는 Python 정적 분석기와 static server)" |
| P3 | L74 | "`--approve` + confirmation token" → "`--approve` + ADR reference + 인간 confirmation token (3신호 전부)" |
| P4 | L47 | 미기록 목록에 "token payload" 추가 |
| P5 | L32 | 확인 목록에 "정적 코드 계보와 런타임 데이터 계보의 구분(repository-ideas L29)" + "원본에 이미 `analysis_context_id`/`captured_at`이 있으므로 同名 필드의 의미 충돌 주의" 추가 |
| P6 | 문서 말미 또는 "추출 기준" 아래 | "근거 강도: Luna 조사는 정적 열람이며 실행 검증이 없다. README 완료 주장·테스트 수치(419/404 불일치 포함)는 미검증, 조사 시점 일부 worktree dirty" 각주 추가 |
| P7 | L104 | 후보 4 반영 문서에 01/03 추가(audit 원천 필드는 백엔트 계약) |
| P8 | L83 (vocpage 행) | "공통 알림이 플랫폼 책임으로 확정되면 수신자·읽음·억제 구조를 재검토" 조건부 재진입 한 줄 추가(선택) |
| P9 | L72 | 필드 튜플 출처가 feedbackops-workflow 한 곳의 패턴임을 명시(선택) |

## 6. 동의 / 반대 / 수정 제안 구분

**동의 (근거 확인됨)**

1. 추출 기준 3조건(구현 존재 · Kernel 경계 내 · 계약만 추출) — 06 §4·§14 및 Luna L16의 경계 서술과 정합.
2. 후보 1~4의 게이트 질문과 "채택 전 확인할 것" 구조 — 특히 `confirmed` 의미 혼용 경고(L32)는 원본 코드(classifier.py L51-55)로 직접 뒷받침된다.
3. 제외 표 전 항목(§2.1)과 결정 순서 4단계(Luna 권고와 일치).
4. parser를 흡수가 아닌 독립 upstream + 소유 view/mart로 소비하는 구조 — 01 L7/L18-23/L41과 일치.
5. 후보 4를 SYNTHESIS §5.1 우선의 보조 어휘로 한정한 것.

**반대 (근거 문서와 배치되는 주장)**

- 없다. 재현 검증 범위(V1-V11 + 원본 소스 5건)에서 근거 문서·원본 코드와 충돌하는 주장은 발견하지 못했다.

**수정 제안 (동의하지만 고쳐야 함)**

- E1-E4(§1.2): 사실 오류·불완전 4건. 전부 국소적 문안 수정.
- R1-R4(§4): 누락된 위험·구체화 4건. R2(근거 강도)가 반영 가치가 가장 크다.
- P1-P9(§5): 위 내용의 실행 목록.

## 7. 검증 한계

- 원본 소스 스팟검증은 5건이다. ProjectGraph `bundle_builder.py`·lineage 모델 전문, FileGateway 엔드포인트·AuditMiddleware 전문, `feedbackops-workflow`·`general-ai-harness` 원본, `context_recognized_parser` 저장소 문서는 직접 열지 않았다 — 해당 행들은 Luna 보고서 인용과의 일치만 확인했다 **[미검증]**.
- Luna 보고서 자체의 저장소 서술이 전반적으로 충실함은 스팟검증 5건으로 뒷받침되지만, 전수 확인이 아니다 **[추론]**.
- 모든 원격 링크의 현재 유효성(커밋 고정 URL 등)은 확인하지 않았다(웹 접근 없음) **[미검증]**. 로컬 worktree의 HEAD가 Luna 기록 커밋과 일치하는지도 `git rev-parse`로 재확인하지 않았다 — 읽은 파일 내용이 Luna 서술과 일치하는지만 봤다 **[미검증]**.
- 설치·빌드·테스트·DB 실행은 하지 않았다(과제 제약). 따라서 "ProjectGraph validation gate이 실제로 동작한다"가 아니라 "해당 분기가 소스에 그렇게 존재한다"까지가 이 보고서의 확인 범위다.
- 이 보고서 작성으로 수정한 파일은 이 파일 하나다. 공식 설계 문서·후보 문서·다른 보고서는 수정하지 않았다.
