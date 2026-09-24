# 설비·라우팅·플랫폼 정체성 도메인 세션 정리 (2026-09-24)

작성 배경: 사용자가 자유롭게 구술한 도메인 지식을 받아 적고, `.claude/skills/domain-modeling`(mattpocock) 방식에 따라 정리한 세션 기록이다. **이 문서 자체는 authoritative가 아니다** — 실제 반영 대상은 [CONTEXT.md](../../CONTEXT.md)와 `docs/adr/`다. 이 문서는 Opus 5.5 리뷰 입력이며, 리뷰 후 누락·모호점을 사용자 인터뷰로 보강한다.

## 이미 CONTEXT.md/ADR에 반영된 것

`CONTEXT.md`(2026-09-24 갱신):
- **Site**: 물리 최상위 조직 단위(기존)
- **Line**: Scope 최대 단위(기존)
- **Maker/Model/ChamberType/EquipmentID/EquipmentName**: 설비 식별 계층. ChamberType(Model보다 세부, 외부 시스템 공급)과 EquipmentName(사람이 읽는 이름, EquipmentID와 별개)은 신규.
- **room_name**: 기존 "Process"를 room_name으로 용어 통일(_Avoid_: Process — 다의어 혼동).
- **StGroup**: 정의 전면 교체 — 담당자 그룹이 아니라 **하나의 Operation을 상호 대체 수행할 수 있는 설비 묶음**(공정 능력 단위).
- **분임조**: 신규 — **그 범위의 설비를 관리하는 엔지니어들의 묶음**(조직·담당자 단위). StGroup과 이름만 비슷하고 축이 다름.
- **Lot/Recipe**: 기존 유지, Recipe는 "Lot이 특정 챔버에서 진행하는 PRC 단계의 레서피 값"으로 구체화.
- **Operation**: 신규 — 제품(웨이퍼)이 처음부터 끝까지 거쳐야 하는 라우팅상의 작업 단위(순서 있음). PRC 로그의 기존 Step과 이름 충돌 방지 위해 임시 명명(최종 확정 대기 — 사용자가 특별히 반대 안 해서 잠정 유지 중).
- **PPID**: 신규 — 하나의 Operation을 수행하는 방법(레서피 흐름) 하나. PPID:Recipe = N:M. 파서 raw 필드명 `FlowId`와 동일 개념.

`docs/adr/`:
- **0001** (기존) — Consequences의 "StGroup(분임조)" 오기 정정(StGroup≠분임조 확인 반영).
- **0002** (기존) — StGroup URL 미소유, 변경 없음.
- **0003**(신규) — 설비 마스터는 플랫폼이 등록·관리하는 시스템이 되는 것이 목표(To-Be). 현재(As-Is)는 외부/사내 DB에 이미 존재하며 파서도 보정 로직에 참조.
- **0004**(신규) — Site는 조회 조건이 아니라 물리적으로 분리된 DB. Scope 선택기가 Site를 Line과 같은 필터 컬럼으로 구현하면 안 됨.

## 설비 조회/필터 패턴 (Decided, 문서 미반영)

- 모든 필드를 AND로 한 번에 걸지 않는다. **상위(Site, room_name)로 먼저 좁히고**, 그 아래는 **분석자마다 다른 축**(stgroup / 메이커·모델 / 분임조 중 하나)으로 필터한다.
- 전체 설비 조회도 있지만, **보통은 보고 싶은 설비를 명시적으로 선택**해서 조회하는 게 주 패턴이다.
- 아직 `docs/09_equipment_master_wireframe.md`/`docs/10_reference_data_wireframe.md`에 반영 안 됨 — 두 문서는 이 세션 이전에 작성돼 room_name/stgroup/분임조/챔버타입 구분을 모른다.

## 제품 라우팅 계층 (전체 그림)

```
제품(웨이퍼)
  └── Operation 1, Operation 2, ... Operation N
        ├── 한 Operation을 수행하는 방법 = 여러 개 가능한 PPID
        │     └── PPID 1개 = N개의 Recipe로 구성(PPID:Recipe = N:M)
        └── 그 Operation을 수행할 수 있는 설비 묶음 = StGroup
```

## 아직 문서화 안 된 새 내용 (이번 세션 후반)

### 1. 플랫폼 핵심 분석 목표

Job 안에서 일어나는 XFR/FNC/PRC 동작들의 **시간 기반 생산성 분석** → 문제 파악 → 개선 지원이 플랫폼의 핵심 목표다.

### 2. CFG(Configuration, = Parameter, 설비 설정) — 정의 미완성

XFR/FNC/PRC 동작을 **제어하는** 설비 설정값. 플랫폼이 이 값을 시각화·분석하는 기능을 제공해야 한다. **아직 구체 정보 부족**: CFG가 설비별 키-값인지, Recipe/PPID에 딸린 값인지, 시간에 따라 바뀌는지(이력이 있는지), 어느 로그 타입에서 오는지 — 전부 미확인.

### 3. 플랫폼 정체성 재확인

"메뉴간 연계분석 플랫폼" — `AGENTS.md`의 플랫폼 5갈래 중 "메뉴간 연결"(Cross-menu Context Link, `06 §22`)과 직접 연결됨. CFG 분석 기능이 이 정체성을 검증하는 사례가 될 수 있음(아직 화면/계약 설계 안 됨).

### 4. 다국어(한/영) 요구사항 — 신규, 미문서화

여러 국적 직원이 있어 한국어/영어 전환 기능이 필요하다. 현재 `06_platform_ui_contract.md`/`DESIGN.md` 어디에도 이 요구사항이 없다(DESIGN.md의 Noto Sans KR 폰트 결정도 다국어 전환 전제 없이 이뤄짐).

## 리뷰 요청 사항

Opus 5.5에게: 위 내용과 현재 `CONTEXT.md`를 대조해서 **누락되거나 모호한 지점**을 찾고, 그걸 메우기 위해 **사용자에게 물어볼 구체적 인터뷰 질문**을 만들어달라고 요청한다. 단순 지적이 아니라 "이 경계 사례에서는 어떻게 되나요?" 같은 구체적 시나리오 기반 질문을 선호한다(`domain-modeling` 스킬의 "Discuss concrete scenarios" 원칙).
