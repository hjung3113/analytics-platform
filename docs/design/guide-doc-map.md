# 가이드 문서 지도 — 독자별 길과 빈 곳 (#1603)

상태: **Decided (2026-11-10, 리드 결정, 소유자 위임, 되돌릴 수 있음)** — 첫 묶음 G1·G2·G8·G9를 작성했다. G6·G7은 다음 묶음이다. 소유자 결정(2026-11-10): 외부 소비자용 가이드는 보류하고 이 저장소의 개발자·에이전트·백엔드 담당자·SDK 기여자를 먼저 한다. 답이 나면 이 문서를 고치고, 가이드가 생기면 이 문서의 「지금」 열을 지도 한 장으로 남긴다.

## 왜 필요한가

사용자가 이 저장소의 개발자에서 코딩 에이전트, 다른 저장소의 SDK 소비자까지 넓어졌다. 지금 문서는 규칙의 원본(계약·ADR)과 폴더별 작업 지침(`AGENTS.md`)이고, "처음 해 보는 사람이 따라 하는 글"은 거의 없다. 이 문서는 새 규칙을 정하지 않는다. 독자마다 어느 문서를 어떤 순서로 읽는지와 빠진 글을 적는다.

규칙은 소유 문서에 두고 가이드는 사용법과 예제만 쓴다([docs/AGENTS.md](../AGENTS.md) 소유권). 단 tarball만 설치한 독자는 저장소 링크를 못 열 수 있으므로, 그 독자에게 필요한 안내는 패키지 안에 있어야 한다.

## 독자별 지도

「지금」은 2026-11-10 저장소 기준으로 실제 있는 문서다. 「빠진 것」은 아래 빈 곳 목록의 번호다.

### R1. 이 저장소에서 메뉴를 만드는 개발자

