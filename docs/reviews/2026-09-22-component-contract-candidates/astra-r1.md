# Astra R1 — 공통 컴포넌트/계약 후보 보강판 최종 리뷰

- 검토일: 2026-09-22
- 대상: [component-contract-candidates.md](../../integration/component-contract-candidates.md), 검토 시점 129행. 아래 대상 행 번호는 이 보강판 기준이다.
- 비교: [Grok R1](grok-r1.md), [GLM R1](glm-r1.md) 전체와 연결된 근거 문서.
- 상태: 리뷰·판정 제안. 이 보고서는 채택 결정이나 전역 계약 변경이 아니며 기존 문서를 수정하지 않았다.
- 표기: **[사실]**은 이번에 읽은 문서·소스가 명시하는 내용, **[추론]**은 그 근거에서 도출한 판정·권고, **[미검증]**은 실행 또는 원본 전수 확인을 하지 않은 내용이다. 조사 보고서의 주장을 확인한 것과 구현을 직접 확인한 것을 구분한다.

## 1. 최종 판단

**보강 방향은 타당하지만, 그대로 최종 확정하기 전에 국소 정정이 필요하다.** §18/§19 분리, 정적 계보와 값 계보 구분, lifetimeworkflow 3신호, audit token payload, 조사 한계 명시는 근거와 맞는다. 반면 `vocpage와 동일 지문 패턴`은 조사 근거와 반대이고, FileGateway current/history를 같은 조회 축으로 요약한 문구 및 `§18 outcome` 참조는 고쳐야 한다. 시간 불일치도 외부 서비스 자체의 위법성처럼 읽히지 않도록 적용 경계를 명시해야 한다. **[사실+추론]**

| 미해결 쟁점 | 명시적 판정 | 권위 근거 |
| --- | --- | --- |
| parser 번호 후보 유지 | **Grok의 기준선 분리 쪽 채택.** 번호 후보에서 빼고 01 교차참조와 의존성 확인 문장만 유지 | 01 소비 계층·버전·fixture 계약, Luna의 별도 기준선 분류 |
| FileGateway 시간 충돌 | **제3안: 기존 Decided를 위반하는 adapter 행동은 명시하되, 외부 서비스 모델 전체를 위반으로 단정하지 않는다.** 현재 보강을 위해 06 변경은 필요 없다 | 06 §6.3–§6.4의 적용 범위, 03 원천 보존, 05의 메커니즘 Decided / TZ 실제 값 Open 구분 |
| nexus/vocpage 보류 필드 | **제3안: 이 문서에는 비계약 참고·재진입 조건과 출처만 유지.** 실제 ingress 필드 확정은 VOC/제품 통합 소유 문서에서 수행 | 06 §4·§14, INDEX의 02/01/03/05 소유권, repository-ideas의 Candidate 상태 |

## 2. 보강판에서 유지할 내용과 필요한 정정

### 2.1 보강 항목별 검증

