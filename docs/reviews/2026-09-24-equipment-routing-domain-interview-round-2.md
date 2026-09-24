# 2026-09-24 설비·라우팅 도메인 인터뷰 — 2차 리뷰 해소

상태: **10개 항목 확정 및 대상 문서 반영 완료(2026-09-24), authoritative 아님.** Opus 5.5 / GPT-6 Astra의 선행 독립 리뷰 지적을 도메인 전문가와의 인터뷰로 해소한 기록이다. 선행 리뷰 전문은 파일로 보존되지 않았으며 아래 사용자 제공 합의가 해당 지적을 대체한다. 현행 용어는 [CONTEXT](../../CONTEXT.md), 결정 근거는 [ADR](../adr/), 전역 소비 계약은 [06](../06_platform_ui_contract.md)이 소유한다.

[1차 15문항 인터뷰](2026-09-24-equipment-routing-domain-interview.md)의 punch list도 같은 작업에서 적용했다. 본문 반영은 설계 문서의 정합성 작업이며 제품 구현·런타임 검증을 뜻하지 않는다.

## 인터뷰 질문과 확정 답변

### 1. 권한·조회 Scope의 기준은 Line인가 room_name인가?

- **답변: room_name.** “포토 공정 담당자”처럼 Site 내 room_name 단위로 권한을 부여한다. 관계는 Site → room_name → StGroup → Equipment이며 하나의 room_name은 여러 Line에 걸칠 수 있다. Line은 실제로 유용한 독립 생산·조회 축이며 room_name을 포함하는 최대 Scope가 아니다.
- **반영:** [ADR-0005](../adr/0005-scope-room-name-line-independent.md) 신설, ADR-0001 부분 대체 표시, CONTEXT Line/room_name, 06 §6.2, 07·09–13. 01/02/05/INDEX/PLATFORM_REQUIREMENTS의 현행 요약도 정정했다. Factory 미모델링·v1 단일 Scope는 유지하며 권한 상속 세부는 Open이다.

### 2. EquipmentID의 Site 간 유일성과 Site 결정 방식은?

- **답변: 모든 Site에 걸쳐 전역 유일.** 동일 ID 충돌은 없고 EquipmentID로 Site DB를 자동 역조회할 필요도 없다. ID 사용 전에 활성 세션/선택 Scope의 Site가 이미 확립되어 있어야 하며 딥링크도 그 전제를 따른다.
- **반영:** [ADR-0004](../adr/0004-site-is-db-partition-not-column.md) Consequences, CONTEXT EquipmentID, 06 §6.1/§6.2, 09 식별자 및 12 직접 진입 설명. URL에서 누락된 필수 scopeId를 세션으로 몰래 채우지 않는 기존 규칙은 유지한다.

### 3. Recipe 필터는 Job 전체를 고르는가, 매칭 PRC 구간만 고르는가?

- **답변: 메뉴별 정의.** 이 조인 범위를 Kernel 공통 규칙으로 강제하지 않는다.
- **반영:** 06 §6.1의 1급 Recipe 축에 Candidate/메뉴 정의 경계 추가, 11·12에 메뉴별 적용 범위 표시. CONTEXT의 Recipe 정의는 변경하지 않았다. 1차 결정대로 PPID·Recipe가 v1 필터 축이며 Operation은 제외한다.

### 4. 서로 다른 Recipe/PPID 실행을 섞은 P95 “느린 실행”의 비교 기준은?

- **답변: 해당 메뉴 분석 로직의 정확성 문제.** 플랫폼·Kernel이나 용어집에서 통계적 해법을 정하지 않는다.
- **반영:** 11·12의 Open Questions에 비교 모집단의 포함/분리 및 비교 가능성 기준을 화면 분석 로직 담당자가 명세하도록 기록했다. 수식·층화·통계 정책은 채택하지 않았다.

### 5. 전역 equipmentIds와 상세 equipment_id는 다른 개념인가? 복귀 시 선택은?

