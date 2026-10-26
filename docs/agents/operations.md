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
- 이슈 하나를 작업자에게 맡기는 전체 절차는 전역 `issue-wave-conductor` 스킬이고, 이 레포의 부분은 [conductor profile](../../.agents/conductor/PROFILE.md)과 설정 [`conductor.json`](../../.agents/conductor/conductor.json)이다. 공통 도구(`launch-worker`·`review-plan`·`worker-hygiene`·`wave-status`)와 구현 작업자·코드 리뷰어 규칙의 공통본은 전역 스킬(`~/.agents/skills/issue-wave-conductor/{scripts,templates}`)에 있고, 이 레포의 덧붙임은 [`.agents/conductor/addenda/`](../../.agents/conductor/addenda/)다(#394). 작업자에게는 둘을 합친 규칙이 worktree `.review/00-IMPL-RULES.md`로 간다.
- 작업자가 쓴 E2E는 실행해 보지 못하고 쓴 것이라 첫 실행에서 자주 깨진다(mock에 없는 값, primitive 기본값 추정, Radix 동작). E2E는 `cd apps/platform-e2e && pnpm exec playwright test -g "<describe 이름>"`으로 새 테스트만 먼저 돌린다.
- 테스트를 고치는 라운드에는 `pnpm --filter <pkg> typecheck`도 넣는다 — vitest는 타입을 보지 않는다.
- 스펙에 ADR 형식을 그대로 적어 준다(영어 예시를 주면 그대로 베낀다). 형식은 [`docs/adr/README.md`](../adr/README.md).
- 읽기 전용 리뷰어는 dispatch 없이 첫 프롬프트로 띄우는 게 간단하다: `orca terminal create --worktree path:<repo> --command "codex --model <m> -c model_reasoning_effort=<e> -s workspace-write -a never 'Read .review/<n>-review-spec.md and follow it exactly.'"` → 상태 표시줄에서 모델·effort 확인 → 보고서 파일의 끝 표시(sentinel)와 작업자 프로세스 종료를 함께 보는 `worker-wait.sh`를 백그라운드로 건다(sentinel만 기다리는 대기는 쓰지 않는다, LANES §기계 자원). GitHub 상태가 필요하면 `gh` 결과를 `.review/`에 스냅샷으로 넣어 준다(샌드박스는 네트워크 없음).

## 메모리(16GB 머신)

- vitest 워커 수는 환경 변수로 2개로 묶는다(`VITEST_MAX_WORKERS`·`VITEST_MAX_FORKS`·`VITEST_MAX_THREADS`=2, `VITEST_MIN_FORKS`·`VITEST_MIN_THREADS`=1 — 이 Mac은 `~/.zshenv`, 작업자 실행기는 `workerops.py`가 넣는다). 상한이 없으면 실행 하나가 CPU 수만큼(9개, 약 19GiB) jsdom 워커를 띄워 2026-10-14에 macOS가 프로세스를 강제 종료했다. 수를 바꾸려면 환경 변수를 준다 — 변수가 있으면 `--maxWorkers` 플래그는 무시되고, `pnpm run test -- --maxWorkers=2`처럼 `--` 뒤에 둔 플래그는 변수가 없어도 파일 필터가 되어 무시된다. 루트 `pnpm test`의 패키지 동시 실행은 루트 `turbo.json`의 `"concurrency": "2"`가 이미 2개로 묶는다(패키지 2개 × 워커 2) — 명령줄에 `--concurrency=2`를 따로 줄 필요가 없다(#166 이후 설정이 상한이고, 줘도 같은 값이라 무해하다, #945). turbo는 strict env 모드라 이 변수들을 `turbo.json` `globalPassThroughEnv`에 둔다(빠지면 루트 `pnpm test`에서 상한이 사라진다).
- 작업자는 패키지 범위 검사만 한다. 루트 `pnpm test`/`build`/`e2e`는 코디네이터가 순서대로 한 번씩 돌린다.
- 작업자가 죽거나 Orca 런타임이 재시작되면 남은 vitest(부모 PID 1)를 찾아 정리한다: `pgrep -fl vitest`, `lsof -a -p <pid> -d cwd`.
- 자기 검사를 멈출 때는 자기 프로세스만 끝낸다: 백그라운드 작업 ID나 `$!`, 또는 cwd가 자기 worktree인 PID(`lsof -a -p <pid> -d cwd`)만 끝낸다. `pkill -f "turbo run"`처럼 명령 이름으로 끝내면 같은 기계에서 도는 다른 세션의 검사도 함께 죽는다(2026-10-26).

## 새 worktree와 pnpm

- `orca worktree create --setup run|skip`은 의존성을 설치하지 않는다 → `pnpm install --frozen-lockfile --config.optimistic-repeat-install=false`. 기본으로 생기는 셸 탭은 닫는다.
- pnpm 11은 설정(`pnpm-workspace.yaml`)만 바뀌면 "Already up to date"로 건너뛴다 → `pnpm install --config.optimistic-repeat-install=false`.
- `products/feedbackops/`는 루트 workspace의 일부다(ADR-0066, #642): 루트 `pnpm install` 한 번이 FeedbackOps도 설치하고 lockfile은 하나다. 루트 `lint|typecheck|test|build`는 `--filter='!@fops/*' --filter='!feedbackops'`로 FeedbackOps를 뺀다([저장소 구조](../integration/repository-layout.md)). 가드 `.github/scripts/check-platform-turbo-scope.mjs`는 `@fops/*` 패키지가 루트 작업 그래프에 들어오지 않았는지 확인한다. 의존 패키지 해시는 스크립트 없는 `transit` 태스크가 전파하고(#390), `--only`는 의존 해시까지 지워 로컬 캐시가 CI를 못 따라가게 하므로(#388) 쓰지 않는다.

- 문서 링크 검사는 `node .github/scripts/check-doc-links.mjs`로 직접 돌려도 된다(`products/`는 검사에서 제외된다).

## macOS 셸(zsh·BSD)

공통 목록은 전역 작업자 규칙 `templates/impl-rules.md` 8번(`sed -i ''`, `\|` 없음, `head -n -N` 없음, zsh `$pipestatus`, 경로 변수 따옴표, 여러 줄·백틱 문구는 `<<'EOF'`)이다. 이 레포에서 따로 겪은 것:

- zsh는 따옴표 없는 변수를 단어로 나누지 않는다. `${T:+--terminal $T}`는 한 단어로 넘어가 `unrecognized arguments`가 된다 → `$( [ -n "$T" ] && echo --terminal "$T" )` 또는 배열.
- 한 호출 안의 명령 하나가 훅에 막히면 그 호출 전체가 실행되지 않는다. 남은 명령을 다시 돌린다.

## git·PR

- 강제 push는 훅이 막는다. 이미 push한 브랜치가 main과 충돌하면 rebase 대신 `git merge origin/main`(rebase는 첫 push 전에만).
- 병렬 PR은 `05`·`06`·`DESIGN.md`·i18n 사전·E2E helper에서 자주 충돌한다 — 하나씩 병합하며 푼다.
- CSS selector CI: 의도한 클래스 제거는 PR에 `css-removal-ok` 라벨 + 이유 코멘트(라벨만 달아도 재평가된다).
- 앱 `src/style.css`의 `@import "tailwindcss"`는 소스를 지정하지 않아 Tailwind가 `apps/platform-web/` 아래 Markdown까지 훑는다. 문서에 `z-30`·`wide:pr-[32rem]` 같은 글자가 있으면 CSS가 생기므로, 그런 문서를 지우거나 고치면 CSS selector 비교가 "제거"로 실패할 수 있다(#220). 소스 코드에 그 클래스가 없는지 `git grep`으로 확인하고 `css-removal-ok`.
- 브랜치를 한 커밋으로 합칠 때는 `git reset --soft $(git merge-base HEAD origin/main)`을 쓴다. worktree들은 `origin/*`를 함께 쓰므로, 다른 worktree의 fetch로 `origin/main`이 앞서 있으면 `reset --soft origin/main`이 그 사이 병합된 PR을 되돌리는 커밋을 만든다(2026-10-23 #676이 #664를 되돌릴 뻔함, CSS selector 비교가 잡음). 커밋 뒤 `git diff origin/main --stat`이 이 PR의 파일만 보이는지 확인한다.
- Tailwind는 테스트 파일의 문자열도 클래스로 읽는다(`'row-1'` → `.row-1`). 테스트 id·URL 값에 Tailwind 유틸리티 모양 문자열을 쓰지 않는다(CSS selector 비교가 "추가"로 실패).
- 주석 줄이 `// eslint-disable…`로 시작하면 설명문이어도 지시어로 읽힌다(규칙 이름 없음 오류). 그 단어로 줄을 시작하지 않는다.
- `gh pr checks <n> --watch --required`를 PR을 만든 직후에 돌리면 필수 검사가 아직 등록되지 않아 "no required checks reported"로 바로 끝난다(exit 1, 2026-10-23 #718). 1분쯤 뒤에 돌리거나, 끝난 뒤 `gh pr checks <n> --required` 출력에 필수 검사 두 개가 `pass`로 보이는지 확인하고 병합한다.
- PR 대기는 CI 완료(+시간 상한)로만 한다. 리뷰 봇은 새 커밋을 다시 리뷰하지 않을 수 있다. `Closes #n` 자동 닫힘이 늦으면 병합 뒤 한 번 확인하고 직접 닫는다.

## 브라우저 확인과 캡처

- 브라우저 확인은 `ego-browser`가 기본이다. 응답이 없으면(`ego-browser nodejs -e 'console.log(1)'`) `apps/platform-e2e`의 Playwright로 대체한다고 말한다.
- 캡처 스크립트는 `apps/platform-e2e` 아래에 두고 실행해야 `@playwright/test`를 찾는다(끝나면 지운다).
- dev 서버는 worktree마다 다른 포트: `pnpm exec vite --host 127.0.0.1 --port 517x --strictPort`. E2E는 기본 4190이고 동시에 돌릴 때는 `E2E_PORT`로 바꾼다(#809).
- mock은 메모리 상태라 페이지를 새로 열 때마다 DevTools(응답 시나리오)를 다시 고른다. 역할은 localStorage `platform:role`.
- zsh에서 명령 목록을 반복 실행할 때는 `eval "$c"`(변수 단어 분리가 안 된다). Playwright `page.evaluate`에 함수 문자열을 넘길 때는 `` `(${fn})()` ``.

자주 쓰는 캡처 URL:

| 보고 싶은 것 | URL·조건 |
| --- | --- |
| 생산성 KPI | `kpi=cycleTime`(또는 `occupancy`·`dwell`·`throughput`) |
| Compare | 사이클타임 상세(생산성 개요는 manifest에서 Compare가 꺼져 있다) |
| 접근 디렉터리 | 관리자 역할로 `/admin/roles?v=1&focus=engineer` |
| 상세 패널 | `/equipment?v=1&scopeId=MEM&focus=MEM-PHOTO-0103` |
| 설비 Maker mock 값 | AMX / ASM / LRC / TEL |

## 생성기와 mock 등록

- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 `node tooling/gen-menu/scripts/probe.ts`.
- mock 등록은 `apps/platform-web/src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS` 하나다. params를 선언한 엔드포인트만 `src/server-conformance.test.ts`의 `PARAMS`에 표본을 넣는다(빠지면 테스트가 실패한다).

## 부하에서만 실패하는 테스트

- 루트 `pnpm test`(터보 병렬)에서만 `Unable to find role …`로 실패하고 그 파일 단독 실행은 통과하면 첫 `findBy*`의 기본 대기(1000ms)를 먼저 의심한다. 진단 루프: 해당 패키지에서 CPU 부하(`while :; do :; done`을 `ncpu×2`개 백그라운드)를 걸고 그 파일을 8–16회 반복해 실패 수를 센다. 고치기 전후와, 원래 코드(변경을 되돌린 것)를 같은 부하로 비교해 변경이 원인인지 가른다. 부하 프로세스는 반드시 `pkill`로 끝낸다. `*.compact-action.test.tsx`는 첫 `findByRole`에 `{ timeout: 8000 }`을 쓴다(#434·#437).
- 한 파일을 고친 뒤 같은 구조의 형제 파일이 "안 깨진다"고 한 번 측정으로 단정하지 않는다. 형제마다 같은 부하 루프를 돈다(#437이 #434의 그 판단을 정정했다).
- 터보 `test`는 첫 실패에서 나머지를 중단한다. 실패 하나로 끝난 루트 `pnpm test`는 나머지 패키지와 `build`를 검증하지 못한 것이므로, 고친 뒤 처음부터 다시 돌린다.
- `node_modules`가 없는 worktree에서 `pnpm docs:links`는 의존성 확인에서 막힌다. `node .github/scripts/check-doc-links.mjs`를 직접 돌리면 같은 검사다(새 파일은 `git add -N`으로 추적에 올려야 "untracked" 오류가 사라진다).

## E2E 포트와 코드 이전 PR (SDK 이전 슬라이스, 2026-10-19)

- `pnpm e2e`의 서버는 기본 4190(`E2E_PORT`로 바꿈, base-path 설정은 `E2E_BASE_PATH_PORT` 기본 4191, #809)이고 `reuseExistingServer:false`다. 다른 세션의 E2E가 떠 있으면 `http://127.0.0.1:4190 is already used`로 바로 실패한다. 이 실패는 코드 문제가 아니다: `lsof -nP -iTCP:4190 -sTCP:LISTEN`으로 PID를 찾고 `lsof -a -p <PID> -d cwd`로 소유(cwd가 다른 checkout인지)를 확인하고, 남의 프로세스는 건드리지 말고 `E2E_PORT=4290 pnpm e2e`처럼 다른 포트로 돌린다.
- 소스를 옮겨 `@source`가 훑는 범위가 줄면 CSS selector 검사가 "N selector(s) removed"로 실패한다. 플랫폼 코드가 쓰는 클래스가 아니라 옮겨 간 쪽 전용 클래스인지 확인한 뒤 PR에 `css-removal-ok` 라벨을 단다(#450). 라벨 뒤에 `ship-pr.sh`가 예전 실패 기록 때문에 "CI failed"로 멈추면 현재 head의 검사가 모두 통과인지 `gh pr view --json statusCheckRollup`으로 확인하고 `gh pr merge --squash --match-head-commit <sha>`로 병합한다(엔진 이슈 conductor-engine#25).
- 옮기는 원본이 `patchedDependencies`나 floating 범위 의존을 쓰는지 먼저 본다. FeedbackOps `@formkit/auto-animate@0.10.0` 패치가 빠져 `useListMotion` 테스트가 실패했고(#450), `@tiptap/*` 하위 확장이 3.32.0으로 올라가 로드 오류가 났다(#455). 원본 락파일의 해석(`pnpm-lock.yaml`)과 맞춘다. pnpm 설정(`patchedDependencies`·`overrides`)을 바꾼 뒤 `pnpm install`이 `Already up to date`로 끝나면 `node_modules/.pnpm-workspace-state-v1.json`을 지우고 다시 설치한다.
