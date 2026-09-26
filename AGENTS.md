# AGENTS.md — analytics-platform

## 프로젝트 목적 (읽기 전 반드시 확인)

이 레포의 목적은 "설비관리·기준정보관리·생산성 분석·지표관리·공지·VOC 같은 메뉴들을 전부 만드는 것"이 아니다.

**목적은 그 메뉴들이 얹힐 플랫폼 자체를 만드는 것이다.** 플랫폼이 제공하는 것은 다섯 갈래로 고정한다 — 이 다섯 갈래 밖의 산출물(개별 메뉴 화면 자체)은 목적이 아니라 아래 갈래를 검증하는 수단일 뿐이다.

| 갈래 | 내용 | 원본 |
| --- | --- | --- |
| Kernel 기능 | Menu Registry, 전역 Context, 딥링크/URL 계약, 권한·Scope, Audit | `docs/06_platform_ui_contract.md` §4–6 |
| 공통 컴포넌트 | PlatformDataTable, DetailDrawer, AuditTimeline, DataTrustIndicator 등 | §13 Platform Component |
| 차트 계약 | Chart Frame + Zoom/Brush/Compare/Annotate 공통 Interaction | §16 |
| 레이아웃 | Overview/Analysis Workspace/Management/Catalog/Workflow 5개 Page Archetype | §12 |
| 메뉴간 연결 | Cross-menu Context Link, 목적지 ID와 분석 Context 분리 | §22 |

이 원칙의 authoritative 버전은 **`docs/06_platform_ui_contract.md`**다(Platform Kernel 책임 범위, Menu Extension Contract, Platform-first Definition of Done, Governance 체크리스트까지 상세히 정의돼 있음). 위 표는 에이전트가 매번 그 문서를 열지 않아도 되게 하는 요약이다 — 상세·최신 버전은 항상 `docs/06_platform_ui_contract.md`를 우선한다.

### 이게 실무에 미치는 영향

- 새 화면/메뉴를 설계·구현할 때, "Domain Done"(그 화면 요구사항이 동작하는가)보다 먼저 "Platform Done"(공통 계약 위에 올라가 있는가, 다른 메뉴와 Context가 연결되는가, 권한/Scope가 일관되는가)을 검증한다 — `docs/06_platform_ui_contract.md` §29.
- 화면별로 반복되는 패턴을 발견하면 그 화면에 국한해서 구현하지 말고 플랫폼 공통 컴포넌트/계약으로 추출할지 먼저 판단한다. 단, 실제 메뉴 2~3개에서 반복이 확인되기 전에 범용 프레임워크를 미리 만들지 않는다(Premature Platformization 금지, §24).
- **메뉴 화면은 위 다섯 갈래를 검증하는 Consumer일 뿐, 만드는 것 자체가 목적이 아니다.** 메뉴 화면(wireframe이든 구현이든)에 착수하기 전에 "이게 다섯 갈래 중 어디를 검증하는가"(어느 archetype, 어느 공통 컴포넌트, 어느 연결 기능)를 먼저 밝힌다. 그 검증이 끝나면 — 예: 목표한 archetype/컴포넌트를 한 번씩 확인했으면 — 다음 메뉴로 곧장 이어가지 않고 플랫폼 갈래 작업이나 사용자 확인으로 돌아간다. **메뉴 화면을 3개 이상 연속 제작하는 작업은 시작 전에 사용자에게 범위(왜 이 개수가 필요한지)를 확인한다.**
- 개별 메뉴 요구사항이 플랫폼 공통 계약(1급 딥링크 키, wall-clock 시간 계약, URL 보안 경계 원칙 등)과 충돌하면 개별 메뉴 쪽을 공통 계약에 맞추는 게 기본값이고, 공통 계약을 바꿔야 한다면 그건 플랫폼 레벨 결정으로 격상해서 다룬다.

## 문서

`docs/INDEX.md`부터 시작. 역할별 진입점과 **작업별 읽기 경로**(어떤 작업이면 어느 문서 → 어느 폴더 `AGENTS.md` → 어느 파일 순서로 볼지)가 정리돼 있다. 플랫폼/프론트엔드 작업은 `docs/06_platform_ui_contract.md`를 먼저 본다.

## 코드 작업 원칙

