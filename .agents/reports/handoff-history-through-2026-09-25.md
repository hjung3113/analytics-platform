# 과거 HANDOFF 기록 — 현행 지시 아님

이 파일은 2026-09-25 갱신 직전(커밋 `41067ab` 기준)의 HANDOFF.md 전체를 보존한다. 그 이전 기록은 [handoff-history-through-2026-09-24.md](handoff-history-through-2026-09-24.md)에 있다. 아래 안내·Open·미착수 상태는 당시 스냅샷이며 현재 상태가 아니다. 현행 진입점은 [HANDOFF](../../HANDOFF.md)와 [INDEX](../../docs/INDEX.md)다.

---

# Handoff — 2026-09-24 도메인 모델 정정·플랫폼 가드레일·와이어프레임 08-13

## 현재 상태

커밋 `a698dcb`를 `origin/main`에 push 완료(2026-09-24). 로컬 `main`은 `origin/main`과 일치하고 작업 트리는 clean이다. 다음 세션에는 다시 확인한다. 제품 구현·새 제품 결정은 범위 밖이다.

- **AGENTS.md**: 플랫폼 목적을 5갈래 표(Kernel 기능/공통 컴포넌트/차트 계약/레이아웃/메뉴간 연결)로 명시하고, "메뉴 화면 3개 이상 연속 제작 시 사전 범위 확인" 가드레일을 추가했다 — 이번 세션 자체가 6개 화면을 연속 제작한 뒤에야 이 가드레일을 만들었다는 자기 지적을 계기로 한 것이다.
- **와이어프레임 08-13**: 남은 Must 메뉴 archetype을 GPT-6 Astra에게 자유 오케스트레이션으로 제작시키고, 화면마다 Opus 5.5 Medium이 문서-대비 준수만 검수했다. Workflow archetype은 아직 검증되지 않았고(0회), 차트 Compare/Annotate도 실사용 사례가 없다 — 다음 플랫폼 갈래 작업의 후보다.
- **도메인 모델 정정 (1차 인터뷰, 15문항)**: `context_recognized_parser` 실제 데이터 모델과 충돌하던 Lot/Job/Carrier 혼동을 해소(Carrier=물리 용기, Lot=논리 개념, Job=분석 grain), StGroup(공정 능력 단위)과 분임조(조직 단위)를 분리, 제품 라우팅 계층(Operation/PPID/Recipe)을 신설했다. `CONTEXT.md`, ADR-0003(설비 마스터 플랫폼 소유 지향), ADR-0004(Site=DB 분리)에 반영. 기록: [1차 인터뷰](../../docs/reviews/2026-09-24-equipment-routing-domain-interview.md).
- **외부 검증 (Grok 4.7 High)**: SEMI 표준(E30/E40/E116/E139)·PROMIS·FabTime 기준으로 Operation 명명·CFG 데이터 형태·생산성 분석 화면 패턴을 조사. Operation 이름 유지 근거 확인, CFG는 SEMI E30 Equipment Constant(설비 단위, 유효 시각 이력)에 가장 가까움을 확인. 기록: [research README](../../docs/research/semiconductor-domain-2026-09-24/README.md) (Candidate, CONTEXT.md를 덮지 않음).
- **"잘못된 방향" 독립 리뷰 (Opus 5.5 + GPT-6 Astra, 병렬·비공유)**: 두 모델이 교차로 짚은 문제 — Site DB 분리(ADR-0004)가 EquipmentID 식별 계약과 안 맞물림, 08-13에서 나온 Kernel 요구가 `06`으로 회수되지 않고 흩어짐, Equipment Group(`O`) 의미가 `06`과 09에서 다르게 서술됨. Astra만 추가로 찾은 것: Recipe 혼합 모집단에서 P95 계산 문제(11/12), 설비 사용중지=이력종료 오통합 위험.
- **2차 인터뷰로 리뷰 결론 확정**: room_name(Line 아님)이 실제 권한/조회 축이고 Line과 독립/교차한다(**ADR-0005 신규**, ADR-0001의 Site→Line 주장을 대체). EquipmentID는 Site 전역 유일, Site는 ID로 역추적하지 않고 항상 활성 Scope의 전제. Equipment Group(StGroup/분임조/Maker+Model)은 **Condition(live)+Selection(frozen) 2계층**으로 통일(**ADR-0002 재작성**). room_name은 드물게 바뀔 수 있고 그래도 같은 EquipmentID 유지, 재등록 기준은 EquipmentName 변경. CFG는 Job 시작 시점 값으로 충분, 로그는 모듈/슬롯 단위·CFG는 설비 단위 저장. 기록: [2차 인터뷰](../../docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md).
- **반영**: 위 10개 결론과 1차 인터뷰의 punch list를 GPT-6 Astra가 22개 문서에 일괄 적용(Claude 미사용, 한도 문제로 제외). 새 ADR 3건(0003/0004/0005), ADR 2건 재작성/보강(0001/0002), `CONTEXT.md`·`06`·wireframes 07-13·`PLATFORM_REQUIREMENTS.md`·`DESIGN.md` 갱신.

