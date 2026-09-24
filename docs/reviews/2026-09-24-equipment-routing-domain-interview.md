# 2026-09-24 설비·라우팅 도메인 인터뷰 — 1차 완료

상태: **인터뷰 15개 질문 답변 및 punch list 문서 반영 완료(2026-09-24), authoritative 아님.** [2차 인터뷰](2026-09-24-equipment-routing-domain-interview-round-2.md)가 권한·Scope, 그룹 URL, 설비 변경, CFG grain/시점 관련 후속 정정을 기록한다. 아래 답변은 당시 기록이며 정정 표시와 현행 원본을 함께 따른다. 이 문서는 리뷰 합의록이며 결정 원본이 아니다 — 확정된 용어는 [CONTEXT.md](../../CONTEXT.md), 결정 근거는 [ADR](../adr/)에 있다. 이 문서는 인터뷰 답변과 대상 문서별 punch list 반영 상태를 보존한다. `docs/05_roadmap_and_open_questions.md`/`PLATFORM_REQUIREMENTS.md` Open Questions와 함께 참고한다.

작성 경로: 사용자 구술 → `.claude/skills/domain-modeling`(mattpocock) 방식으로 CONTEXT.md/ADR 직접 갱신 → Opus 5.5가 CONTEXT.md + [세션 노트](../../.agents/reports/equipment-routing-domain-glossary-notes-2026-09-24.md)를 파서 레포(`context_recognized_parser`) 코드와 대조해 갭 15개를 시나리오 질문으로 도출. 아래는 그 인터뷰 질문과 답변을 기록하는 문서다.

## 이미 확정된 것 (참고, 여기서 재정의하지 않음)

- 설비 필드: 설비명/라인/room_name/메이커/모델/ChamberType/분임조/stgroup — [CONTEXT.md](../../CONTEXT.md)
- StGroup 재정의(공정 능력 묶음, 담당자 묶음 아님), 분임조 신규(엔지니어 조직 묶음) — [CONTEXT.md](../../CONTEXT.md)
- Site는 컬럼이 아니라 DB 분리 — [ADR-0004](../adr/0004-site-is-db-partition-not-column.md)
- 설비 마스터 As-Is(외부 DB)/To-Be(플랫폼 소유) — [ADR-0003](../adr/0003-equipment-master-platform-owned-target.md)
- 제품 라우팅 골격: 제품 → Operation(N) → PPID(Operation당 여러 개) → Recipe(PPID당 여러 개, PPID:Recipe=N:M) — [CONTEXT.md](../../CONTEXT.md)

## 가장 큰 구조적 갭 (Opus 5.5 판정) — 2026-09-24 해소

**`CONTEXT.md`가 Lot과 Job을 같은 것으로 묶었는데, 파서(`context_recognized_parser`)는 둘을 별개 엔티티로 다룬다.** 2026-09-24 인터뷰로 해소: Carrier(물리)/Lot(논리)/Job(실행 인스턴스)을 별개 term으로 분리했고, 생산성 분석 grain은 **Job**, Operation 정보는 **외부 시스템에서 Lot 단위로 공급**받는다는 것을 확인했다(`CONTEXT.md` 반영 완료). 기준정보관리의 "공정"도 room_name으로 확정(질문 8) — Operation과 무관.

**남은 것**: CFG의 구체 값 형식·mart 의존성, 메뉴별 Recipe 조인 범위 등 명시된 Open만 유지한다. 질문 9·14는 아래 답변 완료 상태이며 2차 인터뷰와 함께 실제 문서에 반영했다.

## 인터뷰 질문과 답변 (1차 기록)

### A. 라우팅·실행 계층 관계

1. **Lot과 Job, 같은 것인가 다른 것인가?**
   - 답변(2026-09-24): **다른 개념.** Carrier(물리, wafer를 담는 용기)/Lot(논리, wafer가 속하는 개념)/Job(그 시점에 Lot이 수행하는 작업)은 서로 별개이며 1:1:1이 아니다 — Carrier는 재사용되며 여러 Lot을 담고, Lot도 여러 Carrier를 거치며, 한 Lot이 한 Operation을 수행하는 동안에도 여러 Job으로 나뉠 수 있다. **XFR/FNC/PRC 시간 기반 생산성 분석은 Job 단위로 이뤄진다.** → `CONTEXT.md` Carrier/Lot/Job 3개 term으로 분리 반영 완료.
