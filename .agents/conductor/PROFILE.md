# Conductor profile — analytics-platform

전역 `issue-wave-conductor` 스킬(`~/.agents/skills/issue-wave-conductor/SKILL.md`)이 쓰는 이 레포의 부분이다(#361). 공통 절차는 전역 스킬에 있고, 여기에는 이 레포에서 다른 것만 적는다. 작업 규칙의 원본은 루트 `AGENTS.md`이고 둘이 다르면 `AGENTS.md`를 따른다. `$CONDUCTOR`는 이 폴더(`.agents/conductor/`)다.

FeedbackOps 원본과 다른 점: DB·로그인이 없다(mock 어댑터). 화면 증거는 Playwright E2E(`apps/platform-e2e`)와 mock 미리보기다. 시각 기준 이미지·biome·nav-perf·임시 Postgres는 없다.

## Flow

- `<base>`는 `main` 하나다(develop 없음). 병합은 squash로 한다. 릴리스 순서와 담당은 [`LANES.md`](LANES.md) §팀장 릴리스다.
- 브랜치는 `feat/<n>-<slug>`. `$MAIN`은 `AP_MAIN`(메인 체크아웃 경로)이고, worktree는 Orca가 정한 위치를 이름(`<n>-<slug>`)으로 찾는다.
- 공통 도구(`launch-worker`·`review-plan`·`worker-hygiene`·`wave-status`)는 전역 엔진이다: `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`. 이 레포 설정은 [`conductor.json`](conductor.json)(base·브랜치·설치·리뷰 규칙·플래그·hygiene·미리보기 판정), 템플릿 덧붙임은 [`addenda/`](addenda/)다(#394). 규칙을 바꾸면 설정을 고친다 — 엔진 원본과 테스트는 provider 정식 체크아웃 `~/orca/projects/conductor-engine`(설치는 아래 Tools).
- `WAVE_BRIEFS`는 `$AP_MAIN/.review/wave/`(`.review/`는 `.git/info/exclude`).
- `ship-pr.sh`를 쓰려면 이 클론에서 한 번 `git config workerops.protectedBases none`이 필요하다(PR 기준이 main이다).
- PR마다 `.planning/README.md`의 해당 줄을 같은 PR에서 고친다.
- 여러 세션이 동시에 일할 때의 흐름(`lane:*`) 분담·함께 쓰는 경로·E2E 포트·릴리스 담당은 [`LANES.md`](LANES.md)다.
- 병합 권한은 슬라이스 시작 때 한 번 묻는다(흐름 세션은 묻지 않고 지시서의 권한을 쓴다, [`LANES.md`](LANES.md) §흐름 세션). 권장 선택지는 "CI·리뷰 통과 시 머지, 사후보고"다. 태그·GitHub Release를 언제 묻는지는 [`LANES.md`](LANES.md)를 따른다(SDK는 팀장이 낸 뒤 보고, 앱 `v0.x`는 태그 전에 묻는다). PR마다 다시 묻지 않는다(#436).

## Launch

- `python3 $ENGINE/launch-worker.py <n> <slug>`가 하는 일(설정 `launch`):
  - Orca worktree를 `origin/main`에서 만들고 이름으로 찾아 브랜치 이름을 바꾼다.
  - `pnpm install`을 돌린다(FeedbackOps(`apps/fo-*`·`packages/fo-*`)도 루트 workspace의 일부라 이 한 번의 설치가 덮는다, ADR-0066·#642).
  - 설정 셸을 닫는다.
  - 전역 `impl-rules.md`·`review-rules.md`에 [`addenda/`](addenda/)를 붙여 worktree `.review/00-IMPL-RULES.md`·`00-REVIEW-RULES.md`로 쓰고, `.review/W-<n>-TASK.md` 맨 앞 줄은 그 구현 규칙 포인터다.
  - 공유 실행기를 부른다.
- 필요한 환경 변수: `WAVE_STATE`·`WAVE_BRIEFS`·`AP_MAIN`. 역할은 `WORKER_ROLE`, 덮어쓰기는 `WORKER_MODEL`·`WORKER_EFFORT`로 준다.
- 16GB 머신이라 동시 작업자 수는 `scripts/capacity.sh`가 정한다(1–7개: green 7·yellow 3·red 1, 단계는 LANES §기계 자원). 파일이 겹치지 않는 이슈만 병렬로 돌린다(메모리 기록은 `docs/agents/operations.md`). 이 수는 기계 전체 한도이고, 자리·무거운 단계는 [`LANES.md`](LANES.md) §기계 자원의 잠금을 따른다.
- **FeedbackOps 이슈는 모드 `fo`로 띄운다:** `python3 $ENGINE/launch-worker.py <n> <slug> fo`.
  - FeedbackOps(앱·패키지 `apps/fo-*`·`packages/fo-*`, 도구 `ops/feedbackops/` = `@fops/ops`)는 루트 workspace의 일부이고 Node 26.7·pnpm 11을 루트와 같이 쓴다. 설치는 런처의 루트 설치가 끝낸다(#642).
  - 모드 훅 `scripts/fo-prepare.sh`는 설치하지 않고, `.env`를 채운 뒤 FeedbackOps `verify-db.sh create <n>`으로 이슈 DB(5439)를 만든다.
  - 규칙 덧붙임은 `addenda/impl-rules-fo.md`다.
  - **선행 조건:** verify 컨테이너가 떠 있어야 한다. FeedbackOps가 설치되고 `ops/feedbackops/.env`가 있는 checkout에서 `bash ops/feedbackops/conductor/scripts/verify-db.sh up`을 한 번 돌린다. 5434 개발 DB는 쓰지 않는다.
  - `.env`는 git에 없는 파일이다. 없으면 `fo-prepare.sh`가 `.env.example`로 만든다. `up`을 돌릴 checkout에는 손으로 `cp ops/feedbackops/.env.example ops/feedbackops/.env`를 해 둔다.
  - 머지 뒤에는 `verify-db.sh drop <n>`, 웨이브 끝에는 `down`.

## Complexity

다음 중 하나면 `impl-complex`다.

- Kernel 계약과 그 소비자(컴포넌트·셸·메뉴)를 함께 바꾸거나, 패키지 세 곳 이상을 건드린다.
- 권한·Scope·URL 보안 경계(`safeReturnTo`, 목적지 ID와 Context 분리)나 데이터 누출 규칙을 건드린다.
- 상태·순서 로직을 다룬다: 조회 수명주기(취소·세대·`ready` 게이트), history push/replace, Context가 바뀔 때 page 키 정리.

## Verify

검사는 순서대로 돌리고, 모두 0이어야 커밋한다.

1. 바뀐 패키지 검사.
2. 루트 검사는 `bash .agents/conductor/scripts/verify-root.sh <log-dir>`로 한 번 돌린다(#1018). `pnpm lint` → `pnpm typecheck`(잠금 없이) → `pnpm test` → `pnpm build` 순서이고, test·build는 `heavy.lock` 아래에서 한 번에 묶어 돈다. lint·typecheck가 끝난 뒤 test·build 직전에 `capacity.sh`가 `start=no`이면 잠금을 잡지 않고 종료 코드 3으로 끝난다. 단계마다 `<log-dir>/<step>.log`(마지막 줄 `exit=<코드>`)를 남기고, 첫 실패에서 멈춰 그 단계의 코드를 돌려주며, 끝에 `step=<name> exit=<n> seconds=<s>` 요약을 낸다. test의 패키지 동시 실행 상한은 루트 `turbo.json` `concurrency`가 정하고 CI도 같다([operations.md](../../docs/agents/operations.md)) — 스크립트에도 `--concurrency`·워커 수 플래그를 넣지 않는다. turbo 캐시는 worktree끼리 공유되니 `--force`·`--affected`·`...[ref]` 같은 git diff 필터를 쓰지 않는다 — 해시 입력이 바뀐 패키지와 그 의존자만 다시 돌고, diff 필터는 입력이 아닌 파일 목록으로 범위를 정해 더 위험하다(메뉴만 바꿨는데 gen-menu test가 빠진 일이 있었다). `--filter='!@fops/*'`는 루트 `package.json` 스크립트(`lint`·`typecheck`·`test`·`build`)가 이미 갖고 있어 스크립트가 따로 넣지 않는다(FeedbackOps 루트 도구 `@fops/ops`가 빠지지 않으면 그 lint가 플랫폼 biome 설정으로 돌아 1000건 넘게 실패한다). 패키지 밖 파일을 읽는 테스트는 `turbo.json`에 `$TURBO_ROOT$` inputs를 선언해야 이 캐시가 믿을 만하다.
   - **가벼운 노드(O2, 사용자 2026-10-27):** 그 노드의 diff가 Kernel·셸·공통 컴포넌트(`packages/{kernel,components,shell,ui,contracts}`)·mock 서버·`apps/platform-web` 조립을 건드리지 **않으면**(메뉴·문서·도구·스크립트·위 경로 밖의 이동) 로컬에서는 바뀐 패키지 검사와 `verify-root.sh --light <log-dir>`(lint·typecheck만, `heavy.lock`을 잡지 않는다)만 돌리고 `test`·`build`는 PR CI에 맡긴다. 건드리는 노드는 위 전체다. 공유 경로 PR(루트 `AGENTS.md` 작업 흐름의 다섯 갈래: 공개 API·루트 `package.json`/lockfile/`turbo.json`·`.github/workflows`·`apps/platform-e2e`)은 경로와 관계없이 `verify-root.sh` 전체를 돈다 — CI 실패 비용이 `merge.lock`을 쥔 채 줄 전체에 걸린다. 기준은 그 노드 diff의 경로로 판정하고 VERIFY에 한 줄 적는다("가벼운 노드: 경로 …, test·build는 CI").
7. 입력이 바뀐 경우만, 루트 4종에 없고 CI만 도는 검사를 로컬에서 돌린다(#1018, 아래 §Traps의 증거 문장이 근거):
   1. `packages/contracts`·SDK 패키지의 공개 타입을 바꿨으면 build 뒤(수정 라운드면 해당 패키지 `pnpm --filter <pkg> build`를 먼저 — `sdk:api`는 빌드된 dist 선언을 읽는다, `tooling/sdk/sdk-api-snapshot.mjs`) `pnpm sdk:api`. 의도한 변경이면 `--update`와 `docs/integration/sdk-git-tag-consumption.md` 변경 기록 한 줄.
   2. SDK 패키지(`packages/{contracts,ui,kernel,components,shell}`)의 파일을 옮기거나 이름을 바꿨으면 `pnpm sdk:pack --out <dir> && pnpm sdk:consumer-check <dir>`.
   3. CSS 규칙을 지우는 diff면 PR을 만든 뒤 ship 전에 `css-removal-ok` 라벨을 먼저 달고 `gh pr checks <n> --watch`로 재실행이 끝나기를 기다린 다음 ship한다.
3. Kernel·셸·공통 컴포넌트·mock 서버가 바뀌었으면 E2E를 돌린다. 새 describe만 먼저(`cd apps/platform-e2e && pnpm exec playwright test -g "<describe>"`), 그다음 브리프 「영향 범위」 절이 적은 describe만 `-g "A|B"`로 돌린다. 로컬에서 전체 `pnpm e2e`는 돌리지 않는다. 전체는 PR CI가 돌고, 로컬 전체 실행은 CI 실패를 재현할 때만 쓴다(사용자 2026-10-26, #959).
5. **FeedbackOps 단계는 `.github/workflows/feedbackops.yml`의 `paths`에 닿았을 때만 돌린다**(경로 목록의 원본은 그 워크플로 파일이다: `docs/feedbackops/**`, `apps/fo-*/**`, `packages/fo-*/**`, `ops/feedbackops/**`, `packages/{ui,contracts,http-adapter,server-conformance}/**`, 루트 manifest·lockfile·`.nvmrc` 등). 닿았으면 저장소 루트에서 `bash ops/feedbackops/scripts/ci/gate.sh static --base origin/main`, `unit`, 그리고 integration을 모두 돌린다. integration은 `gate.sh integration`으로 돌리지 않는다: 그 단계는 `CI_PG_ADMIN_URL` 서버의 `feedbackops` DB를 migrate·truncate하는데, verify 컨테이너(5439)에서는 그것이 이슈 DB를 복제하는 원본이다. 대신 이슈 DB에서 `FEEDBACKOPS_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @fops/backend test:integration`(전체)을 돌린다. 브랜치가 migration을 더했으면 먼저 `verify-db.sh drop <n>` → `create <n> --migrate-from <worktree>`(저장소 루트 checkout)로 다시 만든다(#621). 5434는 쓰지 않는다. 플랫폼 루트 검사는 FeedbackOps를 보지 않는다. 한 단계라도 빼면 CI가 대신 잡는다(#620: unit을 빼서 proxy 완전성 테스트 실패를 CI에서야 봤다). 새 파일은 커밋 전에 `ops/feedbackops/node_modules/.bin/biome format --config-path=ops/feedbackops --write <파일>`을 돌린다(#603·#620에서 포맷만으로 static 실패).
4. 메뉴 manifest·`menus.ts`·contracts 메뉴 타입·`tooling/gen-menu`를 바꿨으면 `node tooling/gen-menu/scripts/probe.ts`(생성 → 전체 검사 → 되돌리기)를 돌린다. 루트 4종과 CI에 없어서, #671 B9에서 probe 템플릿의 타입 오류를 이 단계가 처음 잡았다. 미리보기가 떠 있는 worktree에서는 돌리지 않는다(아래 §Traps).
6. `python3 $ENGINE/worker-hygiene.py <worktree>`: 이유 없는 새 `eslint-disable`과 `eslint-suppressions.json` 증가는 실패, 공백만 바뀐 변경은 보고만 한다(설정 `worker_hygiene`).

디자인 lint 오류는 메시지가 알려 주는 토큰·variant·부품으로 고치고, suppressions에 새 위반을 더하지 않는다. 기계적으로 직접 고쳐도 되는 것에는 빠진 mock 등록(`MOCK_ENDPOINTS`, `server-conformance.test.ts`의 `PARAMS`)도 들어간다.

### 수정 라운드 (Fix round)

리뷰 지적이나 호스트 실패를 고친 라운드는 위 전부를 다시 돌리지 않는다. 바뀐 패키지 검사, 루트 `lint`·`typecheck`·`test`(캐시 사용; 가벼운 노드(2단계)는 `lint`·`typecheck`만), 닿은 describe만 `-g`로 E2E, 닿은 FeedbackOps 단계, hygiene(6)만 돌린다. 그 라운드가 7단계의 입력(공개 타입, SDK 파일 이동·이름 변경, CSS 규칙 삭제)을 바꿨으면 7단계도 돈다. `build`·전체 E2E·`probe.ts`는 돌리지 않는다 — 그 라운드가 build 입력(설정, 공개 export, `tooling/gen-menu`)을 바꾼 경우만 예외다. 전체는 PR CI가 한 번 다시 돈다(#945).

### Final head (ship 직전)

마지막 수정 라운드 뒤 ship 전에는 hygiene(6)만 돌린다. `ship-pr.sh`의 rebase가 충돌했을 때만 위 「수정 라운드」 검사를 돌린다. 충돌이 없으면 CI가 최종 head의 기록이다. 릴리스 태그는 `main` CI가 초록인 SHA에 단다.

## Browser evidence

- UX 리뷰 증거의 기본은 리뷰어가 브랜치·기준 미리보기를 직접 조작하는 것이다. ego-browser가 실패하면 다시 시도·대체하는 규칙은 전역 스킬 7d를 따르고, 호스트 캡처 → 자료 판정으로 바꿨다면 그 사실을 VERIFY에 적는다(#436 — 리뷰어 런타임이 바뀌어 예전 "처음부터 호스트 캡처" 기본을 버렸다).
- 확인은 `ego-browser`로 한다. 막히면 `apps/platform-e2e`의 Playwright 일회용 캡처로 대신하고, 대신했다고 말한다.
- 미리보기는 `$ENGINE/app-preview.py start <checkout> --name <n>-branch`(기준은 `<n>-main`)로 띄운다. mock 조립 vite가 5180–5199 사이 빈 포트에 뜨고, 백엔드는 없다.
- 기준 worktree 설치: `pnpm install --frozen-lockfile`.
- 캡처는 차트 canvas와 표 행이 그려진 뒤에 찍는다. 같은 턴에 `stop`한다.

## Review

- 계획은 `python3 $ENGINE/review-plan.py <checkout> [--base origin/main]`으로 세운다. 규칙은 `conductor.json`의 `review_plan`이고, 엔진 저장소의 이 레포 케이스(`engine/tests/ap/test-review-plan.py`)가 고정한다.
- 플래그별 처리:
  - `flags.permission`·`flags.instructions`는 전역 스킬 7a를 따른다.
  - `flags.e2e`가 있으면 Verify 3단계(E2E)를 했는지 확인한다. `flags.submodule`(`docs/feedbackops/`·`apps/fo-*`·`packages/fo-*`·`ops/feedbackops/` 변경)이면 FeedbackOps 게이트(저장소 루트에서 `bash ops/feedbackops/scripts/ci/gate.sh static|unit|integration`, CI는 `.github/workflows/feedbackops.yml`)를 확인한다.
  - `flags.contract`면 06 계약·ADR을 고친 곳을 코드 리뷰어 작업에 적는다.
- 리뷰어 규칙:
  - 코드 리뷰어는 전역 `templates/review-rules.md` + [`addenda/review-rules.md`](addenda/review-rules.md)(작업자 worktree에서는 `.review/00-REVIEW-RULES.md`로 합쳐져 있다). 브리프 사전 점검은 전역 `templates/brief-check.md` + [`addenda/brief-check.md`](addenda/brief-check.md).
  - UX 리뷰어와 품질 리뷰어는 전역 `~/.agents/agents/review-ux.md`·`review-quality.md`이고, 이 레포의 기준은 아래 `Review lens` 두 절이다.
- **리뷰를 줄이는 경우(#1018 C6·O5, 사용자 2026-10-27):** 한곳에 모은다.
  - 기계적·문구 전용 diff(이동·이름 바꾸기·생성기 출력·문구만 바뀜)는 VERIFY에 `git diff --numstat` 근거 한 줄과 "기계적 diff, review-final 생략"을 적으면 `review-final`을 건너뛸 수 있다(전역 스킬 7g가 이미 허용한다; 팀장 점검은 [`LANES.md`](LANES.md) §팀장 「흐름 점검」).
  - 리뷰 결과에 blocker·major가 없고 minor·nit뿐이며 diff가 작으면(≲150 변경 줄 — 이 수는 사용자 결정이 아니라 팀장 판단이고 되돌릴 수 있다. 기계적·문구 diff는 크기와 관계없이 작은 diff로 본다, 생성기 출력 포함) 병합 전 수정 라운드를 열지 않고 병합한다. 지적은 항상 그날 `.planning/backlog.md`나 묶음 이슈에 남기고 링크를 단다(Deferrals 규칙; 다음 PR이 고치면 그 줄을 지운다). 전역 스킬 7f의 minor·nit 처리보다 이 프로필이 우선한다. blocker·major가 하나라도 있으면 지금 규칙 그대로다.
- 성능: 측정 도구가 없다. 회귀를 실제로 재었을 때만 `review-perf`를 띄우고, 그 밖에는 코드 리뷰어 작업에 성능 관점을 넣는다.
- 충돌을 정하는 순서의 맨 앞: 권한·데이터 누출 규칙 → ADR·06 계약·기록된 사용자 결정.
- 과거 병합으로 맞춰 본 결과: #247(드릴다운) → code+ux+perf, permission·e2e·contract / #246(표 컬럼) → code+ux, e2e / #248·#253(문서) → 리뷰 없음.
- **큰 범위의 계획 리뷰**(사용자 2026-10-23): `impl-complex` 브리프, 06 계약·패키지 경계·SDK 공개 API(`sdk:api`)를 바꾸는 브리프는 작업자를 띄우기 전에 브리프 점검과 별도로 `review-quality` 페르소나가 브리프를 본다. 보는 것은 아래 `Review lens: quality`의 기준이다: SDK·플랫폼·메뉴 역할 경계, 의존 방향, 공통화, 공개 API 모양, 코드 품질. 지적은 브리프에 넣고 시작한다. 엔진 단계가 생기기 전까지는 이 절이 규칙이다(conductor-engine#80).
- **영향 범위·회귀 점검**(사용자 2026-10-23, 모든 브리프): 브리프마다 `영향 범위와 회귀 가능성` 절을 넣는다. 깊이는 얕게, 범위는 넓게 본다.
  - 닿는 소비자를 적는다: 바꾸는 부품·계약을 쓰는 곳을 `rg`로 찾은 메뉴, 셸, 보드, 앱 조립.
  - 함께 바뀌어야 하는 06 절, ADR, 문서를 적는다.
  - 회귀 위험을 높은 순으로 적고, 위험마다 그것을 잡는 테스트·E2E describe를 적는다. 변경이 화면·셸·Kernel·공통 컴포넌트·mock 서버에 닿아 E2E가 필요하면 **E2E describe 이름이 반드시 있어야 한다**(단위 테스트만 적은 브리프는 미완성이다, #959). 로컬 E2E는 이 목록의 describe만 `-g`로 돌리므로 목록이 곧 안전망이다. 없으면 "덮지 않음"이라고 쓰고 브리프에 테스트를 더한다.
  - `packages/*`, 셸, `@ap/contracts`, 메뉴 둘 이상을 건드리는 브리프는 작업자를 띄우기 전에 넓게 보는 리뷰어 한 명이 이 절을 검토한다. 브리프 점검과 같은 `review-check` 역할로, 계획 리뷰와 나란히 돌린다. 이 리뷰어는 저장소 전체를 얕게 훑고(import, Registry, E2E describe, 문서 소유) 빠진 영향과 회귀를 막는 항목으로 돌려준다.
  - 엔진에 전용 역할(`review-impact`)과 브리프 절이 생기기 전까지는 이 절이 규칙이다(conductor-engine#91).
- **병합 전 문서 단계**(사용자 2026-10-23): 이슈·묶음마다 마지막 수정 라운드 뒤, 병합 전에 두 가지를 한다.
  1. 문서 동기화 작업자: diff를 소유 문서([`docs/AGENTS.md`](../../docs/AGENTS.md) 소유권)에 이어 본다. 대상은 06 계약 절, ADR, `docs/integration/*`, 요구·화면 문서, `GLOSSARY.md`, 폴더 `AGENTS.md`, `.planning/README.md`·`backlog.md`이고, 어긋난 곳을 고친다. 보고서에는 확인한 코드↔문서 연결을 적는다.
  2. 문서 리뷰: 문서 diff를 `review-check`가 본다. 코드와 맞는지, 계약 소유 문서가 한 곳인지, 용어, 링크(`pnpm docs:links`)를 확인한다. 문서만 바꾼 PR도 이 리뷰는 받는다.
  엔진 단계와 역할이 생기기 전까지는 이 절이 규칙이다(conductor-engine#81).
- 스킬·엔진·템플릿·페르소나를 고쳐야 하는 일은 이 레포가 아니라 conductor-engine 이슈로 올린다(`$ENGINE/upstream-file.sh`).

## Review lens: UX

전역 `review-ux` 페르소나가 이 절을 먼저 읽는다. 보고서는 한국어로 쓴다.

- **미리보기**: `branch`와 `main`(기준) 둘 다 mock 조립 vite 서버다. 백엔드·로그인·DB가 없고, 포트가 달라 localStorage도 따로다. UI를 통한 쓰기는 mock 메모리에만 남는다.
- **역할**: 각 미리보기 origin에서 localStorage `platform:role`로 정한다(예: 관리자·일반). 값은 JSON 문자열이다(`"admin"` — 따옴표 없는 `admin`은 무시된다). 로딩·빈·오류 상태는 mock DevTools의 응답 시나리오로 만든다(페이지를 새로 열 때마다 다시 고른다).
- **뷰포트**: 1440×900(`page.cdp("Emulation.setDeviceMetricsOverride", …)`), 상세 슬롯이 열리는 화면은 1280에서도 본다.
- **기준 문서**:
  - 루트 `AGENTS.md`(플랫폼이 목적, 메뉴 화면은 견본), `DESIGN.md`(FeedbackOps 디자인 시스템을 따르는 시각 규칙), `GLOSSARY.md`(용어).
  - `docs/contract/platform-ui-contract.md`의 해당 절: 셸 §7, 상세 슬롯 §13, 차트 §16, 상태 표시 §19, 메뉴 간 연결 §22, 그리고 이슈가 가리키는 절과 ADR.
  - 컨펌된 시안(실제 앱 위 `?variant=` 중 사용자가 고른 안). 시안과 다르면 `owner-question`이다.
  - 프로젝트가 말하지 않는 곳에만 일반 관점: `web-design-guidelines`·`interface-design` 스킬.
- **추가 점검**:
  - **URL 계약**: 새로고침·뒤로/앞으로·링크 복사로 같은 화면이 열리는가. Context 바를 바꿨을 때 page 값이 계약대로 남거나 지워지는가(06 §6.4).
  - **키보드 기준**: 06 §26 입력 기준(Windows, 키보드와 마우스 함께).
  - **문구**: 한국어 화면 문구, 기존 i18n 표현 재사용, `GLOSSARY.md` 용어(예: 설비명이 아니라 EquipmentID).
  - **일관성**: 50px 페이지 머리, 원색 대신 토큰, 일회용 대신 `@ap/ui`·`@ap/components` 부품.
- **심각도 예시**: `blocker`에는 다른 범위(Scope)의 데이터가 보이는 것, `major`에는 06 계약과 어긋나는 것이 들어간다.

## Review lens: quality

전역 `review-quality` 페르소나가 이 절을 먼저 읽는다. 보고서는 한국어로 쓴다.

- **범위**: `<직전 릴리스 태그>...origin/main`(위 Slice close).
- **기준 문서**: 루트 `AGENTS.md`(목적, 의존 방향, 공통화 기준, 검증)와 `packages/AGENTS.md`, 건드린 경로의 폴더 `AGENTS.md`; `docs/integration/platform-packages.md`(패키지 경계 §3), `docs/contract/platform-ui-contract.md` §24(공통화 — 실제 소비자 2–3곳에서 확인된 뒤), `docs/AGENTS.md`(계약은 소유 문서 한 곳).
- **경계 누출**: Kernel·공통 컴포넌트·셸이 메뉴나 mock을 안다; 역방향 import; 메뉴가 공개 진입점이 아닌 `@ap/*` 내부를 import한다; FeedbackOps primitive를 `@ap/ui` 밖에서 쓴다; 프런트가 권한을 진실로 강제한다.
- **공통화 판단**: 소비자 하나뿐인데 공통 패키지로 올라간 것, 반대로 2–3곳에 반복되는데 메뉴에 남은 것.
- **캐시 입력**: 패키지 밖 파일을 읽는 테스트·린트는 `turbo.json`에 `$TURBO_ROOT$` inputs를 선언했는가(없으면 turbo 캐시가 바뀐 입력을 놓친다, #945).
- **죽은 코드에 더해**: 지우지 않은 프로토타입(`?variant=`) 코드.
- **문서 표류에 더해**: 06 절, ADR, `.planning/README.md` 줄.
- **release-blocker**: 틀린 동작이나 데이터를 내보낼 패키지 경계·06 계약·권한 위반만.

## Fold scope

이슈 diff 밖에서 fold로 만질 수 있는 곳은 둘이다: 그 diff가 바꾼 메뉴 폴더 `menus/<space>/<group>/src/`, i18n 사전. `packages/ui`·`packages/kernel`·`packages/contracts`·셸·다른 메뉴는 fold로 만지지 않는다.

## Slice close

- 품질 리뷰 범위는 `<직전 태그>...origin/main`이다.
- 화면이 바뀐 슬라이스면 `origin/main` 미리보기로 사용자 흐름을 `review-ux`로 본다.
- 그다음 순서(문서 점검·소개 사이트 갱신 포함)는 [`LANES.md`](LANES.md) §팀장 릴리스가 원본이다. 끝나면 다음 슬라이스를 사용자에게 묻는다. 릴리스 명령은 `SHA=$(git rev-parse origin/main)`로 시작해 `gh release create --target "$SHA"`에 전체 SHA를 준다(짧은 SHA는 `target_commitish is invalid`).
- 인계 전 `$ENGINE/app-preview.py status`에 추적 중인 미리보기가 없어야 한다.

## Tools

공용 부품(`issue-wave-conductor`·`orca-dispatch-recipes`·`session-handoff` 스킬, 리뷰어 페르소나, 워크플로 훅)은 conductor-engine의 `install.sh`가 설치하고 이 레포에는 복사본을 두지 않는다. 세션 시작 문맥에 설치 커밋이 보이고, 설치본이 고쳐졌다는 경고가 뜨면 provider 체크아웃에서 `install.sh --check`를 돌린다.

| 도구 | 하는 일 | 고정 테스트 |
| --- | --- | --- |
| `$ENGINE/launch-worker.py <n> <slug>` | 위 Launch | 엔진 저장소 `test-launch-worker.py` |
| `$ENGINE/review-plan.py <checkout> [--base origin/main] [--head HEAD]` | 리뷰 계획 | 엔진 저장소 `engine/tests/ap/` |
| `$ENGINE/wave-status.py [--json] [--prs] [--state-dir <dir>]` | 읽기 전용 스냅숏: 작업자·리뷰어, 미리보기(엔진 `app-preview.py`로 소유 판정), worktree, `--prs`면 열린 PR의 CI. `$WAVE_STATE`가 없으면 이 레포의 최근 세션 `wave/` 폴더(하루 안)를 읽는다 | 엔진 저장소 `engine/tests/ap/` |
| `$ENGINE/worker-hygiene.py <worktree>` | 위 Verify 6단계 | 엔진 저장소 `engine/tests/ap/` |
| `$ENGINE/app-preview.py start <checkout> [--name <label>]` / `stop <label>\|--all` / `status` | mock 미리보기(엔진 도구, 이 레포 설정은 `conductor.json`의 `app_preview`) | 엔진 저장소 `engine/tests/test-app-preview.py` |
| 전역 `templates/brief-check.md` + `addenda/brief-check.md` | 브리프 사전 점검 항목 | – |
| `bash tooling/scripts/next-adr.sh` | ADR 번호 정하기 | – |
| `bash .agents/conductor/scripts/with-lock.sh <잠금> "<purpose>" -- <명령…>` | 기계 자원 잠금(`heavy.lock`·`browser.lock`·`merge.lock`·`worker-slot-N`)을 잡고 자식 수명에 묶어 푼다. owner(`ORCA_TERMINAL_HANDLE`/`WITH_LOCK_OWNER`)와 `token`이 같아야 풀고, purpose 끝에 `, pid <래퍼 PID>`를 붙인다(LANES §기계 자원) | 임시 `AP_MAIN` 시험(#1018 FIX1 보고) |
| `bash .agents/conductor/scripts/verify-root.sh [--light] <log-dir>` | 위 Verify 2단계(루트 lint→typecheck→test→build, test·build는 `heavy.lock` 아래) | 임시 저장소 시험(#1018 FIX1 보고) |
| `bash .agents/conductor/scripts/lock-audit.sh` | 끝난 일의 잠금 찾기(30분 점검, 아무것도 풀지 않는다) | 임시 `AP_MAIN` 시험(#1018 FIX1 보고) |

`app-preview.py`의 동작:

- `status`는 추적 중인 미리보기와 남의 vite를 보여 준다. 남의 vite는 `untracked`로 표시하고 건드리지 않는다.
- `stop`은 신호를 보내기 전에 소유를 확인한다. 기준은 기록된 pgid, 부모의 시작 시각, 명령이다.
- 부모가 없으면 그 그룹 안에서 기록된 checkout이 실행한 vite만 인정한다. 인정하는 형태는 둘이다:
  - `node …/vite/bin/vite.js`(상대 경로는 lsof로 읽은 프로세스 cwd를 기준으로 푼다), 또는 checkout의 `node_modules/.bin/vite`;
  - 여기에 `--port`가 정확히 맞고 `--strictPort`가 있어야 한다.
- 소유가 불명확하면 상태 파일을 남긴 채 `ownership unclear`로 건너뛴다.

레포 전용 conductor 도구는 `scripts/`에 있다(위 표의 `with-lock.sh`·`verify-root.sh`·`lock-audit.sh`, 그리고 `capacity.sh` — LANES §기계 자원). `app-preview.py`를 포함한 전역 엔진의 테스트는 엔진 저장소에서 돈다(`bash engine/scripts/test.sh`, conductor-engine#18).

## Traps

- 화면 동작(상태, 요청 모양, 응답 필드)이 바뀌는 PR은 UX 리뷰를 생략해도 병합 전에 콘덕터가 실서버(이슈 DB + `app-preview.py`/`dev:real`)에서 ego-browser로 바뀐 흐름을 한 번 직접 보고 VERIFY에 적는다. `review-plan.py`가 ux `required`를 냈으면 생략 이유와 대신한 브라우저 확인을 PR 본문에 함께 적는다. 단위 테스트의 mock 서버와 `focusManager` 토글은 실서버 경로를 증명하지 않는다(#733·#737은 브라우저 확인 없이 병합됐다, 2026-10-24).
- 작업자 함정은 [`docs/agents/operations.md`](../../docs/agents/operations.md)에 있다: 새 worktree 설치, pnpm 11, CSS selector CI, 캡처, mock 등록.
- 일반 `git worktree add`로 만든 기준 worktree에는 Orca 터미널 리뷰어를 띄울 수 없다. 거기서는 미리보기만 돌린다.
- 여러 세션이 이 저장소에 ADR을 쓴다(M6, #598). 번호는 #598에 "ADR-NNNN 예약" 코멘트를 남긴 뒤에 쓴다. 예약하기 전에 `origin/main`과 열린 PR을 모두 확인한다. 같은 시각에 다른 세션이 0067을 먼저 머지해서, 충돌 난 PR을 0068로 다시 올렸다(#613 → #616). 예약을 남겨도 다른 세션이 예약을 보지 않고 같은 번호를 쓸 수 있다(#698이 #671 예약 0075를 먼저 머지, #699가 0076으로 옮김, 2026-10-23) — ship 직전 `origin/main`의 `docs/adr`를 다시 본다.
- 머지가 거절되면(`gh pr merge`가 `--auto`를 권하는 메시지) 원격 브랜치를 지우기 전에 `gh pr view <n> --json state`로 상태를 확인한다. 지우면 PR이 닫힌다(#613).
- 메인 체크아웃의 `node_modules`는 병합이 쌓이면 낡는다. 마감 검사 전에 `pnpm install --frozen-lockfile`.
- 이 프로필의 상대 경로(`addenda/`)는 `$CONDUCTOR` 기준이다. 레포 루트에서 그대로 실행하면 "No such file"이다.
- 이슈 번호가 없는 작업(마감 정리 등)은 `launch-worker.py`가 worktree를 만들지 못한다(`--issue`가 숫자를 요구). 손으로 한다: `orca worktree create --setup skip`(`--issue` 없이) → 설치 → 설정 셸 닫기 → TASK 작성 → 공유 실행기.
- E2E는 vite dev 서버 위에서 돈다. 호스트 검사(루트 test·E2E)가 도는 worktree의 소스를 고치지 않는다 — HMR이 화면을 다시 그려 우연한 E2E 실패가 난다(#403: 검사 중 `module.ts` 수정 → Scope 메뉴 항목 detached). 고칠 것이 생기면 검사가 끝난 뒤 고치고 다시 돌린다.
- E2E 포트는 기본 4190(`E2E_PORT`, base-path는 `E2E_BASE_PATH_PORT` 기본 4191, #809)이고 `--strictPort`다. 다른 세션이 같은 포트로 E2E를 돌리면 `is already used`로 바로 실패하니, [`LANES.md`](LANES.md)의 흐름별 포트로 돌린다. 남의 프로세스는 건드리지 않는다(`lsof -nP -iTCP:<port> -sTCP:LISTEN`으로 PID를 찾고 `lsof -a -p <PID> -d cwd`로 cwd 확인). 전체 E2E를 누구에게 알리는지는 LANES.md다.
- `ship-pr.sh --issue`가 PR 본문의 `Closes #n`으로 이미 닫힌 이슈를 다시 닫으려다 `Could not close the issue`로 끝나면 머지는 됐어도 `--worktree` 정리와 `--archive-review`가 돌지 않고 JSON에 `merged`가 빠진다([conductor-engine#58](https://github.com/hjung3113/conductor-engine/issues/58)). 그때는 `gh pr list --head <branch> --state all`로 병합을 확인하고, worktree의 `.review/`를 손으로 보관한 뒤 worktree를 지운다(#546).
- PR에 `css-removal-ok` 라벨을 붙인 직후 `ship-pr.sh`를 다시 돌리면 css-selectors 재실행이 시작되기 전이라 이전 실패 실행으로 판정한다. 라벨을 붙인 뒤 `gh pr checks <n> --watch`로 재실행이 끝나기를 기다린 다음 ship한다(슬라이스 17). `gh pr checks <n> --watch`가 끝난 뒤에도 `ship-pr.sh --ci`가 같은 head의 이전 실패 실행을 보고 `ci_failed`(exit 21)를 낼 수 있다(2026-10-27 #997에서 세 번 연속). 모든 점검이 pass인 것을 `gh pr checks <n> --json name,bucket`으로 확인하고 `merge.lock` 아래에서 `gh pr merge <n> --squash`로 병합한다. [conductor-engine#144](https://github.com/hjung3113/conductor-engine/issues/144) → §Verify 7단계가 정식 규칙
- 리뷰어가 쓰는 미리보기의 worktree에서 메뉴 생성기 probe(`node tooling/gen-menu/scripts/probe.ts`)처럼 파일을 쓰는 명령을 돌리지 않는다 — 파일이 생겼다 지워지는 사이 vite가 import 오류 화면을 띄워 UX 리뷰가 멈췄다(#552, 2026-10-21). probe는 미리보기를 멈춘 뒤 돌린다.
- UX 리뷰 작업서 첫 줄 근처에 "클립보드를 읽지 않는다"를 적는다. `navigator.clipboard.readText()`는 Ego Lite task space 제어권을 사용자에게 넘겨 리뷰가 멈춘다(#552). 링크 복사는 성공 토스트와 주소창으로 판단한다.
- 브리프 사전 점검 패치에 "코디네이터가 착수 전 결정"이라고 남은 항목은 착수 전에 브리프에 결정을 적는다. 비워 두면 작업자가 정책 공백으로 멈춘다(#552 2부, 2026-10-21).
- 작업자·리뷰어를 띄운 같은 턴에 `worker-wait.sh`를 `run_in_background`로 건다. 띄우고 대기를 안 걸면 끝나도 알림이 오지 않는다(#552 2부 코드 리뷰).
- 공용 부품이 틀렸거나 빠졌으면 메모리나 `HANDOFF.md`에만 적지 않는다. 콘덕터가 provider의 `engine/scripts/upstream-file.sh`로 `upstream` 이슈를 올리고, 레포 안 임시 우회는 이 절에 그 이슈 링크와 함께 적는다.
- `?variant=` 시안은 그 값을 메뉴 `pageKeys`에 넣어야 주소를 바꿀 때 화면이 다시 그려진다. 빠지면 안을 바꿔도 A가 그대로 보인다(#541 시안, 2026-10-21).
- 콘덕터 호스트 Playwright 캡처는 `apps/platform-e2e` 안에서 `@playwright/test`를 import해 돌리고, 주소에 `v=1&scopeId=MEM`을 붙인다. Scope가 없으면 "Scope를 선택하세요"만 그려져 canvas를 기다리다 시간 초과다(2026-10-21).
- 브리프에 도메인 계층·묶음(예: "Maker → Module")을 적기 전에 `GLOSSARY.md`와 대조한다. 확인 없이 옮긴 "제조사/모듈 묶음"으로 쓸모없는 시안 라운드를 돌렸다(#541, 원칙은 루트 AGENTS.md "SDK는 범용 조각을 준다").
- 커밋은 검사의 종료 코드로만 건다. `vitest … | grep 'Tests ' && git commit`은 grep이 성공하면 실패한 테스트 위에도 커밋한다(#576 FIX1 문구 수정, 2026-10-21).
- IA·메뉴 구성 시안 캡처는 공간의 레일 섹션마다 찍는다. 셸은 그룹을 레일 섹션으로 그리고 사이드바에는 고른 섹션의 메뉴만 보여, 첫 화면 캡처만으로는 메뉴 트리가 안 보인다. 안을 바꿔 가며 찍으면 최근 방문이 섞이니 캡처마다 origin의 localStorage·sessionStorage를 비운다(#252, 2026-10-21).
- 팝오버·메뉴는 열릴 때 200ms 동안 투명에서 서서히 나타난다. 캡처와 시각 판정은 애니메이션이 끝난 뒤에 한다. 중간 캡처를 "배경이 비친다"는 결함으로 잘못 보고했다(Sol 확인 결과 재현 안 됨, 2026-10-21).
- `@ap/contracts`·SDK 패키지의 공개 타입(union 확장 포함)을 바꾸면 루트 검사 뒤 `pnpm sdk:api`도 돌린다. 루트 4종 검사에는 없고 CI만 돌려서, 로컬이 초록이어도 CI가 깨진다. 의도한 변경이면 `--update`와 `docs/integration/sdk-git-tag-consumption.md` 변경 기록 한 줄(#252, 2026-10-21). → §Verify 7단계가 정식 규칙
- #592(FeedbackOps 서브모듈 → 디렉터리) 이전에 만든 worktree는 `products/feedbackops/` 서브모듈 checkout이 새 트리의 추적 파일과 겹쳐 `git checkout origin/main`이 "untracked … would be overwritten"으로 멈춘다. 서브모듈에 변경이 없는지 보고 `git submodule deinit -f products/feedbackops` → `trash products/feedbackops` → checkout(2026-10-22).
- 슬라이스·웨이브 Epic(예: #557 MARS 이관)은 릴리스로 닫지 않는다. 릴리스 정리 명령에서 Epic을 잘못 닫았다가 다시 열었다(2026-10-21). 닫는 것은 PR 본문 `Closes`가 가리키는 이슈만.
- `launch-worker.py <n>`은 브리프의 report·sentinel이 `.review/W-<n>-REPORT.md`·`<!-- W-<n>-DONE -->`이어야 띄운다. 같은 이슈의 두 번째 단계도 새 worktree면 같은 이름을 쓴다(`-STEP1-DONE` 같은 이름은 거부, #575 1단계).
- `app-preview.py stop --all`이 추적 중인 미리보기를 끄지 않고 성공을 돌려준 적이 있다([conductor-engine#63](https://github.com/hjung3113/conductor-engine/issues/63)). 끈 뒤 `status`로 확인하고, 남았으면 이름으로 `stop <label>`.
- `ship-pr.sh`가 돌고 있는 checkout(특히 `$MAIN`)에서 다른 브랜치로 `git switch`하지 않는다. 배경 ship이 CI를 기다리는 사이 같은 checkout에서 새 브랜치를 만들어, 새 브랜치가 아직 병합 전인 다른 PR의 커밋을 안고 시작했다(#716, 2026-10-23). ship은 그 브랜치용 `git worktree add`에서 돌린다.
- `ship-pr.sh`를 `| tail -1`로 돌리면 rebase 충돌(종료 20)이 `{"pr": null, "merged": false}`로만 보인다([conductor-engine#64](https://github.com/hjung3113/conductor-engine/issues/64)). 출력은 파일로 받고 종료 코드를 따로 확인한다. 충돌을 풀면 다른 세션이 막 병합한 테스트가 바뀐 모델을 모를 수 있으니(#605 테스트가 V1 보드를 `Board`로 시드) 루트 검사를 처음부터 다시 돌린다.
- #642 이전에 FeedbackOps를 중첩 설치한 checkout은 `products/feedbackops/node_modules`(와 그 아래 앱·패키지의 `node_modules`)에 옛 설치가 남는다. 루트 설치가 지우지 않아 FeedbackOps 디렉터리에서 `turbo`가 2.3.3으로 잡힌다. 그런 checkout은 `trash products/feedbackops/node_modules apps/fo-*/node_modules packages/fo-*/node_modules` 뒤 루트 `pnpm install --frozen-lockfile`(2026-10-22).
- 실서버(`dev:real` + 이슈 DB) UX 작업서에는 Context가 있는 화면과 그 화면을 열 수 있는 페르소나를 미리 적는다. 시드 페르소나(Mock User·Mock Admin)는 분석 공간 권한이 없어 분석 메뉴가 `이 메뉴에 대한 권한이 없습니다`이고, 운영 콘솔 `변경 감사`(행위자 필터 + 기간)가 Context를 가진 화면이다. 플랫폼 `로그아웃`은 아직 비활성이라 사용자 교체는 `/auth/login` 재선택으로만 본다(#656 UX 리뷰, 2026-10-23).
- FeedbackOps 화면(`apps/fo-frontend/**`)의 브리프에 플랫폼 타이포 클래스 `t-card-title`·`t-section-title`을 적지 않는다. FO `lint:design`(`no-unknown-classes`)이 거부한다. 14px/600은 FO `text-base font-semibold`다(FO `text-sm`은 13px). (#657b, 2026-10-24)
- 실서버 조립(`dev:real` + 이슈 DB)에서는 공간 0개 홈을 볼 수 없다. log-dev 공간 메뉴가 `platform:view`만 요구해서 모든 로그인 사용자에게 공간이 있다. 공간 0개 상태는 홈 단위 테스트로 확인하고, UX 작업서에 "공간 0개 페르소나"를 적지 않는다(#657a UX 리뷰, 2026-10-24).
- FeedbackOps visual harness는 저장소 루트에서 `bash ops/feedbackops/conductor/scripts/visual.sh run`으로 돌린다. 하니스는 git 최상위를 checkout 루트로 잡고 앱 위치는 `ops/feedbackops/paths.sh`에서 읽는다(713p1 이전에는 `products/feedbackops/`에서 `VISUAL_ROOT=$PWD`가 필요했다, #642).
- 테스트가 관찰한 동작과 단언이 어긋나면, 단언을 동작에 맞춰 풀기 전에 브리프·계약(06, ADR)과 대조한다. 거절돼야 할 드롭(보드 탭)이 보드를 바꾸는 것을 보고 단언을 느슨하게 맞췄다가 코드 리뷰가 계약 위반으로 잡았다(#686, 2026-10-23). 계약과 다르면 단언이 아니라 코드를 고친다.
- 릴리스·태그 상태는 원격에서 확인한다(`gh release list`, `git fetch --tags` 뒤 `git tag`). 로컬 태그만 보고 "마지막 SDK 태그는 `sdk-v0.11.0`"이라 보고했는데, 다른 세션이 이미 `sdk-v0.12.0`을 발행한 뒤였다(2026-10-24).
- 사실을 적는 PR(소개 사이트·docs 17·상태 표)은 병합 직전에 `origin/main`으로 rebase하고, 본문이 인용한 이슈 번호마다 `gh issue view <n> --json state`를 다시 본다. #725는 리뷰 4라운드 사이에 #657이 병합되고 #708이 백로그로 닫혀 "예정 #657"·"예정 #708"이 틀린 문장이 됐고, rebase에서야 알았다(2026-10-24).
- 사이트 캡처(`site/scripts/shots.mjs`)가 비동기 조회로 채워지는 칸을 보여 준다고 적으면, 그 칸의 내용이 뜰 때까지 기다리는 줄을 capture 준비 단계에 둔다. `go()`의 `aria-busy` 대기는 그런 칸을 기다리지 않아, 홈 공지 띠가 뜨기 전에 찍혔다(#725, 2026-10-24).
- 루트 test가 호스트에서 초록이어도, CI에서는 테스트 파일이 더 오래 돌아 테스트가 끝난 뒤의 타이머가 불린다. 그 타이머가 jsdom에 없는 API를 부르면 처리되지 않은 오류가 되고, 테스트는 모두 통과해도 vitest는 1로 끝난다. 표 내보내기는 1초 뒤 `URL.revokeObjectURL`을 부르는데, `afterEach`가 jsdom의 원래 값(`undefined`)으로 되돌려 놓아 main CI가 깨졌다(#752 → #755에서 수정, 2026-10-24). jsdom에 없는 전역을 스텁하는 테스트는 원래 값이 없으면 스텁을 남긴다. CI의 `Unhandled Errors`도 실패로 읽는다.
- `PanelWorkspace` 프리셋·비율을 바꾼 뒤의 UX 재확인은 이전 리뷰가 남긴 `platform:workspace:v1:*<persistKey>*` 저장값이 바뀐 프리셋을 가린다(저장값 우선은 계약대로다). 재확인 작업서에 "측정 전에 단계마다 `기본 배치`를 누르거나 그 키를 지운다"를 적는다(#690 690i, 2026-10-24). 셸의 사이드바 기본값도 폭에 따라 다르다(1440 미만은 접힘, `packages/shell/src/AppShell.tsx`). 폭별로 잰 상태를 작업서에 적는다.
- FeedbackOps 다리 entry를 더하는 노드는 공유 목록 네 곳을 함께 고친다: FO `apps/fo-frontend/package.json` `exports`, `tooling/eslint/src/index.js` `FO_BRIDGE_ENTRIES`, `tooling/eslint/src/boundaries.test.ts`의 entry 배열, `packages/fo-bridge/src/fo-entry-graph.test.ts`의 describe. 병렬 노드가 둘 이상이면 rebase마다 여기서 충돌한다. 손으로 합치지 말고 `origin/main` 쪽을 가져온 뒤 이 노드의 줄·describe만 덧붙이고, 합친 뒤 describe 수가 main + 이 노드 수인지 센다. #763 763l에서 손으로 합치다 Milestones describe 끝이 잘려 `Unexpected end of file`이 났다(2026-10-26).
- URL 키를 다시 쓰는 코드의 브리프에 "이전 값의 타입을 지키려면 `String(previous[key]) === value ? previous[key] : value`" 같은 비교를 처방하지 않는다. #763 763l·763b의 코드 리뷰 F1이 둘 다 이 처방에서 나왔다. 고친 모양은 763l이 `overdue` 키만 불리언으로 두는 것, 763b가 `previous[key] !== value` 비교였다. 키마다 타입을 브리프에 적고, 이전 값 재사용이 꼭 필요하면 `previous[key] !== undefined &&`로 시작하게 한다(763q2, 2026-10-26).
- `dev:real`에서 다른 페르소나를 리뷰어와 동시에 보려면 같은 vite를 다른 origin으로 연다: `http://[::1]:5186`(vite가 `localhost`에만 묶여 `127.0.0.1`은 연결 거부). 쿠키는 호스트별이라 `localhost`에서 돌고 있는 UX 리뷰어의 로그인 세션을 바꾸지 않는다(#763 p1 403 확인, 2026-10-26).
- 작업자 결과를 받으면 `git status --short | wc -l`을 보고서의 바뀐 파일 수와 먼저 맞춘다. #774 묶음에서 작업자가 `biome check --write`를 바꾼 파일이 아니라 넓은 범위로 돌려 `products/feedbackops/**`·`apps/fo-*`의 관련 없는 파일 229개(import 순서·배열 줄바꿈, `.mcp.json`·백엔드 `db/tx.ts` 등)를 다시 썼다. 보고서는 13개만 적었다. 콘덕터가 그 13개를 따로 보관하고 나머지를 `git checkout --`로 되돌렸다. 브리프와 수정 작업서에는 "`biome check --write <바꾼 파일 경로들>` — 디렉터리나 `.`을 넘기지 않는다"를 적는다(2026-10-26).
- FeedbackOps visual harness(`apps/fo-frontend/tests/visual`)는 darwin 전용이라 CI에도 `gate.sh`에도 없다. FO 화면이나 `packages/{ui,shell,kernel,components}` 공용 부품을 바꾸는 이슈는 병합 전에 호스트에서 저장소 루트의 `bash ops/feedbackops/conductor/scripts/visual.sh run <filter>`를 돌린다. 안 돌려서 기준 화면 29개가 낡았다(#954, 2026-10-27). 작업자 샌드박스는 Chromium을 못 띄우므로(142건 실행 오류) 코디네이터가 호스트에서 돌리고, 실패는 diff 이미지로 의도/회귀/flake를 가른 뒤 의도한 것만 `update`한다.
- SDK 패키지(`packages/{contracts,ui,kernel,components,shell}`)의 파일을 옮기거나 이름을 바꾸는 노드는 루트 4종에 더해 `pnpm sdk:pack --out <dir> && pnpm sdk:consumer-check <dir>`를 호스트에서 돌린다. 루트 검사에 없고 CI만 돌리는데, dist JS 파일 순서가 바뀌면 `sdk:consumer-check`가 고르는 패키지 전용 클래스가 달라져 숨은 결함이 드러난다: #713 713f에서 `hasCssSelector`의 lookahead가 `.space-y-4>:not(:last-child)`(`>` 바로 뒤)를 못 잡아 CI만 실패했다(호스트 4종은 초록, 2026-10-27, `tooling/sdk/sdk-css-probes.mjs` 수정). → §Verify 7단계가 정식 규칙
