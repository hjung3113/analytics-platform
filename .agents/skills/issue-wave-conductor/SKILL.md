---
name: issue-wave-conductor
description: Conduct GitHub issues to merged main PRs, one issue = one branch = one PR, with Orca workers implementing (GLM by default, Grok for complex issues), role-split reviewers chosen per issue by trigger (code always; UX when the diff changes a screen; code quality once per slice) using the shared routing table, and the conductor verifying on the host. Covers brief writing, launch, waiting, host verification, previews, review, merge, slice close and cleanup. Use when the user says "진행해", "이슈 진행", "다음 이슈", "wave", or asks to work through a tracked issue set with workers. Ported from FeedbackOps (#255).
---

# Issue wave conductor (analytics-platform)

FeedbackOps의 `issue-wave-conductor`를 이 레포에 맞게 옮긴 것이다(#255). 코디네이터는 기계적 수정 말고는 제품 코드를 쓰지 않는다. 작업자가 구현하고, 리뷰어가 판정하고, 코디네이터가 검증·커밋·병합한다. 작업 규칙의 원본은 루트 `AGENTS.md`이고 이 스킬은 그 절차를 실행하는 방법이다. 둘이 다르면 `AGENTS.md`를 따른다.

FeedbackOps와 다른 점: PR 기준 브랜치는 `main` 하나(develop 없음), 병합은 squash, DB·로그인이 없다(mock 어댑터), 화면 증거는 Playwright E2E(`apps/platform-e2e`)와 mock 미리보기, 시각 기준 이미지·biome·nav-perf·임시 Postgres는 없다.

시작하기 전에 **이 세션에서** 병합 권한을 받았는지 확인한다. 없으면 PR을 열어 두고 병합은 사용자에게 맡긴다.

## 역할과 라우팅

모델·effort는 `~/.claude/skills/orca-dispatch-recipes/routing.tsv`가 원본이다. 세션에서 사용자가 바꾸면 `--model`/`--effort`로 넘기고 여기에 기본값을 복제하지 않는다. 공유 스크립트는 `~/.claude/skills/orca-dispatch-recipes/scripts/`의 `worker-launch.sh`·`worker-wait.sh`·`ship-pr.sh`다.

| 역할 | 하는 일 | 실행 |
| --- | --- | --- |
| `impl` | 일반 구현 | 이 스킬의 `scripts/launch-worker.sh`(worktree 준비 + 공유 실행기) |
| `impl-complex` | 복잡한 구현(아래 기준), 그리고 수정 자체가 어려운 수정 라운드 | `WORKER_ROLE=impl-complex scripts/launch-worker.sh`, 어려운 수정은 공유 `worker-launch.sh --role impl-complex` |
| `impl-mid` | 판단이 조금 필요한 작은 구현(아래 기준), 그런 수정 라운드 | `WORKER_ROLE=impl-mid scripts/launch-worker.sh`, 수정은 공유 `worker-launch.sh --role impl-mid` |
| `fix` | 모든 수정 라운드의 기본(복잡한 이슈도) | 공유 `worker-launch.sh --role fix` |
| `review-final` | 코드: 정확성·계약·테스트·diff 안의 아키텍처 | 규칙 `docs/agents/templates/review-rules.md` |
| `review-ux` | 실행 중인 앱의 디자인·UX | 에이전트 `.claude/agents/review-ux.md`(`--agent`) |
| `review-quality` | 슬라이스 전체의 코드 품질(11단계) | 에이전트 `.claude/agents/review-quality.md` |
| `review-check` | 중간 확인(blocker 수정이 리뷰어가 본 파일 밖으로 번졌을 때) | 별도 CHECK 이름 |

codex 역할은 Orca 터미널에서, claude 역할은 백그라운드 `claude -p`(프롬프트는 stdin, `.claude/agents/<role>.md`가 있으면 `--agent`)로, grok은 백그라운드 headless로 돈다. 보고서 sentinel만으로 끝났다고 보지 않는다. `worker-wait.sh`가 신선도·마지막 줄·프로세스 종료나 터미널 idle을 함께 본다. 끝난 작업자의 터미널은 바로 닫고 상태 JSON은 남긴다.

## 상태

- `WAVE_STATE`: 세션 scratchpad 아래 폴더. 작업자 상태 JSON(`W-<n>.json`, `W-<n>-FIX<k>.json`, `W-<n>-FINAL.json`, `W-<n>-UX.json`, `SLICE-<m>-QUALITY.json`)과 `preview-<label>.json`. 실행·대기마다 `--state-dir "$WAVE_STATE"`, 라운드마다 다른 이름·보고서.
- `WAVE_BRIEFS`: 브리프 폴더(예: `$AP_MAIN/.review/wave/`, `.review/`는 `.git/info/exclude`). `AP_MAIN`: 메인 체크아웃 경로.

## 슬라이스 시작

첫 브리프 전에 후보 이슈를 모두 읽고, 소유자만 정할 수 있는 결정(제품 동작, 문구 의미, 테스트 삭제, 범위)을 모은다. 한 번의 `AskUserQuestion`으로 추천안을 넣어 묻고 답을 이슈에 기록한다. 중간에 드러난 결정도 그 자리에서 모아 묻되, 물어볼 일이 없게 브리프를 쓰는 것이 목표다.

**가치 게이트**(사용자 결정 2026-10-10). 이슈가 슬라이스에 들기 전에, 그리고 지적을 fold하거나 이슈로 남기기 전에, 사용자 이득과 유지 비용(새 상태, 타이밍 우회, 소유 분산, 테스트 추가)을 저울질한다. 비용이 이득을 넘는 일은 하지 않는다. 치명 버그(틀린 데이터, 유출, 수행자가 일을 끝내지 못함)나 UX 이득이 확실히 더 크면 진행한다. 어느 쪽인지 브리프 첫 줄에 적는다.

**슬라이스 고르기.** 다음 슬라이스는 사용자 우선순위와 제품 백로그에서 고른다. 리뷰 후속을 모아 두었다가 **polish 슬라이스**로 처리한다(사용자가 요청하거나 한 영역에 여러 건 쌓였을 때). polish 슬라이스가 지나간 영역을 리뷰 지적만으로 다시 열지 않는다 — blocker나 사용자 요청만 근거다.

## 이슈마다

1. **브리프**(`$WAVE_BRIEFS/<n>-task.md`): 사실은 모두 현재 `origin/main`에서 다시 확인한다(경로, 줄 번호, 기존 헬퍼, 소유 계약 절). 이슈 글은 낡는다. 절은 *Facts (verified on main)* / *Do* / *Acceptance (tests)* / sentinel 줄. 재사용할 공통 부품, 지킬 계약(06 절·ADR), 범위 밖, 코디네이터 결정("final — do not re-litigate")을 적는다. 만질 곳의 과거 메모를 병합된 PR 본문에서 찾는다(`gh pr list --state merged --search '"Noted, not filed" <컴포넌트나 경로>'`) — 나온 것은 *Do*에 옮겨 적는다(아래 7f 규칙으로 fold된다). 같은 note가 두 번 보이면 이슈로 남긴다. 끝 줄은 `Sentinel (last line of .review/W-<n>-REPORT.md): <!-- W-<n>-DONE -->`. ADR 번호를 주기 전에 `bash tooling/scripts/next-adr.sh`와 열린 브랜치를 확인한다.
   **실행 전 자체 점검**(FeedbackOps에서 리뷰 라운드를 하나씩 잡아먹은 것들):
   - 존재하는 헬퍼·타입·컴포넌트만 적는다. 하나씩 `rg`로 확인한다. 없는 것을 "공통 X로"라고 쓰면 작업자가 지어낸다.
   - 계약 규칙(키 개수, 필수 여부, 순서)은 기억이 아니라 06·ADR·검증 코드(`registry.ts` 등)에서 복사한다.
   - 이벤트가 동작을 결정하면("닫으면 접힌다") 호출부가 쓰는 표현을 모두 `rg`로 찾는다(prop 없음 vs `null`).
   - DOM 소유를 옮기는 수정이면 그 요소를 찾는 E2E·단위 테스트 선택자 갱신을 명시한다(작업자는 E2E를 못 돌린다).
   - 브리프가 정한 회귀 테스트 순서를 코드에서 추적해 버그 분기에 닿는지 본다. 닿지 않으면 수정을 빼도 통과한다.
   - 클라이언트가 결정하는 계약의 통합 테스트는 프런트가 실제로 보내는 본문을 보낸다(호출부에서 확인).
   - Context 변경에 컴포넌트를 마운트한 채 두는 변경은 그 컴포넌트의 로컬 상태를 나열하고 각각의 수명을 정한다.
   - 이벤트를 기다리는 guard는 이벤트가 없는 경로의 유계 해제를 두고, 0이 아닌 origin에서 테스트한다.
   - 역할·test id·라벨을 지우는 브리프는 그것을 찾는 테스트 목록을 모두 적는다.
   - 보이는 모양이 바뀌는 일이면 컨펌된 `?variant=` 안을 스펙으로 적는다. 컨펌 전이면 구현하지 않고 시안부터(루트 `AGENTS.md`).
   **브리프 사전 점검.** `impl-complex`·`impl-mid` 브리프는 실행 전에 `templates/brief-check.md`로 검사한다. 브리프·템플릿·보고서 경로·sentinel(`<!-- W-<n>-BRIEFCHECK-DONE -->`)을 적은 `$WAVE_BRIEFS/<n>-BRIEFCHECK-TASK.md`를 `worker-launch.sh --role review-check --cwd "$AP_MAIN"`으로 띄운다(메인 체크아웃이 `origin/main`에서 깨끗할 때). Orca가 그 체크아웃을 거부하면 `--role impl-fallback --model gpt-6.1-sol --effort medium`(백그라운드, 터미널 없음). 지적을 브리프에 반영한 뒤 실행한다. 기계적 `impl` 브리프는 건너뛴다.
2. **실행**: `scripts/launch-worker.sh <n> <slug>`. 16GB 머신이라 동시에 1–2개, 파일이 겹치지 않는 이슈만 병렬로 한다(`docs/agents/operations.md` 메모리). 기본은 `impl`. 다음 중 하나면 **`WORKER_ROLE=impl-complex`**(모델·effort는 `routing.tsv` 역할; 사용자 결정 2026-10-08)다. 수정 라운드는 이슈가 복잡해도 기본 `--role fix`이고, 수정 자체가 어려울 때만 `impl-complex`다(사용자 결정 2026-10-09):
   - Kernel 계약과 그 소비자(컴포넌트·셸·메뉴)를 함께 바꾸거나, 패키지 세 곳 이상을 건드린다;
   - 권한·Scope·URL 보안 경계(`safeReturnTo`, 목적지 ID와 Context 분리), 데이터 누출 규칙을 건드린다;
   - 상태·순서 로직: 조회 수명주기(취소·세대·`ready` 게이트), history push/replace, Context 변경 시 page 키 정리;
   - 같은 이슈의 이전 라운드가 실패했거나 두 번째 수정 라운드가 필요했다.
   **판단이 조금 필요한 작은 이슈는 `impl-mid`로, 수정 라운드도 같다**: 한 부품의 동작 수정, 접근성·레이아웃 수정, 문서와 코드 대조처럼 브리프가 모든 줄을 못 적는 것이다(기계적 브리프는 `impl`).
   선택과 이유를 `W-<n>-VERIFY.md`에 적는다. `impl`이 quota로 멈추면(`worker-wait` exit 11) 같은 worktree에서 공유 `worker-launch.sh --role impl-luna`로 다시 띄우고, worktree에 부분 수정이 있다고 작업에 적는다.
3. **대기**: `worker-wait.sh --state "$WAVE_STATE/W-<n>.json" --timeout 3600 --poll 30`(여러 개면 `--state` 반복 + `--any`) — **항상 Bash 도구의 `run_in_background`로 띄운다**: 끝나면 하네스가 깨운다. foreground나 `until`·`sleep` 루프로 기다리지 않는다. 기다리는 동안 진행이 궁금하면 `scripts/wave-status.py`를 본다. 종료 코드: `0` 완료 → 호스트 검증, 터미널 닫기 / `10` 실패 → 결과의 `log_tail`을 먼저 읽고, 그다음 보고서·로그를 읽어 수정 브리프 / `11` quota → 위 대체 / `12` 시간 초과 → 진행을 확인하고 완료로 보지 않으며 중복 실행하지 않는다 / `2` 인자 오류. 작업자가 멈추기 전에 쓴 보고서나 sentinel은 쓰지 않는다.
4. **호스트 검증**(작업자는 패키지 범위 검사만 했다). 순서: diff 확인 → 검사(바뀐 패키지 → 루트 순서대로) → 모두 0이면 커밋.
   - 작업자 diff를 읽는다(작업자는 git을 안 쓴다). 검사가 끝나기 전에 커밋하지 않는다.
   - 바뀐 패키지 검사 → 루트 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`를 **순서대로 한 번** — 모두 0이어야 커밋·push한다. 파이프로 종료 코드를 가리지 않는다. FeedbackOps gitlink를 올렸으면 `--force`(#237).
   - Kernel·셸·공통 컴포넌트·mock 서버가 바뀌었으면 새 E2E describe만 먼저(`cd apps/platform-e2e && pnpm exec playwright test -g "<describe>"`), 그다음 관련 E2E 또는 전체 `pnpm e2e`.
   - 새 테스트는 한 번 변이 검사한다(고친 곳을 되돌려 그 테스트가 실패하는지 보고 복원).
   - 검사와 함께 커밋 전에 `scripts/worker-hygiene.sh <worktree>`를 돌린다 — 새 무이유 `eslint-disable`과 `eslint-suppressions.json` 증가는 실패, 공백 전용 변경은 보고만이다(루트 `AGENTS.md` 규칙과 같다).
   - 디자인 lint 오류는 메시지가 알려 주는 토큰·variant·부품으로 고친다. suppressions에 새 위반을 더하지 않는다.
5. **직접 고치는 것은 기계적인 것만**: import 경로·순서, lint 자동 수정, 없어진 동작을 고정하던 기대값, 빠진 mock 등록(`MOCK_ENDPOINTS`·`server-conformance.test.ts`의 `PARAMS`). 각각 `W-<n>-VERIFY.md`에 적는다. 판단이 드는 것은 호스트 출력을 인용한 수정 브리프(`W-<n>-FIX<k>-TASK.md`)로 `worker-launch.sh --role fix`(수정 자체가 어려우면 `impl-complex`) `--cwd <worktree> --task <절대 경로> --report <절대 경로> --sentinel '<수정 작업의 sentinel>' --name W-<n>-FIX<k> --state-dir "$WAVE_STATE"`.
6. **화면 증거**: 화면이 바뀌면 브라우저로 확인한다(`ego-browser`, 막히면 `apps/platform-e2e`의 Playwright 캡처로 대신한다고 말한다). 미리보기는 `scripts/app-preview.py start <worktree> --name <n>-branch`. 캡처는 차트 canvas와 표 행을 기다린 뒤 찍고, 올리기 전에 이미지를 직접 연다. 같은 턴에 `stop`한다.
7. **역할별 리뷰, 트리거로 고른다**(이슈당 리뷰 한 라운드, 루트 `AGENTS.md`). 호스트 검증과 화면 증거를 **먼저** 끝낸다.
   **a. 계획**: 커밋된 브랜치에서 `python3 scripts/review-plan.py <worktree>`(커밋하지 않은 변경이 있으면 거부). 출력을 VERIFY에 적는다.
   - `code` → `review-final`. `perf`면 코드 리뷰어 작업에 성능 관점을 넣는다(측정 도구가 없으니 회귀를 실제로 재었을 때만 `review-perf`).
   - `ux: required` → `review-ux`. `ux: optional` → 코디네이터가 정하고 이유 한 줄을 적는다. UX 리뷰가 없으면 코드 리뷰어 작업에 "UX 리뷰 없음"을 적는다(UI 관점을 맡는다).
   - `flags.permission` → 모든 리뷰어 작업 맨 앞에 "제한된 데이터가 새면 안 된다", UX 리뷰어에게 제한 역할.
   - `flags.instructions` → 브랜치의 `.agents/**`·`.claude/**`·`AGENTS.md` diff를 코디네이터가 먼저 읽는다(리뷰어가 브랜치에서 읽는다).
   - `flags.e2e`·`flags.submodule` → 4단계에서 했는지 확인한다.

   | 역할 | 작업 / 보고서 / sentinel |
   | --- | --- |
   | `review-final` | `W-<n>-FINAL-TASK.md` / `-FINAL-REPORT.md` / `<!-- W-<n>-FINAL-DONE -->` |
   | `review-ux` | `W-<n>-UX-TASK.md` / `-UX-REPORT.md` / `<!-- W-<n>-UX-DONE -->` |
   | `review-quality` | `SLICE-<m>-QUALITY-TASK.md` / `-QUALITY-REPORT.md` / `<!-- SLICE-<m>-QUALITY-DONE -->` |

   **b. 코드 리뷰어는 바로 띄운다.** 미리보기가 필요 없으니 계획 직후 실행한다.
   **c. 미리보기**(UX 리뷰일 때만): 기준 worktree 하나를 웨이브 동안 둔다 — `git worktree add --detach <wave>/baseline origin/main`, 서브모듈 init + `pnpm install --frozen-lockfile`. 갱신은 `git -C <baseline> checkout --detach origin/main`(lockfile이 바뀌면 다시 설치). 그다음 `app-preview.py start <baseline> --name <n>-main`과 `app-preview.py start <worktree> --name <n>-branch`. 브랜치는 먼저 `origin/main` 위로 올린다(첫 push 전이면 rebase, 뒤면 merge). claude 리뷰어는 한 번에 하나만 돈다(코디네이터와 quota를 나눈다).
   **d. UX 리뷰어 실행**: 미리보기 URL 두 개, 역할, 브리프의 시나리오 최대 3개, 컨펌된 시안, 미리 만든 `.review/` 아래 절대 경로 스크린샷 폴더를 작업에 넣는다. 모든 역할은 공유 `worker-launch.sh --role <role> --cwd <worktree> --task <절대> --report <절대> --sentinel '<sentinel>' --name <이름> --state-dir "$WAVE_STATE"`.
   **e. 대기**: `worker-wait.sh --any --kill-on-timeout --state …`, UX는 `--timeout 5400`, 나머지 3600. `0` 보고서를 읽는다 / `10`·`12` 부분 보고서가 있으면 쓰고, 아무것도 못 했으면 한 번 다시, 두 번째 실패는 VERIFY에 빈칸으로 / `11` 리셋을 기다리거나 그 역할을 건너뛰고 VERIFY와 PR 본문에 이유를 적는다. **트립와이어**: 실행 전후 worktree와 `$AP_MAIN`의 `git rev-parse HEAD`·`git status --porcelain`·`git stash list | wc -l`을 비교한다(ego-browser는 임의 Node를 돌린다). UX가 끝나면 미리보기를 바로 끈다.
   **f. 지적 합치기**: 모든 보고서를 읽고 중복을 뺀다. 충돌하면 이 순서로 정한다: 권한·데이터 누출 규칙 → ADR·06 계약·기록된 사용자 결정 → 정확성·계약 → 브리프 → 출시된 패턴 기준 UX → 성능 → 스타일. 브리프와 어긋나거나 사실상 제품 질문인 UX 지적은 자동으로 정하지 않는다 — PR 본문 **사용자 질문** 절 + `needs-triage` 이슈. `blocker`면 답이 올 때까지 병합하지 않는다.
   **`pre-existing`·범위 밖 지적은 fold·file·note로 분류한다**(사용자 결정 2026-10-10). 먼저 가치 게이트를 적용한다.
   - **Fold** — 이 이슈의 수정 라운드에 묶는다. 다음을 모두 만족할 때: (1) 사용자 결정(동작, 문구 의미, 테스트 삭제, 범위)이 필요 없고 API·권한 변경이 없다; (2) 결함 수정이나 문구 변경이지 리팩터가 아니다; (3) 이슈 diff의 파일, 그 diff가 바꾼 메뉴 폴더 `menus/<group>/src/`, i18n 사전만 만진다 — `packages/ui`·`packages/kernel`·`packages/contracts`·셸·다른 메뉴는 fold 금지; (4) 항목당 변경 30줄 이하, 이슈당 3건 이하; (5) 동작 변경에는 그것을 빼면 실패하는 회귀 테스트가 따른다; (6) 상태·포커스·되돌리기·수명주기·동시성 코드는 그 파일이 이미 이슈 diff에 있고 아래 fix-diff 점검을 받을 때만. fold는 테스트를 지우지 않는다. 스펙된 동작을 바꾸는 fold는 같은 PR에서 스펙(06·ADR)을 고친다 — 스펙이 동의하지 않으면 그것은 사용자 결정이니 이슈로 남긴다.
     fold는 finding ID를 붙여 FIX1 브리프의 *Do*에 넣고 **자기 FIX1 커밋**으로 올린다. 그 뒤 `review-plan.py <worktree> --base <수정 전 head>`로 원래 계획에 없던 역할이 나오면 그 커밋을 되돌리고 항목을 이슈로 남긴다. 호스트 검증이나 fix-diff 점검을 실패한 fold는 되돌려 이슈로 남긴다(다른 라운드에서 고치지 않는다). PR 본문 **Also fixed (pre-existing)** 절에 finding과 그 테스트를 적는다.
   - **File** — (3)·(4)를 넘거나 위 review-plan 점검에 걸리거나 사용자 결정·계약 변경·모듈 넘는 리팩터가 필요하면 이슈로 남긴다. 관련 지적은 하나의 이슈로 묶는다 — nit마다 이슈를 만들지 않는다.
   - **Note** — touched area 밖의 `minor`·`nit`은 이슈 없이 PR 본문 **Noted, not filed**에 한 줄씩. touched area는 UX 작업에 코디네이터가 적은, 바뀐 파일을 렌더링하는 경로다.
   재확인(`review-check`)·fix-diff 점검은 지명된 지적이 고쳐졌는지와 수정 전 head 대비 회귀만 본다. 거기서 나온 `pre-existing`은 note로만 적는다 — `blocker`가 아니면 이슈로 만들지 않는다.
   남긴 지적은 역할 태그를 붙여 **수정 브리프 하나**(`W-<n>-FIX1-TASK.md`)로 모으고, 코디네이터의 자체 관찰도 같은 라운드에 넣는다. 코디네이터가 검증하고 올린다. 재리뷰는 blocker·major 동작 수정(특히 권한·데이터 누출) 뒤에만, 그 수정 diff만 `review-check`로 본다.
   **`impl-complex` 이슈의 fix-diff 점검**: 이 이슈의 FIX1(fold 포함)은 수정 diff로 `review-check` 한 번을 받는다. 지적은 FIX2 하나로만 모은다. FIX2는 코디네이터가 직접 본다(diff 읽기, 변이 검사, 포커스면 실제 브라우저 확인) — 리뷰어를 더 띄우지 않고 fold도 없다.
   고친 UX `blocker`·`major`는 새 미리보기에서 그 시나리오와 이웃 흐름을 다시 확인한다.
   **g. 계속 지키는 것**: 문서·문구만 바뀐 diff는 리뷰가 없다(계획이 역할을 내지 않는다). 강화된 불변식을 리팩터하면 코드 리뷰어에게 그 이력과 `origin/main` 대비 모든 분기를 따라가라고 적는다. 같은 슬라이스에서 앞서 병합된 이슈가 같은 컴포넌트·훅·mock 엔드포인트를 건드렸으면 코드 리뷰어 작업에 그 PR을 적고 합쳐진 동작을 보게 한다(같은 슬라이스 안 재귀 결함을 잡는다).
8. **배포**: 루트 검사를 다시 0으로 확인한 뒤 PR(`main` 기준, 본문: 변경, 리뷰 판정과 반영·미룬 지적 — fold한 것은 **Also fixed (pre-existing)**로, note는 **Noted, not filed**로, 검증 수치, `Closes #<n>`). 공유 `ship-pr.sh --branch <branch> --base main --title '<제목>' --body-file <파일> --ci --ci-timeout 3600`을 쓰면 이 클론에서 한 번 `git config workerops.protectedBases none`이 필요하다(PR 기준이 main이다). `ship-pr.sh`는 검증된 병합 뒤에만 자원을 정리한다(그 전에는 JSON에 `cleanup_skipped`로 남는다) — 그 명령에 `orca worktree rm`을 잇지 않는다. 병합은 이 세션에서 권한을 받았을 때만, squash로 한다. 고정한 head가 검증 뒤 바뀌었으면 그 head를 다시 검증한다. 끝난 터미널은 닫고 끝난 worktree는 지운다. `.planning/README.md`의 해당 줄을 같은 PR에서 고친다.
9. 병합 몇 번마다 루트 `HANDOFF.md`를 갱신한다(로컬 전용, 제자리 갱신). 후속은 위의 fold·file·note 분류를 따른다 — 이슈로 남기는 것은 사용자 결정과 file 항목뿐이고, flake는 두 번째 발생 때 이슈로 하며, 미룬 nit은 note로 남긴다.
10. **슬라이스 마감**(마지막 이슈가 병합되면, 릴리스 문서 PR 전):
    - `review-quality`(codex, Orca 터미널이므로 일회용 worktree는 `orca worktree create --base-branch origin/main`으로 만든다 — `git worktree add` 체크아웃에는 codex를 띄울 수 없다). 작업 파일의 첫 줄은 "`.claude/agents/review-quality.md`를 읽고 역할 정의로 따른다." 그다음: `worker-launch.sh --role review-quality --cwd <일회용> --task <절대 SLICE-<m>-QUALITY-TASK.md> --report <절대> --sentinel '<!-- SLICE-<m>-QUALITY-DONE -->' --name SLICE-<m>-QUALITY --state-dir "$WAVE_STATE"`. 범위는 `<직전 태그>...origin/main`. `release-blocker` → 릴리스 전 일반 이슈 루프 / `fix-in-slice` → chore PR 하나 / `follow-up` → 위 7f 분류(chore에 fold하거나 묶은 이슈 하나 또는 note). 마감 fold는 문구·a11y 속성·죽은 코드·문서만이다 — 워크스루의 동작 `major`는 chore에 fold하지 않고 별도 이슈 루프로 한다.
    - **delta 품질 리뷰**: 품질 리뷰 뒤 그 지적이 슬라이스에 이슈를 더했으면, 릴리스 게이트 전에 그 파일들로 짧은 `review-quality`를 한 번 더 돌린다.
    - 화면이 바뀐 슬라이스면 `origin/main` 미리보기로 슬라이스의 사용자 흐름을 `review-ux` 한 번(한 diff에서는 안 보이고 써 봐야 보이는 결함).
    - 그다음 릴리스: 보드 문서 PR → 태그 + GitHub Release → 다음 슬라이스를 사용자에게 묻는다.
    - **세션당 슬라이스 하나.** 릴리스 PR이 열리면 인계 문서를 마쳐 두고 새 세션을 권한다.
    - 인계 전 `app-preview.py status`에 추적 중인 미리보기가 없어야 한다.

## 도구

- `scripts/wave-status.py [--json] [--prs] [--state-dir <dir>]`: 웨이브의 읽기 전용 스냅숏 — 작업자·리뷰어(상태·역할·모델·경과·로그 침묵), 미리보기, worktree, `--prs`면 열린 PR의 CI. `$WAVE_STATE`를 읽고, 없으면 이 레포의 최근 세션 scratchpad `wave/` 폴더(하루 안)를 읽는다. 진행 질문이 오면 이 출력을 보인다. 상태 규칙은 `scripts/test-wave-status.py`가 고정한다.
- `scripts/worker-hygiene.sh <worktree>`: 작업자 위생 — 새 무이유 `eslint-disable`·`eslint-suppressions.json` 증가는 실패, 공백 전용 변경은 보고만. 4단계 검증에서 돌리고, 규칙은 `scripts/test-worker-hygiene.py`가 고정한다.
- `scripts/launch-worker.sh <n> <slug>`: Orca worktree(`~/orca/workspaces/analytics-platform/<n>-<slug>`, 브랜치 `feat/<n>-<slug>`), 서브모듈 + `pnpm install`, 설정 셸 닫기, `.review/W-<n>-TASK.md` 작성, 공유 실행기 호출. 필요: `WAVE_STATE`·`WAVE_BRIEFS`·`AP_MAIN`.
- `scripts/review-plan.py <checkout> [--base origin/main] [--head HEAD]`: 7a. 규칙표는 `scripts/test-review-plan.py`(12개 사례)가 고정한다. 과거 병합 대조: #247(드릴다운) → code+ux+perf, permission·e2e·contract / #246(표 컬럼) → code+ux, e2e / #248·#253(문서) → 리뷰 없음.
- `scripts/app-preview.py start <checkout> [--name <label>]` / `stop <label>|--all` / `status`: mock 조립 vite를 5180–5199의 빈 포트에 띄운다(백엔드·DB 없음). `status`는 추적 중인 미리보기와 남의 vite(`untracked`, 건드리지 않음)를 보인다. `stop`은 신호 전에 기록된 pgid·부모 시작 시각·명령으로 소유를 확인하고, 부모가 없으면 그룹 안에서 기록 checkout이 실행한 vite만 인정한다 — `node …/vite/bin/vite.js`(상대 경로는 lsof로 읽은 프로세스 cwd 기준) 또는 checkout의 `node_modules/.bin/vite`, 그리고 `--port` 정확 일치·`--strictPort`. 인수 자리의 vite 이름과 pgid 기록 이전 상태 파일은 소유 증거가 아니므로 항상 불명확이다. 불명확하면 상태 파일을 남긴 채 `ownership unclear`로 건너뛴다. 규칙 표는 `scripts/test-app-preview.py`가 고정한다.

## 함정(측정된 것)

- 이 레포의 작업자 함정은 [`docs/agents/operations.md`](../../../docs/agents/operations.md)에 있다(새 worktree 설치, pnpm 11, CSS selector CI, 캡처, mock 등록).
- `orca terminal create`는 Orca가 관리하는 worktree만 받는다. 일반 `git worktree add` 체크아웃(기준 worktree)에는 codex 리뷰어를 띄울 수 없다. 거기서는 미리보기만 돌린다.
- omp(GLM) 작업자는 5시간 quota에서 조용히 멈춘다. `orca terminal read --screen`으로 보고(스트림 읽기는 시작 화면만 보인다), 출력된 리셋 시각보다 `Provider requested Nms wait`를 믿는다.
- 작업자의 완료 보고는 자기 보고다. diff를 읽고 검사를 직접 다시 돌린다.
- 같은 파일을 고치는 다음 라운드에는 새 sentinel(`…-FIX2-DONE`)을 쓰고, 대상에 아직 없는지 `rg`로 확인한다.
- 메인 체크아웃의 `node_modules`는 병합이 쌓이면 낡는다. 마감 검사 전에 `pnpm install --frozen-lockfile`.
- zsh에서 변수 이름으로 `path`(PATH와 묶임)·`status`(읽기 전용)를 쓰지 않는다.
- 리뷰어 터미널은 시간 초과만으로 닫지 않는다. sentinel이 있고 화면에 `Working`이 없을 때 닫는다.
