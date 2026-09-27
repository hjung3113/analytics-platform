# Handoff — 2026-09-27 다음 세션: #37 적재 워커 스키마 초안 → M3 #60

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md) "작업 관리"·"화면/UI 설계":
  - 작업은 이슈에서 시작하고, PR에 `Closes #n`을 적는다.
  - 무엇이 확정되면 공통화 판단·문서 갱신·로드맵 갱신을 확인한다. PR 템플릿과 CI `PR checklist`가 강제한다.
  - UI 변경은 인터랙티브 프로토타입으로 사용자 컨펌을 받은 뒤 구현한다.
- MVP는 데스크톱 웹만 지원한다(05 Decided). 메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다.

## 현재 상태

- **M1(플랫폼 기능 기반) 완료, 마일스톤 닫힘.** #41 공간 층, #42·#43 운영 콘솔(Registry 조회·활용률 계측), #44 계약 E2E, #45 화면 상태 page key, #46 목적지 단건 조회 포트, #47 mock 메뉴 권한, #48 ECharts 분할.
- 틈틈이 목록 중 #57(`@types/node`), #58(CSS selector CI), #61(FeedbackOps 딥링크 계약), #71(gen-menu 테스트 타임아웃) 완료.
- CI: `Platform workspace`·`Platform contracts (E2E)`(31개)·`CSS selectors (build diff)`(별도 워크플로)·Unit A–C·Python codec·`PR checklist`.
- **디자인 트랙(M2)은 보류:** FeedbackOps 디자인 개선이 확정된 뒤 재개한다. 재개 방향과 프로토타입 브랜치(`hjung3113/prototype-design-direction`)는 #52 코멘트.

## 다음 세션 할 일 (순서대로)

