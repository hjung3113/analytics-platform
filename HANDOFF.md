# Handoff — 2026-10-04 다음 세션: M2 후속 — 프로토타입 묶음(#207·#54·#55·#156), #56 범위 재정리

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- M2 디자인 시스템의 **본 구현은 끝났다**: FeedbackOps 토큰·셸 구조(ADR-0010·0011 — #192·#193·#194), DESIGN.md 개정(#53), 그룹 표시 플래그(#201), 차트 얇은 선 stroke B2(ADR-0012 — #203), 오른쪽 고정 상세 슬롯(ADR-0013 — #205). FeedbackOps 쪽 후속 #746–#750도 모두 병합됐다(#199로 반영, #210 진행 중).
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md). 보이는 모양이 바뀌면 실제 앱 위 `?variant=` 프로토타입 → 사용자 컨펌 → 구현. 메뉴 화면은 다듬지 않는다.
- 작업자(2026-10-04 사용자): 구현 **Luna max**(`codex --model gpt-6-luna -c model_reasoning_effort=max -s workspace-write -a never`), 복잡한 구현·프로토타입 **Sol 6.1 medium**. PR 리뷰 Opus 5.5 high, 보이는 UI는 Sol 6.1 xhigh UI/UX 리뷰 추가. GLM은 쓰지 않는다.

## 다음 세션 할 일 — 순서대로

1. **#210 마무리**(진행 중일 수 있다 — `git worktree list`·브랜치 `hjung3113/210-fops-labels` 확인): 서브모듈 `a777ad1b`, 플랫폼 label 별칭(`text-*-label`)을 FeedbackOps 원본 `text-text-*-label` 쌍으로. 리뷰 → PR.
2. **프로토타입 묶음** — 모두 보이는 변화라 한 브랜치에서 `?variant=`로 띄워 한 번에 컨펌받는다:
   - #207 차트 범례·선 표현(막대 범례 사각형, 생산성 P95 점선과 비교 시리즈 구분, `cat-amber` 비교 선 대비).
   - #54 공통 필터 바(PageFilterBar/FilterField) — 메뉴 3곳의 브라우저 기본 select 필터를 공통 부품으로.
   - #55 StateView 변형(위젯 compact / 페이지 배너).
   - #156 레이아웃 슬롯(Management `filter`/`table`/`drawer` — drawer는 #205 고정 슬롯, Analysis `kpi`/`chart`/`breakdown`). #54와 겹치는 Management `filter`는 함께 판단.
3. **#56 범위 재정리**: 셸 톤·활성 표시·언어/역할 위치는 #194에서 끝났다. 남은 것(Context 바 한 줄 요약, PlatformPage 도움말 슬롯)만 남기고 이슈를 고치거나, 다 끝났으면 닫는다.
4. **#59 디자인 토큰 공유(M3)**: #192·#193으로 플랫폼이 `@fops/ui` 토큰을 직접 쓰게 됐다. 남은 범위(FeedbackOps 앱이 플랫폼 확장 층을 쓸 일이 있는지)를 확인하고 닫거나 고친다. #86(실제 VOC 어댑터)의 선행이 풀리는지도 같이 본다.

### 그 밖에 남은 일

