# 흐름(lane)과 팀장

여러 Claude 세션이 이 저장소에서 동시에 일할 때의 분담 규칙이다(사용자 2026-10-26). 세션 하나는 흐름 하나를 맡아 그 안에서 [`PROFILE.md`](PROFILE.md)대로 이슈를 진행하고, 팀장 세션이 흐름 사이의 배정·충돌·릴리스를 맡는다. 흐름 표·소유 경로·포트·릴리스 담당은 이 레포의 규칙이다. 세션 사이 전달(Run 메시지·터미널 입력), 흐름 세션 수명, 팀장 복구는 엔진에 단계가 생기기 전까지 쓰는 임시 규칙이다([conductor-engine#124](https://github.com/hjung3113/conductor-engine/issues/124)).

## 흐름

열린 이슈는 `lane:*` 라벨을 하나씩 단다. 누가 무엇을 맡는지의 원본은 이 라벨과 이슈 코멘트다.

| 라벨 | 맡는 것 | 주로 소유하는 경로 | E2E 포트 |
| --- | --- | --- | --- |
| `lane:sdk` | 공개 패키지 계약·부품, 분석 작업 영역·MARS 이관(M7), SDK 품질(M8) | `packages/{contracts,ui,kernel,components,shell}`, `tooling/sdk-api`, `tooling/scripts/sdk-*`, `docs/06_platform_ui_contract.md`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | 앱 조립·mock·실어댑터·서버 적합성, 견본 메뉴, 사내 적용(M4), 운영 콘솔 | `apps/platform-web`, `packages/{mock-server,http-adapter,server-conformance}`, `menus/*`(FeedbackOps 다리 메뉴 제외) | 4590 |
| `lane:arch` | 리팩터링·폴더 구조·용어·경계 lint·CI·에이전트 자산·문서 구조 | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `.agents/`, `docs/agents/`, `docs/INDEX.md`, `GLOSSARY.md` | 4690 |
| `lane:fo` | FeedbackOps 이관(M6) | `products/feedbackops/`, `packages/fo-bridge`, `menus/feedbackops/*`, `menus/_global/*`의 FeedbackOps 다리 | 4390 |
| `lane:ev` | equipment-visualization 이관의 AP 쪽(`tools` 공간, 호스트 모듈 fixture, EV tarball 버전 올리기) | 위 AP 경로. EV 저장소 쪽 일은 그 저장소의 `AGENTS.md`·이슈를 따르고 그 저장소의 Orca worktree에서 한다. `eqv-v*` 릴리스는 EV 규칙대로 내고 팀장에게 알린다 | 4490 |
| `lane:site` | 소개 페이지·가이드 문서 | `site/`, 도입·사용 가이드 문서 | 4790 |
| (팀장) | 배정·충돌·릴리스, 보드 | `.planning/`, 릴리스 노트, 이 문서 | 4890 |

E2E는 `E2E_PORT=<포트>`로, base-path E2E는 `E2E_BASE_PATH_PORT=<포트 + 1>`로 돌린다.

## 함께 쓰는 경로

다음은 어느 흐름이든 고칠 수 있다. 다만 고치기 전에 팀장에게 `<흐름>: 착수 #n <경로>` 메시지(아래 전달 경로)를 보내고 같은 줄을 이슈 코멘트로 남긴다. 착수는 그 PR이 병합되거나 닫히면 끝난다. 팀장은 받은 착수를 열린 PR의 바뀐 파일(`gh pr diff <n> --name-only`)과 대조하고, 겹치면 나중에 착수한 흐름에 순서를 보낸다. rebase에서 표·목록 행이 겹치면 양쪽 행을 모두 남긴다.

- `packages/contracts`·`packages/kernel`·`packages/components`·`packages/shell`의 공개 API(다른 흐름이 소비한다)
- `apps/platform-web/src/menus.ts`(`GROUPS`·`SPACES`), 06 계약 문서
- 루트 `package.json`·`pnpm-lock.yaml`·`turbo.json`, `.github/workflows`
- `apps/platform-e2e`(spec, `contract-report`) — 어느 흐름도 소유하지 않는다
- `docs/integration/sdk-git-tag-consumption.md`의 "다음 릴리스" 행, `docs/adr/README.md` 표, ADR 번호(#598에 예약 코멘트, PROFILE §Traps)
- `.agents/conductor/PROFILE.md` §Traps, `docs/agents/operations.md` — 흐름마다 맨 끝에 덧붙인다
- FeedbackOps 다리 entry 목록 네 곳(FO `apps/frontend/package.json` `exports`, `tooling/eslint/src/index.js` `FO_BRIDGE_ENTRIES`, `tooling/eslint/src/boundaries.test.ts` entry 배열, `packages/fo-bridge/src/fo-entry-graph.test.ts` describe — fo가 고치고 eslint 쪽은 arch가 소유, 합치는 법은 PROFILE §Traps), `menus/analytics/hw-time`(M7은 sdk가 고치고 platform이 소유)
- `.planning/README.md`: 흐름 세션은 자기 이슈 줄만 고친다. 줄 순서·구성은 팀장이 바꾼다.

## 기계 자원(16GB)

- [`PROFILE.md`](PROFILE.md) §Launch의 동시 작업자 1–2개는 기계 전체의 한도다. 흐름 세션은 동시에 3개까지 띄우고(2026-10-26, 세션 3개가 루트 검사를 겹쳐 돌린 부하 평균 40에서 무관한 테스트가 시간 초과), 작업자(구현·리뷰)는 자리 둘 중 하나를 잡은 세션만 띄운다: `mkdir "$AP_MAIN/.review/worker-slot-1"`(실패하면 `-2`)이 성공하면 띄우고, 그 작업자가 끝나면 `rmdir`로 푼다. 둘 다 실패하면 기다리는 동안 호스트 검증·문서 일을 한다.
- 무거운 단계는 기계 전체에서 하나씩 돈다: 루트 `pnpm test`·`build`, 전체 `pnpm e2e`, `probe.ts`, FeedbackOps integration, 미리보기·ego-browser 단계(UX 리뷰, 캡처). `mkdir "$AP_MAIN/.review/heavy.lock"`이 성공한 세션만 시작하고, 끝나면 `rmdir`로 푼다. 실패하면 그 이슈는 기다리고 다른 일을 한다. 좁힌 E2E(`-g`)와 패키지 단위 검사는 잠그지 않는다.
- 팀장은 정기 점검 때 잠금·자리가 90분을 넘었으면 `pgrep -fl 'vitest|playwright|turbo'`와 `lsof -a -p <PID> -d cwd`로 주인을 찾고, 주인이 없으면 푼다. swap이 늘면(`memory_pressure`) 흐름 세션 수를 줄인다.

## 흐름 세션

흐름 세션의 터미널은 사용자가 보지 않는다. 전역 conductor 스킬이 사용자에게 묻는 단계는 모두 팀장에게 메시지로 보낸다.

- **시작:** 지시서 파일을 읽는다. 병합 권한은 지시서에 적힌 사용자 권한(모양·날짜)이다. 다시 묻지 않고 `AskUserQuestion`도 쓰지 않는다 — 답할 사람이 없어 흐름이 멈춘다.
- **사용자 몫:** 시안 컨펌(아티팩트 링크), 06 계약을 바꾸는 결정, 테스트 삭제, 새 메뉴 화면 3개 이상, 전역 도구 업데이트는 `<흐름>: 질문 #n`으로 보낸다. 그 이슈는 멈추고 다른 배정을 진행한다. 그 밖의 판단은 스킬 Decisions대로 스스로 정하고 기록한다.
- **배정 사이:** 하나가 끝나면 이슈 코멘트의 순서대로 다음 이슈를 바로 시작한다. 모두 끝나면 `<흐름>: 대기`를 보내고, 새 배정이 올 때까지 아무것도 띄우지 않는다.
- **교대:** 스킬 Session hygiene 한도에 가까우면 흐름 worktree 루트의 `HANDOFF.md`를 고친 뒤 `<흐름>: 교대`를 보낸다. 팀장이 `/clear`를 넣고, 이어서 "지시서를 다시 읽고 HANDOFF.md로 잇는다"를 넣는다.
- **병합:** PR은 기계 전체에서 하나씩 병합한다(루트 AGENTS.md). `ship-pr.sh`를 돌리는 동안(rebase → CI → 병합) `mkdir "$AP_MAIN/.review/merge.lock"`을 잡고, 끝나면 `rmdir`. 병합한 뒤 `main` CI가 실패하면 `<흐름>: main 깨짐`을 보내고 고친다. 팀장은 그동안 다른 흐름의 병합을 멈춘다.
- **전체 E2E:** 시작·끝을 팀장에게 한 줄로 알린다.

## 팀장

- **배정 기록:** 새 이슈에 `lane:*`를 달고, 맡길 일은 이슈 코멘트(`배정: lane-<흐름>, 순서 …`)로 남긴다. 이것이 유일한 원본이다.
- **전달 경로:** 팀장 → 흐름은 터미널 입력이고, 흐름 → 팀장은 Orca Run 메시지다. Run은 하나다(`orca orchestration run-create --objective "AP 팀 — 흐름 배정(LANES.md)"`; 다음 팀장은 `run-list`로 찾아 `run-use --id <run>`).
  - 넣기 전에 `orca terminal wait --terminal <handle> --for tui-idle`을 돌리고 `orca terminal read --terminal <handle> --screen`으로 입력 대기 화면인지 본다. 권한·선택 창이 떠 있으면 넣지 않는다 — Enter가 그 창에 답한다. 확인한 뒤 `orca terminal send --terminal <handle> --text "[팀장 배정 #n] …" --enter`.
  - 흐름 세션은 `orca orchestration send --run <run> --to run:<run> --from "$ORCA_TERMINAL_HANDLE" --type status --subject "<흐름>: <병합|막힘|질문|착수|대기|교대|main 깨짐|E2E> [#n]" --body <세 문장>`으로 알린다.
  - 팀장은 `orca orchestration check --run <run> --wait`를 백그라운드로 걸어 두고 깰 때마다 다시 건다. 질문이 정기 보고까지 묵지 않게 하려는 것이다.
  - `orchestration dispatch --inject`는 쓰지 않는다. 그 작업자 머리말은 실행 중 GitHub 게시를 막고 5분 heartbeat를 요구해, PR을 올리고 병합하는 흐름 세션과 맞지 않는다(드라이런 확인, 2026-10-26). Claude 세션 간 메시지(`SendMessage`)는 권한 모드가 같은 세션에만 닿으므로 보조로만 쓴다.
- **흐름 세션 띄우기·닫기:** 할 일이 있는데 세션이 없는 흐름은 팀장이 띄운다.
  - 지시서를 `$AP_MAIN/.review/lanes/<흐름>.md`에 쓴다: 흐름 라벨, Run id, 사용자 병합 권한(모양·날짜), `AP_MAIN`, `WAVE_STATE=$AP_MAIN/.review/wave/state-<흐름>`, E2E 포트, "LANES.md §흐름 세션과 PROFILE.md를 따른다".
  - `orca worktree create --name lane-<흐름> --base-branch origin/main --agent claude --surface terminal --prompt "Read <지시서 절대 경로> and follow it."`. 첫 화면에서 권한 모드를 확인한다.
  - 흐름 worktree는 지시서·문서를 읽는 집이다. 이슈 작업은 PROFILE §Launch대로 이슈 worktree에서 한다. 배정마다 `git -C <흐름 worktree> fetch && git -C <흐름 worktree> merge --ff-only origin/main`으로 문서를 새로 읽는다.
  - handle은 `orca terminal list --worktree path:<흐름 worktree> --json`으로 찾는다.
  - 닫기: `대기`를 받았고 그 흐름의 작업자·미리보기가 없을 때(`wave-status.py --state-dir <WAVE_STATE>`) `orca terminal close --terminal <handle>`로 닫는다.
- **정기 점검과 보고(사용자 2026-10-26: 2시간):** 팀장 세션에서 2시간 주기 점검을 건다(`CronCreate`, 세션 안 예약이라 팀장 세션이 바뀌면 다시 건다). 흐름 세션은 heartbeat가 없으니 점검마다 본다: `gh issue list --label lane:<x>`, `gh pr list`, `orca worktree ps`, 흐름 터미널마다 `orca terminal read --screen`(멈춘 권한 창·오류), `heavy.lock`. 보고에는 흐름별 병합·진행·막힘, 모아 둔 결정 질문(추천안 포함), 릴리스 후보를 한 번에 담는다. 흐름 하나를 통째로 막는 질문만 받는 즉시 묻는다. 모든 배정이 끝나면 다음 일을 나눈다.
- **릴리스:** 흐름 세션은 SDK 공개 변경마다 [`sdk-git-tag-consumption.md`](../../docs/integration/sdk-git-tag-consumption.md)에 "다음 릴리스" 행만 남긴다. 팀장은 정기 점검 때 "다음 릴리스" 행이 있고 `main` CI가 초록이면 SDK를 낸다. 그 SDK를 기다리는 흐름이 있으면 바로 낸다. 순서는 PROFILE §Flow와 같다: 슬라이스 마감 `review-quality` → 보드·변경 기록 문서 PR → `sdk-v*` 태그·GitHub Release → 보고. 앱 `v0.x`는 팀장이 릴리스 PR까지 만들고 태그 전에 사용자에게 묻는다(사용자 2026-10-26).
- **팀장 교대·복구:** 팀장은 `$AP_MAIN/.review/lanes/LEAD.md`에 Run id와 흐름별 worktree·handle·진행 중 이슈를 적어 둔다. 팀장 세션이 끝나도 흐름 세션은 배정을 이어 가고 메시지는 Run에 쌓인다. 새 팀장은 이 순서로 잇는다: 이 문서 → `LEAD.md` → `run-list`·`run-use --id <run>` → `orchestration check --run <run>`(쌓인 메시지) → `orca terminal list`(handle) → 정기 점검 다시 걸기.