| 대상 위치·보강 | 검증 결과 | 근거·한계 |
| --- | --- | --- |
| L114·117: Data Trust §19→§18, assessments는 §19 | **맞음 [사실]** | 06 L739–773이 Data Trust, L802–817이 outcome/assessments. 단 L115의 `§18 outcome 매핑`은 여전히 오번호다 |
| L25·31·40: Python 구현, EvidenceEntry 추가 필드·동명 충돌 | **맞음 [사실/추론]** | ProjectGraph `models/evidence.py:12–23`에서 필드 직접 확인. 플랫폼 `analysisContextId`와 의미가 같다는 증거는 없으므로 충돌 경고는 타당한 추론이다 |
| L33–38: ConfidenceLevel / ConclusionLevel 분리 | **핵심 수정은 맞음, 범위 한정 권고 [사실/추론]** | `models/confidence.py:4–8`의 10값, `lineage_builder.py:26–43` 자동 부여, `models/bundle.py:19`의 결론 4값 확인. 단 아래 §2.3의 원본 내부 의미 구분을 유지해야 한다 |
| L39: 정적 코드 계보 vs 데이터 값 계보 | **맞음 [사실/추론]** | repository-ideas의 ProjectGraph 확인 항목·“숫자에서 원문 근거로 이동”, Luna L43–53과 일치. log-contract-lens가 값 수준에 더 가깝다는 것은 유용한 비교 추론이지 구현 입증이 아니다 |
| L56: audit token payload 제외 | **맞음 [사실]** | FileGateway `AuditMiddleware.cs:6–7,39–48` 주석·기록 필드 직접 확인. `/health`는 미기록이므로 전 요청 감사가 완비됐다는 주장으로 넓히지 않는다 |
| L58: Scope 매 요청 재검증·설비 접근 제한 | **취지 맞음, 응답 의미 보완 권고 [사실/추론]** | 06 §6.2 및 `ApiKeyMiddleware.cs:10–28`의 callerId 인증 경계와 정합. 무단 명시 ID를 조용히 잘라 성공시키면 안 된다는 조건은 아래 §2.4 참조 |
| L59: SiteTime·offset·UTC instant·default range | **원형 요약은 대체로 맞음, 적용 범위 정정 필요 [사실/추론]** | `SiteTime.cs:7–25`, `LogListQuery.cs:6–39`, FileGateway MVP 계획의 시각 표현 결정 9. 모든 엔드포인트에 같은 기본 구간이 적용되지는 않는다. 쟁점 2에서 판정 |
| L83: lifetimeworkflow 3신호 | **맞음 [사실]** | `approve.py:35–71`에서 approve, ADR, 환경값과 일치하는 token 및 received 파일 존재를 확인. ADR reference는 비어 있지 않은 값인지 검사하며 사유 내용의 타당성까지 검증하지 않는다 |
| L81·87: agent 어휘 단일 출처 및 3유효성 대체 금지 | **취지 맞음 [사실/추론]** | 튜플은 Luna L144의 플랫폼 번역 가설이지 원본 schema의 동일 필드 집합이 아니다. SYNTHESIS §5.1의 세 유효성을 한 값으로 대체하지 말라는 원칙과 정합 |
| L19: 정적 조사·README·dirty 한계 | **맞음 [사실]** | Luna의 조사 방법·검증 한계를 충실히 물려받았다. dirty 이력은 조사 당시 사실로 써야 하며 현재 상태를 보증하지 않는다 |

### 2.2 우선 정정할 사실·참조 오류

**F1 — 중간: `vocpage와 동일 지문 패턴`은 근거와 반대다 (L95).** **[사실]** Luna의 기능 비교 L123은 vocpage의 `issue_code` unique/sequence를 식별자 중복 방지라고 명시하면서 inbound event id/hash/idempotency/replay와 구분한다. L124의 `event_id + payload_fingerprint` 구현은 nexus에 있고, L134의 `source_event_id` 등은 향후 ingress에 대한 제안이다. 따라서 현재 문구는 “두 저장소에 이미 같은 패턴이 있다”는 잘못된 재사용 근거를 만든다.

권고 문안: “nexus의 로컬 replay/conflict 구현을 참고한다. `source_event_id`, fingerprint, trusted principal, Scope/ACL은 향후 ingress 설계 시 검토할 후보이며 vocpage의 기존 구현으로 확인된 필드가 아니다.” **[추론]** vocpage 전체에 해당 기능이 절대로 없다는 전수 증명은 이번 범위 밖이다. 여기서 확인한 오류는 **인용한 조사 결과가 그 동일성을 뒷받침하지 않고 명시적으로 구분한다**는 점이다.

**F2 — 중간: Configuration current와 history가 같은 기간·cursor 축이라는 요약은 부정확하다 (L55·59).** **[사실]** `ConfigurationEndpoints.cs:16–25,61–76`에서 current는 `equipmentId + configurationType`으로 배열을 반환하고 기간·cursor가 없다. history는 `from/to` 필수이고 pagination이 있다. `LogListQuery.cs:23–38`도 Continuous는 기간을 거부하며, 시간 기반 로그만 기본 구간을 사용한다. Configuration을 누락하지 말자는 취지는 맞지만, 로그용 `[from,to)`/기본 구간을 모든 경로에 공통화하면 의미가 달라진다.

권고: “로그의 시간 기반 조회, Configuration history, Configuration current를 구분한다. 원형이 지원하는 기능 범위와 플랫폼에서 실제 채택할 범위는 별도로 결정한다.” current 값을 과거 분석 Context의 설정값처럼 제시하지 않는다는 조건도 adapter 설계 시 확인할 가치가 있다. 이는 구현 요구 확정이 아닌 검토 항목이다. **[추론]**

