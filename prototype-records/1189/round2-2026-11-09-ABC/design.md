# #1189 home and system switcher: design stage (rechecked 2026-11-09)

Lane `home`, v0.33.0. Passes root `AGENTS.md` §UI test B (shell frame), so prototype and owner pick come before implementation. Prior attempt: 2026-11-01, three variants, owner held the decision (issue comment). Prior research and diagnosis: `research.md` in this folder.

## Recheck against the current shell

Compared the 2026-11-01 prototype base with `HEAD` (2ff629b3f).

- `SystemSwitcher.tsx`: only the `currentSpace` accessibility guard changed (#1314). Trigger, popover and cards are as diagnosed. Items 1 to 9 of `research.md` §Q1.3 still apply.
- `OperationsHome.tsx`: two small changes (`내 VOC` link now reads `VOC`; favorites empty state lost its sunken box). Items 10 to 18 still apply, except that the favorites empty box is already gone while the recent empty box remains, so the two panels are now inconsistent.
- Spaces changed. `개선 실행` is gone and `업무 흐름` (`flow`) took its place. `표준 로그 개발` and `업무 흐름` have no subtitle.
- The old finding "two spaces share the Inbox icon" no longer holds: `log-dev` is Inbox, `flow` is ListTodo, so no `SpaceDef.icon` contract field is needed to tell them apart. Item 1 (trigger icon equals the first rail section icon) still holds, because both derive from the home menu's group.
- `MARS` and `CLAS` still share the subtitle `생산성 분석`, so the switcher and home rows still fail to tell them apart.
- 2026-11-01 captures are stale (old space names). All captures are retaken.

## Why the variant set changes

The owner's request said to keep the current pattern (DESIGN.md, ADR-0102 group tiles). All three old variants replaced the tile, and the owner picked none. The new set adds one that keeps the tile, so the owner can see the smallest change next to the larger ones.

## 1. Requirements

- Users: production analysts and operators who already know each system by name. Admins additionally use 운영 콘솔.
- Primary tasks on home: go to a system, resume the last screen, reopen a favorite or recent screen, see notices and to-dos.
- Primary task on the switcher: change system from anywhere in two actions, resume where they left off; reach platform menus.
- Frequency: home is passed through a few times a shift, the switcher several times a day. Neither is a place to read.
- Data: 7 spaces in 4 app-declared groups (3, 2, 1, 1), up to 5 recents, favorites, notices; planned spaces may appear in the switcher.
- Owner's words: minimal, keep the pattern, short descriptions, "it just doesn't look pretty".
- Desktop 1440×900 only (root `AGENTS.md`).

## 2. Information architecture (unchanged in all variants except where noted)

```
Rail: switcher, section buttons, shared tools, help, user
Switcher popover: systems (accessible), planned systems, platform menu links
Home: systems grouped by HOME_LAUNCHER_GROUPS, 내 할 일 slot, favorites, recent, notices
Sidebar head: system name + section name, collapse (variant C makes the name the switcher)
```

Order of home sections, permission logic, resume URLs, Kernel focus rules and `aria` contract stay as they are in `multi-workspace-ui.md` §3.1 and §3.2.

## 3. Screen spec, what may change

| Surface | Keeps | May change |
| --- | --- | --- |
| Home system entry | link target, resume target, permission filter, group order | card shape, icon treatment, copy lines, group label weight, grid |
| Home lower sections | content, order, favorite removal focus rule | panel subtitles, empty states, notice row styling |
| Trigger | 32px visual, 40px target, tooltip and accessible name | mark, indicator, resting and hover surface |
| Popover | focus on current card, focus trap, Esc, selection then arrival focus, planned rows, no search | width, columns, row shape, order of systems and platform links, current-item mark |

Empty, loading and error: home zero-space state, notice `QueryView` and switcher empty text stay in every variant.

## 4. Variants

- **A 타일 유지 (keeps ADR-0102).** Home keeps bordered tiles in 3 columns but each tile is one line of name and short descriptor with an outline icon and no chip; resume is one quiet line. Group titles drop to a label. Switcher: neutral rail trigger with a side-by-side indicator, popover keeps 2 columns with single-line rows, no heading divider, platform links last.
- **B 조용한 목록.** Home has no tile borders: rows under small group labels, in columns. Switcher: one-column menu list with a single check mark on the current item.
- **C 이름 보이는 트리거.** The sidebar head becomes the switcher (`MARS` + indicator). Needs a contract change (§3.2 "the head is not another switcher", ADR-0042), so it is shown to let the owner weigh it. Home as groups in four columns.

Wireframes (region level):

```
A home                                  B home                         C home
분석                                     분석             업무 운영       분석    업무운영  도구   플랫폼관리
[▣ MARS 생산성][▣ BRAVO 지표][▣ CLAS 동작]  ▣ MARS 생산성     ▣ 표준 로그     ▣ MARS  ▣ 표준로그 ▣ 도구 ▣ 운영
업무 운영                                 ▣ BRAVO 지표     ▣ 업무 흐름     ▣ BRAVO ▣ 업무흐름
[▣ 표준 로그][▣ 업무 흐름]                 ▣ CLAS 동작                     ▣ CLAS
도구 · 플랫폼 관리 (shared row)            도구 / 플랫폼 관리
                                                                       (trigger in sidebar head)
```

## 5. Decisions

- Decided (recorded by the lane, reversible): the variant set above; descriptions removed from view in all variants, descriptor copy is a prototype proposal; `MARS` and `CLAS` get distinct descriptors.
- Candidate: moving platform links below the systems (needs a §3.2 text change).
- Open for the owner: which variant; whether a contract change for the trigger position is acceptable (C only).
- Deferred: other high-impact screens the research surfaces are listed in the report, not built.

## 6. Risks

- Implementation touches `@ap/shell` (full tier) and E2E describes `워크스페이스 (06 §9.1)`, `플랫폼 홈 · 전역 화면 (ADR-0028, ADR-0070)`, `메뉴 이동 포커스 (06 §26)`.
- Removing a `시작:` line or description changes what tests assert, not behaviour.
- `SpaceDef.subtitle` copy is app-owned (`apps/platform-web/src/menus.ts`).