- 플랫폼 코드는 루트 pnpm workspace(`apps/*`, `packages/*`, `menus/*`, `tooling/*`)다. 루트에서 `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`(Node 26.7.0, pnpm 11.1.1).
- 의존 방향은 `contracts → ui/kernel → components → shell → apps`이며 역방향 import는 금지다. 원본은 `docs/integration/platform-packages.md` §3.
- Kernel·공통 컴포넌트·셸은 메뉴와 mock을 모른다. 메뉴 목록은 Registry로, 서버는 `PlatformAdapter`로 앱이 주입한다.
- 작업하는 폴더에 `AGENTS.md`가 있으면 그 폴더 규칙을 추가로 따른다. 폴더 지침은 루트를 좁힐 수 있지만 루트 원칙과 충돌하면 루트를 따른다.
- 변경마다 lint·typecheck·test·build를 돌리고, 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. 실행하지 않은 검증은 했다고 보고하지 않는다.
- PR은 한 단계씩 올리고 리뷰 코멘트를 반영한 뒤 병합한다. 리뷰 지적을 고칠 때는 수정 없이 실패하는 회귀 테스트를 함께 넣는다.

## 폴더별 지침

| 폴더 | 역할 |
| --- | --- |
| [`docs/`](docs/AGENTS.md) | 설계 계약 원본, 상태 표기·소유권 규칙 |
| [`apps/platform-web/`](apps/platform-web/AGENTS.md) | 조립 지점(GROUPS·Registry 조립, 어댑터 주입), mock 서버, dev 도구 |
| [`menus/`](menus/AGENTS.md) | 메뉴 Consumer 패키지(`@ap/menu-<group>`, 그룹별 manifest·화면) |
| [`packages/`](packages/AGENTS.md) | 플랫폼 패키지 공통 규칙과 의존 방향 → 각 패키지 `contracts`·`ui`·`kernel`·`components`·`shell`의 `AGENTS.md` |
| [`tooling/`](tooling/AGENTS.md) | 공유 tsconfig·경계 lint·메뉴 생성기(`pnpm gen:menu`) |
| [`prototypes/`](prototypes/AGENTS.md) | 통합 전 Kernel 단위 프로토타입(보존, 새 기능 금지) |
| [`products/feedbackops/`](products/feedbackops/AGENTS.md) | 독립 제품 서브모듈(아래 경계 참조) |

## FeedbackOps 서브모듈 경계

- `products/feedbackops/`는 원본 저장소의 특정 커밋을 참조하는 독립 제품이다. 현재는 참고·통합 설계 단계이며 플랫폼 계약 준수를 기존 FeedbackOps에 소급 강제하지 않는다.
- FeedbackOps 내부 작업은 해당 디렉터리의 `AGENTS.md`와 하위 지침·제품 계약을 따른다. 위 플랫폼 목적·UI 설계 절차와 루트 `.agents/` 자산은 플랫폼 작업에 적용하며 FeedbackOps 자체 규칙을 대체하지 않는다.
- 원본 기능 개발은 기존 FeedbackOps 저장소에서 계속한다. 서브모듈 내부 수정이나 참조 커밋 갱신은 요청된 범위에서만 수행한다. 통합 계약 충돌은 한쪽을 임의 수정하지 말고 명시적으로 결정한다.
- 원본 갱신·초기화 절차와 폴더별 소유권은 `docs/integration/repository-layout.md`를 참조한다.

## 화면/UI 설계

새 화면이나 UI 작업은 `.agents/skills/analysis-platform-wireframe/SKILL.md`부터 읽는다. 현재 설계 단계는 Requirements → IA → Conceptual Contract / Screen Spec → Wireframe → Open Decisions에서 완료할 수 있다. Design System / Prototype / Visual Polish는 별도 구현 요청이 있을 때만 진행한다.

## 공통 에이전트 자산

- 지침 원본은 이 `AGENTS.md`와 폴더별 `AGENTS.md`다. 같은 폴더의 `CLAUDE.md`는 그 파일을 가리키는 상대 심링크다. 새 폴더 지침을 만들 때도 `ln -s AGENTS.md CLAUDE.md`로 연결한다.
- 스킬·명령·외부 디자인 참고자료 원본은 `.agents/skills`, `.agents/commands`, `.agents/references`다. 에이전트별 경로의 심링크 대신 원본을 편집한다.
- 모든 에이전트는 필요한 `SKILL.md`만 읽고, 도구 이름은 현재 세션에서 제공되는 동등 도구로 대응한다. 없는 도구·비밀키·외부 서비스는 사용할 수 있다고 가정하지 않는다.
- 탐색 경로와 실행 방법은 `.agents/README.md`를 참조한다. 외부 디자인 참고자료와 범용 스킬은 제품 계약을 덮어쓰지 않는다.
