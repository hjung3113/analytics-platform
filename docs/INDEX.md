# 문서 인덱스

이 레포는 `context_recognized_parser`(별도 레포)가 적재한 데이터를 소비하는 분석 플랫폼의 설계와 프론트엔드 플랫폼 코드를 담는다. 코드는 루트 pnpm workspace(`packages/*` 플랫폼 패키지, `menus/*` 견본 메뉴, `apps/platform-web` 조립 앱, 서버는 mock)이고, FeedbackOps는 `products/feedbackops/` 서브모듈로 연결돼 있다.

| 알고 싶은 것 | 어디 |
| --- | --- |
| 남은 일, 다음 할 일, 결정 대기 | [`.planning/README.md`](../.planning/README.md) |
| 작업 규칙 | 루트 [AGENTS.md](../AGENTS.md), 이 폴더 [AGENTS.md](AGENTS.md)(문서 소유권·상태 표기) |
| 저장소 구조와 FeedbackOps 연결 | [저장소 구조](integration/repository-layout.md) |
| 결정과 그 이유 | [ADR 목록](adr/README.md), ADR 없는 계약 결정은 [05](05_roadmap_and_open_questions.md) |
| 도메인 용어 | [CONTEXT](../CONTEXT.md) |
| 시각 규칙 | [DESIGN](../DESIGN.md) |
| 이슈 관리·에이전트 운영 메모 | [이슈 트래커](agents/issue-tracker.md), [운영 메모](agents/operations.md) |

## 역할별 진입점

