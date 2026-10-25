# 흐름(lane)과 팀장

여러 Claude 세션이 이 저장소에서 동시에 일할 때의 분담 규칙이다(사용자 2026-10-26). 세션 하나는 흐름 하나를 맡아 그 안에서 [`PROFILE.md`](PROFILE.md)대로 이슈를 진행하고, 팀장 세션이 흐름 사이의 배정·충돌·릴리스를 맡는다.

## 흐름

이슈마다 `lane:*` 라벨을 하나 단다. 배정의 원본은 라벨과 이슈 코멘트이고, 세션 간 메시지는 알림일 뿐이다(권한 모드가 다른 세션에는 메시지가 붙잡혀 만료된다, 2026-10-26).

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

- **배정:** 새 이슈에 `lane:*`를 달고, 할 일이 있는 흐름에 다음 일을 이슈 코멘트로 배정한다. 흐름 세션이 없으면 팀장이 띄운다 — `orca worktree create --name lane-<흐름> --base-branch origin/main --agent claude --prompt "<흐름 지시서>"`. 지시서에는 흐름 라벨, 소유 경로, E2E 포트, 이번에 맡을 이슈와 순서, 병합 권한을 적는다. 동시에 띄우는 흐름 세션은 3–4개까지다(16GB 머신, [operations.md](../../docs/agents/operations.md)). 일이 끝난 흐름 세션은 팀장이 닫는다.
- **현황:** 세션 목록(`ListAgents`), `orca worktree ps`, `gh issue list --label lane:<x>`로 본다. 흐름 세션은 병합·막힘·전체 E2E 시작/끝을 팀장에게 한 줄로 알린다.
- **릴리스:** 흐름 세션은 SDK 공개 변경마다 [`sdk-git-tag-consumption.md`](../../docs/integration/sdk-git-tag-consumption.md) "다음 릴리스" 행만 남긴다. 팀장이 모아 슬라이스 마감 `review-quality`를 돌리고 `sdk-v*` 태그·GitHub Release를 낸 뒤 보고한다. 앱 `v0.x`는 팀장이 릴리스 PR까지 만들고 태그 전에 사용자에게 묻는다(사용자 2026-10-26).
