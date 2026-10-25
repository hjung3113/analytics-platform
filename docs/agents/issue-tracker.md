# Issue tracker: GitHub

이 저장소의 작업·결정·PRD는 `hjung3113/analytics-platform`의 GitHub 이슈로 관리한다. 모든 조작은 `gh` CLI로 한다. 남은 일 한눈 보기는 [`.planning/README.md`](../../.planning/README.md)다(원본은 이슈·마일스톤).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file>` (여러 줄 본문은 파일로). 라벨: triage 라벨 1개 + 영역 라벨(`area:*`) 1개 이상 + 해당하면 마일스톤.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,labels,milestone --jq '.[] | {number, title, labels: [.labels[].name], milestone: .milestone.title}'`.
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: PR이 `main`을 대상으로 하므로 PR 본문의 `Closes #n`이 병합 시 이슈를 닫는다. 이슈 없이 끝난 결정은 `gh issue close <n> --comment "<결정과 근거>"`.

## 영역 라벨

| 라벨 | 범위 |
| --- | --- |
| `area:kernel` | Kernel 기능(Registry, Context, URL, 권한·Scope, Audit), 워크스페이스 층 |
| `area:ops-console` | 운영 콘솔(플랫폼 관리 도구) |
| `area:design` | 디자인 시스템, 공통 UI 부품, DESIGN.md |
| `area:feedbackops` | FeedbackOps 통합 |
| `area:tooling` | lint, 생성기, CI, 검증 도구 |

## 흐름 라벨

열린 이슈마다 `lane:*` 하나를 단다: `lane:sdk`·`lane:platform`·`lane:arch`·`lane:fo`·`lane:ev`·`lane:site`. 범위와 소유 경로는 [`.agents/conductor/LANES.md`](../../.agents/conductor/LANES.md)다(2026-10-26, 열린 이슈 전체에 달았다).

보류 중인 이슈에는 `on-hold` 라벨을 단다(외부 조건이 풀리면 제거). 예: #163·#164는 업무 필수로 확인될 때까지 보류.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Milestones

Milestones are the progress authority per track. Open: `M4 사내 적용`, `M6 FeedbackOps 합류`(지도 #598), `M7 MARS 이관`(#552 #555 #556 #557), `M8 SDK 계약·품질`(#669 #670 #671). Closed: `M1 플랫폼 기능 기반`, `M2 디자인 시스템`·`M3 FeedbackOps 1단계`(둘 다 2026-10-23), `M5 FeedbackOps 2단계`(지도 #213, ADR-0066이 대체). M7·M8은 2026-10-23에 만들었고, 같은 날 `area:*`가 없던 이슈 21건에 영역 라벨을 달았다(#670 D7). The at-a-glance board is `.planning/README.md`.