**F3 — 낮음: `§18 outcome 매핑`은 여전히 틀리다 (L115).** **[사실]** outcome의 소유 절은 06 §19다. “§18 Data Trust 표시 · §19 outcome/assessments 매핑”으로 나누면 된다. 요청 감사와 변경 감사가 다르다는 L56·115의 보강은 02의 who/when/before-after 정의와 맞으며 유지한다.

**F4 — 낮음: “번호는 Luna 보고서의 후보 번호”는 사실이 아니다 (L101).** **[사실]** Luna의 순위 후보 3은 lifecycle/lens, 4는 nexus다. parser는 번호 없는 기준선이고 agent reference는 별도 절이다. 현재 문서 1~4는 재구성한 번호다. “이 문서의 식별 번호이며 우선순위가 아니다”라고 쓰거나 아래 쟁점 1 판정대로 분류를 바꾼다. “권고 그대로 유지”도 내용의 취지를 보존했다는 의미로 한정하는 편이 정확하다. **[추론]**

### 2.3 ConfidenceLevel 분리의 정확한 범위

**[사실]** Grok이 지적한 lineage 자동 `confirmed`는 실제 `_assign_lineage_confidence` 코드에 있다. GLM의 reconciliation 근거도 틀린 코드는 아니다. `reconciliation/classifier.py:47–55`는 자동 결과를 `suspected`로 제한하고 `confirmed` 승격에 human override를 요구한다. 서로 다른 산출물의 `confirmed`를 보고 있었으므로 하나의 결론으로 합칠 수 없다.

**[사실]** 현재 ProjectGraph README L83–84는 자동 부여된 confidence를 사람이 임의 변경하지 못하게 하고 AI agent 단독의 confirmed 승격/conclusion 분류를 금지한다. 따라서 “README상 사람만 부여”는 사람이 개입하는 권위 정책의 요약으로 읽어야 한다. enum 선언만으로 승인자 신원 검증·승인 기록·기술적 강제가 입증되지는 않는다.

**[추론]** L33의 제목을 “lineage ConfidenceLevel — 이 경로에서 자동 부여”, L34를 “bundle ConclusionLevel — 사람 권위 정책”으로 한정하고 reconciliation은 별도 사람 override 경로라고 한 문장 남기는 것이 정확하다. ConfidenceLevel이라는 타입의 모든 값·모든 사용처를 자동 산출로 단정하거나, “사람 확인은 오직 ConclusionLevel에만 있다”고 읽히게 만들지 않는다. 06 §19의 confirmed 역시 **문제 kind가 확인됐다는 상태**이므로 증거 품질·사람 승인과 직접 매핑하지 않는 현재 결론은 유지한다.

### 2.4 새로운 규범처럼 읽히지 않게 할 문장

- **Scope 부분집합 (L58):** 허용 설비만 gateway에 보내는 것은 필요하다. 그러나 명시적으로 요청한 무단 ID를 조용히 제거하고 부분 결과를 같은 요청의 성공으로 보이면 06 §6.2와 충돌한다. “요청 ID를 먼저 검증하고 무단 ID는 명시적으로 처리한 뒤, 검증된 조회만 전달한다”로 보완한다. **[추론: 06 §6.2 및 SYNTHESIS §5.1에 근거]**
- **SYNTHESIS 우선순위 (L87):** 3유효성의 분리는 유용하지만 SYNTHESIS 자체도 Research/Candidate다. `requestEpoch`/`resultRevision` 이름은 §5.1에서 예시라고 명시한다. “먼저 지킨다”가 06/01보다 높은 권위나 필드 채택을 뜻해서는 안 된다. 해시·observedAt은 계산 기준/원천 추적과 일부 관련될 수 있으므로 “전혀 겹치지 않는 축”보다 “대응은 별도 설계하며 세 유효성을 대체하지 않는다”가 정확하다. **[사실+추론]**
- **메뉴 게이트 (L43·104):** §18 표시 책임과 특정 ProjectGraph artifact 채택 게이트를 분리한 L104는 맞다. 다만 drill-through 요구가 승인됐다는 이유만으로 ProjectGraph 필드가 자동 확정되는 것은 아니다. 01의 원천·grain·버전·ACL 대조는 여전히 필요하다. **[추론]**

