# 저장소 구조와 FeedbackOps 연결

## 현재 단계

FeedbackOps 원본 개발을 유지하면서 동일 체크아웃에서 코드를 참고하고 플랫폼 설계를 구체화한다. 공통 계약과 책임 범위를 확정한 뒤 통합 구현을 시작한다. 플랫폼 프론트엔드는 루트 pnpm workspace다. 패키지 추출은 완료됐다([패키지 경계](platform-packages.md)). FeedbackOps(`apps/fo-*`·`packages/fo-*`)는 루트 workspace의 일부다([ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). 서버·DB·배포 통합 여부는 아직 확정하지 않았다.

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
| `package.json`, `pnpm-workspace.yaml`, `turbo.json` | 플랫폼 pnpm workspace 루트(`apps/*`, `packages/*`, `menus/*/*`, `tooling/*`) |
| `apps/platform-web/` | 플랫폼 앱(조립 지점, dev 도구) |
| `apps/platform-e2e/` | 플랫폼 계약 E2E(Playwright 블랙박스) |
| `packages/` | 플랫폼 패키지 `contracts`·`ui`·`kernel`·`components`·`shell`·`mock-server`·`server-conformance`(`@ap/*`). 경계는 [패키지 경계](platform-packages.md) |
| `menus/` | 공간별 `menus/<space>/<group>/` 메뉴 Consumer 패키지(`@ap/menu-<group>`, 전역은 `_global`) |
| `tooling/` | 공유 도구: tsconfig, eslint 경계 규칙, `gen-menu`, `css-selectors` |
| `archive/` | 통합 전 Kernel 단위 프로토타입(개별 npm 프로젝트, workspace 밖). 보존 |
| `apps/fo-*`, `packages/fo-*`, `docs/feedbackops/` | FeedbackOps 앱·패키지·문서(루트 workspace의 일부, 이력 합류 `c73c55c5`, [ADR-0090](../adr/0090-repo-structure-by-branch.md)) |
| `apps/fo-frontend/` | 기존 React 프론트엔드. `src/features/`에 업무 화면 구성 |
| `apps/fo-backend/` | 기존 Fastify 백엔드. `src/modules/`에 업무 및 공통 기능 구현 |
| `packages/fo-shared/` | FeedbackOps 프론트·백엔드 공유 계약. 아직 플랫폼 공통 계약은 아님 |
| `packages/fo-ui/` | FeedbackOps UI 패키지(`@fops/ui`). `a8d768b8` 기준으로 전체가 `packages/ui`(`@ap/ui`)에 옮겨졌고(#441–#443) 이 사본은 FeedbackOps에 그대로 남는다 |
| `docs/feedbackops/` | FeedbackOps 설계·ADR·구현 계약·프로토타입 |
| `ops/feedbackops/` | FeedbackOps 루트 도구(워크스페이스 패키지 `@fops/ops`): 스크립트·게이트·compose·conductor, 앱·패키지 위치 지도 `paths.sh`/`paths.mjs`(713p1, [ADR-0090](../adr/0090-repo-structure-by-branch.md)) |

FeedbackOps의 인증·권한·감사·VOC·Finding·Task 등은 기존 구현을 유지한다. 업무 모듈을 별도 앱으로 재분할하거나 플랫폼 공통 패키지로 승격하지 않았다.

## 원본 및 버전

- FeedbackOps는 이 저장소의 일반 코드다(서브모듈 아님, [ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), #592). FeedbackOps `develop` `c73c55c5`의 이력을 그대로 합쳤다(디렉터리 내용은 그 커밋과 같다).
- 원본 저장소 `https://github.com/hjung3113/FeedbackOps`는 `c73c55c5`에서 동결되고 은퇴한다(#597). 이후 FeedbackOps 변경은 이 저장소의 PR(`feat/<n>-<slug>`, `main`)로만 한다.
- 도구는 통일했다(1b단계, #642): FeedbackOps는 루트 pnpm workspace의 일부이고 Node 26.7·pnpm 11·루트 `pnpm-lock.yaml`·루트 turbo를 쓰며 `@ap/ui`는 `workspace:*`로 받는다. 런타임 `dependencies`에 올 수 있는 플랫폼 패키지는 `@ap/ui` 하나다. 백엔드 테스트(실서버 적합성 #674)만 `@ap/server-conformance`·`@ap/http-adapter`·`@ap/contracts`를 `devDependencies`로 받는다([ADR-0073](../adr/0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md), `ops/feedbackops/scripts/check-boundaries.mjs` 규칙 11이 import와 `package.json`을 함께 검사). 린터는 FeedbackOps가 Biome를 계속 쓴다.

## 설치와 검증

설치는 저장소 루트에서 한 번(`pnpm install --frozen-lockfile`)이고 FeedbackOps도 거기서 설치된다. FeedbackOps 명령은 저장소 루트에서 실행한다(`bash ops/feedbackops/scripts/ci/gate.sh static|unit|integration`, `pnpm --filter @fops/ops typecheck`). CI는 `.github/workflows/feedbackops.yml`이고 `docs/feedbackops/**`·`apps/fo-*/**`·`packages/fo-*/**`·`ops/feedbackops/**`·`packages/ui/**`·루트 도구 파일이 바뀐 PR에서만 돈다.

루트 `lint|typecheck|test|build` 스크립트는 `--filter='!@fops/*'`로 FeedbackOps(도구 패키지 `@fops/ops` 포함)를 뺀다: FeedbackOps 게이트는 Postgres와 자체 검사가 필요해 `ops/feedbackops/scripts/ci/gate.sh`로 돈다. FeedbackOps의 turbo 작업(`gen:routes`, `test`·`typecheck`의 `dependsOn`)은 각 패키지의 `turbo.json`(`extends: ["//"]`)이 선언하고 `pnpm --filter @fops/ops build|dev|test|typecheck`가 `--filter='@fops/*' --filter='!@fops/ops'`로 돌린다. 가드 `.github/scripts/check-platform-turbo-scope.mjs`가 루트 작업 그래프에 `@fops/*`가 들어오지 않는지 확인한다. 의존 패키지 해시는 스크립트 없는 `transit` 태스크가 전파한다(#390).

## 디자인 시스템 이전 기록 (#441, ADR-0046)

- 출처: FeedbackOps `packages/ui` 커밋 `a8d768b8`(`origin/develop`, 2026-10-19). 값·클래스 문자열은 그대로 옮겼다. FeedbackOps 루트의 `patchedDependencies`(`@formkit/auto-animate@0.10.0`)도 함께 가져왔다(`patches/`, `pnpm-workspace.yaml`). FeedbackOps 쪽 사본은 #642에서 지웠다.
- 옮긴 것(1묶음, `packages/ui/src/`): `styles/`(tokens·semantic·theme·compat + 소비 계약·토큰 충실도·대비 테스트), `utils/`(cn·motion·toast-target·useListMotion), `internal/useHorizontalOverflow`, `components/`(Button·KeyboardShortcut·SkeletonBlocks·SkeletonRows), `components/shadcn/` 22개(alert-dialog·alert·avatar·badge·button·card·checkbox·combobox·dialog·dropdown-menu·hover-card·input·label·popover·radio-group·select·sheet·skeleton·tabs·textarea·toggle-group·tooltip)와 그 테스트. 플랫폼 확장 CSS는 `platform-tokens.css`로 이름을 바꿨다(옛 `tokens.css`).
- 2묶음(#442, `packages/ui/src/`): `layout/`(ListShell·PageShell·ShellHeader·ToolbarKicker·WorkbenchShell, `useDetailPanelSlot`은 플랫폼 슬롯의 `layout/useDetailPanelContent`로 대체 — [ADR-0047](../adr/0047-detail-panel-slot-single-registrant-model.md)), `panel/`, `toolbar/`, `forms/`, `feedback/`과 그 테스트, 그리고 `DetailPanelHeader`가 쓰는 `badges/StatusBadgeFrame.tsx` 한 개. oxlint 주석은 `eslint-disable-next-line … -- 이유`로 바꿨다.
- 3묶음(#443, `packages/ui/src/`)에서 `badges/`(나머지 전부)·`data/`·`entity/`·`identity/`·`indicators/`·`permissions/`·`rich-content/`와 `components/{ChipPicker,ManagedSystemPicker,AnalyticsAreaPicker}`를 옮겨 당시 전체 이전을 끝냈다. ADR-0050/#479는 도메인 결합 배지(`StatusBadgeFrame` 제외)·`entity/LinkedEntityTrail`·pickers·`rich-content/`와 전용 테스트를 SDK에서 되돌리고 allowlist 사본 parity test와 turbo 입력을 제거했다. SDK에는 `data/ObjectRow`·`identity/{UserAvatar,UserChip}`·`indicators/{ProgressMeter,SeverityIndicator}`·`permissions/PermissionBlockedPanel`이 남고, `StatusBadgeFrame`은 #442부터 유지한다. 패키지 수준 `shells` 테스트도 남는다. FeedbackOps에만 남는 파일은 `components.json`과 FeedbackOps `AGENTS.md`다. rich-content는 ADR-0052/#483에서 SDK에 복원했다(allowlist 사본 parity test 포함).
- 이후 FeedbackOps의 `@fops/ui`는 FeedbackOps에 그대로 남고, 이전된 묶음의 모양 변경은 `@ap/ui`에서 먼저 한다. FeedbackOps가 SDK를 쓰는 전환 시점 = #443 완료 + 배포 경로 확정(#151).

## 개발 및 에이전트 진입점

- 플랫폼 설계: 저장소 루트에서 시작하고 `AGENTS.md` → `docs/INDEX.md`를 읽는다.
- FeedbackOps 탐색: `docs/feedbackops/`에서 시작하고 그 안의 `AGENTS.md` → `README.md`를 읽는다.
- FeedbackOps 기능 개발: 이 저장소에서 브랜치를 만들어 `apps/fo-*`·`packages/fo-*`·`docs/feedbackops/`를 고친다(루트 `AGENTS.md`).
- 개발 서버·패키지 설치·테스트는 FeedbackOps 앱·백엔드에서는 자체 workspace 설정을 기준으로 실행한다. 플랫폼 앱은 루트에서 `pnpm install` 후 `pnpm dev`/`pnpm test`로 실행하며, FeedbackOps `packages/fo-ui`와 `packages/fo-shared`만 공유한다.
- DB 통합 테스트는 초기화·재시드 동작이 있으므로 기존 데이터를 가진 DB에 실행하지 않는다.

## FeedbackOps 통합 방식 (Decided, 2026-09-26)

> **2026-10-21: FeedbackOps는 플랫폼에 합친다([ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), [합류 설계](feedbackops-merge-design.md)).** 아래 1·2단계는 합류 단계 4까지의 전환 규칙으로만 유효하다. 서브모듈은 합류 단계 1a(#592)에서 일반 디렉터리가 됐다.

FeedbackOps는 플랫폼의 **공통 협업 서비스**다. 독립 앱으로 남고, 플랫폼은 각 업무 공간 안에 그 시스템으로 좁힌 진입 링크와 권한자용 전체 허브 링크를 둔다([ADR-0027](../adr/0027-feedbackops-stays-standalone-entry-links.md)([06 §9.1](../contract/kernel.md#91-워크스페이스-decided-2026-09-26), [ADR-0026](../adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)). 단계적으로 연결한다.

1. **1단계 — 연결:** 원본 앱은 독립 실행을 유지한다. 공유 SSO·디자인 토큰, 서로의 Context를 넘기는 딥링크로 연결한다. 분석 공간의 사용자용 화면은 VOC 상태와 설문 응답 이력을 FeedbackOps API에서 **읽기 전용**으로 조회한다. **VOC 등록과 설문 응답 제출(쓰기)은 1단계에서 FeedbackOps 원본 화면으로 딥링크한다(Decided, 2026-09-27)** — 플랫폼 화면 안의 쓰기는 두지 않는다(ADR-0027). 사용자에게 보이는 상태와 내부 처리 상태를 자동으로 연결하지 않는 FeedbackOps 원칙(ADR-0005)을 그대로 따른다.
2. **2단계 — 공간별 진입:** FeedbackOps 화면은 플랫폼으로 옮기지 않는다(**Decided, 2026-10-09, [ADR-0027](../adr/0027-feedbackops-stays-standalone-entry-links.md)**, ADR-0018의 화면 이전을 대체). 공간 → Managed System 매핑(#81)이 정해지면 각 공간 사이드바에 그 시스템으로 좁힌 진입(VOC 등록·VOC·Task·설문)과 권한자용 전체 허브 링크를 단다. 목록 진입과 허브 진입은 [딥링크 계약](feedbackops-deeplink.md)에 더한다. FeedbackOps 코드를 플랫폼 계약에 맞춰 소급 수정하지 않는다. 진행 계획은 [#213](https://github.com/hjung3113/analytics-platform/issues/213).

**Milestone:** 정의와 구현 상태는 FeedbackOps 저장소가 소유하며(`docs/feedbackops/design/06-task-project-system.md` FR-TASK-004), 플랫폼 쪽에서 별도 마일스톤 기능을 만들지 않는다.

## 다음 설계에서 확정할 항목

Scope와 Managed System의 관계, 권한 검증 책임, 메뉴·URL·Context 계약, 감사·알림 계약, 실행·배포 단위를 결정한다. 그 결과를 바탕으로 공통 코드 추출과 FeedbackOps 도구 통일 여부를 정한다. 답이 필요한 질문과 미결 범위는 [`.planning/README.md`](../../.planning/README.md)에 있다.