## 다음 세션에서 할 일 — 첫 Kernel 구현 작업의 준비

이전 세션(2026-09-23)까지 완료한 문서 구조 정비(M1-M4)에 더해, 이번 세션에서 **Kernel 구현을 막던 도메인 모델 전제(Scope 축, ID 유일성, Equipment Group URL 모델)를 정정했다.** 다음 권장 작업은 여전히 **Platform Kernel의 첫 구현 단위를 정하고, 그 단위에 필요한 결정·근거·수용 기준을 준비하는 것**이다 — 이번엔 그 전제가 실제로 맞는 도메인 모델 위에서 할 수 있다. 아직 구현 단위나 기술 후보의 채택을 승인한 것은 아니고, 추가 메뉴 화면 제작이 다음 순서도 아니다(AGENTS.md 가드레일 참고).

1. AGENTS, `git status --short`, 현재 branch/HEAD 상태를 확인한다. [INDEX](../../docs/INDEX.md) → [06 Kernel 계약](../../docs/06_platform_ui_contract.md) §4-6/§8/§17-19/§26/§28-29 → [2차 인터뷰](../../docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md)(오늘 확정된 Scope/URL 모델의 근거) → [REQUIREMENTS 미결 질문](../../PLATFORM_REQUIREMENTS.md#open-questions--미결-범위와-결정-이력) 순으로 읽는다.
2. **첫 구현 단위 제안 1개**를 작성한다. 후보는 App Shell·Menu Registry·Context/URL 연결(room_name 기준 Scope + Equipment Group Condition/Selection 2계층 포함) 중 작게 검증할 수 있는 범위다. 전체 메뉴 구현으로 확대하지 말고 목표 동작, 포함/제외 범위, 원본 절·revision, 입력/출력·실패 조건, Platform Done 수용 사례를 적는다.
3. 남은 Open 질문 중 그 범위를 실제로 막는 것만 추린다: Scope 부모·자식 상속 세부, SSO 프로토콜 정확한 사양, 시간 assertion 공급자, room_name 공개 URL 키 매핑, PPID/Recipe의 지표별 조인 범위. `11`/`12`의 Recipe 혼합 모집단 P95 문제와 `12`의 Module/Slot 노출은 **메뉴 레벨 Open 항목**으로 이미 각 문서에 기록돼 있다 — Kernel 작업의 선행조건이 아니다.
4. 기술 Candidate는 위 범위에 필요한 것만 비교한다. 모델 합의나 기존 FeedbackOps 구현을 채택 승인으로 쓰지 않는다.

**다음 세션 산출물:** 첫 Kernel 작업 지시서 1개와 우선순위 있는 미결 질문 목록.

## 남은 범위 (변경 없음)

- **M5 — 실제 구현 때 적용:** 첫 코드 slice의 작업/PR 기록에 계약 원문 revision → 코드·schema → 실행한 테스트/환경/결과를 연결한다. 코드가 없는데 문서만으로 M5 완료라고 하지 않는다. Platform Done과 Domain Done을 따로 확인한다.
- **M6 — 실제 변경 3건 이후 평가:** 아직 실행하지 않았다.
- CFG의 메뉴 간 연계(§22)는 오늘도 **Deferred로 유지**했다 — 화면 연결만 미룬 것이고, Job 시작 시점 CFG 값을 붙일 식별·시간 정보 자체는 CONTEXT.md/01에 이미 반영했다.

## 이번 검증과 기록

Astra의 자체 검증: 상대 링크/앵커 396개 통과, Markdown 구조 검사·`git diff --check` 통과. 내가 직접 스팟체크: `CONTEXT.md`(room_name/Module-Slot/CFG 항목), ADR-0002/0004/0005 전문, `docs/11`의 room_name Global Context 반영 — 모두 오늘 확정한 10개 결론과 정확히 일치함을 확인했다. 런타임/브라우저 검증은 대상이 없다(문서 전용 레포). 09-13 전체 문서의 문장 단위 전수 검토는 하지 않았다 — 이상 발견 시 개별 정정한다.

## 보존할 경계

- Decided는 구현 완료가 아니다. 필드명/기술 Candidate, Scope 상속 세부·SSO 프로토콜 등 Open을 임의 결정하지 않는다. 자세한 상태는 각 원본 문단을 따른다.
- FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 및 독립 parser 책임을 유지한다.
- GPT-6(Astra 포함), Grok 4.7을 사용한다. 호출 가용성은 실제 확인하며 과거 모델명은 고치지 않는다.
- 역사 snapshot/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다.

## 필요할 때만 읽는 기록

[직전 HANDOFF(2026-09-23) 전체](handoff-history-through-2026-09-24.md) · [1차 인터뷰(15문항)](../../docs/reviews/2026-09-24-equipment-routing-domain-interview.md) · [2차 인터뷰(리뷰 결론 10개)](../../docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md) · [외부 리서치](../../docs/research/semiconductor-domain-2026-09-24/README.md) · [도메인 세션 원본 노트](equipment-routing-domain-glossary-notes-2026-09-24.md)(authoritative 아님, CONTEXT.md/ADR이 반영 대상). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