- **답변: 같은 EquipmentID 식별자.** 목록 필터와 단일 목적지라는 역할만 다르다. 상세/드릴인에서 분석으로 돌아갈 때는 진입 전 Context를 그대로 복원한다. 선택 밖 설비를 보았더라도 선택을 확대·교체하지 않는다.
- **반영:** 06 §6.4의 Equipment Group/Context Capability 및 분석 복귀 계약, §22, 09–13의 관련 왕복 설명. Condition·Selection·미적용 값 및 출발 페이지의 등록된 URL 상태를 유지하며 권한은 복귀 시 재검증한다.

### 6. 사용중지와 속성 이력 valid_to 종료, 재등록은 별개 사건인가?

- **답변: 기존 ID의 종료가 곧 사용중지다.** 새 EquipmentID 재등록 시 기존 ID 종료·사용중지는 하나의 전환 동작이고 기존 ID를 다른 용도로 재사용하지 않는다.
- **반영:** 09의 기존 Decided 동치를 유지하면서 재등록과 기존 ID 종료의 관계를 명시했다. 충돌하던 01의 “동일 의미로 처리하지 않는다”를 정정하고 02 소비 요약도 맞췄다. 재등록의 실제 사유는 다음 항목의 EquipmentName 변경이다.

### 7. room_name 변경은 불가능한가? 새 EquipmentID가 필요한가?

- **답변: 드물지만 가능하고 같은 ID를 유지한다.** 보통 등록 시 정해진 값이 유지된다. 다른 설비로 취급하는 재등록의 기준은 **EquipmentName 변경**이다.
- **반영:** CONTEXT room_name/EquipmentName, 09·10의 본문/표/와이어프레임/결정/리스크에 남은 불변·재등록 가정 정정. 관련 파생 요약도 같은 기준으로 맞췄다.
- **원문 충돌 해석:** 항목 6에 예시로 언급된 “room_name 변경 후 재등록”은 이 항목의 명시적 정정에 따라 EquipmentName 변경으로 해석했다. room_name 변경 자체로 새 ID를 만들지 않는다.

### 8. Job 중간 CFG 변경까지 분석해야 하는가?

- **답변: Job 시작 시점의 유효값 하나로 충분하다.** 구간별·Job 중간의 CFG 변경을 추가 모델링하지 않는다.
- **반영:** CONTEXT CFG, 1차 인터뷰 CFG 후속 정정, 01의 CFG 소비 경계, 12 참고 경계, [외부 조사 README](../research/semiconductor-domain-2026-09-24/README.md)의 조인 시점 질문 해소. 외부 조사는 Research/Candidate 상태로 유지한다.

### 9. 이벤트 로그와 CFG의 실제 grain은?

- **답변: XFR/FNC/PRC는 Module/Slot 단위.** EquipmentID보다 세부적인 이벤트 grain이다. CFG 기록 자체는 설비 단위이고 개별 값이 특정 Module을 참조/대상화할 수 있다. Module은 값 내부 속성이지 CFG 테이블 분할 키가 아니다.
- **반영:** CONTEXT에 Module/Slot·CFG 추가, EquipmentID의 “파서 최소 적재 키” 오해 정정, 01에 저장/소비 경계 명시. 12에 Module/Slot 참조·부모 Job occurrence 연결과 표현을 정할 Open 항목 추가. 타임라인 전체는 재설계하지 않았다.

### 10. Equipment Group 조건과 명시 선택을 URL에 어떻게 보존하는가?

- **답변: 모든 축에 Condition/Selection 두 층을 적용한다.** StGroup / 분임조 / Maker+Model 및 향후 축에 예외가 없다. Condition은 현재 멤버/매칭 설비를 재평가하는 live reference가 가능하고, 그 결과에서 사용자가 명시적으로 고른 Selection은 항상 고정 EquipmentID 목록이다. 1차의 축 간 배타성(조합 미지원)을 유지한다.
- **반영:** [ADR-0002](../adr/0002-stgroup-materializes-to-equipment-ids.md) 전면 개정(기존 링크를 위해 파일명 유지), 06 §6.1/§6.4/§11, 09–13의 그룹 상태·전달·복귀 설명. 05/INDEX/PLATFORM_REQUIREMENTS의 구형 단일 키 정책도 정정했다.

