# 흐름(lane)과 팀장

여러 Claude 세션이 이 저장소에서 동시에 일할 때의 분담 규칙이다(사용자 2026-10-26). 세션 하나는 흐름 하나를 맡아 그 안에서 [`PROFILE.md`](PROFILE.md)대로 이슈를 진행하고, 팀장 세션이 흐름 사이의 배정·충돌·릴리스를 맡는다. 흐름 표·소유 경로·포트·릴리스 담당은 이 레포의 규칙이다. 세션 사이 전달(Run 메시지·터미널 입력), 흐름 세션 수명, 팀장 복구는 엔진에 단계가 생기기 전까지 쓰는 임시 규칙이다([conductor-engine#124](https://github.com/hjung3113/conductor-engine/issues/124)).

## 흐름

열린 이슈는 `lane:*` 라벨을 하나씩 단다. 누가 무엇을 맡는지의 원본은 이 라벨과 이슈 코멘트다.

| 라벨 | 맡는 것 | 주로 소유하는 경로 | E2E 포트 |
| --- | --- | --- | --- |
| `lane:sdk` | 공개 패키지 계약·부품, 분석 작업 영역·MARS 이관(M7), SDK 품질(M8) | `packages/{contracts,ui,kernel,components,shell}`, `tooling/sdk-api`, `tooling/scripts/sdk-*`, `docs/contract/platform-ui-contract.md`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | 앱 조립·mock·실어댑터·서버 적합성, 견본 메뉴, 사내 적용(M4), 운영 콘솔 | `apps/platform-web`, `packages/{mock-server,http-adapter,server-conformance}`, `menus/*`(FeedbackOps 다리 메뉴 제외) | 4590 |
| `lane:arch` | 리팩터링·폴더 구조·용어·경계 lint·CI·문서 구조 | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `docs/INDEX.md`, `docs/AGENTS.md`, `GLOSSARY.md` | 4690 |
| `lane:fo` | FeedbackOps 이관(M6) | `apps/fo-*`, `packages/fo-*`, `docs/feedbackops/`, `ops/feedbackops/`, `packages/fo-bridge`, `menus/feedbackops/*`, `menus/_global/*`의 FeedbackOps 다리 | 4390 |
| `lane:ev` | equipment-visualization 이관의 AP 쪽(`tools` 공간, 호스트 모듈 fixture, EV tarball 버전 올리기) | 위 AP 경로. EV 저장소 쪽 일은 그 저장소의 `AGENTS.md`·이슈를 따르고 그 저장소의 Orca worktree에서 한다. `eqv-v*` 릴리스는 EV 규칙대로 내고 팀장에게 알린다 | 4490 |
| `lane:site` | 소개 사이트 | `site/`(소개 페이지와 사이트 안 안내·캡처). 사내 적용·개발 가이드(`docs/integration/in-house-rollout.md` 등)는 `lane:platform` | 4790 |
| `lane:ops` | 플랫폼 개발 밖의 부가 요청(사용자 2026-10-26): 운영 방식, conductor 프로필·함정·덧붙임, 에이전트 자산, 사용자가 시키는 조사·정리 보고서. 팀장이 직접 하지 않고 이 흐름에 넘긴다. 파일이 바뀌는 요청은 팀장이 `lane:ops` 이슈를 열어 배정한다(답만 하면 되는 질문은 이슈 없이). 전역 오케스트레이션 도구(conductor-engine·스킬)는 고치지 않고 `upstream-file.sh`로 conductor-engine 이슈를 올린다(PROFILE §Review) | `.agents/`(이 문서 `LANES.md` 제외), `docs/agents/` | 4990 |
| (팀장) | 배정·충돌·릴리스, 보드 | `.planning/`, 릴리스 노트, 이 문서(`LANES.md`) | 4890 |

E2E는 `E2E_PORT=<포트>`로, base-path E2E는 `E2E_BASE_PATH_PORT=<포트 + 1>`로 돌린다.

## 요청 분류

새 요청(이슈, 리뷰 후속, 제품 세션이 보낸 요구)에 `lane:*`를 달기 전에 팀장은 그 요청이 누구 몫인지 정한다. 기준의 원본은 루트 [`AGENTS.md`](../../AGENTS.md) 「이 레포의 목적」(SDK는 범용 조각을 준다, 승격 기준, 공통 계약과 충돌할 때)이고, 이 절은 그 기준을 흐름과 할 일로 옮긴다. 도구·CI·문서 구조(`lane:arch`), 소개 페이지(`lane:site`), 운영·부가 요청(`lane:ops`)은 나누지 않는다.

위에서부터 묻고, 처음 맞는 것이 그 요청(또는 그 조각)의 분류다.

1. **Kernel 책임:** 06 [§4](../../docs/contract/platform-ui-contract.md#4-platform-kernel-responsibilities) 목록(셸, Registry, 전역 Context, URL, 권한·Scope, 감사, 계측 등)이나 Kernel 런타임 책임([`packages/kernel/AGENTS.md`](../../packages/kernel/AGENTS.md): 조회 수명주기·캐시·중복 제거 등)에 드는가. 계약·런타임(`packages/{contracts,kernel,shell}`)은 `lane:sdk`, 그 계약을 앱에 잇는 일(조립, mock, 실어댑터, 서버 적합성)은 `lane:platform`이다. 소비자 수를 기다리지 않는다. 06 계약을 바꾸는 결정은 사용자 몫이다(§흐름 세션).
2. **SDK 조각:** 메뉴마다 다른 것(위계, 단계 수, 줄 이름, 내려가는 조작, 업무 문구·권한)을 메뉴 선언으로 빼고 남는 것이 다른 메뉴도 그대로 쓸 수 있는 부품인가([ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md) 편입 기준). 그러면 `lane:sdk`이고 소비자 수와 관계없이 SDK에 둔다. 요구 문장의 도메인 용어는 [`GLOSSARY.md`](../../GLOSSARY.md)로 확인하고 조각의 이름·API에는 넣지 않는다.
   - **SDK 운영:** 특정 기능이 아니라 SDK 자체의 배포·품질(tarball·의존 고정, 성능, 테스트 안정성, 공개 API 스냅샷)이면 이 분류로 보고 `lane:sdk`다(#806, #706, #741).
3. **메뉴 몫:** 남은 것, 곧 그 메뉴의 업무 의미(숫자·CRUD·상태 전이, 특정 차트 설정, 그 메뉴만의 Form — 06 §4 「Kernel이 소유하지 않는 것」, §13 Domain Component). 메뉴 요구가 공통 계약과 부딪히면 이것도 메뉴 몫이다 — 메뉴를 계약에 맞춘다(루트 `AGENTS.md`). 누가 하는지는 메뉴가 어디 있느냐로 정한다.
   - **견본 메뉴**(`menus/*`, 다리 메뉴 제외): `lane:platform`. 견본은 그것이 검증하는 플랫폼 계약만큼만 고친다. 화면만 다듬는 요구는 배정하지 않는다.
   - **제품 메뉴**: FeedbackOps 다리 메뉴는 `lane:fo`, EV 호스트 모듈은 `lane:ev`. 업무 의미는 제품이 소유한다([ADR-0043](../../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)).
   - **사내 메뉴**(이 저장소 밖에서 새로 만드는 실제 메뉴): 여기서 만들지 않는다. 요청이 이슈로 왔으면 [사내 메뉴 개발 가이드](../../docs/integration/in-house-rollout.md) §5의 해당 단계와 쓸 SDK 조각을 코멘트로 적고 not planned로 닫는다. 대화로 왔으면 답으로 안내하고 이슈를 열지 않는다. 가이드에 없는 조립법이 드러나면 가이드를 고친다(`lane:platform`, M4).

- **섞인 요청:** 분류마다 나눈다. Kernel 일과 SDK 조각은 `lane:sdk` 이슈로, 메뉴 선언·화면은 그 메뉴 흐름의 이슈로 하고, 메뉴 이슈는 SDK 이슈 뒤에 둔다. 사내 메뉴 요청이면 SDK 조각만 이슈로 남기고 메뉴 부분은 그 이슈에 소비자 안내로 적는다. 예: HW Time의 설비 → 설비-모듈 → 동작 드릴은 SDK 조각 둘("메뉴가 선언한 단계대로 드릴", "가로 막대의 범주 줄")과 HW Time의 단계 선언이다(#541). 첫 소비자가 그 조각을 검증하는 견본 메뉴이거나, 요청에 딸린 견본 메뉴 수정이 작으면(링크 하나 등) 한 PR에 둔다(#753, #852 — 다른 견본 메뉴로 옮기는 일은 [`backlog.md`](../../.planning/backlog.md)에 남겼다).
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
- FeedbackOps 다리 entry 목록 네 곳(FO `apps/fo-frontend/package.json` `exports`, `tooling/eslint/src/index.js` `FO_BRIDGE_ENTRIES`, `tooling/eslint/src/boundaries.test.ts` entry 배열, `packages/fo-bridge/src/fo-entry-graph.test.ts` describe — fo가 고치고 eslint 쪽은 arch가 소유, 합치는 법은 PROFILE §Traps), `menus/analytics/hw-time`(M7은 sdk가 고치고 platform이 소유)
- `.planning/README.md`: 흐름 세션은 자기 이슈 줄만 고친다. 줄 순서·구성은 팀장이 바꾼다.

## 기계 자원(16GB)

- 동시 작업자 수와 흐름 세션 수는 고정값이 아니라 기계 사용량이 정한다(사용자 2026-10-26 #936). `bash .agents/conductor/scripts/capacity.sh`가 한 줄(`green|yellow|red workers=<1-5> lanes=<2-4> start=<yes|no> … why=…`)을 출력하고, 호출하는 쪽은 흐름 worktree 어디서든 이 스크립트를 쓴다(`AP_MAIN`이 있으면 직전 swap 기록을 `$AP_MAIN/.review/capacity.last`에 둔다). 단계와 수는 아래 표다. 이 수는 이 저장소 일을 하는 모든 Claude 세션(AP 밖 cwd의 fo·ev 세션, 「사용자 시작」 세션 포함)과 모든 흐름의 작업자를 합친 기계 전체의 한도다.

  | 단계 | 조건(모두 만족 / 하나라도) | 작업자 | 흐름 세션 | 새로 시작 |
  | --- | --- | --- | --- | --- |
  | green | 여유 ≥ 25% | 5 | 4 | 가능 |
  | yellow | 20% ≤ 여유 < 25%. 메모리 측정이 실패해도 여기다 | 3 | 3 | 가능 |
  | red | 여유 < 20% | 1 | 2 | 불가 |

  - **판정 기준(사용자 2026-10-26):** 지금은 메모리 여유 %만으로 단계를 정한다 — 초록 ≥ 25%, 빨강 < 20%, 그 사이 노랑(사용자 2026-10-27 "20퍼 여유 남길 때까지 쓰도록"으로 40·25에서 낮춤, #965; 측정 근거 없음 — `capacity.last`와 시간 초과 사건을 보고 다시 조정). swap·load·커널 압박은 출력에 참고값으로만 남긴다. 측정해 보니 쌓인 swap 13 GB는 오래 떠 있는 프로세스의 안 쓰는 페이지였고(10초간 swapout 0), 그것으로 green을 막으면 재부팅 전에는 green이 나오지 않았다. 아래 근거 문단의 swap·load·커널 압박 조건은 이 결정 전의 설계 기록이다.
  - **경계값의 근거:** 아래는 모두 「근거 없음, 첫 값」이다. 다만 yellow의 수(작업자 3·세션 3; 작업자 수는 2026-10-27 #965에서 2→3, green 3→5로 올림 — 근거: 작업자 프로세스 claude -p ≈340MB·codex ≈150MB, 큰 메모리는 작업자의 package test/typecheck 1–2GB이고 루트 검사는 heavy.lock으로 직렬)는 이 규칙 이전의 고정 상한이다. red의 load 기준(2×ncpu = 20)은 2026-10-26 세션 3개가 루트 검사를 겹쳐 돌려 부하 평균 40에서 무관한 테스트가 시간 초과된 한 번의 사건과 모순되지 않을 뿐이다(그 사건은 20과 40 사이를 가르지 못한다). 사건 당일 18:35~18:38 측정(여유 32~45%, swap 13.2/14.3 GB, load 6.4~10.5, 커널 압박 warn; swap 대부분은 며칠째 떠 있는 흐름 밖 claude 세션 3개와 ChatGPT)은 yellow로 나온다: swap이 8 GB를 넘고 커널 압박이 warn이라 green이 막힌다. macOS는 swap 파일을 필요할 때 늘리고 천천히 줄이므로 `사용/전체` 비율은 의미가 없어 절대값(8 GB = RAM의 절반)을 쓴다 — 이 값도 근거 없음이다. `여유 %`는 위 상태에서도 45%였으니 약한 신호이고 커널 압박 단계가 더 직접적이다. **이 규칙이 막는 것:** 부하가 이미 높을 때 작업자·무거운 단계가 더 얹히는 것. 2026-10-26 사건처럼 루트 검사가 겹치는 것은 이전부터 `heavy.lock`이 막는다. 이미 쌓인 swap(흐름 밖 세션)은 새 시작을 막아도 줄지 않으므로 아래 흐름 세션 항목의 팀장 점검이 그 세션을 드러낸다. 측정이 쌓이면(`capacity.last` 기록과 시간 초과 사건) 이 표를 고친다. 첫 사용 몇 번은 `why`와 실제 부하를 같이 적어 둔다.
  - **red의 수:** red의 `workers`·`lanes`는 새로 잡을 수 있는 수가 아니다(`start=no`). `lanes=2`는 팀장이 `대기` 흐름을 닫을 때의 목표 수이고 `workers=1`은 참고값이다. `start=no`면 5분 뒤 다시 돌리고 두 번째도 `no`면 막힘 보고를 보낸다(양식: `<흐름>: 막힘 #n capacity <단계> why=<why>`). yellow에서 낮은 번호 자리가 다른 작업자에게 잡혀 있고 높은 번호만 비어 있으면 기다린다 — 의도한 동작이다.
  - **작업자:** 작업자(구현·리뷰)를 띄우기 전에 매번 capacity.sh를 돌려 `start=yes`일 때만 자리를 잡는다. 자리는 `$AP_MAIN/.review/worker-slot-N`(N = 1부터 출력의 `workers`(최대 5)까지, 번호 순서로 시도하고 모두 실패하면 자리 없음; 잡는 법은 아래 잠금과 같다)이고, 그 작업자가 끝나면 바로 푼다. 구현이 끝나 리뷰어를 띄울 때는 풀었다가 다시 잡는다(그때 capacity.sh도 다시 돌린다) — 단계 사이에 자리를 쥐고 있지 않는다. `start=no`거나 자리가 모두 잡혀 있으면 자리 없이 작업자(리뷰어 포함)를 띄우지 않는다(#899에서 어겼다). 기다리는 동안 호스트 검증·문서 일을 하고, 할 수 있는 다른 일이 없으면 아래 막힘 보고(`<흐름>: 막힘 #n …`)를 보낸다. 막힘 보고에는 capacity.sh의 단계와 `why`를 적는다.
  - **이미 잡은 것은 뺏지 않는다:** 단계가 내려가도(예: green에서 3개를 잡은 뒤 red) 이미 돌고 있는 작업자와 잡은 자리·`heavy.lock`은 그대로 끝까지 돌린다. 새로 잡는 것만 막는다. 자리 번호가 `workers`보다 큰 `worker-slot-3`을 쥔 작업자도 끝날 때까지 쥔다.
  - **무거운 단계:** `heavy.lock`은 허용 수와 상관없이 기계 전체에서 하나다(아래). `start=no`(red)이면 새 무거운 단계도 시작하지 않고 `heavy.lock`을 잡으려 하지 않는다(좁힌 E2E와 패키지 단위 검사는 잠그지 않는 대로).
  - **흐름 세션:** 팀장이 정기 점검과 메일함 이벤트마다 capacity.sh의 `lanes`를 본다. 지금 세션 수(`orca terminal list`의 흐름 세션과 「사용자 시작」 세션)가 `lanes`보다 적고 할 일이 있는 흐름이 있으면 띄운다. 많으면 `대기` 상태인 흐름부터 닫고(닫기 규칙은 아래), 사용자 시작 세션은 닫지 않고 사용자에게 알린다. 일하고 있는 흐름 세션은 단계가 내려가도 끌어내리지 않는다 — 새 배정을 받지 않고 끝나면 닫을 뿐이다. 세션을 띄우기 전에도 capacity.sh를 돌려 `start=yes`를 확인한다. 단계가 yellow 이하이면 `ps -eo rss,etime,command | grep -E 'claude|codex|ChatGPT' | sort -rn | head`로 메모리 상위 프로세스와 경과 시간을 점검 보고에 적고, 흐름 표에 없는 하루 이상 된 세션은 사용자에게 닫아 달라고 알린다(팀장이 닫지 않는다).
- 무거운 단계는 기계 전체에서 하나씩 돈다: 루트 `pnpm test`·`build`, `probe.ts`, FeedbackOps integration(전체 `pnpm e2e`는 로컬에서 돌리지 않고 CI 실패 재현 때만 같은 잠금으로 돈다, #959). 미리보기·ego-browser 단계(UX 리뷰, 캡처)는 CPU를 거의 쓰지 않아 `heavy.lock`이 아니라 `browser.lock`을 잡는다(아래, #945). `mkdir "$AP_MAIN/.review/heavy.lock" && echo "$ORCA_TERMINAL_HANDLE" > "$AP_MAIN/.review/heavy.lock/owner"`이 성공한 세션만 시작한다. 바로 이어 같은 디렉터리에 `since`(`date -u +%FT%TZ`)와 `purpose`(어느 단계인지와 기다리는 PID, 예: `762p2 UX 리뷰, pid 41234`)를 적는다. `pid`는 `$WAVE_STATE/<이름>.json`의 `pid`다. Orca 터미널 작업자(PID 없음)는 `terminal <handle>`, 호스트에서 직접 도는 검사는 `foreground`로 적는다. 작업자를 다시 띄우면(쿼터 fallback 등) 먼저 `purpose`를 고쳐 쓴다. 자리(`worker-slot-*`)도 같다. 작업자를 띄운 뒤 PID를 알면 `purpose`를 고쳐 쓴다. 푸는 것은 `owner`가 자기 handle일 때만이다(`[ "$(cat …/owner)" = "$ORCA_TERMINAL_HANDLE" ] && trash …/heavy.lock`, `rm`은 전역 훅이 막고, owner 파일이 있어 `rmdir`은 안 된다) — 남의 잠금을 지운 일이 있었다(2026-10-26). 이 잡기·풀기가 `heavy.lock`·`browser.lock`·`worker-slot-N`·`merge.lock` 넷의 유일한 방법이다(디렉터리 이름만 바꾼다). 팀장의 stale 잠금 해제(아래 「stale 잠금 점검」)만 예외다. 풀 때 경쟁을 피하려고 주인이든 팀장이든 `mv <잠금> <잠금>.released-$$ && trash <잠금>.released-$$`로 푼다(이름 바꾸기가 실패하면 이미 누가 풀었거나 다른 세션이 새로 잡은 것이니 건드리지 않는다). 실패하면 그 이슈는 기다리고 다른 일을 한다. 좁힌 E2E(`-g`)와 패키지 단위 검사는 잠그지 않는다.
  - **`browser.lock`(#945):** 미리보기 서버·ego-browser·캡처 단계(UX 리뷰 포함)는 `heavy.lock` 대신 `$AP_MAIN/.review/browser.lock`을 같은 방법(`mkdir`, `owner`·`since`·`purpose`, `mv`+`trash`로 풀기)으로 잡는다. 기계 전체에서 하나이고 ego-browser(Ego Lite) 하나를 여럿이 번갈아 쓰지 않게 하는 잠금이다. `heavy.lock`과 동시에 쥘 수 있어, 다른 흐름의 루트 test/build가 도는 동안에도 브라우저 단계를 시작한다. 한 세션이 둘을 함께 쥐면 `browser.lock`을 먼저 잡고 `heavy.lock`을 잡는다(순서 고정으로 교착을 막는다). 미리보기 vite는 CPU·메모리를 쓰므로 capacity.sh `start=no`(red)면 브라우저 단계도 시작하지 않는다.
  - 잠금은 대기가 아니라 무거운 프로세스(작업자, 미리보기 서버)에 묶는다: 그 작업자가 끝나는 즉시 — 성공이든 `error_max_turns`·쿼터·크래시든 — 미리보기 서버를 내리고 잠금과 자리를 푼 뒤에야 결과를 읽는다. 작업자 완료 대기는 `worker-wait.sh`만 쓴다(sentinel에 PID 생존과 상한 시간을 함께 본다. `--kill-on-timeout`을 항상 준다. 종료 코드 `10`·`11`·`12`는 작업자가 끝난 것이니 같은 처리이고, `13`(capacity)은 작업자가 멈춘 것이라 잠금을 쥔 채 `purpose`를 `capacity 대기`로 고쳐 쓴다). sentinel 파일만 기다리는 직접 짠 대기는 쓰지 않는다 — 리뷰어가 sentinel 없이 죽으면 영원히 끝나지 않는다(#932).
- **stale 잠금 점검(사용자 2026-10-26 지시 #932):** 팀장은 2시간 점검을 기다리지 않고, 메일함 이벤트(`check --wait`가 깰 때)마다 `heavy.lock`·`browser.lock`·`worker-slot-*`·`merge.lock`의 `since`와 `purpose`를 본다. 정기 점검에서는 `owner` handle도 `orca terminal list`와 대조한다(팀장도 `trash`로 푼다). 풀어도 되는 경우는 위에서부터 첫 번째다: ① 디렉터리가 5분 넘게 `owner` 없이 있거나 handle이 이미 닫혔다 → 바로 푼다. ② `since`가 30분 넘었고 `purpose`의 PID가 죽었다(`ps -o command= -p <PID>`로 PID가 없거나 `claude -p`·`codex exec`·`vite` 등 `purpose`와 다른 프로세스일 때 — PID 재사용 때문에 `kill -0`만 쓰지 않는다) → 주인 흐름에 `[팀장] <잠금> 풀어라: <purpose>`를 바로 보내고(그 터미널이 `tui-idle`이 아니면 idle이 된 뒤부터), 10분 안에 `<흐름>: 풀음 <잠금 이름>`이 없으면 팀장이 푼다. 10분은 `check --wait --timeout-ms 600000`으로 센다. 주인이 이미 풀었으면 그대로 두고, 풀면서 새로 잡힌 잠금은 건드리지 않는다. 같은 흐름이 띄운 미리보기 서버가 남았으면 함께 내리라고 적고, 주인이 없으면 팀장이 `app-preview.py status`로 그 흐름의 label을 찾아 `stop <label>`으로 내린다(소유가 불분명하면 강제하지 않고 보고한다). 주인 세션이 없고 팀장도 없는 구간이면 막힌 흐름이 ① 경우(주인 handle이 `orca terminal list`에 없음)에 한해 직접 풀고 흐름 보고에 적는다. `purpose`에 `ship`을 적은 `merge.lock`은 `ship-pr.sh`의 CI 상한을 넘은 경우만 stale로 본다. 주인이 살아 있어도 PID가 죽었으면 같다 — 미리보기 vite가 떠 있는 것은 주인이 살아 있다는 증거가 아니다. ③ `purpose`가 없거나 PID를 알 수 없다 → 90분이 넘었으면 `pgrep -fl 'vitest|playwright|turbo|ship-pr|claude -p'`와 `lsof -a -p <PID> -d cwd`로, cwd가 그 주인 흐름 worktree(`LEAD.md` 표) 아래인 프로세스가 도는지 보고(미리보기 `vite`는 세지 않는다), 없으면 ②처럼 주인에게 묻고 푼다. 풀 때는 이슈 #932처럼 무엇을 왜 풀었는지 흐름 보고에 한 줄 적는다. `since`·`purpose`가 없는 잠금(사용자 시작 세션, 이 규칙 이전)은 `없음`으로 보고 ①과 ③만 적용한다. 90분의 근거는 측정이 아니라 여유다: CI 단계별로 lint 37초·typecheck 144초·test 395초·build 48초(루트 4종 합 약 10분), E2E는 shard 하나 5–8분이고 로컬 `contracts.spec.ts` 전체가 7.3분이다(#945, 2026-10-26). 로컬 캐시가 일부 맞은 test는 3분 20초였다. 한 단계가 이 합을 크게 넘으면 stale로 본다 — 측정이 더 쌓이면 이 숫자를 줄인다. 흐름 세션 수는 위 capacity.sh 표를 따른다.

## 흐름 세션

흐름 세션의 터미널은 사용자가 보지 않는다. 전역 conductor 스킬이 사용자에게 묻는 단계는 모두 팀장에게 메시지로 보낸다.

- **시작:** 지시서 파일을 읽는다. 병합 권한은 지시서에 적힌 사용자 권한(모양·날짜)이다. 다시 묻지 않고 `AskUserQuestion`도 쓰지 않는다 — 답할 사람이 없어 흐름이 멈춘다.
- **사용자 몫:** 시안 컨펌(아티팩트 링크), 06 계약을 바꾸는 결정, 테스트 삭제, 새 메뉴 화면 3개 이상, 전역 도구 업데이트는 `<흐름>: 질문 #n`으로 보낸다. 그 이슈는 멈추고 다른 배정을 진행한다. 그 밖의 판단은 스킬 Decisions대로 스스로 정하고 기록한다.
- **막힘 보고:** 잠금·자리를 못 잡아 이슈가 멈추면 기다리면서 `<흐름>: 막힘 #n <잠금 이름>, 주인 <owner>, since <시각>, purpose <purpose>`를 바로 보낸다. 5분 기다려 풀리는 일이면 보내지 않고, 그 뒤에도 안 풀리면 보낸다. 팀장은 막힘 메시지를 받은 같은 깨움에서 그 잠금의 `purpose` PID를 확인해 위 ②에 따라 주인에게 풀라고 보내거나 직접 풀고, 흐름에 결과를 회신한다(첫 응답 기준: 받은 즉시, 다음 정기 점검을 기다리지 않는다). 막힌 흐름은 잠금 잡기에 실패하면 5분 뒤 한 번 더 시도하고, 두 번째도 실패하면 보낸다. `since`·`purpose`가 없으면 `없음`으로 적는다.
- **배정 사이:** 하나가 끝나면 이슈 코멘트의 순서대로 다음 이슈를 바로 시작한다. 파일이 겹치지 않는 다음 이슈는 capacity 자리가 있으면 함께 띄운다(PROFILE §Launch). 모두 끝나면 `<흐름>: 대기`를 보내고, 새 배정이 올 때까지 아무것도 띄우지 않는다.
- **교대:** 터미널 상태줄의 `ctx:`가 60%를 넘으면(2026-10-26 fo 세션이 67%, 자동 요약 직전까지 갔다) 이슈 하나를 끝내는 조용한 때에 교대한다. 흐름 세션은 모델에게 상태줄이 보이지 않으므로 배정이 끝날 때마다 `orca terminal read --terminal "$ORCA_TERMINAL_HANDLE" --screen | grep -o 'ctx:[0-9]*%'`로 확인하고, 팀장도 정기 점검에서 흐름 터미널 화면의 `ctx:`를 읽어 60%를 넘었으면 `교대`를 지시한다(받은 세션은 진행 중인 이슈를 마무리한 뒤 `교대`를 보낸다). 75%를 넘으면 이슈 중간이라도 `HANDOFF.md`에 진행 중인 일을 적고 바로 교대한다. ctx%가 우선 기준이고 스킬의 토큰 한도는 보조다. 스킬 Session hygiene 한도에 가까울 때도 같다. 교대는 흐름 worktree 루트의 `HANDOFF.md`에 진행 중인 일과 쥐고 있는 잠금·자리·미리보기 label·`$WAVE_STATE` 작업자 이름을 적은 뒤(새 세션은 첫 행동으로 `worker-wait.sh`를 다시 건다) `<흐름>: 교대`를 보내는 것이다. 팀장이 `/clear`를 넣고, 이어서 "지시서를 다시 읽고 HANDOFF.md로 잇는다"를 넣는다.
- **병합:** PR은 기계 전체에서 하나씩 병합한다(루트 AGENTS.md). `ship-pr.sh`를 돌리는 동안(rebase → CI → 병합) `merge.lock`을 잡고(위 잠금 방법) 끝나면 푼다. 병합한 뒤 `main` CI가 실패하면 `<흐름>: main 깨짐`을 보내고 고친다. 팀장은 그동안 다른 흐름의 병합을 멈춘다.
- **전체 E2E(CI 실패 재현 때만):** 시작·끝을 팀장에게 한 줄로 알린다.
- **이슈 올리기 전 중복 확인:** 흐름 세션은 새 이슈(테스트 간헐 실패, 함정, 후속)를 열기 전에 `gh issue list --state all --limit 20 --search "<키워드·테스트 이름·파일>"`로 열린 이슈와 최근에 닫은 이슈를 본다. 같은 원인이면 새로 열지 않고 기존 이슈에 코멘트로 더한다(`.planning/README.md` 줄 정리는 팀장 몫이다)(#897이 #741과 같은 간헐 실패를 따로 기록해 #741로 합쳤다).

## 팀장

- **배정 기록:** 새 이슈를 §요청 분류대로 나눠 `lane:*`를 달고, 맡길 일은 이슈 코멘트(`배정: lane-<흐름>, 분류 <Kernel|SDK 조각|SDK 운영|메뉴 몫>, 순서 …` — 섞이면 `+`로 잇고, arch·site·ops 일은 `분류 없음`)로 남긴다. 이것이 유일한 원본이다. 분류 라벨은 따로 두지 않는다.
- **전달 경로:** 팀장 → 흐름은 터미널 입력이고, 흐름 → 팀장은 Orca Run 메시지다. Run은 하나다(`orca orchestration run-create --objective "AP 팀 — 흐름 배정(LANES.md)"`; 다음 팀장은 `run-list`로 찾아 `run-use --id <run>`).
  - 넣기 전에 `orca terminal wait --terminal <handle> --for tui-idle`을 돌리고 `orca terminal read --terminal <handle> --screen`으로 입력 대기 화면인지 본다. 권한·선택 창이 떠 있으면 넣지 않는다 — Enter가 그 창에 답한다. 확인한 뒤 `orca terminal send --terminal <handle> --text "[팀장 배정 #n] …" --enter`.
  - 흐름 세션은 `orca orchestration send --run <run> --to run:<run> --from "$ORCA_TERMINAL_HANDLE" --type status --subject "<흐름>: <병합|막힘|풀음|질문|착수|대기|교대|main 깨짐|E2E> [#n]" --body <세 문장>`으로 알린다.
  - **Run 코디네이터는 팀장 하나다.** 흐름 세션은 `orchestration run-use`·`check --wait`·`--ack`을 쓰지 않고 `send`만 쓴다(교대 뒤 새 세션도 같다). `run-use`는 Run의 `coordinator_handle`을 가져가므로, sdk 세션이 교대 중 돌렸을 때 팀장의 `check --wait`가 `consumer_fenced`로 끊겼다(2026-10-26 03:42Z, #903). 팀장은 `consumer_fenced`를 받으면 `orchestration run-list`로 코디네이터 주인을 보고 `run-use --id <run>`으로 되찾은 뒤 `check --wait`를 다시 건다.
  - 팀장은 `orca orchestration check --run <run> --wait`를 백그라운드로 걸어 두고 깰 때마다 다시 건다. 질문이 정기 보고까지 묵지 않게 하려는 것이다.
  - `orchestration dispatch --inject`는 쓰지 않는다. 그 작업자 머리말은 실행 중 GitHub 게시를 막고 5분 heartbeat를 요구해, PR을 올리고 병합하는 흐름 세션과 맞지 않는다(드라이런 확인, 2026-10-26). Claude 세션 간 메시지(`SendMessage`)는 권한 모드가 같은 세션에만 닿으므로 보조로만 쓴다.
  - **보내기 전 화면 확인과 보낸 뒤 확인:** 위 확인에 더해 피드백 초안이 떠 있거나 입력란에 글이 남아 있어도 넣지 않는다(#825 세션에서 어겼다). 넣을 수 없으면 다음 점검에 다시 보고, 한 주기가 넘게 그대로면 사용자에게 그 화면(사용자가 보는 세션이다)을 정리해 달라고 알린다. `terminal send --enter`가 Claude TUI에 `no turn start was observed` 경고를 내도 세 번 모두 실제로는 전달됐다. 경고를 실패로 보고 다시 보내지 않는다: 보낸 뒤 `orca terminal read --screen`으로 입력이 들어갔는지 확인하고, 없을 때만 한 번 더 보낸다.
  - `orchestration check --wait --json` 출력은 JSON 앞에 `{"_keepalive":…}` 줄이 붙는다. 바로 파싱하지 말고 그 줄을 걸러(`grep -v '^{"_keepalive"'` 등) 읽는다. `send` 경고와 이 keepalive 줄은 Orca 쪽 동작이라 conductor-engine 이슈로도 올렸다([conductor-engine#131](https://github.com/hjung3113/conductor-engine/issues/131)).
- **흐름 밖 세션(사용자 시작):** 사용자가 직접 띄운 세션(2026-10-26 #825 세션: main checkout 터미널, Run 보고 없이 `heavy.lock`·작업자 자리를 잡았다)은 흐름 규칙 밖에 있어 지시도 못 받고 보고도 안 한다. 팀장은 정기 점검에서 `orca terminal list`의 세션과 락·자리 `owner` handle을 `LEAD.md` 흐름 표와 맞춰, 표에 없는 handle(cwd가 AP 밖인 세션도)을 찾는다. 찾으면 `$AP_MAIN/.review/lanes/<흐름>-<이슈>.md` 지시서(흐름 라벨, Run id, 병합 권한 — 사용자가 그 세션에 준 범위 그대로, `AP_MAIN`, `WAVE_STATE`, 포트, "LANES.md §흐름 세션을 따른다")를 쓰고 터미널 입력으로 붙인다(위 전달 경로의 확인 순서). 그 세션은 capacity.sh의 `lanes` 한도에 들고 팀장 점검 표에는 「사용자 시작」으로 적는다. 사용자가 시킨 일이므로 이슈의 `lane:*` 라벨과 배정 코멘트는 팀장이 사후에 단다. 지시서를 붙일 수 없는 세션(Orca 터미널이 아님)은 사용자에게 알린다.
- **새 이슈 중복 대조:** 팀장은 정기 점검 때 새로 열린 이슈를 열린 이슈와 대조한다(제목·테스트 이름·파일로 `gh issue list --search`). 같은 원인이면 먼저 번호가 있는 쪽으로 합치고(나중 이슈에 `→ #이전` 코멘트를 남기고 닫는다) `.planning/README.md` 줄을 맞춘다.
- **흐름 세션 띄우기·닫기:** 할 일이 있는데 세션이 없는 흐름은 팀장이 띄운다.
  - 지시서를 `$AP_MAIN/.review/lanes/<흐름>.md`에 쓴다: 흐름 라벨, Run id, 사용자 병합 권한(모양·날짜), `AP_MAIN`, `WAVE_STATE=$AP_MAIN/.review/wave/state-<흐름>`, E2E 포트, "LANES.md §흐름 세션과 PROFILE.md를 따른다".
  - `orca worktree create --name lane-<흐름> --base-branch origin/main --agent claude --surface terminal --prompt "Read <지시서 절대 경로> and follow it."`. 첫 화면에서 권한 모드를 확인한다.
  - 흐름 worktree는 지시서·문서를 읽는 집이다. 이슈 작업은 PROFILE §Launch대로 이슈 worktree에서 한다. 배정마다 `git -C <흐름 worktree> fetch && git -C <흐름 worktree> merge --ff-only origin/main`으로 문서를 새로 읽는다.
  - handle은 `orca terminal list --worktree path:<흐름 worktree> --json`으로 찾는다.
  - 닫기: `대기`를 받았고 그 흐름의 작업자·미리보기가 없을 때(`wave-status.py --state-dir <WAVE_STATE>`) `orca terminal close --terminal <handle>`로 닫는다. 작업판에 그 흐름에 줄 일이 없을 때만 닫는다(capacity가 `lanes`를 줄일 때는 예외).
- **목표까지 작업판(사용자 2026-10-26: "기다리기만 하면 내가 프롬프트를 하나씩 보내는 것과 같다"):** 목표(예: 릴리스)를 받으면 `LEAD.md` 작업판에 목표까지의 줄을 적는다 — 이슈와 이슈 없는 단계(마감 리뷰·문서 점검·태그), 줄마다 의존·담당·상태. 이슈 담당의 원본은 배정 코멘트다. 의존이 끝났고 시작 안 한 줄이 **ready**다.
  - **깨울 때마다(메일함 이벤트·정기 점검·작업자 완료) ready를 0으로 만든다:** 작업판을 고치고, `capacity.sh`가 `start=yes`이고 빈 자리나 `대기` 흐름이 있으면 ready 줄을 같은 턴에 배정한다. CI·ship·리뷰·사용자 답을 기다리기 시작할 때도 같다.
  - **배정 순서:** ① 그 영역을 방금 만진 흐름 ② `대기` 흐름(남의 경로면 §함께 쓰는 경로 착수) ③ `lanes`가 남으면 복제 흐름(`<흐름>2`, 포트 +50, `WAVE_STATE=state-<흐름>2`). 한 흐름에 착수 전 이슈가 둘 이상이고 다른 흐름이 `대기`면 겹치지 않는 것을 옮긴다.
  - **순서대로 두는 것:** 같은 파일, 사용자 답을 기다리는 결정에 기대는 일, capacity red. `heavy.lock`·`merge.lock`이 겹칠 일은 배정하되 순서를 적는다.
  - **흐름 점검:** 열린 PR과 `병합` 메시지마다 `state-<흐름>/W-<n>*.json`에 `impl*`·`review-*` 기록(또는 VERIFY의 생략 이유)이 있는지 본다. 없으면 `[팀장] 규칙 #n: <빠진 것>`을 보내 병합 전이면 그 단계를 돌리게 하고, 병합 뒤면 사후 `review-final`을 돌리게 한다(2026-10-26 sdk #915 직접 구현, platform #924 리뷰 생략).
- **정기 점검과 보고(사용자 2026-10-26: 2시간):** 팀장 세션에서 2시간 주기 점검을 건다(`CronCreate`, 세션 안 예약이라 팀장 세션이 바뀌면 다시 건다). 흐름 세션은 heartbeat가 없으니 점검마다 본다: `gh issue list --label lane:<x>`, `gh pr list`, `orca worktree ps`, `orchestration run-list`의 coordinator가 팀장 handle인지, 흐름 터미널마다 `orca terminal read --screen`(멈춘 권한 창·오류), 잠금 셋(위 「stale 잠금 점검」). 보고에는 흐름별 병합·진행·막힘, 모아 둔 결정 질문(추천안 포함), 릴리스 후보를 한 번에 담는다. 흐름 하나를 통째로 막는 질문만 받는 즉시 묻는다. 보고는 작업판 차이(끝난·진행·남은 줄)로 한다.
- **릴리스:** 흐름 세션은 SDK 공개 변경마다 [`sdk-git-tag-consumption.md`](../../docs/integration/sdk-git-tag-consumption.md)에 "다음 릴리스" 행만 남긴다. 팀장은 정기 점검 때 "다음 릴리스" 행이 있고 `main` CI가 초록이면 SDK를 낸다. 그 SDK를 기다리는 흐름이 있으면 바로 낸다. 릴리스 순서의 원본은 이 줄이다(PROFILE §Slice close는 여기를 가리킨다):
  1. 슬라이스 마감 `review-quality`(화면이 바뀐 슬라이스는 `review-ux` 둘러보기도, PROFILE §Slice close). fix-in-slice는 이슈 하나로 고쳐 병합한다.
  2. 릴리스 문서 PR 초안: 변경 기록 버전, 보드 릴리스 줄. 앱 `v0.x` 릴리스면 site 흐름이 같은 시기에 사이트 갱신 PR을 연다(아래 소개 사이트 담당).
  3. **문서 점검**(아래). 2의 초안까지 본다. 지적은 팀장이 2의 릴리스 문서 PR에 넣어 고친다(사이트 지적은 site PR).
  4. 문서 PR(과 사이트 PR)을 병합한 뒤, SDK는 `sdk-v*` 태그·tarball·GitHub Release를 내고 보고한다. 앱 `v0.x`는 태그 전에 사용자에게 묻는다(사용자 2026-10-26).
  - **겹쳐 진행:** 1·2(앱 릴리스면 site PR도)는 남은 PR이 자기 리뷰를 마치면 병합을 기다리지 않고 함께 시작한다. 1에는 `origin/main`과 남은 PR diff를 준다. 3은 1의 보고서와 2의 초안이 생기면 시작한다. 전역 스킬 Slice close보다 이 줄이 우선한다(2026-10-26 v0.17.0).
- **문서 점검자(릴리스 전, 사용자 2026-10-26):** 릴리스마다 한 번, 오래 붙어 있는 세션이 아니라 일회성 리뷰어(routing.tsv `review-doc` 역할, 사용자 2026-10-26: Claude 사용량 절약)를 띄운다. 작업서는 [`addenda/doc-audit.md`](addenda/doc-audit.md)에 이번 버전·범위(`<이전 태그>...HEAD`)·마감 리뷰 보고서 경로·릴리스 문서 PR 브랜치를 채워 만든다. 문서를 지우는 결정은 사용자에게 묻는다.
- **소개 사이트 담당(사용자 2026-10-26):** `lane:site` 흐름 세션이 맡는다. 앱 `v0.x` 릴리스 때(SDK만 나가는 릴리스는 다음 앱 릴리스 때 묶어서) 팀장이 site 세션을 띄워 `site/`를 그 릴리스 내용에 맞추고, 끝나면 닫는다. 일회성 site·ops 세션도 capacity.sh의 `lanes` 한도에 든다.
- **팀장 교대·복구:** 팀장 세션은 conductor 스킬 Session hygiene 한도(약 450k 토큰)보다 일찍, 큰 일을 하나 끝낸 조용한 때 교대한다(사용자 2026-10-26: 너무 오래 돌면 판단이 흐려진다). 새 일을 받지 않고 하던 일을 마무리한 뒤 `LEAD.md`를 갱신하고 사용자에게 세션 초기화(`/clear` 뒤 이 문서로 다시 시작)를 요청한다. 흐름 세션은 그사이 계속 일한다. 팀장은 `$AP_MAIN/.review/lanes/LEAD.md`에 Run id와 흐름별 worktree·handle·진행 중 이슈를 적어 둔다. 팀장 세션이 끝나도 흐름 세션은 배정을 이어 가고 메시지는 Run에 쌓인다. 새 팀장은 이 순서로 잇는다: 이 문서 → `LEAD.md` → `run-list`·`run-use --id <run>` → `orchestration check --run <run>`(쌓인 메시지) → `orca terminal list`(handle) → 정기 점검 다시 걸기.
