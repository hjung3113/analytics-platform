# Issue Tracker: GitHub

This repository tracks work, decisions, and PRDs in GitHub issues at `hjung3113/analytics-platform`. Use the `gh` CLI for all operations. The at-a-glance view of remaining work is [`.planning/README.md`](../../.planning/README.md); issues and milestones are the source of truth.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file>` (put multiline bodies in a file). Add one triage label, at least one area label (`area:*`), one flow label (`lane:*`), and a milestone when applicable.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,labels,milestone --jq '.[] | {number, title, labels: [.labels[].name], milestone: .milestone.title}'`.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: PRs target `main`, so `Closes #n` in the PR body closes the issue when the PR is merged. Close a decision made without an issue with `gh issue close <n> --comment "<decision and rationale>"`.

## Area Labels

| Label | Scope |
| --- | --- |
| `area:kernel` | Kernel features (Registry, Context, URL, permissions and Scope, Audit), workspace layer |
| `area:ops-console` | Operations console (platform administration tools) |
| `area:design` | Design system, shared UI components, DESIGN.md |
| `area:feedbackops` | FeedbackOps integration |
| `area:tooling` | lint, generators, CI, validation tools |

## Flow Labels

`lane:sdk` · `lane:platform` · `lane:arch` · `lane:fo` · `lane:ev` · `lane:site` · `lane:ops`. For label rules and how to classify requests as Kernel responsibility, SDK components, or menu work, see [`.agents/conductor/LANES.md`](../../.agents/conductor/LANES.md) §Lanes and §Request classification.

Add the `on-hold` label to an issue while an external condition remains unresolved; remove it when the condition clears. For example, keep #163 and #164 on hold until their work requirement is confirmed.

## Pull Requests as a Triage Surface

**PRs as a request surface: no.**

## When a Skill Says "Publish to the Issue Tracker"

Create a GitHub issue.

## When a Skill Says "Fetch the Relevant Ticket"

Run `gh issue view <number> --comments`.

## Milestones

Milestones are the progress authority for each track.

- **Open:** `M4 사내 적용`, `M6 FeedbackOps 합류` (map: #598), `M7 MARS 이관` (#552, #555, #556, #557), `M8 SDK 계약·품질` (#669, #670, #671).
- **Closed:** `M1 플랫폼 기능 기반`, `M2 디자인 시스템`, `M3 FeedbackOps 1단계`, `M5 FeedbackOps 2단계` (map: #213; superseded by ADR-0066).

The at-a-glance board is [`.planning/README.md`](../../.planning/README.md).

