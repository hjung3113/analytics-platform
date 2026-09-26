# 문서 인덱스

이 레포는 `context_recognized_parser`(별도 레포)가 적재한 데이터를 소비하는 분석 플랫폼의 개념 설계를 담는다. 분석 플랫폼 자체의 런타임 코드는 없으며, 기존 FeedbackOps 구현은 `products/feedbackops/` 서브모듈로 연결돼 있다. 문서는 구현 전 설계이며 Decided / Candidate / Open / Deferred를 구분한다. 에이전트용 보조 스크립트는 `.agents/`에 있다.

저장소 전체를 살펴보려면 [폴더 구조와 FeedbackOps 연결 방식](integration/repository-layout.md)을 먼저 본다.

## 역할별 진입점

| 역할 | 먼저 볼 문서 | 같이 볼 문서 |
| --- | --- | --- |
| 전체 / 기획(PM) | `00_overview.md` | `02_domain_menus.md`, `05_roadmap_and_open_questions.md` |
| 기획(PM) — 도메인/설계 결정 | `02_domain_menus.md` | `05_roadmap_and_open_questions.md` |
| 백엔드/인프라 | `01_architecture_and_data_contract.md` | `03_backend_stack.md` |
| 플랫폼/프론트엔드 | `06_platform_ui_contract.md` | `04_frontend_ui_ux.md`, `02_domain_menus.md` |
| 개별 프론트엔드 메뉴 구현 | [06 플랫폼 Kernel·메뉴 확장 계약](06_platform_ui_contract.md) §4–6/§8/§17–19/§26/§28–29 | [02 도메인 catalog](02_domain_menus.md) → [07 셸](07_app_shell_wireframe.md)/해당 화면 설계 → [04 구현 후보](04_frontend_ui_ux.md) |
| UI/UX — App Shell 화면 설계 | `07_app_shell_wireframe.md` | `06_platform_ui_contract.md`, `04_frontend_ui_ux.md`, `.agents/skills/analysis-platform-wireframe/references/wireframe-rules.md` |
| 신규 합류자 | `00_overview.md` → `06_platform_ui_contract.md` → 자기 역할 문서 순서로 | — |
| 시간·기간·지연완료 계약 변경 | [06 시간 계약·변경 영향 경로](06_platform_ui_contract.md#ctx-time) | [01 R/H 정책 원본](01_architecture_and_data_contract.md#late-arrival-policy) → 원본 옆의 소비자 포인터와 실제 변경 작업 기록 |

새 메뉴는 위 06 계약부터 읽고 Platform Done을 먼저 확인한다. 필드 원천은 [01 데이터 계약](01_architecture_and_data_contract.md), 화면 설계 절차는 [설계 스킬](../.agents/skills/analysis-platform-wireframe/SKILL.md), 시각 token/render는 [DESIGN](../DESIGN.md)을 함께 본다.

## 문서 목록

- `00_overview.md` — 목적/범위, 리뷰 반영 핵심 발견(1차·2차), YAGNI 제외 목록
- `01_architecture_and_data_contract.md` — 전체 아키텍처(view/mart), 파서-플랫폼 데이터 계약 리스크, mart 재계산·집계 가능성·마스터 소유권, 폴링·파서 DB 접근·R/H 상세 원본
- `02_domain_menus.md` — 플랫폼 코어 공통 기능, 도메인 메뉴 그룹(설비관리/기준정보관리/생산성분석/지표관리/공지/VOC)
- `03_backend_stack.md` — 백엔드/DB/인증/마이그레이션 기술 스택, 재현성·시간 계약
- `04_frontend_ui_ux.md` — 프론트 구현 후보, UI/UX 리서치(상용 SaaS 참고), 전역 계약 참조, 페이지별 UI 패턴, 차트/주석 설계
- [05 결정 상태와 미결 질문](05_roadmap_and_open_questions.md) — Design Decisions / Open Questions, 이관된 데이터 운영 정책의 이전 링크 안내, 메뉴 활용률 계측 정책 원본, 과거 Phase 가설의 이력 포인터
- `06_platform_ui_contract.md` — 플랫폼 우선 SaaS 디자인 계약: Platform Kernel, Menu Registry, Context Capability, Shell Slot, Page Archetype, Shared Component 승격 기준, Data Trust/권한/상태 UX, navigation IA
- `07_app_shell_wireframe.md` — App Shell(전역 셸) Requirements/IA/Wireframe, `06_platform_ui_contract.md`를 화면 단위로 구체화, 설계 단계 산출물
- `08_operations_overview_wireframe.md` — 운영 개요(랜딩) 화면, 07 content slot의 첫 소비 화면. Kernel 공통 기능(메뉴 그리드/즐겨찾기/최근방문/공지 배너) 소비 패턴의 첫 검증
- `09_equipment_master_wireframe.md` — 설비관리 설비 마스터 목록/상세, Management archetype 첫 Consumer, PlatformDataTable/DetailDrawer/AuditTimeline 소비 패턴
- `10_reference_data_wireframe.md` — 기준정보관리 마스터 데이터(공정/레시피/자재) 목록/상세, 09와 같은 Management archetype이지만 다중 엔티티 유형 처리 패턴을 추가로 다룸. 필드 원천 소유권·Recipe 마스터와 PRC 실행값 관계는 Open으로 유지
- `11_productivity_overview_wireframe.md` — 생산성 분석 개요, Overview archetype 첫 Consumer(물리 점유율/비Process 체류/사이클타임 P50·P95/Job 처리량). granularity·지표별 버전 page-owned 키, Global room_name·PPID/Recipe·Equipment Group Condition/Selection을 다룸
- `12_cycle_time_drilldown_wireframe.md` — 사이클타임 상세→느린 실행→occurrence 상세, Analysis Workspace archetype. PLATFORM_REQUIREMENTS §3의 대표 드릴다운 왕복 검증 경로(occurrence 식별자·Context 분리·VOC 생성/복귀 링크 계약)를 구체화
- `13_metric_catalog_wireframe.md` — 지표관리 카탈로그/상세, Catalog archetype. `metricId`+`metricVersion` 쌍(06 §6.1)의 등록·발행 원본이며, 11/12는 이 문서가 정의한 식별 쌍의 소비자로 명시 연결됨

- [DESIGN](../DESIGN.md) — 시각 token/render 원본. 전역 행동·상태·접근성 의무와 최소 기준은 06을 따른다.
- [PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) — 원본 계약에서 파생된 요구·작업·제안 목록. 결정 반영 체크가 구현 완료를 뜻하지 않는다.
- [HANDOFF](../HANDOFF.md) — 현재 세션 배경과 후속 작업 안내. 역사 기록은 현재 계약·권한을 대체하지 않는다.
- [CONTEXT](../CONTEXT.md) — 현행 도메인 용어와 관계. [ADR-0005](adr/0005-scope-room-name-line-independent.md)는 room_name 기준 Scope와 독립 Line 축([ADR-0001](adr/0001-scope-hierarchy-site-line-only.md)의 Scope 주장 대체), [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md)는 Equipment Group Condition/Selection 두 층, [ADR-0004](adr/0004-site-is-db-partition-not-column.md)는 Site DB 경계·전역 유일 EquipmentID의 근거다. 전역 소비 계약은 06을 따른다.

## 원본

`00`~`05` 문서는 Claude Docs에서 진행된 설계 세션(1차 리뷰: grok-4.6/gpt-6-astra/glm-5.3-flash, UI/UX 리서치: codex gpt-5.6-luna, 2차 리뷰: grok-4.6/gpt-6-astra/glm-5.3-flash)의 최종 산출물을 역할별로 분리해 옮긴 것이다. 원본 통합 문서: https://claude.ai/code/artifact/005e792f-7bda-4f27-b9fd-e89b4474fead

`06_platform_ui_contract.md`는 위 설계들을 플랫폼 개발 관점으로 통합해, 개별 메뉴가 공통 Shell/Context/확장 계약 위에 올라가도록 정의한 구현 전 Design Contract다. `07_app_shell_wireframe.md`는 그 계약 중 App Shell 화면 하나를 `analysis-platform-wireframe` 스킬 절차(Requirements→IA→Screen Spec→Wireframe)로 구체화하고 codex 리뷰를 거친 산출물이다.

`docs/reviews/`는 이후 설계 세션의 인터뷰/리뷰 합의록을 보존하는 디렉토리다. [2026-09-26 워크스페이스·운영 메뉴 인터뷰](reviews/2026-09-26-workspace-ops-interview.md)는 분석 / 운영 콘솔 / 피드백 3개 공간, 가공 상태 원천, FeedbackOps 단계적 통합 결정을 기록한다. [2026-09-24 2차 도메인 인터뷰](reviews/2026-09-24-equipment-routing-domain-interview-round-2.md)는 1차 punch list와 선행 리뷰 해소 사항의 문서 반영을 추적한다. `docs/reviews/2026-09-18-url-time-status-contract-grilling.md`는 grok-4.6(griller)과 codex gpt-6-astra(answerer)의 grill-duel로 `06`/`05`의 URL·시간·상태·실시간성·DB 접근·지연완료 메커니즘 Open 항목을 검토한 기록이며, 그 결과는 `06`과 [01 데이터 운영 정책](01_architecture_and_data_contract.md#데이터-운영-정책) 본문에 Decided로 반영돼 있으며 `05`에서 결정 상태를 추적한다. 리뷰 문서 자체는 authoritative source가 아니다.

## 문서 소유권과 tooling 경계

`06_platform_ui_contract.md`가 전역 계약과 navigation IA를 소유하고 `07_app_shell_wireframe.md`는 이를 소비한다. `02`는 도메인 catalog, `04`는 구현 후보/리서치, [05](05_roadmap_and_open_questions.md)는 결정 상태와 미결 질문을 추적한다. 폴링·파서 DB 접근·지연완료 R/H 상세 원본은 [01 데이터 운영 정책](01_architecture_and_data_contract.md#데이터-운영-정책)에 있다. [DESIGN](../DESIGN.md)은 시각 token/render 원본이며 06의 최소 기준·상태·접근성 의무를 변경하지 않는다. [PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md)는 파생 목록, [HANDOFF](../HANDOFF.md)는 세션 배경이다. Phase 0~4는 Deferred/non-authoritative 가설이며 구현 일정·기술 도입·POC 착수를 확정하지 않는다. `.agents/`의 스킬·명령·외부 레퍼런스는 별도 tooling 자산이며 제품 설계를 확정하는 권한을 갖지 않는다. 에이전트 공통 사용법은 [`../.agents/README.md`](../.agents/README.md)를 참조한다.

## 외부 프로젝트 설계 레퍼런스

- [플랫폼 구축 리서치와 다중 모델 토론](research/platform-build-2026-09-22/README.md) — 기능·성능·OSS·기존 구현 재사용을 조사하고 문서 보강·대체 후보를 비교한다. Research/Candidate이며 기존 계약이나 구현 승인을 대체하지 않는다.

- [기존 프로젝트 활용 아이디어 모음](integration/repository-ideas.md) — FeedbackOps 및 소유 저장소 조사 기반 브레인스토밍. 후보·질문을 모으는 문서이며 채택 결정이나 구현 계획이 아니다. 상세 근거는 연결된 Luna Max 조사 보고서에 보존한다.

- [공통 컴포넌트/계약 후보](integration/component-contract-candidates.md) — 위 아이디어 모음에서 필드 수준 계약으로 뽑아낼 수 있는 것만 추려 정리. Research/Candidate이며 06/01/03에 반영되기 전 초안이다.

- [플랫폼 모노레포 패키지 경계](integration/platform-packages.md) — `platform-app`을 contracts/ui/kernel/components/shell/mock-server/메뉴 패키지로 나누는 경계·의존 방향·메뉴 템플릿·이행 순서. 구성·단위·도구·이름은 2026-09-26 Decided, 세부 타입 이름은 Candidate.

- [Standard Log Lifecycle](references/standard-log-lifecycle/README.md) — 모델 표준 로그 개발·검증·결함·재검증 관리의 설계 참고. 원본 커밋에 고정한 Markdown 7개, 출처·해시 manifest와 4개 화면 시안 적용 범위를 포함한다. 기존 플랫폼 계약을 대체하지 않는다.

## 현재 작업과 과거 기록

현재 작업 상태는 [HANDOFF](../HANDOFF.md)에서 확인한다. 과거 맥락이 필요한 경우에만 [이전 HANDOFF 기록](../.agents/reports/handoff-history-through-2026-09-26-b.md), [결정 상세·Phase 가설 이관 기록](reviews/2026-09-23-decision-detail-history.md), 해당 리뷰/조사 보고서로 내려간다. 과거 Open·후보·실행 모델명은 당시 기록이며 현재 계약으로 승격하지 않는다. 일반 탐색은 위 역할별 경로부터 시작하고 `docs/reviews/`, `.agents/reports/`는 근거 확인이 필요할 때 검색한다.
