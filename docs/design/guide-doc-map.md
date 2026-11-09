# 가이드 문서 지도 — 독자별 길과 빈 곳 (#1603)

상태: **Candidate (2026-11-10)** — 설계만 있고 가이드 본문은 아직 없다. 소유자 답(`질문 #1603`, 아래 Open)을 받은 뒤 작성한다. 답이 나면 이 문서를 고치고, 가이드가 생기면 이 문서의 「지금」 열을 지도 한 장으로 남긴다.

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

### R2. 다른 저장소에서 tarball로 쓰는 메뉴 개발자

| | |
| --- | --- |
| 처음 | `sdk-v*` Release 설명(GitHub) 또는 받은 tarball 안의 패키지 README |
| 다음 | 설치·소비자 조건 → 첫 화면 → 공개 API 목록(`tooling/sdk/api/*.api.txt`) |
| 읽고 나면 | 깨끗한 저장소에 SDK를 설치하고 Provider를 붙여 화면 하나를 그린다 |
| 빠진 것 | G2, G3, G4. 설치 안내가 [`packages/sdk/CHANGELOG.md`](../../packages/sdk/CHANGELOG.md) 중간 절(변경 기록 220줄 뒤)에 있고, 패키지 README가 하나도 없다. tarball은 `dist`만 담는다(`files: ["dist"]`) |

### R3. 호스트 모듈 개발자 (다른 저장소 업무 모듈을 플랫폼에 올림)

| | |
| --- | --- |
| 처음 | [ADR-0053](../adr/0053-host-module-contract-v1.md)(계약 1판) |
| 다음 | [플랫폼 탑재 설계](../integration/platform-hosting-design.md)(설계 글, 일부 Proposed) → `packages/sdk/kernel/src/registry/module.ts`의 `mountModule` |
| 읽고 나면 | manifest 하나와 화면 하나를 만들어 호스트에 마운트한다 |
| 빠진 것 | G5. 설계 글에는 스케치뿐이고 실제로 돌아가는 최소 모듈 예제가 문서에 없다. 외부 확장(#428)·카탈로그(#1207)는 설계 PR 단계라 가이드에서 쓸 수 있는 것으로 적지 않는다 |

### R4. 코딩 에이전트 (R1·R2의 도구)

| | |
| --- | --- |
| 처음 | R1: 루트 [AGENTS.md](../../AGENTS.md)가 자동으로 읽힌다. R2: 소비자 저장소에는 읽을 지침이 없다 |
| 다음 | R1: 폴더별 `AGENTS.md`. R2: (없음) |
| 읽고 나면 | R1: 규칙을 지키며 작업. R2: 같은 규칙을 지키려면 사람이 붙여 주는 수밖에 없다 |
| 빠진 것 | G6. 소비자 저장소에 두는 에이전트용 지침 한 장이 없다. 자동 안내·스킬은 AP DevKit(#1207)의 몫이고 아직 없으므로, 그 전까지 쓸 수 있는 것은 정적 문서뿐이다 |

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

## 빈 곳 목록

| # | 빈 곳 | 독자 | 크기 |
| --- | --- | --- | --- |
| G1 | 이 저장소 첫 화면 만들기 — 빈 상태에서 메뉴 화면 하나가 뜨기까지 따라 하는 글 | R1 | 가이드 1편 |
| G2 | SDK 패키지 6개(`contracts`·`kernel`·`ui`·`components`·`shell`·`contract-schemas`)의 README | R1·R2·R4 | README 6개 |
| G3 | 외부 소비자 빠른 시작 — 설치(Release URL, 소비자 조건)부터 첫 화면까지 | R2 | 가이드 1편 |
| G4 | 설치 안내의 자리 — 지금은 변경 기록 파일 안. 규칙 원본(소비자 조건)은 거기 두고, 따라 하는 글은 G3·G2가 맡아야 한다 | R2 | G3·G2에 포함 |
| G5 | 호스트 모듈 최소 예제 — 만들어진 `mountModule` 범위까지만 | R3 | 가이드 1편 (범위 좁게) |
| G6 | 소비자 저장소용 에이전트 지침 한 장(복사해 두는 파일) | R4 | 파일 1개, 영어 |
| G7 | SDK 기여 — 공개 API 변경·스냅샷·소비자 검사 순서 | R6 | 가이드 1편 |
| G8 | 루트 README가 "어디부터 읽나"를 독자별로 알려 주지 않는다 | 전체 | README 고침 |

가이드에 쓰지 않는 것: AP DevKit(#1207), 외부 확장 SDK(#428·#492), #911. 설계 단계이거나 없는 기능이다. 생기면 그때 가이드를 고친다.

## 작성할 때 지킬 것

- 예제는 컴파일되거나 실행된 것만 싣는다. 가이드마다 깨끗한 디렉터리에서 순서대로 따라 해 보고, 외부용은 릴리스 tarball로(`sdk:consumer-check` 형태) 확인한 결과를 PR에 적는다.
- 사람이 읽는 가이드는 쉬운 한국어(`copy-plain-ko`), 에이전트가 읽는 파일(G6, 패키지 README 영문본)은 영어.
- 폴더 `AGENTS.md`와 `.planning/README.md`는 이 일에서 고치지 않는다.
- 패키지 README를 tarball에 넣는 일은 `sdk-pack`(`files`·staging)을 건드리므로 `v0.32.0` 태그 뒤에 한다.

## Open (소유자 결정)

답은 `질문 #1603`으로 받는다. 결정되면 이 절을 지우고 본문에 반영하며, 실제 대안 중 고른 것은 ADR로 남긴다.

1. **가이드를 둘 곳.** (a, 권고) 새 폴더 `docs/guides/`에 독자별 글을 모으고 INDEX와 루트 README에서 잇는다. (b) 기존 문서에 덧붙인다(사내 적용 가이드 §5 확장 등). 권고 이유: (b)는 이미 규칙 목록인 문서를 더 길게 만들고, 외부 독자가 찾을 자리가 여전히 없다.
2. **패키지 README의 언어와 내용.** (a, 권고) 영어, 짧게(무엇인지·설치·최소 사용 예·공개 진입점·소비자 조건 요약). 읽는 쪽이 에이전트와 외부 개발자라서다. (b) 한국어. 소비자 조건은 CHANGELOG가 원본이므로 README에는 필요한 줄만 복사하면 규칙이 두 곳에 생긴다 — 이를 피하려고 pack 단계가 CHANGELOG 절을 README에 끼워 넣게 할 수도 있다(구현은 hold 뒤, 별도 판단).
3. **첫 묶음 범위.** (a, 권고) G1·G2·G3·G6·G8을 먼저, G5·G7은 다음에. 이유: 앞의 다섯이 "처음 읽을 글이 없다"는 문제를 직접 닫는다. (b) 전부 한 번에.
4. **외부 소비자 확인 방법.** (a, 권고) 릴리스된 tarball(`sdk-v0.32.0` 이후)로 깨끗한 디렉터리에서 따라 하고 PR에 기록. 태그 전에는 `sdk:pack`으로 만든 로컬 tarball. (b) 항상 로컬 tarball.
