# 저장소 구조와 FeedbackOps 연결

## 현재 단계

FeedbackOps 원본 개발을 유지하면서 동일 체크아웃에서 코드를 참고하고 플랫폼 설계를 구체화한다. 공통 계약과 책임 범위를 확정한 뒤 통합 구현을 시작한다. 단일 패키지 workspace·서버·DB·배포 여부는 아직 확정하지 않았다.

기존 플랫폼 문서는 링크와 소유권을 보존하기 위해 `docs/`에 유지한다. `docs/platform/` 이동이나 공통 코드 추출은 이번 연결에 포함하지 않는다.

## 폴더별 역할

| 경로 | 역할 |
| --- | --- |
| `docs/00_*.md` ~ `docs/07_*.md` | 기존 플랫폼 설계. 전역 계약은 `06_platform_ui_contract.md`가 소유 |
| `docs/integration/` | 저장소 연결 및 향후 통합 결정. 기존 제품 계약을 암묵적으로 덮어쓰지 않음 |
| `DESIGN.md`, `PLATFORM_REQUIREMENTS.md` | 기존 플랫폼 디자인 및 요구사항 자료 |
| `.agents/` | 플랫폼 에이전트 스킬·참고자료·보고서 |
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

반영할 커밋을 정한 뒤 해당 커밋으로 detached checkout하고, 부모 저장소에서 `git diff --submodule=log`로 변경을 검토한다. `git add products/feedbackops`는 부모 저장소의 참조 커밋만 스테이징한다. 커밋·푸시는 별도 작업 권한에 따른다. 단순 부모 저장소 `git pull`만으로 서브모듈 작업 트리 갱신까지 완료됐다고 가정하지 않는다.

## 개발 및 에이전트 진입점

- 플랫폼 설계: 저장소 루트에서 시작하고 `AGENTS.md` → `docs/INDEX.md`를 읽는다.
- FeedbackOps 탐색: `products/feedbackops/`에서 시작하고 그 안의 `AGENTS.md` → `README.md`를 읽는다.
- FeedbackOps 기능 개발: 기존 원본 체크아웃을 기본으로 사용한다. 참조용 서브모듈의 detached HEAD에서 바로 커밋하지 않는다.
- 개발 서버·패키지 설치·테스트는 FeedbackOps 디렉터리와 자체 workspace 설정을 기준으로 실행한다. 루트 통합 실행 명령은 아직 없다.
- DB 통합 테스트는 초기화·재시드 동작이 있으므로 기존 데이터를 가진 DB에 실행하지 않는다.

## FeedbackOps 통합 방식 (Decided, 2026-09-26)

FeedbackOps는 플랫폼의 **피드백 공간**([06 §9.1](../06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26))이 되며 단계적으로 통합한다.

1. **1단계 — 연결:** 원본 앱은 독립 실행을 유지한다. 공유 SSO·디자인 토큰, 서로의 Context를 넘기는 딥링크로 연결한다. 분석 공간의 사용자용 화면(내 VOC 등록·상태 확인, 설문 응답)은 FeedbackOps API를 읽기 전용으로 소비한다. 사용자에게 보이는 상태와 내부 처리 상태를 자동으로 연결하지 않는 FeedbackOps 원칙(ADR-0005)을 그대로 따른다.
2. **2단계 — 셸 편입:** 인증 프로토콜과 Scope↔Managed System 관계가 결정된 뒤 같은 셸 안의 피드백 공간으로 옮긴다. 이 결정 전에는 FeedbackOps 코드를 플랫폼 계약에 맞춰 소급 수정하지 않는다.

**Milestone:** FeedbackOps 설계에 이미 정의돼 있다(`products/feedbackops/docs/design/06-task-project-system.md` FR-TASK-004 — Finding에서 생성, Task 묶음, 상세에 하위 Task 간트 차트; 디자인 프로토타입 `docs/design-prototype/screen-milestone-gantt.jsx`, `screen-milestones.jsx`). 2026-09-26 기준 고정 커밋(`6a0c7f8`)에서는 **아직 구현되지 않았고** 백엔드에 `tasks.milestone_id`·`findings.linked_milestone_id` 자리만 있다. 구현은 FeedbackOps 원본 저장소에서 진행하며, 피드백 공간은 그 구현을 참조한다. 플랫폼 쪽에서 별도 마일스톤 기능을 만들지 않는다.

## 다음 설계에서 확정할 항목

인증·사용자 식별, Scope와 Managed System의 관계, 권한 검증 책임, 메뉴·URL·Context 계약, 셸과 업무 화면의 책임, UI 재사용 범위, 감사·알림 계약, 실행·배포 단위를 결정한다. 그 결과를 바탕으로 공통 코드 추출과 서브모듈의 정식 편입 여부를 정한다.
