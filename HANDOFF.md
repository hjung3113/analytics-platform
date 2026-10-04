# Handoff — 2026-10-05 다음 세션: v0.1.0 릴리스 뒤 다음 슬라이스 — FeedbackOps 2단계(#213) 착수 범위 확인부터

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- **M2 디자인 시스템은 끝났고 main에 v0.1.0 태그·GitHub Release가 있다.** 2차 프로토타입 컨펌 4건(모두 B)이 병합됐다: 차트 범례(ADR-0014, #207), Context 바 우선순위 넘침(ADR-0015, #56), 공통 PageFilterBar(ADR-0016, #54), 같은 응답 위젯 배너(ADR-0017, #55).
- **FeedbackOps 2단계(피드백 공간 편입)는 방향이 정해졌다**: 통합 깊이 A — 화면을 플랫폼 메뉴 패키지로 옮기고 FeedbackOps 백엔드는 도메인 API로 유지([ADR-0018](docs/adr/0018-feedbackops-stage2-screens-into-platform-menus.md), 2026-10-04 사용자). 계획은 지도 이슈 [#213](https://github.com/hjung3113/analytics-platform/issues/213)과 ROADMAP M5.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md). 보이는 모양이 바뀌면 실제 앱 위 `?variant=` 프로토타입 → 사용자 컨펌 → 구현. 메뉴 화면은 다듬지 않는다.
- 작업자(2026-10-04 사용자): 구현 **Luna max**(`codex --model gpt-6-luna -c model_reasoning_effort=max -s workspace-write -a never`), 복잡한 구현·프로토타입 **Sol 6.1 medium**. PR 리뷰 Opus 5.5 high(`orca orchestration task-create` + `worker-start --agent claude --model claude-opus-5-5 --effort high`), 보이는 UI는 Sol 6.1 xhigh UI/UX 리뷰 추가. GLM은 쓰지 않는다.

## 다음 세션 할 일 — 순서대로

1. **다음 슬라이스를 사용자에게 확인한다.** 2026-10-04 사용자: "하던 일 마무리하고 main release한 후에 다음 슬라이스". 후보와 권장:
   - **(권장) FeedbackOps 2단계 착수(#213)** — 메뉴 화면을 여러 개 연속 옮기는 일이라 착수 전에 범위를 확인받는다(루트 AGENTS.md). 순서: 남은 결정을 `ready-for-human` 이슈로 나눔(Scope↔Managed System, 세션 공유 — #150 의존, 권한 매핑, 피드백 공간 메뉴 구성, 독립 앱 존속, 알림·감사 통합) → 결정 없이 가능한 플랫폼 선행 이슈화(메뉴 조회 포트 쓰기 계약, Workflow 레이아웃 06 §12, 셸 알림 슬롯) → 피드백 공간 셸 + 대표 화면 프로토타입.
   - 레이아웃 슬롯(#156): Management `filter`(이제 PageFilterBar)/`table`/`drawer`(고정 슬롯) · Analysis `kpi`/`chart`/`breakdown`. 프로토타입 컨펌 필요.
   - [결정] #218: 1440px에서 Context 바 기간 프리셋이 팝오버로 들어간다(적용 배지 폭). A 그대로 / B 적용 배지 생략 + 라벨 먼저 숨김 / C 프리셋 압축. 짧은 질문이라 위 둘과 같이 물어도 된다.

### 그 밖에 남은 일

- **M3 FeedbackOps 1단계 잔여**: #84(FeedbackOps#548 설문 응답 읽기 API), #85(FeedbackOps#549 신고자 딥링크), #81 딥링크 확장, #86 실제 VOC 어댑터(세션 토큰 공유 — #150 뒤).
- **사용자 확인 대기**: ADR-0009(운영 조립 주입) Candidate 승인. #149 전송 형식 초안(질문은 문서 §10, 인프라 확인 항목은 사내 적용 가이드 §3.2).
- **사내에 물을 것(사람)**: #150 SSO 사양, #151 배포·인프라, #148 선언 원본, #149 합의. 질문 목록은 [사내 적용 가이드](docs/integration/in-house-rollout.md) §3. 답이 오면 해당 이슈와 05·원본 문서를 Decided로.
- 답이 다 오면 #154 실어댑터(`createAssembly`를 `CreateAssembly` 타입으로 구현해 `AP_PLATFORM_ASSEMBLY`로 꽂는다), #155 사내 FastAPI. #165 폴링·세대 재검증은 #149 합의 뒤.
- 에이전트 대기 중: #122(메뉴 조회 포트 사람 확인 게이트 — #100 §10 단계 7 — 뒤에만), #90(견본 메뉴 작업 — 낮은 우선순위).
- 표 행 복사(#174) 남은 실확인: 실제 엑셀·구글 시트 붙여넣기, Safari 클립보드, HTTP 경로 실브라우저.

### 작업 방식 메모

- **codex 작업자 샌드박스(workspace-write)**: 네트워크 없음(`gh`·레지스트리 불가 → 이슈 본문은 `.review/<n>-issue.md`로 넣어 준다), 워크트리 밖 `.git`에 못 써서 **커밋 불가**(코디네이터가 커밋), 포트를 못 열어 **dev 서버·E2E·캡처 불가**(코디네이터가 Playwright로), `.agents/`에 못 쓴다. lockfile이 바뀌는 설치는 코디네이터가 먼저 하고 작업자에게는 `pnpm --config.verify-deps-before-run=false --filter <pkg> run <script>`만. 작업자가 `.pnpm-store/`를 만들면 지운다.
- **작업자가 쓴 e2e는 첫 실행에서 자주 깨진다**(실행해 보지 못하고 쓴다 — mock에 없는 값, primitive 기본값 추정, Radix 동작). 전체 e2e 전에 `cd apps/platform-e2e && pnpm exec playwright test -g "<describe 이름>"`으로 새 테스트만 먼저 돌린다.
- **스펙에 ADR 형식을 그대로 적어 준다**: 한국어 제목(접두어 없음), `상태: **Decided (YYYY-MM-DD)**.` + `- 결정자: 사용자 — …` 줄, `## 결정` / `## Considered Options`(`(B, 채택)`) / `## 결과`, 05 행에 이슈 링크. 영어 문구를 예로 주면 그대로 베낀다.
- **CSS selector CI**: 의도한 클래스 제거는 PR에 `css-removal-ok` 라벨 + 이유 코멘트(라벨만 달아도 재평가된다).
- **새 worktree**: `orca worktree create --setup run|skip`이 의존성을 설치하지 않는다 → `git submodule update --init --depth 1 -q -- products/feedbackops && pnpm install --frozen-lockfile --config.optimistic-repeat-install=false`. 기본으로 생기는 셸 탭은 닫는다.
- **강제 push는 훅이 막는다.** 이미 push한 브랜치가 main과 충돌하면 rebase 대신 `git merge origin/main`으로 푼다(rebase는 첫 push 전에만). 병렬 PR은 05·06·DESIGN.md·i18n·e2e helper에서 자주 충돌한다 — 하나씩 병합하며 푼다.
- zsh에서 명령 목록을 반복 실행할 때는 `eval "$c"`(변수 단어 분리가 안 된다). Playwright `page.evaluate`에 함수 문자열을 넘길 때는 `` `(${fn})()` ``.
- 캡처 스크립트는 `apps/platform-e2e` 아래에 두고 실행해야 `@playwright/test`를 찾는다(끝나면 지운다). dev 서버는 worktree마다 다른 포트(`pnpm exec vite --host 127.0.0.1 --port 517x --strictPort`). 시나리오는 mock 메모리 상태라 페이지를 새로 열 때마다 DevTools(응답 시나리오)를 다시 누른다. 역할은 localStorage `platform:role`.
- 캡처 URL 함정: 생산성 KPI 키는 `kpi=cycleTime`(·`occupancy`·`dwell`·`throughput`), 생산성 개요는 manifest Compare가 꺼져 있다(Compare는 사이클타임 상세), 접근 디렉터리는 관리자 역할로 `/admin/roles?v=1&focus=engineer`, 상세 패널은 `/equipment?v=1&scopeId=ICH&focus=ICH-PHOTO-0103`, 설비 Maker mock 값은 AMX/ASM/LRC/TEL.
- pnpm 11은 설정(`pnpm-workspace.yaml`)만 바꾸면 "Already up to date"로 건너뛴다 → `pnpm install --config.optimistic-repeat-install=false`. 서브모듈 gitlink를 올리면 플랫폼 lockfile도 같은 PR에서(`repository-layout.md`). 루트 검사는 `@fops/*` 작업을 돌리지 않는다(가드 `.github/scripts/check-platform-turbo-scope.mjs`).
- 이 머신은 16GB다. 작업자에게는 패키지 범위 검사만(테스트를 고치는 라운드엔 `typecheck`도 — vitest는 타입을 보지 않는다), 루트 test/build/e2e는 코디네이터가 순서대로 한 번씩(작업자가 테스트를 돌리는 중이면 `pnpm test --concurrency=2`). 작업자가 죽거나 Orca 런타임이 재시작되면 남은 vitest(부모 PID 1)를 정리한다.
- 커밋·push는 루트 검사가 **모두 0으로 끝났을 때만**.
- ego-browser가 응답하지 않으면(`ego-browser nodejs -e 'console.log(1)'`) `apps/platform-e2e`의 Playwright로 대체한다고 말한다(2026-10-04에도 무응답).
- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 probe(`node tooling/gen-menu/scripts/probe.ts`). mock 등록은 `apps/platform-web/src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS` 하나 — params를 선언한 엔드포인트만 `server-conformance.test.ts`의 `PARAMS`에 표본.

## 사람·외부 결정 대기 — 답 전에는 거기에 기대는 구현을 하지 않는다

- #218 Context 바 프리셋 노출(위 1번).
- #148 선언 원본, #149 전송 형식 합의, #150 SSO, #151 배포·인프라.
- #37 파서 담당 합의(스키마 초안) → 뒤에 #51 모니터링·트레이스.
- #75 활용률 이벤트에 조회조건을 넣을지, #91 전역 감사 room 권한, #98 역할 소속 원천(#150 답에 기댐 — 답 전에는 부여·회수 포트를 만들지 않는다).
- FeedbackOps 2단계의 남은 결정(#213 — 착수 때 이슈로 나눈다).
- 05 Open으로만 기록한 것: ECharts 렌더러(결정 SVG ↔ 코드 canvas), Router·Zustand 미채택 확정 여부.