1. **#37 적재 워커 상태 스키마 초안.** 플랫폼이 초안을 쓰고, 합의는 파서 담당이 한다. 이 이슈는 초안 문서까지다.
   - 범위: 운영 콘솔 모니터링·트레이스와 사용자용 가공 상태 조회(06 §19, 01 가공 상태 보고)에 필요한 상태 필드, 원인 분류, 보존 기간, `context_recognized_parser` 변경 범위.
   - 합의 전 모니터링 화면(#51)은 설계까지만 한다.
2. **M3 #60 분석 공간의 내 VOC·설문 이력 읽기 전용 조회.** 선행 #40·#41은 끝났다.
   - 어댑터 포트 + 화면. 쓰기는 딥링크로만 한다(`docs/integration/feedbackops-deeplink.md`, `@ap/contracts`의 `buildFeedbackOpsLink`).
   - FeedbackOps origin은 앱 설정에서 주입한다(`VITE_FEEDBACKOPS_ORIGIN`). 지금은 codec만 있고 연결은 없다.
3. 운영 콘솔 #49(권한/역할)·#50(변경 감사)는 `ready-for-agent`지만 로드맵상 "마일스톤 밖(결정 대기)"이다. 착수 전에 로드맵 표와 이슈 선행 조건을 다시 확인한다.
4. **사람의 결정 대기 — 답이 나오기 전에는 거기에 기대는 구현을 하지 않는다.**
   - #75: 활용률 이벤트에 조회조건(필터 값)을 넣을지. 지금 v1은 식별 필드만 보낸다.
   - #81: FeedbackOps 딥링크 확장(Scope↔Managed System 매핑, 설문 제출 URL, VOC prefill, 복귀). phase-1은 FeedbackOps가 지금 받는 키만 보낸다.

## 결정 (2026-09-27 인터뷰로 확정)

- 인증: FeedbackOps 방식(AuthProvider — 개발 Mock + 운영 OIDC 계열, 서버 세션 쿠키, 백엔드 매 요청 재검증). 실제 IdP 사양만 사내 확인 대기.
- 운영 콘솔: '운영 콘솔 접근' 한 역할 → 권한 토큰 `console:access`(Candidate), mock은 `admin`만.
- 공간 필드: `space`는 그룹에 선언한다(메뉴 아님). 현재 공간은 라우트에서 유도하고 URL 키는 없다.
- FeedbackOps 1단계 쓰기: 원본 화면 딥링크.
- 적재 워커 스키마: 플랫폼이 초안(#37) → 파서 담당 협의.
- 시각 회귀: 지금은 빌드 CSS selector 비교 CI(#58 완료), 픽셀 비교는 디자인 확정 뒤.

자세한 내용은 [05 결정 상태](docs/05_roadmap_and_open_questions.md)와 로드맵 "사람의 결정" 표.

## 이번 세션에 생긴 플랫폼 계약 (다음 작업이 기대는 것)

- 서버 권한: mock `serve()`는 `permission`(읽는 데이터의 권한)이 필수이고 요청 시점 역할로 거부한다. 목적지 객체는 `useEntityQuery`(`adapter.getEntity`)로 읽고, 분석 Context를 쓰지 않는다.
- 화면 상태: manifest `pageKeys` + `setPage`로 다룬다. 표는 `urlState`(controlled)를 쓴다. Context가 바뀔 때 지울 키는 manifest `contextResetKeys`로 선언하며, Kernel이 같은 내비게이션 안에서 지운다(뒤로가기는 지우지 않음). 앱 README 7번.
- 공간: `createRegistry({ spaces, groups, menus })`, Kernel `accessibleSpaces`·`switchSpace`(전역 Context 유지, page 키 버림). 권한 없는 공간의 직접 URL은 `RouteOutlet`이 거부한다.
- 활용률: Kernel이 `adapter.recordUsage`(entry/dwell, 식별 필드만)로 보내고, 콘솔은 `usageSummary`로 읽는다. `platform:usage` localStorage는 없어졌다.
- ECharts는 `EChartImpl` lazy 청크다. 차트 인스턴스를 쓰는 동작은 `onReady` 이후에 다시 적용되고, 청크 로딩이 실패하면 차트 영역만 오류 상태로 바뀐다.

## 워커 오케스트레이션 (Orca)

- **역할과 모델(고정 — 사용자 요청 없이 바꾸지 않는다):**
  - 설계: Grok 4.7 high.
  - 구현: GLM 5.3 Flash max(`omp --model glm-5.3-flash --thinking max`, OpenRouter 금지).
  - 리뷰: Codex gpt-6-astra medium.
  - 조율·스펙·검증·문서·PR: coordinator.
  - 작업은 하나씩 작게 나눈다. 같은 구현 터미널에 다음 단계를 이어 dispatch하고, 단계마다 로컬 커밋한다.
  - 원인과 해법이 분명한 작은 기술 작업(#48·#57·#58·#71)은 coordinator가 스펙을 쓰고 설계 워커를 생략했다.
- **표준 흐름:** `orca terminal create --command '<CLI>'` → `run-create` → `task-create` → `dispatch --inject` → 결과가 오면 `--ack` → `worker-release` → `terminal close`.
- **Codex(Astra):** 주입된 프롬프트가 입력창에 남는 경우가 잦다. dispatch 뒤 `tui-idle`을 기다려 `terminal send --enter`를 한 번 보내고 "Working"을 확인한다.
- **Grok:** `--reasoning-effort`를 무시하므로 띄운 뒤 `/effort high`를 보낸다. `/effort` 직후 `dispatch --inject`한 과제는 자주 사라진다. 이때는 과제 원문을 `terminal send`로 직접 보내고, 완료는 **설계 파일이 생기고 TUI가 idle인지**로 판정한다. 이렇게 시작하면 dispatch capability가 없어 heartbeat·`worker_done`이 "Rejected"로 오니, 그 dispatch는 `worker-abandon`으로 정리한다. **Grok 주간 한도가 8% 남았다(2026-09-27).** 떨어지면 사용자에게 대체 설계 모델을 묻는다.
- **대기:** 다른 세션의 `check --wait`가 Run의 waiter를 잡고 있으면 `waiter_exists`가 난다. 그때는 non-blocking `check`를 Monitor 루프로 30초마다 돌린다. `--types`는 heartbeat를 거르지 못하므로 heartbeat는 자동 ack하고, 실제 메시지(`worker_done`·질문·Rejected)만 깨운다.
- **정리:** 끝난 탭은 바로 닫는다(`terminal create`로 연 탭은 release 후에도 남음). 병합된 브랜치는 `--delete-branch`로 지운다.

## 운영 사항

- **새 메뉴 그룹:** `GroupId`·`GROUPS`(행에 `space` 포함, 06 §9.1)에 사람이 추가 → `pnpm gen:menu <group> --label-ko … --label-en …` → `pnpm install`. 생성기 변경은 깨끗한 트리(커밋 후)에서 `node tooling/gen-menu/scripts/probe.ts`로 확인.
- **검증:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, Kernel·셸·공통 컴포넌트·mock을 바꿨으면 `pnpm e2e`(보고: `apps/platform-e2e/contract-report/README.md`). 캐시 없이는 `pnpm exec turbo run lint typecheck test --force`. 로컬 E2E는 `PLAYWRIGHT_BROWSERS_PATH=$PWD/prototypes/kernel-platform-table/.browsers`.
- **리뷰 지적 수정:** 수정마다 수정 전 코드에서 실패하는 회귀 테스트를 붙인다. 테스트가 약하다는 지적은 기능을 일부러 망가뜨려 보는 변이 검사로 확인한다.
- **dev 서버 누수:** vite가 `node …/vite.js`로 떠서 `pkill -f "vite --host"`에 안 걸린다. 끝나면 `lsof -tiTCP:5173-5180,4190 -sTCP:LISTEN | xargs kill`.
- **스택 PR:** 기반 PR을 `--delete-branch`로 병합하면 위 PR이 닫힌다. 기반은 브랜치 유지로 병합 → `gh pr edit <n> --base main` → `origin/main` 병합 후 push.
- **Tailwind v4:** 앱 밖 패키지는 `styles.css`의 `@source` + 앱 `style.css` import. 빌드 CSS selector 집합은 `css-selectors` 워크플로가 PR head와 merge-base를 비교한다. 제거가 있으면 실패하고, 의도된 제거는 `css-removal-ok` 라벨로 통과시킨다.
- **알려진 잔여:** gen-menu `--remove`의 EBUSY 재시도 경로(P2), 문법 기반 lint의 한계(platform-packages §6), `"none"` 문자열 EquipmentID 구분 불가(Unit A), 성공 응답 `trust.source`가 설비 단건에서도 `mart.productivity_hourly`(#46 결정, 필요 시 별도 이슈).
- CI: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26. 그 무렵 CI가 깨지면 먼저 확인.

## 보존할 경계

- Decided는 구현 완료가 아니다. 확인 필요 항목을 임의로 결정하지 않는다(Decided를 좁히는 결정은 `ready-for-human` 이슈로).
- FeedbackOps 코드는 플랫폼 계약에 맞춰 소급 수정하지 않는다(서브모듈 gitlink `6a0c7f8`). 필요한 변경은 #81처럼 요구사항으로 적는다.
- 역사 기록(`reports/`, `docs/reviews/`, `.agents/reports/`)은 덮어쓰지 않는다.

이전 HANDOFF 내용은 `git log -p HANDOFF.md`.
