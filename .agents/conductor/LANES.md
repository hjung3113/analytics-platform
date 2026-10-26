# 흐름(lane)과 팀장

여러 Claude 세션이 이 저장소에서 동시에 일할 때의 분담 규칙이다(사용자 2026-10-26). 세션 하나는 흐름 하나를 맡아 그 안에서 [`PROFILE.md`](PROFILE.md)대로 이슈를 진행하고, 팀장 세션이 흐름 사이의 배정·충돌·릴리스를 맡는다. 흐름 표·소유 경로·포트·릴리스 담당은 이 레포의 규칙이다. 세션 사이 전달(Run 메시지·터미널 입력), 흐름 세션 수명, 팀장 복구는 엔진에 단계가 생기기 전까지 쓰는 임시 규칙이다([conductor-engine#124](https://github.com/hjung3113/conductor-engine/issues/124)).

## 흐름

열린 이슈는 `lane:*` 라벨을 하나씩 단다. 누가 무엇을 맡는지의 원본은 이 라벨과 이슈 코멘트다.

| 라벨 | 맡는 것 | 주로 소유하는 경로 | E2E 포트 |
| --- | --- | --- | --- |
| `lane:sdk` | 공개 패키지 계약·부품, 분석 작업 영역·MARS 이관(M7), SDK 품질(M8) | `packages/{contracts,ui,kernel,components,shell}`, `tooling/sdk-api`, `tooling/scripts/sdk-*`, `docs/06_platform_ui_contract.md`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | 앱 조립·mock·실어댑터·서버 적합성, 견본 메뉴, 사내 적용(M4), 운영 콘솔 | `apps/platform-web`, `packages/{mock-server,http-adapter,server-conformance}`, `menus/*`(FeedbackOps 다리 메뉴 제외) | 4590 |
| `lane:arch` | 리팩터링·폴더 구조·용어·경계 lint·CI·문서 구조 | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `docs/INDEX.md`, `docs/AGENTS.md`, `GLOSSARY.md` | 4690 |
| `lane:fo` | FeedbackOps 이관(M6) | `products/feedbackops/`, `packages/fo-bridge`, `menus/feedbackops/*`, `menus/_global/*`의 FeedbackOps 다리 | 4390 |
| `lane:ev` | equipment-visualization 이관의 AP 쪽(`tools` 공간, 호스트 모듈 fixture, EV tarball 버전 올리기) | 위 AP 경로. EV 저장소 쪽 일은 그 저장소의 `AGENTS.md`·이슈를 따르고 그 저장소의 Orca worktree에서 한다. `eqv-v*` 릴리스는 EV 규칙대로 내고 팀장에게 알린다 | 4490 |
| `lane:site` | 소개 사이트 | `site/`(소개 페이지와 사이트 안 안내·캡처). 사내 적용·개발 가이드(`docs/integration/in-house-rollout.md` 등)는 `lane:platform` | 4790 |
| `lane:ops` | 플랫폼 개발 밖의 부가 요청(사용자 2026-10-26): 운영 방식, conductor 프로필·함정·덧붙임, 에이전트 자산, 사용자가 시키는 조사·정리 보고서. 팀장이 직접 하지 않고 이 흐름에 넘긴다. 파일이 바뀌는 요청은 팀장이 `lane:ops` 이슈를 열어 배정한다(답만 하면 되는 질문은 이슈 없이). 전역 오케스트레이션 도구(conductor-engine·스킬)는 그 저장소에서 고치거나 `upstream-file.sh`로 올린다 | `.agents/`(이 문서 `LANES.md` 제외), `docs/agents/` | 4990 |
| (팀장) | 배정·충돌·릴리스, 보드 | `.planning/`, 릴리스 노트, 이 문서(`LANES.md`) | 4890 |

E2E는 `E2E_PORT=<포트>`로, base-path E2E는 `E2E_BASE_PATH_PORT=<포트 + 1>`로 돌린다.

## 요청 분류

새 요청(이슈, 리뷰 후속, 제품 세션이 보낸 요구)에 `lane:*`를 달기 전에 팀장은 그 요청이 누구 몫인지 정한다. 기준의 원본은 루트 [`AGENTS.md`](../../AGENTS.md) 「이 레포의 목적」(SDK는 범용 조각을 준다, 승격 기준, 공통 계약과 충돌할 때)이고, 이 절은 그 기준을 흐름과 할 일로 옮긴다. 도구·CI·문서 구조(`lane:arch`), 소개 페이지(`lane:site`), 운영·부가 요청(`lane:ops`)은 나누지 않는다.

위에서부터 묻고, 처음 맞는 것이 그 요청(또는 그 조각)의 분류다.

1. **Kernel 책임:** 06 [§4](../../docs/06_platform_ui_contract.md#4-platform-kernel-responsibilities) 목록(셸, Registry, 전역 Context, URL, 권한·Scope, 감사, 계측 등)이나 Kernel 런타임 책임([`packages/kernel/AGENTS.md`](../../packages/kernel/AGENTS.md): 조회 수명주기·캐시·중복 제거 등)에 드는가. 계약·런타임(`packages/{contracts,kernel,shell}`)은 `lane:sdk`, 그 계약을 앱에 잇는 일(조립, mock, 실어댑터, 서버 적합성)은 `lane:platform`이다. 소비자 수를 기다리지 않는다. 06 계약을 바꾸는 결정은 사용자 몫이다(§흐름 세션).
2. **SDK 조각:** 메뉴마다 다른 것(위계, 단계 수, 줄 이름, 내려가는 조작, 업무 문구·권한)을 메뉴 선언으로 빼고 남는 것이 다른 메뉴도 그대로 쓸 수 있는 부품인가([ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md) 편입 기준). 그러면 `lane:sdk`이고 소비자 수와 관계없이 SDK에 둔다. 요구 문장의 도메인 용어는 [`GLOSSARY.md`](../../GLOSSARY.md)로 확인하고 조각의 이름·API에는 넣지 않는다.
   - **SDK 운영:** 특정 기능이 아니라 SDK 자체의 배포·품질(tarball·의존 고정, 성능, 테스트 안정성, 공개 API 스냅샷)이면 이 분류로 보고 `lane:sdk`다(#806, #706, #741).
3. **메뉴 몫:** 남은 것, 곧 그 메뉴의 업무 의미(숫자·CRUD·상태 전이, 특정 차트 설정, 그 메뉴만의 Form — 06 §4 「Kernel이 소유하지 않는 것」, §13 Domain Component). 메뉴 요구가 공통 계약과 부딪히면 이것도 메뉴 몫이다 — 메뉴를 계약에 맞춘다(루트 `AGENTS.md`). 누가 하는지는 메뉴가 어디 있느냐로 정한다.
   - **견본 메뉴**(`menus/*`, 다리 메뉴 제외): `lane:platform`. 견본은 그것이 검증하는 플랫폼 계약만큼만 고친다. 화면만 다듬는 요구는 배정하지 않는다.
   - **제품 메뉴**: FeedbackOps 다리 메뉴는 `lane:fo`, EV 호스트 모듈은 `lane:ev`. 업무 의미는 제품이 소유한다([ADR-0043](../../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)).
   - **사내 메뉴**(이 저장소 밖에서 새로 만드는 실제 메뉴): 여기서 만들지 않는다. 요청이 이슈로 왔으면 [사내 메뉴 개발 가이드](../../docs/integration/in-house-rollout.md) §5의 해당 단계와 쓸 SDK 조각을 코멘트로 적고 not planned로 닫는다. 대화로 왔으면 답으로 안내하고 이슈를 열지 않는다. 가이드에 없는 조립법이 드러나면 가이드를 고친다(`lane:platform`, M4).

- **섞인 요청:** 분류마다 나눈다. Kernel 일과 SDK 조각은 `lane:sdk` 이슈로, 메뉴 선언·화면은 그 메뉴 흐름의 이슈로 하고, 메뉴 이슈는 SDK 이슈 뒤에 둔다. 사내 메뉴 요청이면 SDK 조각만 이슈로 남기고 메뉴 부분은 그 이슈에 소비자 안내로 적는다. 예: HW Time의 설비 → 설비-모듈 → 동작 드릴은 SDK 조각 둘("메뉴가 선언한 단계대로 드릴", "가로 막대의 범주 줄")과 HW Time의 단계 선언이다(#541). 첫 소비자가 그 조각을 검증하는 견본 메뉴이고 작으면 한 PR에 둔다(#852 — 다른 견본 메뉴로 옮기는 일은 [`backlog.md`](../../.planning/backlog.md)에 남겼다).
- **승격 후보:** 승격 기준은 루트 `AGENTS.md`가 원본이고, 팀장이 할 일은 메뉴에서 생긴 패턴의 소비자를 세는 것이다. 2번을 통과하지 못했지만(업무 의미가 섞였거나 모양이 메뉴마다 다르다) 다른 메뉴에도 나올 패턴은 `backlog.md`에 `구현 안 함 — <패턴> SDK 승격` 줄로 남기고 지금 소비자(메뉴와 이슈)와 다시 여는 조건(실제 소비자 2–3곳)을 적는다. 같은 패턴이 또 오면 그 줄에 소비자를 더하고, 조건이 차면 `lane:sdk` 이슈로 올린다. 견본·제품·사내 메뉴를 모두 소비자로 센다.
- **흐름과 분류가 다를 때:** 기본값은 고칠 경로의 주인 흐름(§흐름 표)이다. 다른 흐름(예: 제품 흐름)이 맡는 것은 팀장이 그 흐름에 배정했을 때뿐이다. 흐름은 경로 주인을 따르고, 분류는 원본 문서·승격 기준·사용자 몫을 정한다. 제품 흐름이 자기 제품 때문에 Kernel·SDK 일을 맡을 수 있다(#829 — Kernel 책임을 `lane:ev`가 맡았다). SDK 조각이 다른 흐름이 소유한 소비자 파일을 고쳐야 할 때도 같다. 두 경우 모두 §함께 쓰는 경로의 착수를 보내고 팀장이 순서를 정한다. 버그는 증상이 보이는 곳이 아니라 확인된 원인이 있는 곳으로 나눈다.
- **이름:** "플랫폼 역할"로 오는 요구는 대개 Kernel 책임이다. `lane:platform`은 앱 조립·mock·어댑터·견본 메뉴의 흐름이지 Kernel이 아니다([`GLOSSARY.md`](../../GLOSSARY.md) `Kernel`).

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
- 무거운 단계는 기계 전체에서 하나씩 돈다: 루트 `pnpm test`·`build`, 전체 `pnpm e2e`, `probe.ts`, FeedbackOps integration, 미리보기·ego-browser 단계(UX 리뷰, 캡처). `mkdir "$AP_MAIN/.review/heavy.lock" && echo "$ORCA_TERMINAL_HANDLE" > "$AP_MAIN/.review/heavy.lock/owner"`이 성공한 세션만 시작한다. 푸는 것은 `owner`가 자기 handle일 때만이다(`[ "$(cat …/owner)" = "$ORCA_TERMINAL_HANDLE" ] && trash …/heavy.lock`, `rm`은 전역 훅이 막는다) — 남의 잠금을 지운 일이 있었다(2026-10-26). 아래 작업자 자리·병합 잠금도 같은 방식이다. 실패하면 그 이슈는 기다리고 다른 일을 한다. 좁힌 E2E(`-g`)와 패키지 단위 검사는 잠그지 않는다.
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

- **배정 기록:** 새 이슈를 §요청 분류대로 나눠 `lane:*`를 달고, 맡길 일은 이슈 코멘트(`배정: lane-<흐름>, 분류 <Kernel|SDK 조각|SDK 운영|메뉴 몫>, 순서 …` — 섞이면 `+`로 잇고, arch·site·ops 일은 `분류 없음`)로 남긴다. 이것이 유일한 원본이다. 분류 라벨은 따로 두지 않는다.
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
- **릴리스:** 흐름 세션은 SDK 공개 변경마다 [`sdk-git-tag-consumption.md`](../../docs/integration/sdk-git-tag-consumption.md)에 "다음 릴리스" 행만 남긴다. 팀장은 정기 점검 때 "다음 릴리스" 행이 있고 `main` CI가 초록이면 SDK를 낸다. 그 SDK를 기다리는 흐름이 있으면 바로 낸다. 릴리스 순서의 원본은 이 줄이다(PROFILE §Slice close는 여기를 가리킨다):
  1. 슬라이스 마감 `review-quality`(화면이 바뀐 슬라이스는 `review-ux` 둘러보기도, PROFILE §Slice close). fix-in-slice는 이슈 하나로 고쳐 병합한다.
  2. 릴리스 문서 PR 초안: 변경 기록 버전, 보드 릴리스 줄. 앱 `v0.x` 릴리스면 site 흐름이 같은 시기에 사이트 갱신 PR을 연다(아래 소개 사이트 담당).
  3. **문서 점검**(아래). 2의 초안까지 본다. 지적은 팀장이 2의 릴리스 문서 PR에 넣어 고친다(사이트 지적은 site PR).
  4. 문서 PR(과 사이트 PR)을 병합한 뒤, SDK는 `sdk-v*` 태그·tarball·GitHub Release를 내고 보고한다. 앱 `v0.x`는 태그 전에 사용자에게 묻는다(사용자 2026-10-26).
- **문서 점검자(릴리스 전, 사용자 2026-10-26):** 릴리스마다 한 번, 오래 붙어 있는 세션이 아니라 일회성 리뷰어(`review-quality`)를 띄운다. 작업서는 [`addenda/doc-audit.md`](addenda/doc-audit.md)에 이번 버전·범위(`<이전 태그>...HEAD`)·마감 리뷰 보고서 경로·릴리스 문서 PR 브랜치를 채워 만든다. 문서를 지우는 결정은 사용자에게 묻는다.
- **소개 사이트 담당(사용자 2026-10-26):** `lane:site` 흐름 세션이 맡는다. 앱 `v0.x` 릴리스 때(SDK만 나가는 릴리스는 다음 앱 릴리스 때 묶어서) 팀장이 site 세션을 띄워 `site/`를 그 릴리스 내용에 맞추고, 끝나면 닫는다. 일회성 site·ops 세션도 동시 세션 3개 한도에 든다.
- **팀장 교대·복구:** 팀장 세션은 conductor 스킬 Session hygiene 한도(약 450k 토큰)보다 일찍, 큰 일을 하나 끝낸 조용한 때 교대한다(사용자 2026-10-26: 너무 오래 돌면 판단이 흐려진다). 새 일을 받지 않고 하던 일을 마무리한 뒤 `LEAD.md`를 갱신하고 사용자에게 세션 초기화(`/clear` 뒤 이 문서로 다시 시작)를 요청한다. 흐름 세션은 그사이 계속 일한다. 팀장은 `$AP_MAIN/.review/lanes/LEAD.md`에 Run id와 흐름별 worktree·handle·진행 중 이슈를 적어 둔다. 팀장 세션이 끝나도 흐름 세션은 배정을 이어 가고 메시지는 Run에 쌓인다. 새 팀장은 이 순서로 잇는다: 이 문서 → `LEAD.md` → `run-list`·`run-use --id <run>` → `orchestration check --run <run>`(쌓인 메시지) → `orca terminal list`(handle) → 정기 점검 다시 걸기.