| 역할 | 먼저 볼 문서 | 같이 볼 문서 |
| --- | --- | --- |
| 신규 합류자 | [00 개요](00_overview.md) → [06 플랫폼 계약](06_platform_ui_contract.md) | 자기 역할 행 |
| 기획(PM) — 도메인 | [02 도메인 catalog](02_domain_menus.md) | [CONTEXT](../CONTEXT.md), [05](05_roadmap_and_open_questions.md) |
| 백엔드·인프라 | [01 아키텍처·데이터 계약](01_architecture_and_data_contract.md) | [03 백엔드](03_backend_stack.md), [실서버 연결 체크리스트](integration/real-server-checklist.md) |
| 플랫폼·프론트엔드 | [06 플랫폼 계약](06_platform_ui_contract.md) | [04 프론트 기술 스택](04_frontend_ui_ux.md), [07 셸](07_app_shell_wireframe.md) |
| 사내 적용(백엔드·인프라·사내 메뉴 개발자) | [사내 적용 가이드](integration/in-house-rollout.md) | [실서버 연결 체크리스트](integration/real-server-checklist.md), [전송 형식 초안](integration/http-adapter-contract.md) |
| 시간·기간·지연 완료 계약 변경 | [06 시간 계약](06_platform_ui_contract.md#ctx-time) | [01 R/H 정책 원본](01_architecture_and_data_contract.md#late-arrival-policy) |

새 메뉴는 06 계약부터 읽고 Platform Done(§29)을 먼저 확인한다. 화면 설계 절차는 [설계 스킬](../.agents/skills/analysis-platform-wireframe/SKILL.md).

## 작업별 읽기 경로

코드를 만지는 작업은 아래 순서로 따라간다. 각 폴더 `AGENTS.md`가 그 폴더의 역할·금지 사항·검증 방법과 다음에 볼 파일을 알려 준다.

| 작업 | 1. 계약 | 2. 폴더 지침 | 3. 코드 |
| --- | --- | --- | --- |
| 메뉴 화면 추가·수정 | [06](06_platform_ui_contract.md) §5 Menu Extension·§29 Platform Done → 해당 화면 설계(`08`·`09`·`11`–`13`) | [menus](../menus/AGENTS.md) → [페이지 작성 가이드](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙) | `menus/<group>/src/index.ts`(선언) → `menus/<group>/src/pages/` → 필요한 부품은 [components](../packages/components/AGENTS.md) |
| Kernel 동작(Registry·전역 Context·URL·Scope·조회 수명주기) | 06 §4–6 | [packages](../packages/AGENTS.md) → [kernel](../packages/kernel/AGENTS.md) → 타입이 바뀌면 [contracts](../packages/contracts/AGENTS.md) | `packages/kernel/src/registry.ts`·`platform.tsx`·`query.ts` → 테스트 → 앱 `url-contract.test.ts` |
| 서버 계약·어댑터(실서버 전환 포함) | [사내 적용 가이드](integration/in-house-rollout.md)(순서) → [실서버 연결 체크리스트](integration/real-server-checklist.md)(규칙) → [전송 형식 초안](integration/http-adapter-contract.md)(HTTP 경계), [ADR-0019](adr/0019-menu-query-endpoint-declaration.md), 06 §18–19 | [contracts](../packages/contracts/AGENTS.md) → [mock-server](../packages/mock-server/AGENTS.md) → [server-conformance](../packages/server-conformance/AGENTS.md) → [apps/platform-web](../apps/platform-web/AGENTS.md)(주입·dev 도구) | `packages/contracts/src/adapter.ts`·`menu-query.ts` → `packages/mock-server/src/adapter.ts` |
| 공통 컴포넌트·차트·상태 화면 | 06 §13·§15·§16·§18–19·§24 | [packages](../packages/AGENTS.md) → [components](../packages/components/AGENTS.md) → primitive가 필요하면 [ui](../packages/ui/AGENTS.md) | `packages/components/src/` → 소비 화면(`menus/*/src/pages`) |
| 셸(레일·사이드바·페이지 머리·Context 바·상세 슬롯·라우트 상태·공간) | [07 셸](07_app_shell_wireframe.md), 06 §7–9 | [shell](../packages/shell/AGENTS.md) → 슬롯·Registry는 [kernel](../packages/kernel/AGENTS.md) | `packages/shell/src/` → 앱 `src/main.tsx`(조립) |
| 디자인 토큰·시각 규칙 | [DESIGN](../DESIGN.md), [ADR-0011](adr/0011-design-direction-feedbackops-shell.md) → [FeedbackOps ADR-0058](../products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md), [06 §23](06_platform_ui_contract.md#23-design-tokens) | [ui](../packages/ui/AGENTS.md) | `packages/ui/src/styles/` |
| 플랫폼 계약 자동 검사(E2E) | 06 §6·§11·§17·§19·§22 | [apps/platform-e2e](../apps/platform-e2e/AGENTS.md) | `apps/platform-e2e/tests/contracts.spec.ts` → `support.ts` → 보고 `contract-reporter.ts` |
| 모노레포 구조·빌드·CI·접두사 변경 | [패키지 경계](integration/platform-packages.md), [저장소 구조](integration/repository-layout.md) | [tooling](../tooling/AGENTS.md) → [packages](../packages/AGENTS.md) | 루트 `package.json`·`pnpm-workspace.yaml`·`turbo.json` → `.github/workflows/ci.yml` |
| 설계 문서·결정 갱신 | 해당 소유 문서 → [ADR 목록](adr/README.md) 또는 [05](05_roadmap_and_open_questions.md) | [docs](AGENTS.md) | 바꾼 뒤 `pnpm docs:links` |
| 적재 워커 상태·가공 상태 조회·운영 콘솔 모니터링 | [01 가공 상태 보고](01_architecture_and_data_contract.md#processing-status-report), 06 §19, [상태 기록 스키마 초안](integration/ingest-status-schema.md) | [docs](AGENTS.md) | 파서 저장소 `context_recognized_parser` |
| FeedbackOps 연결 | [저장소 구조](integration/repository-layout.md), [딥링크 계약](integration/feedbackops-deeplink.md), [ADR-0018](adr/0018-feedbackops-stage2-screens-into-platform-menus.md) | [products/feedbackops](../products/feedbackops/AGENTS.md) | 서브모듈 하위 `AGENTS.md` |
| 통합 전 단위 프로토타입 | — | [prototypes](../prototypes/AGENTS.md) | 각 프로토타입 README |

## 문서 목록

설계 문서(`docs/`):

- [00 개요](00_overview.md) — 목적·범위, YAGNI 제외 목록.
- [01 아키텍처·데이터 계약](01_architecture_and_data_contract.md) — view/mart 구조, 파서-플랫폼 데이터 계약, mart 재계산·집계 가능성·마스터 소유권, 폴링·파서 DB 접근·지연 완료 R/H 원본.
- [02 도메인 catalog](02_domain_menus.md) — 플랫폼 코어 기능과 도메인 메뉴 그룹.
- [03 백엔드](03_backend_stack.md) — 백엔드·DB·인증 기술 스택, 재현성·시간 계약.
- [04 프론트 기술 스택](04_frontend_ui_ux.md) — 라이브러리 결정과 코드 현황, 그리드·차트·데이터 도구 검토, 페이지별 UI 패턴.
- [05 결정 상태](05_roadmap_and_open_questions.md) — ADR 없는 계약 결정 목록, MVP 지원 환경, 메뉴 활용률 계측 정책.
- [06 플랫폼 UI 계약](06_platform_ui_contract.md) — Platform Kernel, Menu Registry, Context Capability, Shell Slot, Page Archetype, 공통 컴포넌트 승격 기준, Data Trust·권한·상태 UX, navigation IA. **전역 계약의 원본.**
- [07 App Shell](07_app_shell_wireframe.md) — 셸 구조(ADR-0011·0013·0015로 Decided)와 IA.
- 견본 메뉴 화면의 계약 메모(사내에서 새로 만들 메뉴라 계약에 닿는 부분만 둔다): [08 운영 개요](08_operations_overview_wireframe.md), [09 설비 마스터](09_equipment_master_wireframe.md), [11 생산성 개요](11_productivity_overview_wireframe.md), [12 사이클타임 드릴다운](12_cycle_time_drilldown_wireframe.md)(대표 드릴다운 왕복 계약), [13 지표 카탈로그](13_metric_catalog_wireframe.md)(`metricId`+`metricVersion` 쌍의 원본). 드릴다운 플랫폼 기능: [14 드릴다운 — 플랫폼 기능과 레이아웃](14_drilldown_platform.md)(#225, ADR-0025). 업무 시스템별 공간과 FeedbackOps 협업 진입: [15 멀티 워크스페이스](15_multi_workspace_ui.md)(#249, ADR-0026).

통합 계약(`docs/integration/`):

- [저장소 구조](integration/repository-layout.md) — 폴더 구조, FeedbackOps 서브모듈 연결·갱신 절차.
- [패키지 경계](integration/platform-packages.md) — 패키지 의존 방향, 메뉴 템플릿, 결정(2026-09-26, 세부 타입 이름은 Candidate).
- [실서버 연결 체크리스트](integration/real-server-checklist.md) — `PlatformAdapter` 메서드별 의미, `menuQuery` 판정 순서·등록 검증, 적합성 묶음 실행. Candidate.
- [전송 형식 초안](integration/http-adapter-contract.md) — 메서드별 HTTP 경로·요청/응답, 상태 코드와 `outcome`, 세션·CSRF, 백엔드 담당 질문. Candidate(#149 합의 대기).
- [사내 적용 가이드](integration/in-house-rollout.md) — mock → 실어댑터·실서버 전환 순서, 담당자별 확인 질문, 사내 메뉴 개발 가이드, 완료 기준.
- [적재 워커 상태 기록 스키마](integration/ingest-status-schema.md) — 가공 상태 원천의 기록 구조와 평가 규칙. Candidate(#37 파서 담당 합의 대기).
- [FeedbackOps 딥링크 계약](integration/feedbackops-deeplink.md) — 양방향 딥링크 1단계(확장은 #81).

루트 문서: [DESIGN](../DESIGN.md)(FeedbackOps 기반 플랫폼 시각 확장 — 06의 최소 기준·상태·접근성 의무는 바꾸지 않는다), [CONTEXT](../CONTEXT.md)(현행 도메인 용어와 관계).

조사·근거 기록(authoritative 아님):

- [URL·시간·상태 계약 grilling](reviews/2026-09-18-url-time-status-contract-grilling.md) — 06 §6.1·§6.3·§6.4·§19의 세부 판정 근거와 반례.
- [플랫폼 구축 리서치 종합](research/platform-build-2026-09-22/SYNTHESIS.md) — #165(폴링·계산 세대)·#155(서버) 착수 때 설계 입력.
- [반도체 도메인 외부 조사](research/semiconductor-domain-2026-09-24/README.md) — SEMI 표준·제품 자료를 우리 용어에 대 본 조사(Operation 이름·CFG 형식은 아직 Open).

## 상태 표기

문서는 Decided / Candidate / Open / Deferred를 구분한다. 규칙은 [docs/AGENTS.md](AGENTS.md). `.agents/`의 스킬·명령·외부 레퍼런스는 tooling 자산이며 제품 설계를 확정하지 않는다([`.agents/README.md`](../.agents/README.md)).
