# 저장소 구조와 FeedbackOps 연결

## 현재 단계

FeedbackOps 원본 개발을 유지하면서 동일 체크아웃에서 코드를 참고하고 플랫폼 설계를 구체화한다. 공통 계약과 책임 범위를 확정한 뒤 통합 구현을 시작한다. 플랫폼 프론트엔드는 루트 pnpm workspace다. 패키지 추출은 완료됐다([패키지 경계](platform-packages.md)). `products/feedbackops/packages/ui`와 `packages/shared`만 플랫폼 workspace에 포함하며, 앱·백엔드 등 나머지 FeedbackOps workspace와 서버·DB·배포 통합 여부는 아직 확정하지 않았다.

기존 플랫폼 문서는 링크와 소유권을 보존하기 위해 `docs/`에 유지한다. `docs/platform/` 이동이나 공통 코드 추출은 이번 연결에 포함하지 않는다.

## 폴더별 역할

| 경로 | 역할 |
| --- | --- |
| `docs/00_*.md` ~ `docs/13_*.md` | 기존 플랫폼 설계. 전역 계약은 `06_platform_ui_contract.md`가 소유 |
| `docs/adr/` | 결정 기록(ADR). 목록·형식은 `docs/adr/README.md` |
| `docs/integration/` | 저장소 연결 및 향후 통합 결정. 기존 제품 계약을 암묵적으로 덮어쓰지 않음 |
| `DESIGN.md`, `CONTEXT.md` | 플랫폼 디자인 방향, 도메인 용어 |
| `.planning/` | 남은 일·결정 대기(원본은 GitHub 이슈) |
| `.agents/` | 플랫폼 에이전트 스킬·참고자료·보고서 |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json` | 플랫폼 pnpm workspace 루트(`apps/*`, `packages/*`, `menus/*`, `tooling/*`)와 FeedbackOps `packages/ui`, `packages/shared` |
| `apps/platform-web/` | 플랫폼 앱(조립 지점, dev 도구) |
| `apps/platform-e2e/` | 플랫폼 계약 E2E(Playwright 블랙박스) |
| `packages/` | 플랫폼 패키지 `contracts`·`ui`·`kernel`·`components`·`shell`·`mock-server`·`server-conformance`(`@ap/*`). 경계는 [패키지 경계](platform-packages.md) |
| `menus/` | 메뉴 Consumer 패키지(`@ap/menu-<group>`) |
| `tooling/` | 공유 도구: tsconfig, eslint 경계 규칙, `gen-menu`, `css-selectors` |
| `prototypes/` | 통합 전 Kernel 단위 프로토타입(개별 npm 프로젝트, workspace 밖). 보존 |
| `products/feedbackops/` | FeedbackOps 원본 Git 저장소의 고정 커밋 |
| `products/feedbackops/apps/frontend/` | 기존 React 프론트엔드. `src/features/`에 업무 화면 구성 |
| `products/feedbackops/apps/backend/` | 기존 Fastify 백엔드. `src/modules/`에 업무 및 공통 기능 구현 |
| `products/feedbackops/packages/shared/` | FeedbackOps 프론트·백엔드 공유 계약. 아직 플랫폼 공통 계약은 아님 |
| `products/feedbackops/packages/ui/` | FeedbackOps UI 패키지. 플랫폼 채택 범위는 추후 결정 |
| `products/feedbackops/docs/` | FeedbackOps 설계·ADR·구현 계약·프로토타입 |
| `products/feedbackops/scripts/` | FeedbackOps 빌드 지원 및 검증 도구 |

FeedbackOps의 인증·권한·감사·VOC·Finding·Task 등은 기존 구현을 유지한다. 업무 모듈을 별도 앱으로 재분할하거나 플랫폼 공통 패키지로 승격하지 않았다.

## 원본 및 버전

- 원본: `https://github.com/hjung3113/FeedbackOps`
- 갱신 대상 브랜치: `develop`
- 최초 연결 커밋: `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`
- 실제 참조 버전의 기준: 부모 저장소의 gitlink. 위 최초 연결 커밋은 이력 정보다.

서브모듈은 원본 커밋을 참조한다. 원본의 미추적 파일·환경 변수·의존성 설치 디렉터리·로컬 데이터는 복사하지 않는다. 원본에서 계속 개발해도 부모 저장소의 참조 커밋은 자동으로 바뀌지 않는다.

## 초기화와 현재 버전 확인

부모 저장소 루트에서 실행한다.

```sh
git submodule update --init --recursive
git submodule status
git -C products/feedbackops status --short
git -C products/feedbackops log -1 --oneline
```

`update --init`은 부모 저장소에 기록된 커밋을 복원한다. 최신 원본을 가져오는 명령이 아니다. 기존 서브모듈 작업 내용이 있다면 먼저 확인하고 보존한다.

## 원본 변경을 반영하는 절차

원본 개발은 기존 FeedbackOps 체크아웃에서 진행한다. 이 저장소의 참조를 갱신할 때는 내부 작업 트리가 깨끗한지 확인하고, 아래 명령으로 원본 변경을 검토한다.

```sh
git -C products/feedbackops status --short
git -C products/feedbackops fetch origin
git -C products/feedbackops log --oneline HEAD..origin/develop
git -C products/feedbackops diff --stat HEAD origin/develop
```

반영할 커밋을 정한 뒤 해당 커밋으로 detached checkout하고, 부모 저장소에서 `git diff --submodule=log`로 변경을 검토한다. gitlink를 갱신하면 플랫폼 `pnpm-lock.yaml`도 같은 PR에서 다시 생성해야 한다. workspace package 내용이 바뀌므로 lockfile이 함께 바뀌지 않으면 CI의 `pnpm install --frozen-lockfile`이 실패한다. `git add products/feedbackops`는 부모 저장소의 참조 커밋만 스테이징한다. 커밋·푸시는 별도 작업 권한에 따른다. 단순 부모 저장소 `git pull`만으로 서브모듈 작업 트리 갱신까지 완료됐다고 가정하지 않는다.

## 개발 및 에이전트 진입점

- 플랫폼 설계: 저장소 루트에서 시작하고 `AGENTS.md` → `docs/INDEX.md`를 읽는다.
- FeedbackOps 탐색: `products/feedbackops/`에서 시작하고 그 안의 `AGENTS.md` → `README.md`를 읽는다.
- FeedbackOps 기능 개발: 기존 원본 체크아웃을 기본으로 사용한다. 참조용 서브모듈의 detached HEAD에서 바로 커밋하지 않는다.
- 개발 서버·패키지 설치·테스트는 FeedbackOps 앱·백엔드에서는 자체 workspace 설정을 기준으로 실행한다. 플랫폼 앱은 루트에서 `pnpm install` 후 `pnpm dev`/`pnpm test`로 실행하며, FeedbackOps `packages/ui`와 `packages/shared`만 공유한다.
- DB 통합 테스트는 초기화·재시드 동작이 있으므로 기존 데이터를 가진 DB에 실행하지 않는다.

## FeedbackOps 통합 방식 (Decided, 2026-09-26)

FeedbackOps는 플랫폼의 **공통 협업 서비스**가 된다 — 각 업무 공간 안의 VOC·Task·설문 진입과 권한자용 전체 협업 허브([06 §9.1](../06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26), [ADR-0026](../adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)). 단계적으로 통합한다.

1. **1단계 — 연결:** 원본 앱은 독립 실행을 유지한다. 공유 SSO·디자인 토큰, 서로의 Context를 넘기는 딥링크로 연결한다. 분석 공간의 사용자용 화면은 VOC 상태와 설문 응답 이력을 FeedbackOps API에서 **읽기 전용**으로 조회한다. **VOC 등록과 설문 응답 제출(쓰기)은 1단계에서 FeedbackOps 원본 화면으로 딥링크한다(Decided, 2026-09-27)** — 플랫폼 화면 안의 쓰기는 2단계 셸 편입 이후로 미룬다. 사용자에게 보이는 상태와 내부 처리 상태를 자동으로 연결하지 않는 FeedbackOps 원칙(ADR-0005)을 그대로 따른다.
2. **2단계 — 셸 편입:** 인증 프로토콜과 Scope↔Managed System 관계가 결정된 뒤 같은 셸 안의 협업 진입·전체 허브로 옮긴다. 이 결정 전에는 FeedbackOps 코드를 플랫폼 계약에 맞춰 소급 수정하지 않는다. **통합 깊이는 A — FeedbackOps 화면을 플랫폼 메뉴 패키지로 옮기고 FeedbackOps 백엔드는 도메인 API 서비스로 유지한다(Decided, 2026-10-04, [ADR-0018](../adr/0018-feedbackops-stage2-screens-into-platform-menus.md)).** 진행 계획은 [#213](https://github.com/hjung3113/analytics-platform/issues/213).

**Milestone:** 정의와 구현 상태는 FeedbackOps 저장소가 소유하며(`products/feedbackops/docs/design/06-task-project-system.md` FR-TASK-004), 플랫폼 쪽에서 별도 마일스톤 기능을 만들지 않는다.

## 다음 설계에서 확정할 항목

Scope와 Managed System의 관계, 권한 검증 책임, 메뉴·URL·Context 계약, 감사·알림 계약, 실행·배포 단위를 결정한다. 그 결과를 바탕으로 공통 코드 추출과 서브모듈의 정식 편입 여부를 정한다. 답이 필요한 질문과 미결 범위는 [`.planning/README.md`](../../.planning/README.md)에 있다.