## 3. 쟁점 1 — parser는 번호 후보에서 기준선으로 분리

**판정: Grok의 구조적 분리를 채택한다. 단 “강등”은 중요도나 근거 강도의 하락이 아니라 이미 정해진 의존성의 재분류다.** **[추론]**

**[사실]** 01은 read-only parser → 플랫폼 소유 view/mart → API 구조, 다섯 버전 구분, 의미·grain·단위·시각·null·품질·원천 버전 및 실제 dump fixture 검증을 이미 소유한다. Luna도 parser를 “기준선: 흡수하지 않고 계약으로 소비”로 별도 분류한다. 06 §4의 Kernel UI 책임과 parser의 저장·분석 계약은 같은 층이 아니다.

**[추론]** 번호 유지가 정보를 한 장에 모으는 장점은 있지만 이 문서는 전체 inventory보다 “새로 추출할 계약 후보”가 목적이다. 기준선을 후보와 나란히 두면 다른 후보의 채택 여부에 따라 parser 소비 관계도 선택 가능한 것처럼 읽힌다. 이미 소유자가 있는 필드 목록을 여기서 또 유지하면 01의 버전·grain 경고가 빠진 얇은 복사본이 생긴다.

권고 문안:

> 기준선 — parser 소비 경계는 01이 소유한다. 독립 upstream과 플랫폼 소유 view/mart 구조를 전제로 하며, 상세 식별자·버전·grain·fixture 계약은 01을 따른다. 추가 artifact/adapter를 설계할 때 이 기준선과의 정합성을 먼저 확인한다.

이 변경은 01의 계약이나 05 결정 상태를 바꾸지 않는다. “먼저 고정”도 설계 의존성 확인 순서이며 dump 생성·테스트·구현 착수 승인으로 쓰지 않는다(05 L3·20 및 Deferred Phase 경계). **[사실+추론]**

보충: GLM R1 §2.3은 후보를 근거 부족으로 내릴 필요가 없다고 했지만, **Luna 번호 보존이 문서 목적이라는 주장까지 명시하지는 않았다.** 대상 L125의 GLM 입장 요약은 해석임을 밝히거나 실제 표현 수준으로 축소하는 것이 공정하다. **[사실/추론]**

## 4. 쟁점 2 — 시간 위반은 adapter의 구체 행동으로 판정

**판정: Grok의 구체적 위반 조건은 유지하되, “FileGateway 시간 모델 자체가 06 위반”이라는 포괄 단정은 채택하지 않는다. 이 판단을 위해 06 §6.3을 변경할 필요는 없다.** **[추론]**

**[사실]** 06 §6.3은 플랫폼 wall-clock 전달·v1 URL·시간대 미확인 처리·병합 assertion·기본 구간을 규정한다. 확인된 TZ 이름도 변환 가능성의 충분조건이 아니고, 별도 UTC 분석 API를 영구 금지하지 않는다고 명시한다. 03은 원천 wall-clock 보존과 변환 가능한 경우의 별도 분석 시각을 말한다. 05는 이 메커니즘을 Decided로 두면서 TZ 실제 값·다중 사업장 날짜 의미는 Open으로 남긴다.

