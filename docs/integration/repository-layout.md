# 저장소 구조와 FeedbackOps 연결

## 현재 단계

FeedbackOps 원본 개발을 유지하면서 동일 체크아웃에서 코드를 참고하고 플랫폼 설계를 구체화한다. 공통 계약과 책임 범위를 확정한 뒤 통합 구현을 시작한다. 플랫폼 프론트엔드는 루트 pnpm workspace다. 패키지 추출은 완료됐다([패키지 경계](platform-packages.md)). FeedbackOps(`apps/{platform-api,feature-screens}`·`packages/feature-*`)는 루트 workspace의 일부다([ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). 패키지 이름과 루트 작업·CI는 #1098 r에서 통합했다. 인프라 이름 전환은 #1100의 별도 범위다.

기존 플랫폼 문서는 링크와 소유권을 보존하기 위해 `docs/`에 유지한다. `docs/platform/` 이동이나 공통 코드 추출은 이번 연결에 포함하지 않는다.

## 폴더별 역할

| 경로 | 역할 |
| --- | --- |
| `docs/{overview,product,architecture,contract,wireframes,design}/` | 기존 플랫폼 설계. 전역 계약은 `docs/contract/platform-ui-contract.md`가 소유 |
| `docs/adr/` | 결정 기록(ADR). 목록·형식은 `docs/adr/README.md` |
| `docs/integration/` | 저장소 연결 및 향후 통합 결정. 기존 제품 계약을 암묵적으로 덮어쓰지 않음 |
| `DESIGN.md`, `GLOSSARY.md` | 플랫폼 디자인 방향, 도메인 용어 |
| `.planning/` | 남은 일·결정 대기(원본은 GitHub 이슈) |
| `.agents/` | 플랫폼 에이전트 스킬·참고자료·보고서 |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json` | 플랫폼 pnpm workspace 루트(`apps/*`, `packages/*`(FeedbackOps `feature-*`), `packages/sdk/*`, `packages/adapters/*`, `menus/*/*`, `platform/*`, `tooling/*`) |
| `apps/platform-web/` | 플랫폼 앱(조립 지점, dev 도구) |
| `apps/platform-e2e/` | 플랫폼 계약 E2E(Playwright 블랙박스) |
| `packages/sdk/` | SDK 패키지 `contracts`·`ui`·`kernel`·`components`·`shell`(`@ap/*`, 공개 API). 경계는 [패키지 경계](platform-packages.md) |
| `packages/adapters/` | 어댑터·소비자 쪽 패키지 `mock-server`·`http-adapter`·`server-conformance`·`feature-bridge`(`@ap/*`, SDK 아님). 경계는 [패키지 경계](platform-packages.md) |
| `menus/` | 업무 시스템 메뉴 Consumer 패키지 `menus/<system>/<group>/`(`@ap/menu-<group>`). 공간은 폴더가 원본이고 `GROUPS`와 일치를 검사 |
| `platform/` | 플랫폼 기능 Consumer 패키지 `platform/<feature>/`(`@ap/menu-<name>`: 홈·내 활동·공지·운영 콘솔·FeedbackOps 화면). 한 단계, SDK 아님. 공간은 `GROUPS`만 정한다 |
| `tooling/` | 공유 도구: tsconfig, eslint 경계 규칙, `gen-menu`, `css-selectors` |
| `archive/` | 통합 전 Kernel 단위 프로토타입(개별 npm 프로젝트, workspace 밖). 보존 |
| `apps/{platform-api,feature-screens}`, `packages/feature-*` | FeedbackOps 앱·패키지·문서(루트 workspace의 일부, 이력 합류 `c73c55c5`, [ADR-0090](../adr/0090-repo-structure-by-branch.md)) |
| `apps/feature-screens/` | 기존 React 프론트엔드. `src/features/`에 업무 화면 구성 |
| `apps/platform-api/` | 기존 Fastify 백엔드. `src/modules/`에 업무 및 공통 기능 구현 |
| `packages/feature-shared/` | FeedbackOps 프론트·백엔드 공유 계약. 아직 플랫폼 공통 계약은 아님 |
| `packages/feature-ui/` | FeedbackOps UI 패키지(`@ap/feature-ui`). `a8d768b8` 기준으로 전체가 `packages/sdk/ui`(`@ap/ui`)에 옮겨졌고(#441–#443) 이 사본은 FeedbackOps에 그대로 남는다 |
| `docs/{product/features,architecture/platform-api,design/features,user-guide}` | 플랫폼 기능의 요구·구현·화면·사용 안내; 과거 기록은 [보존 색인](feature-history.md) |
| `ops/platform-api/` | FeedbackOps 루트 도구(워크스페이스 패키지 `@ap/platform-api-ops`): 스크립트·게이트·compose·conductor, 앱·패키지 위치 지도 `paths.sh`/`paths.mjs`(713p1, [ADR-0090](../adr/0090-repo-structure-by-branch.md)) |

FeedbackOps의 인증·권한·감사·VOC·Finding·Task 등은 기존 구현을 유지한다. 업무 모듈을 별도 앱으로 재분할하거나 플랫폼 공통 패키지로 승격하지 않았다.

## 원본 및 버전

- FeedbackOps는 이 저장소의 일반 코드다(서브모듈 아님, [ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), #592). FeedbackOps `develop` `c73c55c5`의 이력을 그대로 합쳤다(디렉터리 내용은 그 커밋과 같다).
- 원본 저장소 `https://github.com/hjung3113/FeedbackOps`는 `c73c55c5`에서 동결되고 은퇴한다(#597). 이후 FeedbackOps 변경은 이 저장소의 PR(`feat/<n>-<slug>`, `main`)로만 한다.
- 도구는 통일했다(1b단계, #642): FeedbackOps는 루트 pnpm workspace의 일부이고 Node 26.7·pnpm 11·루트 `pnpm-lock.yaml`·루트 turbo를 쓰며 `@ap/ui`는 `workspace:*`로 받는다. 런타임은 기능 패키지 집합과 `@ap/ui`를 허용하고, 코어 서버만 새 포트 검증용 `@ap/contract-schemas`를 직접 import할 수 있다(ADR-0097). 백엔드 테스트(실서버 적합성 #674)만 `@ap/server-conformance`·`@ap/http-adapter`·`@ap/contracts`를 `devDependencies`로 받는다([ADR-0073](../adr/0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md), `ops/platform-api/scripts/check-boundaries.mjs` 규칙 11이 import와 `package.json`을 함께 검사). 린터는 FeedbackOps가 Biome를 계속 쓴다.

## 설치와 검증

설치는 루트에서 한 번(`pnpm install --frozen-lockfile`)이다. 루트 `lint|typecheck|test|build`는 모든 기능 leaf를 포함한다. `.github/scripts/check-platform-turbo-scope.mjs`는 각 manifest에 존재하는 작업이 루트 그래프에 포함되는지, `@ap/ui#typecheck`가 유지되는지, 옛 이름·필터·재귀 집계가 없는지 검사한다(`--self-test`).

운영 도구의 집계는 `pnpm --filter @ap/platform-api-ops feature:build|feature:dev|feature:test|feature:typecheck`다. 정확한 네 패키지 필터를 사용하고 ops 자체는 집계 대상에서 제외하므로 루트 작업이 중첩 turbo를 실행하지 않는다. 기능 패키지의 `turbo.json`은 `^build` 의존을 유지한다. 루트 backend `test`는 `DATABASE_URL`, `DATABASE_URL_MIGRATE`, `WORKSPACE_ID`를 제거하고 `ALLOW_SKIPPED_INTEGRATION=1`로 비DB suite를 돌린다. 실제 통합은 opt-out 없는 별도 `test:integration`과 폐기 가능한 DB가 필요하다.

`ci.yml`이 정적·단위·통합 게이트를 함께 소유한다. 정적 Job은 루트 lint/typecheck/build와 추가 경계 fixture·통합 실행기 guard·migration drift·FE typecheck를, test Job은 루트 단위 suite를, 통합 Job은 Postgres16+pgvector의 격리 DB에서 backend 적합성까지 검사한다. 필수 `Platform workspace (pnpm monorepo)`는 세 결과가 성공해야 통과한다(의도한 docs-only 통합 생략 제외). classifier 오류는 전체 검사로 간다. E2E 선택·필수 상태명·main push만 cache 저장하는 정책은 유지한다.

`platform-api`·`feature-shared`·`feature-ui`·`feature-screens`는 패키지 `lint`(ESLint 전체 소스, #1102 a·b)를 루트 lint가 turbo로 돌린다. 루트 lint의 ops leaf는 경계 검사와 변경 파일 Biome allowlist(docs·ops 범위만)를 사용한다. `FEATURE_LINT_BASE`(기본 `origin/main`)와 전체 이력이 필요하며 기준 계산 실패는 실패로 끝난다. PR은 base SHA, push는 before SHA, 수동 실행은 `HEAD^`를 기준으로 제공한다. 비교 기준이 turbo 입력 해시에 없으므로 ops lint는 캐시하지 않는다. 전체 Biome `lint:all`·`format`도 같은 잔여 범위(docs·ops)만 본다. Oxlint 디자인 패스는 없다. 대응 규칙표: [platform-packages §6](platform-packages.md#6-경계-강제와-도구). `gate.sh static --base <ref>`, `unit`, `integration`은 명시적 운영 진입점이며 CI는 루트가 이미 증명하는 suite를 중복 실행하지 않고 `static-extra`만 추가한다.

mock build의 lazy 검사와 SDK 산출물 검사를 먼저 끝낸 뒤 DB-free `build:real-prod` 성공 경로를 실행한다. 강제 mock graph/build 실패 guard도 유지한다. 같은 dist를 쓰므로 이 순서를 바꾸지 않는다.

## 디자인 시스템 이전 기록 (#441, ADR-0046)

- 출처: FeedbackOps `packages/ui` 커밋 `a8d768b8`(`origin/develop`, 2026-10-19). 값·클래스 문자열은 그대로 옮겼다. FeedbackOps 루트의 `patchedDependencies`(`@formkit/auto-animate@0.10.0`)도 함께 가져왔다(`patches/`, `pnpm-workspace.yaml`). FeedbackOps 쪽 사본은 #642에서 지웠다.
- 옮긴 것(1묶음, `packages/sdk/ui/src/`): `styles/`(tokens·semantic·theme·compat + 소비 계약·토큰 충실도·대비 테스트), `utils/`(cn·motion·toast-target·useListMotion), `internal/useHorizontalOverflow`, `components/`(Button·KeyboardShortcut·SkeletonBlocks·SkeletonRows), `components/shadcn/` 22개(alert-dialog·alert·avatar·badge·button·card·checkbox·combobox·dialog·dropdown-menu·hover-card·input·label·popover·radio-group·select·sheet·skeleton·tabs·textarea·toggle-group·tooltip)와 그 테스트. 플랫폼 확장 CSS는 `platform-tokens.css`로 이름을 바꿨다(옛 `tokens.css`).
- 2묶음(#442, `packages/sdk/ui/src/`): `layout/`(ListShell·PageShell·ShellHeader·ToolbarKicker·WorkbenchShell, `useDetailPanelSlot`은 플랫폼 슬롯의 `layout/useDetailPanelContent`로 대체 — [ADR-0047](../adr/0047-detail-panel-slot-single-registrant-model.md)), `panel/`, `toolbar/`, `forms/`, `feedback/`과 그 테스트, 그리고 `DetailPanelHeader`가 쓰는 `badges/StatusBadgeFrame.tsx` 한 개. oxlint 주석은 `eslint-disable-next-line … -- 이유`로 바꿨다.
- 3묶음(#443, `packages/sdk/ui/src/`)에서 `badges/`(나머지 전부)·`data/`·`entity/`·`identity/`·`indicators/`·`permissions/`·`rich-content/`와 `components/{ChipPicker,ManagedSystemPicker,AnalyticsAreaPicker}`를 옮겨 당시 전체 이전을 끝냈다. ADR-0050/#479는 도메인 결합 배지(`StatusBadgeFrame` 제외)·`entity/LinkedEntityTrail`·pickers·`rich-content/`와 전용 테스트를 SDK에서 되돌리고 allowlist 사본 parity test와 turbo 입력을 제거했다. SDK에는 `data/ObjectRow`·`identity/{UserAvatar,UserChip}`·`indicators/{ProgressMeter,SeverityIndicator}`·`permissions/PermissionBlockedPanel`이 남고, `StatusBadgeFrame`은 #442부터 유지한다. 패키지 수준 `shells` 테스트도 남는다. FeedbackOps에만 남는 파일은 `components.json`과 FeedbackOps `AGENTS.md`다. rich-content는 ADR-0052/#483에서 SDK에 복원했다(allowlist 사본 parity test 포함).
- 이후 FeedbackOps의 `@ap/feature-ui`는 FeedbackOps에 그대로 남고, 이전된 묶음의 모양 변경은 `@ap/ui`에서 먼저 한다. FeedbackOps가 SDK를 쓰는 전환 시점 = #443 완료 + 배포 경로 확정(#151).

## 개발 및 에이전트 진입점

- 플랫폼 설계: 저장소 루트에서 시작하고 `AGENTS.md` → `docs/INDEX.md`를 읽는다.
- 기능 도메인 탐색: `docs/INDEX.md` → `docs/agents/feature-implementation.md` → 해당 소유 계약을 읽는다.
- FeedbackOps 기능 개발: 이 저장소에서 브랜치를 만들어 `apps/{platform-api,feature-screens}`·`packages/feature-*`와 해당 플랫폼 소유 문서를 고친다(루트 `AGENTS.md`).
- 패키지 설치·개발·검사는 저장소 루트 workspace에서 실행한다. 코어 서버·기능 화면·운영 도구도 같은 lockfile을 쓴다. 기능 도메인별 세부 검증은 해당 앱 AGENTS와 `docs/agents/feature-implementation.md`를 따른다.
- DB 통합 테스트는 초기화·재시드 동작이 있으므로 기존 데이터를 가진 DB에 실행하지 않는다.

## FeedbackOps 통합 방식 (Decided, 2026-09-26)

> **2026-10-21: FeedbackOps는 플랫폼에 합친다([ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), [합류 설계](feedbackops-merge-design.md)).** 아래 1·2단계는 합류 단계 4까지의 전환 규칙으로만 유효하다. 서브모듈은 합류 단계 1a(#592)에서 일반 디렉터리가 됐다.

FeedbackOps는 플랫폼의 **공통 협업 서비스**다. 모두가 쓰는 기능은 플랫폼 메뉴와 레일에, 관리자·개발자 화면은 운영 콘솔에 배치하며 독립 앱은 은퇴한다([ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), [ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md)). 업무 시스템과 Managed System의 관계는 [ADR-0068](../adr/0068-permission-scope-and-business-system-link.md), 단계와 현재 상태는 [합류 설계](feedbackops-merge-design.md)를 따른다.

**Milestone:** 정의와 구현 상태는 기능 도메인 계약이 소유하며(`docs/product/features/06-task-project-system.md` FR-TASK-004), 플랫폼 쪽에서 별도 마일스톤 기능을 만들지 않는다.

## 다음 설계에서 확정할 항목

Scope와 Managed System의 관계, 권한 검증 책임, 메뉴·URL·Context 계약, 감사·알림 계약, 실행·배포 단위를 결정한다. 그 결과를 바탕으로 공통 코드 추출과 FeedbackOps 도구 통일 여부를 정한다. 답이 필요한 질문과 미결 범위는 [`.planning/README.md`](../../.planning/README.md)에 있다.