2. **Lot(또는 Job) 실행 한 건과 Operation은 어떻게 연결되는가?**
   - 답변(2026-09-24): Operation 정보(그 Lot의 제품이 전체적으로 거칠 Operation 목록)는 **외부 시스템에서 공급받는다** — 현재 운영 DB에 있고, 파서 단계에서 외부 API 호출로 붙일 예정(아직 미구현). Operation은 제품별 고정이 아니라 **Lot 단위**로 공급받는다. → `CONTEXT.md` Lot/Operation entry에 반영 완료.
3. **PPID:Recipe 관계가 파서 모델과 맞는가?**
   - 답변(2026-09-24): 파서의 `recipe_type`/`sub_recipe_id` 구분은 **일단 안 쓴다.** PPID = LEH 로그의 `FlowId`, Recipe(`prc_name`) = PRC 로그의 `RecipeId`로 단순화해서 진행하고, 확장 필요해지면 그때 정정한다. → `CONTEXT.md` PPID entry에 "LEH 로그의 FlowId" 명시 반영 완료.
4. **PPID와 Operation의 카디널리티는?**
   - 답변(2026-09-24): (질문 2 답변과 동일 맥락) Operation은 제품 고정이 아니라 **Lot별로 외부 시스템에서 공급**받는다 — Wafer(제품)가 여러 Operation을 지나듯 Lot도 여러 Operation을 지난다고 보면 됨.
5. **StGroup 멤버는 설비 단위인가 챔버(모듈) 단위인가?**
   - 답변(2026-09-24): **설비 단위.** 2차 정정: ADR-0002는 모든 그룹 축의 Condition/Selection 두 층으로 개정됐고 명시 Selection만 고정 ID 목록이다. → `CONTEXT.md` StGroup entry에 반영 완료.
6. **ChamberType은 설비 속성인가 챔버 속성인가?**
   - 답변(2026-09-24): **설비 속성**("다른 시스템에서 정의하는 Model 같은 개념"). 기존 Maker→Model→ChamberType→EquipmentID 계층 그대로 유지 — 변경 불필요.
7. **StGroup이 room_name·Site 경계를 넘는가?**
   - 답변(2026-09-24): **안 넘는다**(room_name도, Site도). Line은 넘을 수 있음(현행 근거는 ADR-0005, Line은 독립 축). → `CONTEXT.md` StGroup entry에 반영 완료. Site 넘지 않으므로 v1 단일 Scope 제약과 충돌 없음(질문 자체가 기우였음).

### B. 기존 문서와의 충돌

8. **기준정보관리의 "공정"은 room_name인가 Operation인가?**
   - 답변(2026-09-24): **room_name.** Operation과는 완전히 다른 개념 — [10](../10_reference_data_wireframe.md)의 기존 설계(공정 탭=room_name)가 맞았다. 재설계 불필요.
9. **`06`의 전역 Context "Process"/"Equipment Group"이 뭘로 바뀌어야 하는가?**
   - 답변(2026-09-24): **"Process"(→room_name)는 전역 Context로 가져간다** — `06 §11`의 기존 결정이 맞고, `11_productivity_overview_wireframe.md`가 room_name을 Page Filter로 둔 결정이 틀렸다(아래 punch list 적용 완료). **"Equipment Group"은 고정된 하나의 필드가 아니라, 조회에 실제로 쓰인 축을 그대로 따라간다** — stgroup으로 조회했으면 stgroup을, 분임조로 조회했으면 분임조를, Maker/Model로 조회했으면 그걸 전역 Context로 들고 간다(질문 11의 배타적 필터 결정과 맞물림 — 다형적/polymorphic Equipment Group 슬롯).
10. **생산성 분석에서 Operation·PPID·Recipe가 전부 필터 축인가?**
    - 답변(2026-09-24): **PPID와 Recipe(prc_name)만.** Operation은 v1 필터/URL 축에서 제외하고 확장 개념으로 둔다. → `CONTEXT.md` Operation entry에 반영 완료. `06 §6.1`에 `ppid`(신규 후보 키) 반영 완료 — 아래 punch list 참고.
11. **stgroup/메이커·모델/분임조 필터는 서로 배타적인가?**
    - 답변(2026-09-24): **배타적으로.** 조합 필터 미지원.
12. **분임조가 필터 말고 권한·알림에도 쓰이는가?**
    - 답변(2026-09-24): 분임조·StGroup 소속은 **외부 시스템에서 공급받아 그대로 소비**(플랫폼이 직접 관리 안 함). 권한 모델은 당시 **보류(Open)**였으나 **2차 인터뷰로 Site 내 room_name 기준 권한이 확정**됐다([ADR-0005](../adr/0005-scope-room-name-line-independent.md)). 상속 세부는 Open으로 남는다.