| 행동 또는 원형 | 판정과 adapter 조건 |
| --- | --- |
| 미확인 플랫폼 naive 값을 SiteTime에 그대로 전달하여 Seoul로 해석 | **기존 Decided 위반 조건.** adapter가 offset을 직접 추가하지 않아도 gateway가 추가하므로 L59(a)만으로 충분하지 않다. 의미를 보존할 매핑이 입증되지 않으면 이 경로를 호출하지 못하도록 해야 한다 |
| gateway API가 offset을 받고 내부에서 instant를 비교 | **그 자체는 위반 아님.** 외부 서비스 표현을 플랫폼 URL/원천 의미와 동일시하는 행동이 문제다. 매핑 가능성·구간 의미·모호/존재하지 않는 시각 처리는 별도 검증 대상이며 현재 통합 가능하다고 승인한 것은 아니다 |
| offset 응답을 공개 URL `from/to`로 재사용 | **기존 Decided 위반 조건.** 단순 offset 제거도 의미 보존을 입증하지 못한다. 정당한 wall-clock 대응을 확인해야 하며 URL 형식 검증을 우회하지 않는다 |
| 단일 Site TZ를 복수 설비의 공통 시간역 증명으로 사용 | **기존 Decided 위반 조건.** 서버 assertion이 요청 전체 구간과 대상 전체를 덮어야 한다. 같은 TZ 문자열만으로 충분하지 않다 |
| offset 기반 외부 데이터를 분리 조회 | **06이 일괄 금지하지 않음.** 플랫폼의 단일 설비 naive 조회 가능성과 해당 gateway가 이를 안전하게 지원할 수 있는지는 별개다 |
| gateway default range를 플랫폼 기본 구간으로 위임 | **그대로 위임하면 기존 Decided 위반 조건.** `defaultRangeTo`와 필요 시 `R` 비교를 따른 플랫폼 구간을 물질화해야 한다. gateway는 clock 기반 최근 구간을 사용한다 |
| 플랫폼 `from`만 있는 입력을 gateway 보정에 맡김 | **기존 Decided 위반 조건.** gateway 시간 기반 로그는 from-only에 2일을 채우지만 06 §6.4는 한쪽 누락을 거부한다 |

위 표의 원형은 `SiteTime`, `EffectiveRangePlanner`, 06/03/05에서 읽은 **사실**이며 “어떤 행동이 위반인지”는 그 규칙을 적용한 **추론**이다. 외부 서비스가 기본 TZ를 가진다는 이유만으로 서비스 전체를 거부하는 새 규칙은 06에 없다.

권고 문안:

> FileGateway의 시간 표현은 플랫폼 계약과 직접 호환되지 않는다. adapter가 미확인 wall-clock을 Seoul/UTC로 임의 해석하거나, offset을 공개 URL에 복사하거나, assertion 없는 병합 또는 gateway 기본 기간 위임을 하면 기존 06 §6.3–§6.4를 위반한다. 실제로 의미를 보존하는 매핑을 입증하기 전까지 해당 통합 경로는 미승인이다.

**05 추적 경계:** 기존 규칙을 adapter 체크 항목으로 구체화하는 것만으로 전역 계약이 바뀌지는 않는다. 향후 기본 TZ fallback 허용, offset URL 허용, assertion 없는 병합 허용처럼 기존 의미를 바꾸려면 06/03 소유 문서를 변경하고 05에서 결정 상태를 추적해야 한다. 실제 TZ 매핑 값을 확정하는 것도 05의 기존 Open 항목 처리 대상이다. 지금 이 후보 문서가 그 값을 확정할 권한은 없다. **[추론]**

## 5. 쟁점 3 — ingress 필드는 출처 있는 보류 참고로 남김

**판정: 보류 필드의 흔적을 이 문서에 남기되, 번호 계약 후보나 공통 ingress schema로 승격하지 않는 절충안을 채택한다. 지금 VOC 문서로 전부 옮겨 없애는 것도 필요하지 않다.** **[추론]**

**[사실]** 이 문서는 이미 “후보로 뽑지 않은 것”을 담고 repository-ideas도 외부 VOC 흐름을 Candidate로 보존한다. 따라서 제외 사유와 재검토 조건을 기록하는 것 자체는 문서 소유권 침해가 아니다. 반면 06 §4는 VOC 상태 전이를 소유하지 않고 §14는 반복 수요 없이 공통화를 앞당기지 않는다. 둘이 같은 지문 schema를 구현했다는 근거도 없다(F1).

보류 참고를 다음처럼 구분하면 된다. **[추론, 원형 출처는 Luna L123–134의 사실]**

| 항목 | 현재 증거·상태 | 후속 소유권 |
| --- | --- | --- |
| `event_id + payload_fingerprint` | nexus 로컬 replay/conflict 구현의 참고 어휘. 실제 connector/권한 주체 검증은 별개 | VOC ingress 수요가 결정되면 해당 제품·adapter 계약에서 검토 |
| `source_event_id + fingerprint + trusted principal + Scope/ACL` | Luna의 향후 ingress 제안. 현행 vocpage schema도 아니며 확정 필드도 아님 | 도메인 capability는 02, 플랫폼 경계의 데이터·API/인증·감사 계약은 01/03에 반영 여부 결정 |
| vocpage payload review·알림 억제 | 별도 UX/업무 reference. event replay와 구분 | 기존 FeedbackOps 제품 계약을 존중하고 실제 반복 수요가 확인될 때만 공통 부분을 검토 |

