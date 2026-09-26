# 05. Design Decisions / Open Questions

현재는 개념 설계 단계다. 이 문서는 결정 상태와 미결 질문을 추적하며 구현 일정·기술 도입 시점·POC 착수를 승인하지 않는다. 기존 파일명은 참조 안정성을 위해 유지한다. 전역 UX 계약의 원본은 `06_platform_ui_contract.md`다.

## 결정 상태

| 상태 | 내용 | 원본 / 다음 판단 |
| --- | --- | --- |
| Decided | Platform Kernel을 우선하고 메뉴가 공통 계약을 소비한다 | `06_platform_ui_contract.md` §1/§4/§5 |
| Decided | occurrence와 도메인 객체 식별자를 분리하고 URL을 권한 증명으로 쓰지 않는다 | 전역 계약 §6 |
| Decided | Context 변경 시 이전 결과를 새 조건의 결과로 표시하지 않는다 | 전역 계약 §11 |
| Decided | URL 직렬화·집합 키/공집합·지표 버전 쌍·초 단위 구간, 시간 경계 메커니즘(half-open, 날짜-only, TZ 미확인 fallback, 복수 설비 병합 가드, `defaultRangeTo`), URL 계약(세션 우선순위, 버전 `v`, 잘못된 값, 뒤로가기/셸 전환 복원), §19 응답 스키마(2층: `outcome`+`assessments[]`) | `06_platform_ui_contract.md` §6.1/§6.3/§6.4/§19, `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` |
| Decided | 실시간성 기본 정책(폴링+세대 기반 캐시 재검증), 파서 DB 접근 기본 정책(같은 인스턴스·read-only·플랫폼 스키마), 지연 완료 허용 시간의 정책 메커니즘(`lateArrivalAutoHorizon`, 진행 경계 `R`/창 길이 `H`, 창 밖은 정정 후보로 보존) — **`H`=1시간과 클라이언트 폴링=5분은 Decided. 폴링 중단 조건·워커 감지 주기는 Open, 공개 필드명은 Candidate** | [01 데이터 운영 정책](01_architecture_and_data_contract.md#데이터-운영-정책), `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §6 |
| Decided | 셸 치수(사이드바 270px·헤더 54px)와 테이블 행 밀도(최소 32px, 25px는 compact 시각 목표)는 `DESIGN.md` canonical 값으로 통일. `docs/06` §7/§15를 `DESIGN.md`에 맞춰 갱신 완료(2026-09-21) | `06_platform_ui_contract.md` §7/§15, `DESIGN.md` `sidebar-shell`/`top-bar`/`table-density`, `PLATFORM_REQUIREMENTS.md` §0 |
| Decided | Scope는 Site→room_name→StGroup→Equipment 관계, 권한·조회는 room_name 기준, Line은 독립 축(Factory 제외). EquipmentID는 전 Site 유일, Site는 DB 연결 경계이며 ID 사용 전 확립. room_name 변경은 같은 ID 유지, EquipmentName 변경은 재등록·기존 ID 종료. Lot과 Job은 구별하고 Recipe는 PRC 단계 값 | [CONTEXT](../CONTEXT.md), [ADR-0005](adr/0005-scope-room-name-line-independent.md), [ADR-0004](adr/0004-site-is-db-partition-not-column.md) |
| Decided | 조직/운영 요구값(2026-09-22 확정): 백엔드 FastAPI, 배포 on-prem, 동시 사용자 ~100명, 데이터 보존 기간 제한 없음(삭제 안 함), 초기 1개 Site/Line으로 시작하되 구조는 확장 가능하게, Scope는 v1에서 단일 선택만(복수 선택은 이후), TZ는 한국(Asia/Seoul) 단일값으로 우선 시작(해외 사업장인 중국 시안·미국 오스틴 실존 확인, 확장 여지는 설계에서 배제하지 않음) | `03_backend_stack.md`; 아래 Open Questions |
| Decided | Evidence/Lineage drill-through(후보 1)와 원문 로그/설정파일 drill-through(후보 2, FileGateway류)는 현재 defer — parser의 view/mart 조회로 충분하며, 원본 접근은 내부 개발자 전용 메뉴가 실제로 필요해질 때 재검토(2026-09-22) | `docs/integration/component-contract-candidates.md` §다음 결정 순서 |
| Decided | 딥링크 키 확장(Recipe/PPID/room_name, Equipment Group Condition은 live reference 가능·Selection은 고정 ID 목록 — 2026-09-24 개정), 기간 프리셋(`1일/7일/사용자 지정`)과 집계 단위(`granularity`, page-owned), 시각화 경계(donut은 분모 있는 비율만 기본 허용, gauge/3D/그라디언트는 기본 비허용이나 업무 근거 확인 시 케이스별 예외 가능), 폴링 주기 5분(300s), CJK 폰트(망분리 확인 — Noto Sans KR 자체 호스팅), 아이콘 세트(Lucide), 메뉴 활용률 계측(v1 범위 포함, 수집 필드·보존·열람권한 확정) — 2026-09-22 grilling Round 2 및 2026-09-24 도메인 인터뷰 반영 | 아래 §딥링크 키 확장, §기간 프리셋과 집계 단위, §시각화 경계, §메뉴 활용률 계측; `docs/adr/0002-stgroup-materializes-to-equipment-ids.md`; `PLATFORM_REQUIREMENTS.md` |
| Decided | 워크스페이스 3개(분석 / 운영 콘솔 / 피드백), 전환기는 접근 가능한 공간이 2개 이상일 때만 노출, 공간 전환 시 전역 Context 전부 보존. 관리·감사는 운영 콘솔로 이동, 분석 공간의 공지·VOC는 사용자용 화면만(2026-09-26) | [06 §9.1](06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26), [인터뷰 기록](reviews/2026-09-26-workspace-ops-interview.md) |
| Decided | 가공 상태 원천은 적재 워커의 단계별 처리 결과 보고. 사용자용 가공 상태 조회는 단계 상태·원인 분류·예상 해소 시점·VOC 문의까지, 개발자용 트레이스는 원시 오류·로그·재처리까지(2026-09-26). 보고 스키마와 파서 저장소 변경 범위는 Open | [06 §19](06_platform_ui_contract.md#19-loading--empty--error-taxonomy), [01 가공 상태 보고](01_architecture_and_data_contract.md#processing-status-report) |
| Decided | FeedbackOps 단계적 통합: 1단계 SSO·토큰·딥링크 연결과 사용자용 VOC·설문 읽기 전용 소비, 2단계 인증·Scope 결정 후 셸 편입. Milestone은 FeedbackOps FR-TASK-004(미구현, 원본 저장소에서 구현 예정)를 참조(2026-09-26) | [저장소 연결](integration/repository-layout.md#feedbackops-통합-방식-decided-2026-09-26) |
| Decided | 다음 구현 범위는 프론트엔드 플랫폼 틀과 메뉴 개발 환경(모노레포, Kernel, 공유 컴포넌트, 메뉴 템플릿, Storybook, CI). 서버는 mock 유지. 일정 추정은 인터뷰 기록의 참고치이며 일정 승인이 아니다(2026-09-26) | [인터뷰 기록](reviews/2026-09-26-workspace-ops-interview.md), `prototypes/platform-app` |
| Decided | 모노레포 패키지 경계: contracts/ui/kernel/components/shell/mock-server + 그룹 단위 `menus/*` + `apps/platform-web`(프로토타입을 `git mv`), lint는 ESLint, 접두사 `@ap/`(임시, 회사 시스템 이름으로 일괄 변경 예정). 타입·필드 이름은 Candidate(2026-09-26) | [패키지 경계](integration/platform-packages.md#8-결정-decided-2026-09-26) |
| Candidate | 대표 분석 흐름으로 차트·표·드릴다운·딥링크 계약을 검증한다 | 아래 설계 검증 기준; 구현 착수는 별도 결정 |
| Candidate | 프론트엔드 라이브러리 및 백엔드 기술 선택(백엔드는 FastAPI로 방향 확정, 세부 프레임워크 버전·구성은 Candidate) | `04_frontend_ui_ux.md`, `03_backend_stack.md`; 제품 제약과 검증 결과에 따라 결정 |
| Open | 인증 프로토콜의 정확한 사양 — 사내 SSO 존재는 확인됐으나 프로토콜 미확인(사내 확인 중). 확인 전까지 인증 계층은 나중에 붙일 수 있도록 pluggable하게 구현한다 | 아래 Open Questions |
| Open | Scope 상속·행 스코핑, 다중 Site 시간 의미·assertion 공급 근거·최초 기본 Δ, 데이터 볼륨·조회 제한·브라우저 지원 등 남은 입력 | [06 Scope/시간](06_platform_ui_contract.md#62-scope와-권한-decided--open), [01 멀티테넌시](01_architecture_and_data_contract.md), [REQUIREMENTS 질문 2–5](../PLATFORM_REQUIREMENTS.md#open-questions--미결-범위와-결정-이력) |
| Deferred | 구현 순서·일정·POC·저장된 뷰·범용 위젯/플러그인 확장 | 별도 implementation-planning에서 재평가 |

Decided는 설계 계약의 상태이며 구현 완료를 뜻하지 않는다. Candidate/Open/Deferred를 구현 지시로 해석하지 않는다.

## 대표 분석 시나리오의 설계 검증 기준 (Candidate)

향후 대표 시나리오를 검증할 때 사용할 후보 기준이다. 현재 설계 단계에서 POC 구현이나 통과를 요구하지 않는다:

- 동일 조건의 차트·상세 표·CSV 일치
- 지연 완료 후 일치(재집계가 반영됨)
- 딥링크 왕복(같은 조회조건으로 재방문 가능)
- 권한 변경 후 비노출(캐시가 권한을 무시하지 않음)
- 유효구간 경계 귀속(설비 속성이 변경된 구간의 데이터가 올바른 속성값에 귀속)

대표 시나리오의 검증 질문은 "차트가 잘 나온다"보다 다음 질문에 답할 수 있는지로 잡는다:

> 이 숫자는 어느 데이터까지 반영했고, 어떤 정의로 계산했으며, 무엇을 제외했고, 어떤 설비 실행에서 나온 것인가?

예를 들어 사이클타임 P95에서 느린 실행 목록으로, 다시 해당 실행의 공정 타임라인과 품질 표시로 내려갈 수 있다면, 그 하나의 흐름에서 지표·필터·식별자·권한·리니지·차트 요구를 함께 검증할 수 있다.

## Open Questions

- [ ] 인증 프로토콜의 정확한 값 (사내 SSO 존재는 확인됐으나 프로토콜은 사내 확인 중 — 확인 전까지 인증 계층은 pluggable하게 구현)

이 목록은 인증 입력을 추적하며 전체 미결 목록은 아니다. Scope·시간·공개 계약의 미결은 [06](06_platform_ui_contract.md), 파생 질문은 [REQUIREMENTS](../PLATFORM_REQUIREMENTS.md#open-questions--미결-범위와-결정-이력)를 함께 확인한다.

2026-09-22 도메인 인터뷰로 이 절의 나머지 항목(백엔드 언어, 멀티테넌시, 배포 환경, 동시 사용자, 데이터 보존, 지연 완료 허용 시간 구체 숫자, 사업장 TZ 실제 값, Scope hierarchy)은 결정됐거나 초기 범위가 정해졌다. 값과 근거는 위 결정 상태 표와 [CONTEXT](../CONTEXT.md), [ADR-0005](adr/0005-scope-room-name-line-independent.md)을 본다. Scope 상속·구체 행 스코핑 방식, 다중 Site 시간 의미·assertion 공급 근거, 최초 기본 Δ, 데이터 볼륨·최대 조회량·timeout, 브라우저 지원 범위 등 남은 입력은 아래 원본 포인터와 REQUIREMENTS의 미결 질문을 따른다.

### 실시간성 (Decided — 메커니즘)

상세 원본은 [01 데이터 운영 정책](01_architecture_and_data_contract.md#refresh-policy)으로 이관했다. 이 제목은 기존 링크 호환을 위해 유지하며 정책을 중복 편집하지 않는다.

### 파서 DB 접근 방식 (Decided — 메커니즘)

상세 원본은 [01 데이터 운영 정책](01_architecture_and_data_contract.md#parser-db-access)으로 이관했다. 이 제목은 기존 링크 호환을 위해 유지하며 정책을 중복 편집하지 않는다.

<a id="지연-완료-허용-시간-decided--정책-메커니즘-구체-숫자는-open-questions-유지"></a>
<a id="late-arrival-policy"></a>
### 지연 완료 허용 시간 (Decided — 정책 메커니즘 + 구체 숫자)

상세 원본은 [01 데이터 운영 정책](01_architecture_and_data_contract.md#late-arrival-policy)으로 이관했다. 이 제목은 기존 링크 호환을 위해 유지하며 정책을 중복 편집하지 않는다.

### 딥링크 키 확장 — Recipe/StGroup (Decided, 2026-09-22 grilling Round 2)

이 제목은 기존 링크 호환을 위해 유지한다. 2026-09-24 인터뷰로 PPID/room_name과 모든 Equipment Group 축의 두 층 모델로 확장됐다. 현행 규칙·Candidate 필드명은 [06 §6.1](06_platform_ui_contract.md#61-식별자와-url-소유-상태-decided), 모든 그룹 축의 Condition/Selection 대안·재평가 의미은 [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md)를 따른다. [당시 결정 근거](reviews/2026-09-23-decision-detail-history.md)는 이력으로 보존하며 규칙을 중복 편집하지 않는다.

### 기간 프리셋과 집계 단위 (Decided, 2026-09-22 grilling Round 2)

프리셋의 rolling wall-clock·Δ·초기 기본 기간 및 시간 의미의 Open은 [06 시간 계약](06_platform_ui_contract.md#ctx-time), 집계 단위의 page-owned 메커니즘과 필드/값 Candidate는 [06 §6.1](06_platform_ui_contract.md#61-식별자와-url-소유-상태-decided), 시각 표현은 [DESIGN](../DESIGN.md#reference-component-bindings)이 소유한다.

[당시 결정 기록](reviews/2026-09-23-decision-detail-history.md)에 비교 근거를 보존했다.

### 시각화 경계 — Donut/Gauge (Decided, 2026-09-22 grilling Round 2)

기본 허용 범위와 업무 근거에 따른 예외는 [06 Decorative Visualization](06_platform_ui_contract.md#decorative-visualization)이 소유한다. [당시 채택 기록](reviews/2026-09-23-decision-detail-history.md)은 배경이며 이 절에서 별도 규칙을 만들지 않는다.

### 메뉴 활용률 계측 (Decided — v1 범위 포함, 2026-09-22 grilling Round 2)

**범위 판단 정정:** 이 계측은 "메뉴가 몇 개 쌓이면 그때 붙이는" 메뉴 부가기능이 아니라 **Platform Kernel 자체의 관측 범위**(Menu Registry가 실제로 어떻게 쓰이는지)다. 메뉴별 반복 패턴 확인 후 공통 컴포넌트로 승격하는 Premature Platformization 게이트(§24)는 여기 적용 대상이 아니다 — 플랫폼 우선순위(`AGENTS.md`, 06 §1)에 따라 v1 범위에 포함한다.

- **수집 필드**: menuId·이벤트·시각뿐 아니라 **조회조건·필터값까지 포함**한다.
- **보존기간**: 무제한(자동 삭제 없음). 개발자가 필요시 수동으로 삭제할 수 있는 경로는 둔다(자동 purge 잡은 아님).
- **열람 권한**: 개발자 및 운영자 기본 열람. 그 외 계정은 운영자가 개별로 권한을 부여한 경우에만 열람 가능(기존 06 §17 권한/Scope 집행 정책과 같은 서버 재검증 원칙을 따름 — 별도 새 권한 모델을 만들지 않고 기존 역할 체계 위에 얹는다).
- 계측 파이프라인의 이벤트 스키마·PII 최소화 세부 구현은 구현 착수 직전 별도로 다룬다(위 세 항목은 정책 수준 Decided).

## Deferred — 과거 Phase roadmap 가설 (non-authoritative)

[과거 Phase 0–4 표](reviews/2026-09-23-decision-detail-history.md#deferred--과거-phase-roadmap-가설-non-authoritative)는 이력으로 분리했다. 확정 일정·기술 도입·POC 착수·완료 기준이 아니며, 다른 문서의 Phase 참조도 이 가설을 가리킨다. 구현 요청 시 현행 계약과 미결 입력으로 별도 계획을 세운다.
