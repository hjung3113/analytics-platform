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
| `fix` | 모든 수정 라운드의 기본(복잡한 이슈도) | 공유 `worker-launch.sh --role fix` |
| `review-final` | 코드: 정확성·계약·테스트·diff 안의 아키텍처 | 규칙 `docs/agents/templates/review-rules.md` |
| `review-ux` | 실행 중인 앱의 디자인·UX | 에이전트 `.claude/agents/review-ux.md`(`--agent`) |
| `review-quality` | 슬라이스 전체의 코드 품질(11단계) | 에이전트 `.claude/agents/review-quality.md` |
| `review-check` | 중간 확인(blocker 수정이 리뷰어가 본 파일 밖으로 번졌을 때) | 별도 CHECK 이름 |

codex 역할은 Orca 터미널에서, claude 역할은 백그라운드 `claude -p`(프롬프트는 stdin, `.claude/agents/<role>.md`가 있으면 `--agent`)로, grok은 백그라운드 headless로 돈다. 보고서 sentinel만으로 끝났다고 보지 않는다. `worker-wait.sh`가 신선도·마지막 줄·프로세스 종료나 터미널 idle을 함께 본다. 끝난 작업자의 터미널은 바로 닫고 상태 JSON은 남긴다.

## 상태

- `WAVE_STATE`: 세션 scratchpad 아래 폴더. 작업자 상태 JSON(`W-<n>.json`, `W-<n>-FIX<k>.json`, `W-<n>-FINAL.json`, `W-<n>-UX.json`, `SLICE-<m>-QUALITY.json`)과 `preview-<label>.json`. 실행·대기마다 `--state-dir "$WAVE_STATE"`, 라운드마다 다른 이름·보고서.
- `WAVE_BRIEFS`: 브리프 폴더(예: `$AP_MAIN/.review/wave/`, `.review/`는 `.git/info/exclude`). `AP_MAIN`: 메인 체크아웃 경로.

## 이슈마다

1. **브리프**(`$WAVE_BRIEFS/<n>-task.md`): 사실은 모두 현재 `origin/main`에서 다시 확인한다(경로, 줄 번호, 기존 헬퍼, 소유 계약 절). 이슈 글은 낡는다. 절은 *Facts (verified on main)* / *Do* / *Acceptance (tests)* / sentinel 줄. 재사용할 공통 부품, 지킬 계약(06 절·ADR), 범위 밖, 코디네이터 결정("final — do not re-litigate")을 적는다. 끝 줄은 `Sentinel (last line of .review/W-<n>-REPORT.md): <!-- W-<n>-DONE -->`. ADR 번호를 주기 전에 `bash tooling/scripts/next-adr.sh`와 열린 브랜치를 확인한다.
   **실행 전 자체 점검**(FeedbackOps에서 리뷰 라운드를 하나씩 잡아먹은 것들):
   - 존재하는 헬퍼·타입·컴포넌트만 적는다. 하나씩 `rg`로 확인한다. 없는 것을 "공통 X로"라고 쓰면 작업자가 지어낸다.
   - 계약 규칙(키 개수, 필수 여부, 순서)은 기억이 아니라 06·ADR·검증 코드(`registry.ts` 등)에서 복사한다.
   - 이벤트가 동작을 결정하면("닫으면 접힌다") 호출부가 쓰는 표현을 모두 `rg`로 찾는다(prop 없음 vs `null`).
   - DOM 소유를 옮기는 수정이면 그 요소를 찾는 E2E·단위 테스트 선택자 갱신을 명시한다(작업자는 E2E를 못 돌린다).
   - 보이는 모양이 바뀌는 일이면 컨펌된 `?variant=` 안을 스펙으로 적는다. 컨펌 전이면 구현하지 않고 시안부터(루트 `AGENTS.md`).
2. **실행**: `scripts/launch-worker.sh <n> <slug>`. 16GB 머신이라 동시에 1–2개, 파일이 겹치지 않는 이슈만 병렬로 한다(`docs/agents/operations.md` 메모리). 기본은 `impl`(GLM). 다음 중 하나면 **`WORKER_ROLE=impl-complex`**(Grok, 사용자 결정 2026-10-08)다. 수정 라운드는 이슈가 복잡해도 기본 `--role fix`(GLM)이고, 수정 자체가 어려울 때만 `impl-complex`다(사용자 결정 2026-10-09):
   - Kernel 계약과 그 소비자(컴포넌트·셸·메뉴)를 함께 바꾸거나, 패키지 세 곳 이상을 건드린다;
   - 권한·Scope·URL 보안 경계(`safeReturnTo`, 목적지 ID와 Context 분리), 데이터 누출 규칙을 건드린다;
   - 상태·순서 로직: 조회 수명주기(취소·세대·`ready` 게이트), history push/replace, Context 변경 시 page 키 정리;
   - 같은 이슈의 이전 GLM 라운드가 실패했거나 두 번째 수정 라운드가 필요했다.
   선택과 이유를 `W-<n>-VERIFY.md`에 적는다. GLM이 quota로 멈추면(`worker-wait` exit 11) 같은 worktree에서 공유 `worker-launch.sh --role impl-luna`로 다시 띄우고, worktree에 부분 수정이 있다고 작업에 적는다.