06은 이 과정에서 Scope 재검증·Context/URL·상태 표시의 공통 불변식을 제공한다. 05는 ingress 채택·소유권 충돌 같은 결정과 미결 질문을 추적하며 fingerprint 알고리즘·unique key·보관 기간 등 상세 schema를 소유하지 않는다. FeedbackOps 내부 계약을 플랫폼 문서만으로 소급 변경하지 않는다. **[사실+추론: AGENTS, INDEX, 06 소유권 규칙]**

즉 Grok의 “보류 필드를 잃지 말자”는 취지는 수용하고, GLM의 “지금 계약화하지 않는다”도 유지한다. 이 단계에서 필드를 도메인 문서로 강제 이관하면 아직 승인되지 않은 요구가 정식 계약처럼 보일 수 있다. 실제 채택 시 소유 문서에 상세를 두고 이곳은 링크와 판정 이력만 유지하면 된다. **[추론]**

## 6. 검증 범위와 남은 한계

- **[사실]** AGENTS·INDEX를 먼저 읽고 대상·두 R1·repository-ideas·Luna 보고서를 읽었다. 01 전체, 05의 결정 상태/Open/Deferred, 06의 소유권·Kernel·Scope·시간·권한 관련 규칙·§14·§18–19, SYNTHESIS §5.1과 관련 통합 표, 02 감사 정의·03 시간 계약을 대조했다. 06 전체의 비관련 화면·토큰 절을 전수 재검토한 것은 아니다.
- **[사실]** 원본 스팟 확인: ProjectGraph `/Users/hyojung/Desktop/2026/ProjectGraph` HEAD `bd3bda9aeeede6cd6856facb3aa70b64f88eb45a`의 Evidence/Confidence/Conclusion 모델, lineage confidence 함수, reconciliation 함수, writer, bundle builder 관련 구절 및 README; FileGateway `/Users/hyojung/orca/projects/FileGateway` HEAD `30d89a5210e5b3bd8c9c6a6c1fff8469867d7be8`의 SiteTime·ConfigurationEndpoints·LogEndpoints 관련 구절·LogListQuery·Audit/API-key middleware와 시간 문서; lifetimeworkflow `/Users/hyojung/Desktop/2026/lifetimeworkflow` HEAD `6e0e12650a95d1bbb9c992701de16794b1e28efc`의 approve.py를 읽었다. HEAD는 Luna 기록과 일치하며 관련 파일의 변경은 status에 없었다. 별도 dirty 파일들은 그대로 보존했다.
- **[미검증]** parser·nexus·vocpage·feedbackops-workflow·general-ai-harness·FeedbackOps 원본은 이번에 전수 또는 새로 직접 검사하지 않았다. 이들의 세부 구현 주장은 Luna 및 플랫폼 문서와의 일치 여부까지 검증했다. 특히 F1은 vocpage 전체의 기능 부재 증명이 아니다.
- **[미검증]** 설치·서버·빌드·테스트·DB·FTP·OIDC·Jira 호출을 수행하지 않았다. 원본 gate의 실행 보장, 사람 신원의 강제, 시간 매핑의 실제 운영 가능성, 감사 로그의 전 경로 민감정보 비노출은 입증하지 않았다. README 통과 수치를 검증 결과로 사용하지 않았다.
- **[사실]** 웹·원격 시스템에 접근하지 않았으며 원격 링크의 현재 유효성도 확인하지 않았다. 이 검토의 판단은 제공된 로컬 문서와 좁게 읽은 로컬 소스에 한정한다.
- **[사실]** 작성 범위는 이 보고서 한 파일이다. 기존 문서·코드·서브모듈·설정은 수정하지 않았고 commit/push 및 하위 에이전트 생성도 하지 않았다. 권고 반영과 채택 결정은 후속 작업으로 남는다.
