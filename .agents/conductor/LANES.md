# 흐름(lane)과 팀장

여러 Claude 세션이 이 저장소에서 동시에 일할 때의 분담 규칙이다(사용자 2026-10-26). 세션 하나는 흐름 하나를 맡아 그 안에서 [`PROFILE.md`](PROFILE.md)대로 이슈를 진행하고, 팀장 세션이 흐름 사이의 배정·충돌·릴리스를 맡는다.

## 흐름

이슈마다 `lane:*` 라벨을 하나 단다. 배정의 원본은 라벨과 이슈 코멘트이고, 전달은 Orca 오케스트레이션이다(아래 팀장). Claude 세션 간 메시지는 권한 모드가 다른 세션에는 붙잡혀 만료된다(2026-10-26).

| 라벨 | 맡는 것 | 주로 소유하는 경로 | E2E 포트 |
| --- | --- | --- | --- |
| `lane:sdk` | 공개 패키지 계약·부품, 분석 작업 영역·MARS 이관(M7), SDK 품질(M8) | `packages/{contracts,ui,kernel,components,shell}`, `tooling/sdk-api`, `tooling/scripts/sdk-*`, `docs/06_platform_ui_contract.md`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | 앱 조립·mock·실어댑터·서버 적합성, 견본 메뉴, 사내 적용(M4), 운영 콘솔 | `apps/platform-web`, `packages/{mock-server,http-adapter,server-conformance}`, `menus/*`(FeedbackOps 다리 메뉴 제외) | 4590 |
| `lane:arch` | 리팩터링·폴더 구조·용어·경계 lint·CI·에이전트 자산·문서 구조 | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `.agents/`, `docs/agents/`, `docs/INDEX.md`, `GLOSSARY.md` | 4690 |
| `lane:fo` | FeedbackOps 이관(M6) | `products/feedbackops/`, `packages/fo-bridge`, `menus/feedbackops/*`, `menus/_global/*`의 FeedbackOps 다리 | 4390 |
| `lane:ev` | equipment-visualization 이관 | EV 저장소, AP 쪽 EV 탑재(`tools` 공간, 호스트 모듈 fixture) | 4490 |
| `lane:site` | 소개 페이지·가이드 문서 | `site/`, 도입·사용 가이드 문서 | 4790 |
| (팀장) | 배정·충돌·릴리스, 보드 | `.planning/`, 릴리스 노트, 이 문서 | 4290 |

base-path E2E는 위 포트 + 1을 `E2E_BASE_PATH_PORT`로 준다.

## 함께 쓰는 경로

다음은 어느 흐름이든 고칠 수 있지만, 고치기 전에 이슈에 `착수: <경로>` 코멘트를 남긴다. 다른 흐름이 열어 둔 착수와 겹치면 팀장이 순서를 정한다.

- `packages/contracts`·`packages/kernel`·`packages/components`·`packages/shell`의 공개 API(다른 흐름이 소비한다)
- `apps/platform-web/src/menus.ts`(`GROUPS`·`SPACES`), 06 계약 문서
- 루트 `package.json`·`pnpm-lock.yaml`·`turbo.json`, `.github/workflows`
- ADR 번호(#598에 예약 코멘트, PROFILE §Traps)
- `.planning/README.md`: 흐름 세션은 자기 이슈 줄만 고친다. 줄 순서·구성은 팀장이 바꾼다.

## 팀장

- **배정 기록:** 새 이슈에 `lane:*`를 달고, 맡길 일은 이슈 코멘트(`배정: lane-<흐름>, 순서 …`)로 남긴다. 이것이 원본이다.
- **배정 전달 — Orca 오케스트레이션:** 팀장은 Orca Run 하나에 배정을 기록한다(`orca orchestration run-create --objective "AP 팀 — 흐름 배정(LANES.md)"`, 다음 팀장 세션은 `run-list`로 찾아 `run-use`). 배정마다 `task-create --run <run> --task-title "<흐름>: #n" --spec <지시>`로 Task를 만들고, 지시 문장을 흐름 세션의 Orca 터미널에 넣는다(`orca terminal send --terminal <handle> --text "[팀장 배정 <task id>] …" --enter`). 흐름 세션은 일을 끝내거나 막히면 `orca orchestration send --run <run> --to run:<run> --from <자기 handle> --type status --subject "<흐름>: #n <병합|막힘|질문>" --body <세 문장>`으로 알리고, 팀장은 `orchestration check --run <run>`으로 받아 `task-update --status completed|failed|blocked`로 닫는다. `orchestration dispatch --inject`는 쓰지 않는다: 그 작업자 머리말은 실행 중 GitHub 게시를 막고 5분 heartbeat를 요구해, PR을 올리고 병합하는 흐름 세션과 맞지 않는다(드라이런 확인, 2026-10-26). Claude 세션 간 메시지(`SendMessage`)는 권한 모드가 같은 세션에만 닿으므로 보조로만 쓴다. 흐름 세션의 터미널 handle은 `orca terminal list`로 찾는다(세션은 모두 Orca 터미널에서 돈다).
- **흐름 세션 띄우기·닫기:** 할 일이 있는데 세션이 없는 흐름은 팀장이 띄운다 — `orca worktree create --name lane-<흐름> --base-branch origin/main --agent claude --prompt "<흐름 지시서>"`. 지시서에는 흐름 라벨, 소유 경로, E2E 포트, 이 문서와 [`PROFILE.md`](PROFILE.md), 병합 권한, "배정은 `[팀장 배정 <task id>]`로 터미널에 들어오고, 보고는 위 `orchestration send`로 한다"를 적는다. 동시에 띄우는 흐름 세션은 3–4개까지다(16GB 머신, [operations.md](../../docs/agents/operations.md)). 일이 끝난 흐름 세션은 팀장이 닫는다.
- **현황:** `orca orchestration task-list`, `orca worktree ps`, `gh issue list --label lane:<x>`로 본다. 흐름 세션은 병합·막힘·전체 E2E 시작/끝을 같은 `orchestration send`로 한 줄씩 알린다.
- **보고:** 사람이 정할 것은 흐름 세션이 `orchestration send --type status --subject "…질문"`이나 이슈(`ready-for-human`)로 올리고, 팀장이 모아 한 번에 사용자에게 묻는다. 팀장은 정해진 주기(사용자 2026-10-26: 2시간)로 흐름별 진행·막힘·결정 대기를 보고하고, 모든 배정이 끝나면 다음 일을 나눈다.
- **릴리스:** 흐름 세션은 SDK 공개 변경마다 [`sdk-git-tag-consumption.md`](../../docs/integration/sdk-git-tag-consumption.md) "다음 릴리스" 행만 남긴다. 팀장이 모아 슬라이스 마감 `review-quality`를 돌리고 `sdk-v*` 태그·GitHub Release를 낸 뒤 보고한다. 앱 `v0.x`는 팀장이 릴리스 PR까지 만들고 태그 전에 사용자에게 묻는다(사용자 2026-10-26).