3. **대기**: `worker-wait.sh --state "$WAVE_STATE/W-<n>.json" --timeout 3600 --poll 30`(여러 개면 `--state` 반복 + `--any`). 종료 코드: `0` 완료 → 호스트 검증, 터미널 닫기 / `10` 실패 → 보고서·로그를 읽고 수정 브리프 / `11` quota → 위 대체 / `12` 시간 초과 → 진행을 확인하고 완료로 보지 않으며 중복 실행하지 않는다 / `2` 인자 오류. 작업자가 멈추기 전에 쓴 보고서나 sentinel은 쓰지 않는다.
4. **호스트 검증**(작업자는 패키지 범위 검사만 했다). 순서: diff 확인 → 검사(바뀐 패키지 → 루트 순서대로) → 모두 0이면 커밋.
   - 작업자 diff를 읽는다(작업자는 git을 안 쓴다). 검사가 끝나기 전에 커밋하지 않는다.
   - 바뀐 패키지 검사 → 루트 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`를 **순서대로 한 번** — 모두 0이어야 커밋·push한다. 파이프로 종료 코드를 가리지 않는다. FeedbackOps gitlink를 올렸으면 `--force`(#237).
   - Kernel·셸·공통 컴포넌트·mock 서버가 바뀌었으면 새 E2E describe만 먼저(`cd apps/platform-e2e && pnpm exec playwright test -g "<describe>"`), 그다음 관련 E2E 또는 전체 `pnpm e2e`.
   - 새 테스트는 한 번 변이 검사한다(고친 곳을 되돌려 그 테스트가 실패하는지 보고 복원).
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
   **f. 지적 합치기**: 모든 보고서를 읽고 중복을 뺀다. 충돌하면 이 순서로 정한다: 권한·데이터 누출 규칙 → ADR·06 계약·기록된 사용자 결정 → 정확성·계약 → 브리프 → 출시된 패턴 기준 UX → 성능 → 스타일. 브리프와 어긋나거나 사실상 제품 질문인 UX 지적은 자동으로 정하지 않는다 — PR 본문 **사용자 질문** 절 + `needs-triage` 이슈. `blocker`면 답이 올 때까지 병합하지 않는다. `pre-existing`과 범위 밖은 후속 이슈다. 남긴 지적은 역할 태그를 붙여 **수정 브리프 하나**(`W-<n>-FIX1-TASK.md`)로 모으고, 코디네이터의 자체 관찰도 같은 라운드에 넣는다. 재리뷰는 blocker·major 동작 수정(특히 권한·데이터 누출) 뒤에만, 그 수정 diff만 `review-check`로 본다. 고친 UX `blocker`·`major`는 새 미리보기에서 그 시나리오와 이웃 흐름을 다시 확인한다.
   **g. 계속 지키는 것**: 문서·문구만 바뀐 diff는 리뷰가 없다(계획이 역할을 내지 않는다). 강화된 불변식을 리팩터하면 코드 리뷰어에게 그 이력과 `origin/main` 대비 모든 분기를 따라가라고 적는다.
8. **배포**: 루트 검사를 다시 0으로 확인한 뒤 PR(`main` 기준, 본문: 변경, 리뷰 판정과 반영·미룬 지적, 검증 수치, `Closes #<n>`). 공유 `ship-pr.sh --branch <branch> --base main --title '<제목>' --body-file <파일> --ci --ci-timeout 3600`을 쓰면 이 클론에서 한 번 `git config workerops.protectedBases none`이 필요하다(PR 기준이 main이다). 병합은 이 세션에서 권한을 받았을 때만, squash로 한다. 고정한 head가 검증 뒤 바뀌었으면 그 head를 다시 검증한다. 끝난 터미널은 닫고 끝난 worktree는 지운다. `.planning/README.md`의 해당 줄을 같은 PR에서 고친다.
9. 병합 몇 번마다 루트 `HANDOFF.md`를 갱신한다(로컬 전용, 제자리 갱신). 후속(불안정 테스트, 미룬 nit, 사용자 결정)은 이슈로 남긴다.
10. **슬라이스 마감**(마지막 이슈가 병합되면, 릴리스 문서 PR 전):
    - `review-quality`: `origin/main`에 detach된 일회용 worktree에서 `worker-launch.sh --role review-quality --cwd <일회용> --task <절대 SLICE-<m>-QUALITY-TASK.md> --report <절대> --sentinel '<!-- SLICE-<m>-QUALITY-DONE -->' --name SLICE-<m>-QUALITY --state-dir "$WAVE_STATE"`. 범위는 `<직전 태그>...origin/main`. `release-blocker` → 릴리스 전 일반 이슈 루프 / `fix-in-slice` → chore PR 하나 / `follow-up` → 이슈.
    - 화면이 바뀐 슬라이스면 `origin/main` 미리보기로 슬라이스의 사용자 흐름을 `review-ux` 한 번(한 diff에서는 안 보이고 써 봐야 보이는 결함).
    - 그다음 릴리스: 보드 문서 PR → 태그 + GitHub Release → 다음 슬라이스를 사용자에게 묻는다.
    - 인계 전 `app-preview.py status`에 추적 중인 미리보기가 없어야 한다.

## 도구

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