- **사용자 확인 대기**: ADR-0009(운영 조립 주입) Candidate 승인. #149 전송 형식 초안(질문은 문서 §10, 인프라 확인 항목은 사내 적용 가이드 §3.2).
- **사내에 물을 것(사람)**: #150 SSO 사양, #151 배포·인프라, #148 선언 원본, #149 합의. 질문 목록은 [사내 적용 가이드](docs/integration/in-house-rollout.md) §3. 답이 오면 해당 이슈와 05·원본 문서를 Decided로.
- 답이 다 오면 #154 실어댑터(`createAssembly`를 `CreateAssembly` 타입으로 구현해 `AP_PLATFORM_ASSEMBLY`로 꽂는다), #155 사내 FastAPI. #165 폴링·세대 재검증은 #149 합의 뒤.
- 에이전트 대기 중: #122(메뉴 조회 포트 사람 확인 게이트 — #100 §10 단계 7 — 뒤에만), #90(견본 메뉴 작업 — 낮은 우선순위).
- 표 행 복사(#174) 남은 실확인: 실제 엑셀·구글 시트 붙여넣기, Safari 클립보드, HTTP 경로 실브라우저.

### 작업 방식 메모

- **codex 작업자 샌드박스(workspace-write)**: 네트워크 없음(`gh`·레지스트리 불가 → 이슈 본문은 `.review/<n>-issue.md`로 넣어 준다), 워크트리 밖 `.git`에 못 써서 **커밋 불가**(코디네이터가 커밋), 포트를 못 열어 **dev 서버·E2E·캡처 불가**(코디네이터가 Playwright로), `.agents/`에 못 쓴다. lockfile이 바뀌는 설치는 코디네이터가 먼저 하고 작업자에게는 `pnpm --config.verify-deps-before-run=false --filter <pkg> run <script>`만. 작업자가 `.pnpm-store/`를 만들면 지운다.
- **강제 push는 훅이 막는다.** 이미 push한 브랜치가 main과 충돌하면 rebase 대신 `git merge origin/main`으로 푼다(rebase는 첫 push 전에만).
- pnpm 11은 설정(`pnpm-workspace.yaml`)만 바꾸면 "Already up to date"로 건너뛴다 → `pnpm install --config.optimistic-repeat-install=false`.
- 서브모듈 gitlink를 올리면 플랫폼 lockfile도 같은 PR에서(`repository-layout.md`). 루트 검사는 `@fops/*` 작업을 돌리지 않는다(가드 `.github/scripts/check-platform-turbo-scope.mjs`).
- 캡처 URL 함정: 생산성 KPI 키는 `kpi=cycleTime`(·`occupancy`·`dwell`·`throughput`), 접근 디렉터리는 관리자 역할로 `/admin/roles?v=1&focus=engineer`, 상세 패널은 `/equipment?v=1&scopeId=ICH&focus=ICH-PHOTO-0103`. 작업자 2명이 테스트를 돌릴 때 루트 테스트는 `pnpm test --concurrency=2`.

- 이 머신은 16GB다. 작업자에게는 패키지 범위 검사만(테스트를 고치는 라운드엔 `typecheck`도 — vitest는 타입을 보지 않는다), 루트 test/build/e2e는 코디네이터가 마지막에 한 번씩 순서대로. 작업자가 죽거나 Orca 런타임이 재시작되면 남은 vitest(부모 PID 1)를 확인해 정리한다.
- 커밋은 루트 검사가 **모두 0으로 끝났을 때만**(검사 결과로 커밋 단계를 막는다).
- 화면 동일성 증명: main과 워크트리 dev 서버를 다른 포트로 띄워 같은 URL·역할의 DOM을 Playwright로 비교한다.
- ego-browser가 응답하지 않으면(`ego-browser nodejs -e 'console.log(1)'`) `apps/platform-e2e`의 Playwright로 대체한다고 말한다.
- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 probe(`node tooling/gen-menu/scripts/probe.ts`). mock 등록은 `apps/platform-web/src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS` 하나 — params를 선언한 엔드포인트만 `server-conformance.test.ts`의 `PARAMS`에 표본.

## 사람·외부 결정 대기 — 답 전에는 거기에 기대는 구현을 하지 않는다

- #148 선언 원본, #149 전송 형식 합의, #150 SSO, #151 배포·인프라.
- #37 파서 담당 합의(스키마 초안) → 뒤에 #51 모니터링·트레이스.
- #75 활용률 이벤트에 조회조건을 넣을지, #91 전역 감사 room 권한, #98 역할 소속 원천(#150 답에 기댐 — 답 전에는 부여·회수 포트를 만들지 않는다).
- FeedbackOps: #81 딥링크 확장, #84(FeedbackOps#548 설문 응답 읽기 API), #85(FeedbackOps#549 신고자 딥링크), #86 실제 VOC 어댑터(#59 토큰 공유 뒤).
- 05 Open으로만 기록한 것: ECharts 렌더러(결정 SVG ↔ 코드 canvas), Router·Zustand 미채택 확정 여부.