## 1차 punch list의 함께 적용한 범위

| 1차 질문 | 적용 결과 |
| --- | --- |
| 1–4 | Lot/Job 혼용 제거, Job 처리량·단위, PPID/Recipe 공개 키와 실행 grain 반영 |
| 5–7 | 설비 단위 StGroup·ChamberType 분류, room_name/Site 경계, Condition/Selection 및 Scope 정정 |
| 8–10 | 기준정보 공정=room_name, 09 잔여 Process 분류명 제거, 11 room_name Global Context 전환, PPID/Recipe·Operation 경계 |
| 11–12 | 그룹 축 배타성, StGroup·분임조 소속 외부 소비(ADR-0003 포함), room_name 권한 확정 |
| 13–14 | CFG grain·Job 시작 유효값 명시, cross-menu Deferred, mart 의존/트리거는 01 Open으로 추적 |
| 15 | 06 §23의 UI 문구·정적 본문만 한/영 번역, 사용자 본문·마스터 값 제외; DESIGN/PLATFORM_REQUIREMENTS 연결 |

## 문서 적용 판단과 후속 확인 경계

- **공개 키는 Candidate:** room_name은 `roomNames` 집합, PPID는 단일 `ppid`, 그룹 조건은 구조화된 단일 `equipmentGroup`, 명시 선택은 `selectedEquipmentIds`로 표현했다. 기존 `equipmentIds`는 같은 명시 ID 집합의 대응 표현이며 별도 필터를 만들지 않는다. 정확한 조건 인코딩·카디널리티·별칭/버전 이행은 구현 전 공개 스키마에서 확정한다.
- **두 층의 재평가 해석:** 명시 Selection이 있으면 그 고정 목록을 분석 대상으로 유지하고, 현재 Condition 결과로 자동 교집합/확장하지 않는 것으로 적용했다. 조건 편집 시 선택 처리 UI와 현재 결과에서 빠진 선택의 표시 방식은 Candidate다. 권한·Scope 위반은 항상 재검증하며 자동 목록 수정으로 숨기지 않는다.
- **Job occurrence 매핑:** 12의 예전 합성 `entityType=lot`을 Job과 동일시하지 않도록 설명용 `JOB_TYPE`으로 표시했다. 실제 원천 enum/조인은 Open이며 새 파서 enum을 확정한 것이 아니다.
- **복원:** 09의 기존 복원 기능은 일반 경우로 남기되 EquipmentName 변경 재등록으로 종료된 옛 ID에는 적용하지 않았다. 일반 사용중지의 복원 허용 조건은 후속 설계에서 확인할 부분이다.
- **언어 선호:** 1차 인터뷰가 위임한 저장 방식은 계정 선호값 Candidate로 기록했다. 새 저장 API나 언어 설정 화면을 설계하지 않았다.
- **범위:** 08은 이번 결정과 직접 충돌하지 않아 수정하지 않았다. AGENTS/HANDOFF 및 products/feedbackops/는 변경하지 않았다. 01/02/05/INDEX/DESIGN/PLATFORM_REQUIREMENTS의 수정은 이번 결정과 punch list가 직접 영향을 주는 문장·포인터로 한정했다.

## 검증 범위

수정 전 작업 트리 스냅샷과 대조하여 기존 수정·미추적 문서를 보존하고 이번 변경을 확인했다. 용어·Scope·URL/복귀 규칙·미결 상태·상대 링크와 section anchor를 문서 수준에서 검수했다. 08과 products/feedbackops/는 변경 대상에 포함하지 않았다. 런타임 코드·통계 계산·브라우저 UI 검증은 수행하지 않았다.