### C. CFG·플랫폼 정체성·다국어

13. **CFG 값 하나의 구체적 모습은?**
    - 답변(2026-09-24): **(a) 설비 단위.** 원천은 혼재 — 이벤트 로그 안에 있는 경우도 있고, 별도 파일이나 외부 시스템에서 오는 경우도 있음. "이런 개념이 있다"는 것만 확정, 구체적 데이터 형식은 추후 확정(Open). **2차 보강:** Module 대상은 값 내부 속성이고 기록/테이블 분할 단위는 설비다. 분석에는 Job 시작 시점 유효값 하나면 충분하다.
14. **"메뉴간 연계분석"이 기존 `06` §22 이상의 것을 뜻하는가?**
    - 답변(2026-09-24): **CFG는 §22 Cross-menu Context Link 패턴을 일단 따라가지 않는다.** "다른 메뉴들과 결이 다르고 너무 어렵다"는 이유로 CFG의 cross-menu 연동은 이번 범위에서 보류(Deferred) — CFG 자체의 시각화·분석 기능은 만들되, 다른 메뉴에서 문맥과 함께 이동해 들어오는 연계는 나중에 별도로 판단.
15. **다국어(한/영) 범위는 어디까지인가?**
    - 답변(2026-09-24): **UI 문구 + 정적 본문만.** 사용자 입력 본문(VOC/공지 등 동적 콘텐츠)·마스터 값(EquipmentName/분임조 이름 등)은 번역 대상 아님. 언어 설정 저장 방식은 어시스턴트 추천에 위임 — 아래 참고.

## 영향받는 기존 문서 — punch list 반영 결과

| 질문 | 반영 문서와 상태 |
| --- | --- |
| 1, 2, 3, 4 | CONTEXT / 06 §6.1 / 11–13: Lot·Job 구분, PPID/Recipe, Job 처리량·실행 grain 반영 |
| 5, 6, 7 | CONTEXT / ADR-0002·0005 / 06: 설비 단위 StGroup, room_name·Site 경계, Line 독립 축, 두 층 URL 반영 |
| 8 | 02 / 10: 공정 탭=room_name, Operation과 구별 |
| 9 | 06 §6/§11 / 09–12: room_name Global Context, 잔여 Process 분류명 정정 |
| 10 | 06 §6.1 / 11·12: PPID/Recipe 전역 축, Operation v1 필터 제외, 메뉴별 적용 범위 명시 |
| 11, 12 | 06 / 09·10 / ADR-0003·0005: 그룹 축 배타성, 외부 소속 소비, room_name 권한 기준 반영 |
| 13, 14 | CONTEXT / 01 / 06 §22 / 12 / 연구 README: CFG grain·Job 시작 유효값, cross-menu Deferred, mart 의존 Open 기록 |
| 15 | 06 §23 / DESIGN / PLATFORM_REQUIREMENTS: 한/영 번역 범위 및 언어 선호 저장 Candidate 반영 |

## 반영 상태와 남은 범위

- 질문 1–7: CONTEXT/06/ADR-0002/0004/0005와 11–13에 Lot/Job 구분·Recipe/PPID·그룹 grain·Scope 반영 완료.
- 질문 8–12: 02/06/09/10/11/12의 room_name 용어·Global Context·배타적 그룹 조건 및 ADR-0003의 외부 소속 소유권 반영 완료. 권한 축은 2차 확정으로 해소했고 상속 세부만 Open.
- 질문 13–14: CONTEXT의 CFG/Module·Slot 정의, 06 §22의 CFG 연계 Deferred, 01의 CFG mart 의존 Open, 연구 README의 후속 정정 반영 완료. 새 CFG 화면·자동 재계산 트리거는 채택하지 않았다.
- 질문 15: 06 §23에 번역 범위 Decided와 계정 언어 선호 저장 Candidate, DESIGN/PLATFORM_REQUIREMENTS에 소비 포인터 반영 완료. AGENTS는 에이전트 지침이므로 제품 요구를 중복 추가하지 않았다.
- 이 문서의 “추가 검토 필요/정정 필요”는 당시 punch list의 배경이다. 현행 결정 및 이번 작업의 판단 경계는 [2차 인터뷰 기록](2026-09-24-equipment-routing-domain-interview-round-2.md)을 따른다. 구현 완료를 뜻하지 않는다.

