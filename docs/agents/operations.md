# 에이전트 운영 메모

여러 세션에서 실제로 부딪힌 함정과 우회법이다. 규칙이 아니라 참고다 — 작업 규칙은 루트 [`AGENTS.md`](../../AGENTS.md), 남은 일은 [`.planning/README.md`](../../.planning/README.md).

## 작업자(codex) 샌드박스

`codex … -s workspace-write`로 띄운 작업자는 다음을 못 한다. 코디네이터가 대신한다.

| 못 하는 것 | 대신 |
| --- | --- |
| 네트워크(`gh`, 패키지 레지스트리) | 이슈 본문을 `.review/<n>-issue.md` 같은 파일로 넣어 준다. lockfile이 바뀌는 설치는 코디네이터가 먼저 한다 |
| 워크트리 밖 `.git` 쓰기 → 커밋 | 코디네이터가 커밋한다 |
| 포트 열기 → dev 서버·E2E·화면 캡처 | 코디네이터가 Playwright로 돌린다 |
| `.agents/` 쓰기 | 코디네이터가 고친다 |

- 작업자에게는 `pnpm --config.verify-deps-before-run=false --filter <pkg> run <script>`만 맡긴다. 작업자가 `.pnpm-store/`를 만들면 지운다.
- 작업자가 쓴 E2E는 실행해 보지 못하고 쓴 것이라 첫 실행에서 자주 깨진다(mock에 없는 값, primitive 기본값 추정, Radix 동작). 전체 E2E 전에 `cd apps/platform-e2e && pnpm exec playwright test -g "<describe 이름>"`으로 새 테스트만 먼저 돌린다.
- 테스트를 고치는 라운드에는 `pnpm --filter <pkg> typecheck`도 넣는다 — vitest는 타입을 보지 않는다.
- 스펙에 ADR 형식을 그대로 적어 준다(영어 예시를 주면 그대로 베낀다). 형식은 [`docs/adr/README.md`](../adr/README.md).
- 읽기 전용 리뷰어는 dispatch 없이 첫 프롬프트로 띄우는 게 간단하다: `orca terminal create --worktree path:<repo> --command "codex --model <m> -c model_reasoning_effort=<e> -s workspace-write -a never 'Read .review/<n>-review-spec.md and follow it exactly.'"` → 상태 표시줄에서 모델·effort 확인 → 보고서 파일의 끝 표시(sentinel)를 백그라운드로 기다린다. GitHub 상태가 필요하면 `gh` 결과를 `.review/`에 스냅샷으로 넣어 준다(샌드박스는 네트워크 없음).

## 메모리(16GB 머신)

- 작업자는 패키지 범위 검사만 한다. 루트 `pnpm test`/`build`/`e2e`는 코디네이터가 순서대로 한 번씩 돌린다(작업자가 테스트를 돌리는 중이면 `pnpm test --concurrency=2`).
- 작업자가 죽거나 Orca 런타임이 재시작되면 남은 vitest(부모 PID 1)를 찾아 정리한다: `pgrep -fl vitest`, `lsof -a -p <pid> -d cwd`.

## 새 worktree와 pnpm

- `orca worktree create --setup run|skip`은 의존성을 설치하지 않는다 → `git submodule update --init --depth 1 -q -- products/feedbackops && pnpm install --frozen-lockfile --config.optimistic-repeat-install=false`. 기본으로 생기는 셸 탭은 닫는다.
- pnpm 11은 설정(`pnpm-workspace.yaml`)만 바뀌면 "Already up to date"로 건너뛴다 → `pnpm install --config.optimistic-repeat-install=false`.
- 서브모듈 gitlink를 올리면 플랫폼 lockfile도 같은 PR에서 고친다([저장소 구조](../integration/repository-layout.md)). 루트 검사는 `@fops/*` 작업을 돌리지 않는다(가드 `.github/scripts/check-platform-turbo-scope.mjs`).

## git·PR

- 강제 push는 훅이 막는다. 이미 push한 브랜치가 main과 충돌하면 rebase 대신 `git merge origin/main`(rebase는 첫 push 전에만).
- 병렬 PR은 `05`·`06`·`DESIGN.md`·i18n 사전·E2E helper에서 자주 충돌한다 — 하나씩 병합하며 푼다.
- CSS selector CI: 의도한 클래스 제거는 PR에 `css-removal-ok` 라벨 + 이유 코멘트(라벨만 달아도 재평가된다).
- 앱 `src/style.css`의 `@import "tailwindcss"`는 소스를 지정하지 않아 Tailwind가 `apps/platform-web/` 아래 Markdown까지 훑는다. 문서에 `z-30`·`wide:pr-[32rem]` 같은 글자가 있으면 CSS가 생기므로, 그런 문서를 지우거나 고치면 CSS selector 비교가 "제거"로 실패할 수 있다(#220). 소스 코드에 그 클래스가 없는지 `git grep`으로 확인하고 `css-removal-ok`.
- PR 대기는 CI 완료(+시간 상한)로만 한다. 리뷰 봇은 새 커밋을 다시 리뷰하지 않을 수 있다. `Closes #n` 자동 닫힘이 늦으면 병합 뒤 한 번 확인하고 직접 닫는다.

## 브라우저 확인과 캡처

- 브라우저 확인은 `ego-browser`가 기본이다. 응답이 없으면(`ego-browser nodejs -e 'console.log(1)'`) `apps/platform-e2e`의 Playwright로 대체한다고 말한다.
- 캡처 스크립트는 `apps/platform-e2e` 아래에 두고 실행해야 `@playwright/test`를 찾는다(끝나면 지운다).
- dev 서버는 worktree마다 다른 포트: `pnpm exec vite --host 127.0.0.1 --port 517x --strictPort`. E2E는 4190을 쓴다.
- mock은 메모리 상태라 페이지를 새로 열 때마다 DevTools(응답 시나리오)를 다시 고른다. 역할은 localStorage `platform:role`.
- zsh에서 명령 목록을 반복 실행할 때는 `eval "$c"`(변수 단어 분리가 안 된다). Playwright `page.evaluate`에 함수 문자열을 넘길 때는 `` `(${fn})()` ``.

자주 쓰는 캡처 URL:

| 보고 싶은 것 | URL·조건 |
| --- | --- |
| 생산성 KPI | `kpi=cycleTime`(또는 `occupancy`·`dwell`·`throughput`) |
| Compare | 사이클타임 상세(생산성 개요는 manifest에서 Compare가 꺼져 있다) |
| 접근 디렉터리 | 관리자 역할로 `/admin/roles?v=1&focus=engineer` |
| 상세 패널 | `/equipment?v=1&scopeId=ICH&focus=ICH-PHOTO-0103` |
| 설비 Maker mock 값 | AMX / ASM / LRC / TEL |

## 생성기와 mock 등록

- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 `node tooling/gen-menu/scripts/probe.ts`.
- mock 등록은 `apps/platform-web/src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS` 하나다. params를 선언한 엔드포인트만 `src/server-conformance.test.ts`의 `PARAMS`에 표본을 넣는다(빠지면 테스트가 실패한다).
