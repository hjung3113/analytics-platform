# Conductor profile — analytics-platform

전역 `issue-wave-conductor` 스킬(`~/.agents/skills/issue-wave-conductor/SKILL.md`)이 쓰는 이 레포의 부분이다(#361). 공통 절차는 전역 스킬에 있고, 여기에는 이 레포에서 다른 것만 적는다. 작업 규칙의 원본은 루트 `AGENTS.md`이고 둘이 다르면 `AGENTS.md`를 따른다. `$CONDUCTOR`는 이 폴더(`.agents/conductor/`)다.

FeedbackOps 원본과 다른 점: DB·로그인이 없다(mock 어댑터). 화면 증거는 Playwright E2E(`apps/platform-e2e`)와 mock 미리보기다. 시각 기준 이미지·biome·nav-perf·임시 Postgres는 없다.

## Flow

- `<base>`는 `main` 하나다(develop 없음). 병합은 squash로 한다. 릴리스는 보드 문서 PR → 태그 + GitHub Release.
- 브랜치는 `feat/<n>-<slug>`. `$MAIN`은 `AP_MAIN`(메인 체크아웃 경로)이고, worktree는 `~/orca/workspaces/analytics-platform/<n>-<slug>`.
- `WAVE_BRIEFS`는 `$AP_MAIN/.review/wave/`(`.review/`는 `.git/info/exclude`).
- `ship-pr.sh`를 쓰려면 이 클론에서 한 번 `git config workerops.protectedBases none`이 필요하다(PR 기준이 main이다).
- PR마다 `.planning/README.md`의 해당 줄을 같은 PR에서 고친다.

## Launch

- `scripts/launch-worker.sh <n> <slug>`가 하는 일:
  - Orca worktree를 `origin/main`에서 만들고 브랜치 이름을 바꾼다.
  - 서브모듈을 init하고 `pnpm install`을 돌린다.
  - 설정 셸을 닫는다.
  - `.review/W-<n>-TASK.md`를 쓴다. 맨 앞 줄은 `docs/agents/templates/impl-rules.md` 포인터다.
  - 공유 실행기를 부른다.
- 필요한 환경 변수: `WAVE_STATE`·`WAVE_BRIEFS`·`AP_MAIN`. 역할은 `WORKER_ROLE`, 덮어쓰기는 `WORKER_MODEL`·`WORKER_EFFORT`로 준다.
- 16GB 머신이라 동시에 1–2개만, 파일이 겹치지 않는 이슈만 병렬로 돌린다(메모리 기록은 `docs/agents/operations.md`).

## Complexity

다음 중 하나면 `impl-complex`다.

- Kernel 계약과 그 소비자(컴포넌트·셸·메뉴)를 함께 바꾸거나, 패키지 세 곳 이상을 건드린다.
- 권한·Scope·URL 보안 경계(`safeReturnTo`, 목적지 ID와 Context 분리)나 데이터 누출 규칙을 건드린다.
- 상태·순서 로직을 다룬다: 조회 수명주기(취소·세대·`ready` 게이트), history push/replace, Context가 바뀔 때 page 키 정리.

## Verify

검사는 순서대로 돌리고, 모두 0이어야 커밋한다.

1. 바뀐 패키지 검사.
2. 루트 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`를 순서대로 한 번 돌린다. FeedbackOps gitlink를 올렸으면 `--force`(#237).
3. Kernel·셸·공통 컴포넌트·mock 서버가 바뀌었으면 E2E를 돌린다. 새 describe만 먼저(`cd apps/platform-e2e && pnpm exec playwright test -g "<describe>"`), 그다음 관련 E2E 또는 전체 `pnpm e2e`.
4. `scripts/worker-hygiene.sh <worktree>`: 이유 없는 새 `eslint-disable`과 `eslint-suppressions.json` 증가는 실패, 공백만 바뀐 변경은 보고만 한다.

디자인 lint 오류는 메시지가 알려 주는 토큰·variant·부품으로 고치고, suppressions에 새 위반을 더하지 않는다. 기계적으로 직접 고쳐도 되는 것에는 빠진 mock 등록(`MOCK_ENDPOINTS`, `server-conformance.test.ts`의 `PARAMS`)도 들어간다.

## Browser evidence

- 확인은 `ego-browser`로 한다. 막히면 `apps/platform-e2e`의 Playwright 일회용 캡처로 대신하고, 대신했다고 말한다.
- 미리보기는 `scripts/app-preview.py start <checkout> --name <n>-branch`(기준은 `<n>-main`)로 띄운다. mock 조립 vite가 5180–5199 사이 빈 포트에 뜨고, 백엔드는 없다.
- 기준 worktree 설치: 서브모듈 init + `pnpm install --frozen-lockfile`.
- 캡처는 차트 canvas와 표 행이 그려진 뒤에 찍는다. 같은 턴에 `stop`한다.

## Review

- 계획은 `python3 scripts/review-plan.py <checkout> [--base origin/main]`으로 세운다. 규칙표는 `scripts/test-review-plan.py`가 고정한다.
- 플래그별 처리:
  - `flags.permission`·`flags.instructions`는 전역 스킬 7a를 따른다.
  - `flags.e2e`·`flags.submodule`이 있으면 Verify 3단계(E2E)와 gitlink 검사를 했는지 확인한다.
  - `flags.contract`면 06 계약·ADR을 고친 곳을 코드 리뷰어 작업에 적는다.
- 리뷰어 규칙:
  - 코드 리뷰어는 `docs/agents/templates/review-rules.md`.
  - UX 리뷰어와 품질 리뷰어는 전역 `~/.agents/agents/review-ux.md`·`review-quality.md`이고, 이 레포의 기준은 아래 `Review lens` 두 절이다.
- 성능: 측정 도구가 없다. 회귀를 실제로 재었을 때만 `review-perf`를 띄우고, 그 밖에는 코드 리뷰어 작업에 성능 관점을 넣는다.
- 충돌을 정하는 순서의 맨 앞: 권한·데이터 누출 규칙 → ADR·06 계약·기록된 사용자 결정.
- 과거 병합으로 맞춰 본 결과: #247(드릴다운) → code+ux+perf, permission·e2e·contract / #246(표 컬럼) → code+ux, e2e / #248·#253(문서) → 리뷰 없음.

## Review lens: UX

전역 `review-ux` 페르소나가 이 절을 먼저 읽는다. 보고서는 한국어로 쓴다.

- **미리보기**: `branch`와 `main`(기준) 둘 다 mock 조립 vite 서버다. 백엔드·로그인·DB가 없고, 포트가 달라 localStorage도 따로다. UI를 통한 쓰기는 mock 메모리에만 남는다.
- **역할**: 각 미리보기 origin에서 localStorage `platform:role`로 정한다(예: 관리자·일반). 로딩·빈·오류 상태는 mock DevTools의 응답 시나리오로 만든다(페이지를 새로 열 때마다 다시 고른다).
- **뷰포트**: 1440×900(`page.cdp("Emulation.setDeviceMetricsOverride", …)`), 상세 슬롯이 열리는 화면은 1280에서도 본다.
- **기준 문서**:
  - 루트 `AGENTS.md`(플랫폼이 목적, 메뉴 화면은 견본), `DESIGN.md`(FeedbackOps 디자인 시스템을 따르는 시각 규칙), `GLOSSARY.md`(용어).
  - `docs/06_platform_ui_contract.md`의 해당 절: 셸 §7, 상세 슬롯 §13, 차트 §16, 상태 표시 §19, 메뉴 간 연결 §22, 그리고 이슈가 가리키는 절과 ADR.
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
- **기준 문서**: 루트 `AGENTS.md`(목적, 의존 방향, 공통화 기준, 검증)와 `packages/AGENTS.md`, 건드린 경로의 폴더 `AGENTS.md`; `docs/integration/platform-packages.md`(패키지 경계 §3), `docs/06_platform_ui_contract.md` §24(공통화 — 실제 소비자 2–3곳에서 확인된 뒤), `docs/AGENTS.md`(계약은 소유 문서 한 곳).
- **경계 누출**: Kernel·공통 컴포넌트·셸이 메뉴나 mock을 안다; 역방향 import; 메뉴가 공개 진입점이 아닌 `@ap/*` 내부를 import한다; FeedbackOps primitive를 `@ap/ui` 밖에서 쓴다; 프런트가 권한을 진실로 강제한다.
- **공통화 판단**: 소비자 하나뿐인데 공통 패키지로 올라간 것, 반대로 2–3곳에 반복되는데 메뉴에 남은 것.
- **죽은 코드에 더해**: 지우지 않은 프로토타입(`?variant=`) 코드.
- **문서 표류에 더해**: 06 절, ADR, `.planning/README.md` 줄.
- **release-blocker**: 틀린 동작이나 데이터를 내보낼 패키지 경계·06 계약·권한 위반만.

## Fold scope

이슈 diff 밖에서 fold로 만질 수 있는 곳은 둘이다: 그 diff가 바꾼 메뉴 폴더 `menus/<space>/<group>/src/`, i18n 사전. `packages/ui`·`packages/kernel`·`packages/contracts`·셸·다른 메뉴는 fold로 만지지 않는다.

## Slice close

- 품질 리뷰 범위는 `<직전 태그>...origin/main`이다.
- 화면이 바뀐 슬라이스면 `origin/main` 미리보기로 사용자 흐름을 `review-ux`로 본다.
- 그다음 보드 문서 PR → 태그 + GitHub Release → 다음 슬라이스를 사용자에게 묻는다.
- 인계 전 `scripts/app-preview.py status`에 추적 중인 미리보기가 없어야 한다.

## Tools

| 도구 | 하는 일 | 고정 테스트 |
| --- | --- | --- |
| `scripts/launch-worker.sh <n> <slug>` | 위 Launch | – |
| `scripts/review-plan.py <checkout> [--base origin/main] [--head HEAD]` | 리뷰 계획 | `test-review-plan.py` |
| `scripts/wave-status.py [--json] [--prs] [--state-dir <dir>]` | 읽기 전용 스냅숏: 작업자·리뷰어, 미리보기, worktree, `--prs`면 열린 PR의 CI. `$WAVE_STATE`가 없으면 이 레포의 최근 세션 `wave/` 폴더(하루 안)를 읽는다 | `test-wave-status.py` |
| `scripts/worker-hygiene.sh <worktree>` | 위 Verify 4단계 | `test-worker-hygiene.py` |
| `scripts/app-preview.py start <checkout> [--name <label>]` / `stop <label>\|--all` / `status` | mock 미리보기 | `test-app-preview.py` |
| `templates/brief-check.md` | 브리프 사전 점검 항목 | – |
| `bash tooling/scripts/next-adr.sh` | ADR 번호 정하기 | – |

`app-preview.py`의 동작:

- `status`는 추적 중인 미리보기와 남의 vite를 보여 준다. 남의 vite는 `untracked`로 표시하고 건드리지 않는다.
- `stop`은 신호를 보내기 전에 소유를 확인한다. 기준은 기록된 pgid, 부모의 시작 시각, 명령이다.
- 부모가 없으면 그 그룹 안에서 기록된 checkout이 실행한 vite만 인정한다. 인정하는 형태는 둘이다:
  - `node …/vite/bin/vite.js`(상대 경로는 lsof로 읽은 프로세스 cwd를 기준으로 푼다), 또는 checkout의 `node_modules/.bin/vite`;
  - 여기에 `--port`가 정확히 맞고 `--strictPort`가 있어야 한다.
- 소유가 불명확하면 상태 파일을 남긴 채 `ownership unclear`로 건너뛴다.

CI가 `.github/workflows/ci.yml`에서 이 폴더의 테스트 4개를 돌린다.

## Traps

- 작업자 함정은 [`docs/agents/operations.md`](../../docs/agents/operations.md)에 있다: 새 worktree 설치, pnpm 11, CSS selector CI, 캡처, mock 등록.
- 일반 `git worktree add`로 만든 기준 worktree에는 Orca 터미널 리뷰어를 띄울 수 없다. 거기서는 미리보기만 돌린다.
- 메인 체크아웃의 `node_modules`는 병합이 쌓이면 낡는다. 마감 검사 전에 `pnpm install --frozen-lockfile`.