| | |
| --- | --- |
| 처음 | 루트 [README](../../README.md)(31줄, 실행 명령뿐) |
| 다음 | [사내 적용 가이드 §5](../integration/in-house-rollout.md#5-사내-메뉴-개발-가이드) → [페이지 작성 가이드](../../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙) → [menus/AGENTS.md](../../menus/AGENTS.md) |
| 읽고 나면 | 메뉴 그룹 하나에 화면을 더하고 조회를 선언하고 mock으로 돌려 본다 |
| 빠진 것 | G1, G2. 순서는 있으나(§5) 규칙 목록이라, 빈 상태에서 화면 하나가 뜨기까지 따라 하는 글이 없다. 페이지 규칙이 조립 앱 README에 있어 찾기 어렵다 |

### R2. 다른 저장소에서 tarball로 쓰는 메뉴 개발자 — 보류

보류(소유자, 2026-11-10). 이유와 다시 여는 조건은 아래 「보류」 절. 지금 있는 안내는 [`packages/sdk/CHANGELOG.md`](../../packages/sdk/CHANGELOG.md)의 「Release tarball로 받기」 절과 [ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md)이고 그대로 둔다.

### R3. 호스트 모듈 개발자 — 보류

보류(소유자, 2026-11-10). 지금 있는 글은 [ADR-0053](../adr/0053-host-module-contract-v1.md)과 [플랫폼 탑재 설계](../integration/platform-hosting-design.md)이다.

### R4. 이 저장소에서 일하는 코딩 에이전트

| | |
| --- | --- |
| 처음 | 루트 [AGENTS.md](../../AGENTS.md)(자동으로 읽힘) |
| 다음 | [docs/INDEX.md](../INDEX.md)의 작업별 읽기 경로 → 폴더별 `AGENTS.md` |
| 읽고 나면 | 규칙을 지키며 메뉴·SDK 작업을 한다 |
| 빠진 것 | G6. 작업 종류별로 "어느 문서를 열고 무엇을 돌리는지"가 INDEX 표와 폴더 지침에 나뉘어 있고, 에이전트용 한 장 요약이 없다. 소비자 저장소용 지침은 R2 보류에 따라 범위 밖 |

### R5. 실서버 어댑터를 붙이는 백엔드 담당자

| | |
| --- | --- |
| 처음 | [사내 적용 가이드](../integration/in-house-rollout.md) |
| 다음 | [실서버 연결 체크리스트](../integration/real-server-checklist.md) → [전송 형식](../integration/http-adapter-contract.md) → [`@ap/server-conformance`](../../packages/adapters/server-conformance/AGENTS.md) |
| 읽고 나면 | 어댑터가 적합성 묶음을 통과한다 |
| 빠진 것 | 문서는 갖춰져 있다. 새 글은 만들지 않고 이 지도의 읽는 순서로 충분하다 |

### R6. SDK 자체에 기여하는 개발자

| | |
| --- | --- |
| 처음 | [packages/AGENTS.md](../../packages/AGENTS.md) |
| 다음 | 각 패키지 `AGENTS.md` → [tooling/AGENTS.md](../../tooling/AGENTS.md)(`sdk:pack`·`sdk:api`·`sdk:consumer-check`) → [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)·[ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md) |
| 읽고 나면 | 공개 API를 바꾸고 스냅샷·소비자 검사를 돌려 통과시킨다 |
| 빠진 것 | G7. 도구 설명은 흩어져 있고 "공개 API 하나를 더하는 순서"를 한 곳에서 보여 주는 글이 없다 |

### R7. 배포판을 실행하는 운영·사내 담당자 (#1606)

| | |
| --- | --- |
| 처음 | 루트 [README](../../README.md)(지금 기동 안내 없음) |
| 다음 | [oidc-and-images.md](../../ops/platform-api/docs/release/oidc-and-images.md)(compose 순서) → [first-admin-bootstrap.md](../../ops/platform-api/docs/release/first-admin-bootstrap.md) → [backup-restore-upgrade.md](../../ops/platform-api/docs/release/backup-restore-upgrade.md) |
| 읽고 나면 | 깨끗한 볼륨에서 개발·로컬 스모크·운영 구성을 순서대로 띄우고 최초 Admin을 부여한다 |
| 빠진 것 | G9. 순서가 release 문서와 compose 주석에만 있고 README·`in-house-rollout.md`에서 닿지 않는다 |

## 빈 곳 목록

| # | 빈 곳 | 독자 | 크기 | 상태 |
| --- | --- | --- | --- | --- |
| G1 | 이 저장소 첫 화면 만들기 — 빈 상태에서 메뉴 화면 하나가 뜨기까지 따라 하는 글 | R1 | 가이드 1편 | 작성함: [guides/first-menu-screen.md](../guides/first-menu-screen.md) |
| G2 | SDK 패키지 6개(`contracts`·`kernel`·`ui`·`components`·`shell`·`contract-schemas`)의 README. 저장소 안에서 패키지를 여는 개발자·에이전트가 읽는다 | R1·R4·R6 | README 6개 | 작성함: `packages/sdk/*/README.md`, 한국어, 코드 예제 없음 (tarball 포함은 보류 절) |
| G3 | 외부 소비자 빠른 시작 | R2 | 가이드 1편 | **보류** |
| G4 | 설치 안내의 자리(CHANGELOG 안) | R2 | — | **보류** (G3과 함께) |
| G5 | 호스트 모듈 최소 예제 | R3 | 가이드 1편 | **보류** |
| G6 | 에이전트용 한 장 요약(작업 종류별 문서·검증), 영어 | R4 | 파일 1개 | 다음 묶음 — 아래 「G6 대조」 |
| G7 | SDK 기여 — 공개 API 변경·스냅샷·검사 순서 | R6 | 가이드 1편 | 다음 묶음 |
| G8 | 루트 README가 "어디부터 읽나"를 독자별로 알려 주지 않는다 | 전체 | README 고침 | 작성함: 루트 README 「누가 어디부터 읽나」 |
| G9 | 배포판 실행 안내 — compose별 기동 순서·프로파일 서비스·MinIO·최초 Admin(#1606). README에서 닿게 하고 깨끗한 볼륨에서 확인 | R7 | 가이드 1편 | 작성함: [run-guide.md](../../ops/platform-api/docs/release/run-guide.md), `ops/platform-api/README.md`, 상태 점검 `scripts/release/stack-status.sh` |

가이드에 쓰지 않는 것: AP DevKit(#1207), 외부 확장 SDK(#428·#492), #911. 설계 단계이거나 없는 기능이다. 생기면 그때 가이드를 고친다.

## G6 대조 (INDEX와 겹치는가)

[docs/INDEX.md](../INDEX.md)의 「작업별 읽기 경로」 표가 이미 작업 종류별로 계약 → 폴더 지침 → 코드를 한 줄에 준다. 루트 [AGENTS.md](../../AGENTS.md)가 INDEX와 폴더 지침으로 잇는다. 에이전트용 한 장 요약을 따로 두면 같은 표가 두 곳이 되어 어긋난다. 그래서 새 파일 대신, 표에 없는 작업(배포판 실행, 첫 메뉴 화면)만 INDEX에 한 줄씩 더했다. 다음 묶음에서 에이전트가 INDEX 표로 길을 못 찾은 사례가 나오면 그 사례를 보고 정한다.

## 다음 묶음

| 항목 | 이유 | 시작 조건 |
| --- | --- | --- |
| G6 에이전트용 요약 | 위 대조. 필요가 확인되기 전에는 INDEX 표가 원본 | 표로 길을 못 찾은 실제 사례 |
| G7 SDK 기여 순서 | 이번 묶음 범위 밖(리드 결정) | 다음 묶음 지시 |

## 보류 (Deferred, 구현 안 함)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| G3·G4 외부 소비자 가이드, R2 | 소유자 결정(2026-11-10): 저장소 밖 소비자가 지금 EV뿐이고 EV는 자체 안내(EV ADR-0014, `INTEGRATION.md`)를 따른다 | 저장소 밖 패키지(EV 외의 소비자, 또는 EV가 최신 SDK로 올리는 시점)가 이 도구나 확장을 실제로 필요로 할 때 |
| G5 호스트 모듈 예제, R3 | 같은 결정. 외부 소비자 독자에 속한다 | 위와 같음 |
| 릴리스된 tarball로 따라 하기 확인 | 외부용 가이드가 없어 대상이 없다. 저장소 안 가이드는 워크스페이스에서 확인한다 | 위와 같음 |
| 패키지 README를 tarball에 싣기(`sdk-pack` `files`) | 외부 독자 보류와 `v0.32.0` 태그 보류 | 위와 같음 |

## 작성할 때 지킬 것

- 예제는 컴파일되거나 실행된 것만 싣는다. 가이드마다 깨끗한 상태(새 clone 또는 worktree, G9는 깨끗한 볼륨)에서 순서대로 따라 해 본 결과를 PR에 적는다.
- 사람이 읽는 가이드는 쉬운 한국어(`copy-plain-ko`), 에이전트가 읽는 파일(G6, 패키지 README)은 영어.
- 폴더 `AGENTS.md`와 `.planning/README.md`는 이 일에서 고치지 않는다.
- 패키지 README 파일은 저장소 안에서만 쓴다. `sdk-pack`은 건드리지 않는다(보류 절).

## 결정 (리드, 소유자 위임, 2026-11-10 — 되돌릴 수 있음)

- 가이드는 `docs/guides/`에 두고 소유권 목록에 올렸다([docs/AGENTS.md](../AGENTS.md)). 서버 실행 안내(G9)는 `ops/platform-api/docs/release/`에 두고 README에서 잇는다.
- 패키지 README는 한국어로 짧게, 코드 예제 없이 G1로 잇는다.
- 첫 묶음은 G1·G2·G8·G9. G6·G7은 다음.
