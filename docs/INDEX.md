# 문서 인덱스

이 레포는 `context_recognized_parser`(별도 레포)가 적재한 데이터를 소비하는 분석 플랫폼의 개념 설계 문서다. 제품 런타임 코드는 없다. 문서는 구현 전 설계이며 Decided / Candidate / Open / Deferred를 구분한다. 에이전트용 보조 스크립트는 `.agents/`에 있다.

## 역할별 진입점

| 역할 | 먼저 볼 문서 | 같이 볼 문서 |
| --- | --- | --- |
| 전체 / 기획(PM) | `00_overview.md` | `02_domain_menus.md`, `05_roadmap_and_open_questions.md` |
| 기획(PM) — 도메인/설계 결정 | `02_domain_menus.md` | `05_roadmap_and_open_questions.md` |
| 백엔드/인프라 | `01_architecture_and_data_contract.md` | `03_backend_stack.md` |
| 플랫폼/프론트엔드 | `06_platform_ui_contract.md` | `04_frontend_ui_ux.md`, `02_domain_menus.md` |
| 개별 프론트엔드 메뉴 구현 | `04_frontend_ui_ux.md` | `06_platform_ui_contract.md` (플랫폼 Shell/Context/확장 계약), `02_domain_menus.md` |
| UI/UX — App Shell 화면 설계 | `07_app_shell_wireframe.md` | `06_platform_ui_contract.md`, `04_frontend_ui_ux.md`, `.agents/skills/analysis-platform-wireframe/references/wireframe-rules.md` |
| 신규 합류자 | `00_overview.md` → `06_platform_ui_contract.md` → 자기 역할 문서 순서로 | — |

## 문서 목록

- `00_overview.md` — 목적/범위, 리뷰 반영 핵심 발견(1차·2차), YAGNI 제외 목록
- `01_architecture_and_data_contract.md` — 전체 아키텍처(view/mart), 파서-플랫폼 데이터 계약 리스크, mart 재계산·집계 가능성·마스터 소유권
- `02_domain_menus.md` — 플랫폼 코어 공통 기능, 도메인 메뉴 그룹(설비관리/기준정보관리/생산성분석/지표관리/공지/VOC)
- `03_backend_stack.md` — 백엔드/DB/인증/마이그레이션 기술 스택, 재현성·시간 계약
- `04_frontend_ui_ux.md` — 프론트 구현 후보, UI/UX 리서치(상용 SaaS 참고), 전역 계약 참조, 페이지별 UI 패턴, 차트/주석 설계
- `05_roadmap_and_open_questions.md` — Design Decisions / Open Questions, Deferred인 과거 Phase 가설
- `06_platform_ui_contract.md` — 플랫폼 우선 SaaS 디자인 계약: Platform Kernel, Menu Registry, Context Capability, Shell Slot, Page Archetype, Shared Component 승격 기준, Data Trust/권한/상태 UX, navigation IA
- `07_app_shell_wireframe.md` — App Shell(전역 셸) Requirements/IA/Wireframe, `06_platform_ui_contract.md`를 화면 단위로 구체화, 설계 단계 산출물

## 원본

`00`~`05` 문서는 Claude Docs에서 진행된 설계 세션(1차 리뷰: grok-4.6/gpt-6-astra/glm-5.3-flash, UI/UX 리서치: codex gpt-5.6-luna, 2차 리뷰: grok-4.6/gpt-6-astra/glm-5.3-flash)의 최종 산출물을 역할별로 분리해 옮긴 것이다. 원본 통합 문서: https://claude.ai/code/artifact/005e792f-7bda-4f27-b9fd-e89b4474fead

`06_platform_ui_contract.md`는 위 설계들을 플랫폼 개발 관점으로 통합해, 개별 메뉴가 공통 Shell/Context/확장 계약 위에 올라가도록 정의한 구현 전 Design Contract다. `07_app_shell_wireframe.md`는 그 계약 중 App Shell 화면 하나를 `analysis-platform-wireframe` 스킬 절차(Requirements→IA→Screen Spec→Wireframe)로 구체화하고 codex 리뷰를 거친 산출물이다.

## 문서 소유권과 tooling 경계

`06_platform_ui_contract.md`가 전역 계약과 navigation IA를 소유하고 `07_app_shell_wireframe.md`는 이를 소비한다. `02`는 도메인 catalog, `04`는 구현 후보/리서치, `05`는 결정 상태와 미결 질문이다. Phase 0~4는 Deferred/non-authoritative 가설이며 구현 일정·기술 도입·POC 착수를 확정하지 않는다. `.agents/`의 스킬·명령·외부 레퍼런스는 별도 tooling 자산이며 제품 설계를 확정하는 권한을 갖지 않는다. 에이전트 공통 사용법은 [`../.agents/README.md`](../.agents/README.md)를 참조한다.
